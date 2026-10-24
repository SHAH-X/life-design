// The on-phone models' files: search by meaning's (src/lib/meaning-model.json) and reading text in photos'
// (src/lib/ocr-model.json), fetched from Hugging Face at their pinned revisions, each checked against its SHA-256 (any
// difference refuses, and nothing is written), then stored gzipped in public/models/ with onnxruntime-web's
// WebAssembly runtime. They're git-ignored (about 33 MB gzipped), so CI runs this before testing and building, and
// `npm run build` refuses without them. Files already there and right are kept.
// Run: npm run model
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const meaning = json('../src/lib/meaning-model.json')
const ocr = json('../src/lib/ocr-model.json')
const ort = json('../node_modules/onnxruntime-web/package.json')
const root = new URL('../public/models/', import.meta.url)
const ortDir = new URL(`ort-${ort.version}/`, root)

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function refuse(why, then) {
  console.error(`npm run model: ${why}\n  ${then}`)
  process.exit(1)
}

/** Whether name.gz is already in dir and unzips to exactly the expected file. */
function have(dir, name, hash) {
  const path = new URL(`${name}.gz`, dir)
  if (!existsSync(path)) return false
  try {
    return sha256(gunzipSync(readFileSync(path))) === hash
  } catch {
    return false
  }
}

function put(dir, name, bytes) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(new URL(`${name}.gz`, dir), gzipSync(bytes, { level: 9 }))
}

/** Each of a model's files, from its pinned revision on Hugging Face, checked; the bytes of each, kept or fetched. */
async function fetchModel(spec, specPath) {
  const dir = new URL(`${spec.dir}/`, root)
  const got = new Map()
  for (const file of spec.files) {
    const repo = file.repo ?? spec.repo
    const revision = file.revision ?? spec.revision
    if (have(dir, file.name, file.sha256)) {
      console.log(`kept ${spec.dir}/${file.name}`)
      got.set(file.name, gunzipSync(readFileSync(new URL(`${file.name}.gz`, dir))))
      continue
    }
    const url = `https://huggingface.co/${repo}/resolve/${revision}/${file.from}`
    let response
    try {
      response = await fetch(url)
    } catch (error) {
      refuse(`couldn't reach Hugging Face for ${repo}/${file.from} (${error.message}).`, 'Check the internet connection, then run it again.')
    }
    if (!response.ok) refuse(`Hugging Face answered ${response.status} for ${repo}/${file.from}.`, `Try again later. If it stays, the pinned revision may be gone: see ${specPath}.`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    const hash = sha256(bytes)
    if (hash !== file.sha256)
      refuse(`${repo}/${file.from} isn't the file that was checked (its SHA-256 is ${hash}).`, "Nothing was written. Don't change the hash to make it pass: find out first why the file is different.")
    put(dir, file.name, bytes)
    got.set(file.name, bytes)
    console.log(`got  ${spec.dir}/${file.name} (${bytes.length} bytes, SHA-256 matches)`)
  }
  return { dir, got }
}

/** PaddleOCR keeps the recognition model's characters in its YAML (PostProcess.character_dict): one a line, then the
 *  space, which the model also uses and the YAML leaves out. */
function characters(yml) {
  const lines = new TextDecoder().decode(yml).split('\n')
  const start = lines.findIndex((l) => l.trim() === 'character_dict:')
  const chars = []
  for (const line of lines.slice(start + 1)) {
    const m = line.match(/^\s+- (.*)$/)
    if (!m) break
    const v = m[1]
    chars.push(v.startsWith("'") && v.endsWith("'") ? v.slice(1, -1).replaceAll("''", "'") : v.startsWith('"') && v.endsWith('"') ? JSON.parse(v) : v)
  }
  return chars
}

await fetchModel(meaning, 'src/lib/meaning-model.json')

const { dir: ocrDir, got } = await fetchModel(ocr, 'src/lib/ocr-model.json')
const chars = characters(got.get('rec.yml'))
if (chars.length !== ocr.characters)
  refuse(`rec.yml lists ${chars.length} characters, not the ${ocr.characters} that were tested.`, 'Find out why before changing src/lib/ocr-model.json.')
const dict = new TextEncoder().encode(JSON.stringify([...chars, ' ']))
if (have(ocrDir, 'dict.json', sha256(dict))) console.log(`kept ${ocr.dir}/dict.json`)
else {
  put(ocrDir, 'dict.json', dict)
  console.log(`made ${ocr.dir}/dict.json (${chars.length} characters and the space, from rec.yml)`)
}

// The runtime comes from node_modules, checked by npm against package-lock.json.
const wasm = readFileSync(new URL('../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', import.meta.url))
if (have(ortDir, 'ort.wasm', sha256(wasm))) console.log(`kept ort-${ort.version}/ort.wasm`)
else {
  put(ortDir, 'ort.wasm', wasm)
  console.log(`made ort-${ort.version}/ort.wasm (from onnxruntime-web ${ort.version})`)
}

// Older models or runtimes would be published too: remove them.
const keep = new Set([meaning.dir, ocr.dir, `ort-${ort.version}`])
for (const name of readdirSync(root)) {
  if (!keep.has(name)) {
    rmSync(new URL(name, root), { recursive: true, force: true })
    console.log(`removed ${name} (not a pinned model or runtime)`)
  }
}
