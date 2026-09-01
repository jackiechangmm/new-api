import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'

import { api } from '@/lib/api'

import { generateEcommerceCopy } from '../api'

const client = api as unknown as {
  post: (
    url: string,
    data?: unknown,
    config?: unknown
  ) => Promise<{ data: unknown }>
}
const originalPost = client.post

afterEach(() => {
  client.post = originalPost
})

test('AI copy uses one gpt-5.6-terra chat completion with current business context', async () => {
  let request: { url: string; data: unknown; config: unknown } | undefined
  client.post = async (url, data, config) => {
    request = { url, data, config }
    return {
      data: { choices: [{ message: { content: '轻装通勤，自在随行' } }] },
    }
  }

  const signal = new AbortController().signal
  const result = await generateEcommerceCopy(
    {
      productName: '轻量通勤包',
      category: '包',
      facts: '黑色尼龙，自重 400 克',
      purpose: '一眼看清商品',
      customPurpose: '',
      focus: '一个具体卖点',
      sellingPoint: '轻便',
      targetLanguage: '中文',
    },
    signal
  )

  assert.equal(result, '轻装通勤，自在随行')
  assert.equal(request?.url, '/v1/chat/completions')
  assert.deepEqual(request?.config, { signal, skipErrorHandler: true })
  const payload = request?.data as {
    model: string
    stream: boolean
    messages: Array<{ role: string; content: string }>
  }
  assert.equal(payload.model, 'gpt-5.6-terra')
  assert.equal(payload.stream, false)
  assert.equal(payload.messages.length, 2)
  assert.match(payload.messages[1]?.content ?? '', /轻量通勤包/)
  assert.match(payload.messages[1]?.content ?? '', /黑色尼龙，自重 400 克/)
  assert.match(payload.messages[1]?.content ?? '', /中文/)
})

test('AI copy rejects an empty model response', async () => {
  client.post = async () => ({ data: { choices: [] } })

  await assert.rejects(
    generateEcommerceCopy({
      productName: '商品',
      category: '',
      facts: '',
      purpose: '一眼看清商品',
      customPurpose: '',
      focus: '整体外观',
      sellingPoint: '',
      targetLanguage: '中文',
    }),
    /empty response/
  )
})
