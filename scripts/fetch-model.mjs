// Search by meaning's model files: fetched from Hugging Face at the revision pinned in src/lib/meaning-model.json,
// each checked against its SHA-256 (any difference refuses, and nothing is written), then stored gzipped in
// public/models/ with onnxruntime-web's WebAssembly runtime. They're git-ignored (about 28 MB gzipped), so CI runs
// this before testing and building, and `npm run build` refuses without them. Files already there and right are kept.
// Run: npm run model
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'

const spec = JSON.parse(readFileSync(new URL('../src/lib/meaning-model.json', import.meta.url), 'utf8'))
const ort = JSON.parse(readFileSync(new URL('../node_modules/onnxruntime-web/package.json', import.meta.url), 'utf8'))
const root = new URL('../public/models/', import.meta.url)
const modelDir = new URL(`${spec.dir}/`, root)
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

for (const file of spec.files) {
  if (have(modelDir, file.name, file.sha256)) {
    console.log(`kept ${spec.dir}/${file.name}`)
    continue
  }
  const url = `https://huggingface.co/${spec.repo}/resolve/${spec.revision}/${file.from}`
  let response
  try {
    response = await fetch(url)
  } catch (error) {
    refuse(`couldn't reach Hugging Face for ${file.from} (${error.message}).`, 'Check the internet connection, then run it again.')
  }
  if (!response.ok) refuse(`Hugging Face answered ${response.status} for ${file.from}.`, 'Try again later. If it stays, the pinned revision may be gone: see src/lib/meaning-model.json.')
  const bytes = new Uint8Array(await response.arrayBuffer())
  const got = sha256(bytes)
  if (got !== file.sha256)
    refuse(`${file.from} isn't the file that was checked (its SHA-256 is ${got}).`, "Nothing was written. Don't change the hash to make it pass: find out first why the file is different.")
  put(modelDir, file.name, bytes)
  console.log(`got  ${spec.dir}/${file.name} (${bytes.length} bytes, SHA-256 matches)`)
}

// The runtime comes from node_modules, checked by npm against package-lock.json.
const wasm = readFileSync(new URL('../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', import.meta.url))
if (have(ortDir, 'ort.wasm', sha256(wasm))) console.log(`kept ort-${ort.version}/ort.wasm`)
else {
  put(ortDir, 'ort.wasm', wasm)
  console.log(`made ort-${ort.version}/ort.wasm (from onnxruntime-web ${ort.version})`)
}

// Older models or runtimes would be published too: remove them.
for (const name of readdirSync(root)) {
  if (name !== spec.dir && name !== `ort-${ort.version}`) {
    rmSync(new URL(name, root), { recursive: true, force: true })
    console.log(`removed ${name} (not the pinned model or runtime)`)
  }
}
