import type { Tokenizer } from '@huggingface/tokenizers'
import type { InferenceSession, Tensor } from 'onnxruntime-web/wasm'

/** How the model reads text (src/lib/meaning-model.json). */
export interface EncoderSpec {
  pooling: 'cls' | 'mean'
  maxTokens: number
  queryPrefix: string
}

/** An entry's words, or a search question (which gets the model's search prompt in front). */
export type TextKind = 'passage' | 'query'

export type Encode = (text: string, kind: TextKind) => Promise<Float32Array>

/**
 * Turns a text into its meaning as numbers, the way sentence-transformers does for this model: [CLS] … [SEP], cut
 * at the model's limit; then the first token (bge) or the mean of all of them; then scaled to length 1, so how
 * close two texts are is a dot product. The worker runs it with the browser's runtime; the unit tests with Node's.
 */
export function createEncoder(TensorClass: typeof Tensor, session: InferenceSession, tokenizer: Tokenizer, spec: EncoderSpec): Encode {
  return async (text, kind) => {
    const encoded = tokenizer.encode(kind === 'query' ? spec.queryPrefix + text : text, { return_token_type_ids: true })
    let ids = encoded.ids
    let mask = encoded.attention_mask
    let types = encoded.token_type_ids
    if (ids.length > spec.maxTokens) {
      // Keep [CLS] and the closing [SEP].
      ids = [...ids.slice(0, spec.maxTokens - 1), ids[ids.length - 1]!]
      mask = mask.slice(0, spec.maxTokens)
      types = types.slice(0, spec.maxTokens)
    }
    const n = ids.length
    const tensor = (values: number[]) => new TensorClass('int64', BigInt64Array.from(values, (v) => BigInt(v)), [1, n])
    const inputs: Record<string, Tensor> = { input_ids: tensor(ids), attention_mask: tensor(mask), token_type_ids: tensor(types) }
    const feeds = Object.fromEntries(session.inputNames.filter((name) => name in inputs).map((name) => [name, inputs[name]!]))
    const outputs = await session.run(feeds)
    const hidden = outputs.last_hidden_state ?? outputs[session.outputNames[0]!]!
    const d = hidden.dims[2]!
    const data = hidden.data as Float32Array
    const vector = new Float32Array(d)
    if (spec.pooling === 'cls') vector.set(data.subarray(0, d))
    else {
      for (let t = 0; t < n; t++) for (let j = 0; j < d; j++) vector[j]! += data[t * d + j]!
      for (let j = 0; j < d; j++) vector[j]! /= n
    }
    let norm = 0
    for (let j = 0; j < d; j++) norm += vector[j]! * vector[j]!
    norm = Math.sqrt(norm) || 1
    for (let j = 0; j < d; j++) vector[j]! /= norm
    for (const output of Object.values(outputs)) output.dispose()
    return vector
  }
}
