import assert from 'node:assert/strict'

import { IDBFactory } from 'fake-indexeddb'
import { Window } from 'happy-dom'

import { api } from '@/lib/api'

const bunTestModule = 'bun:test'
const { afterEach, beforeEach, test } = (await import(bunTestModule)) as {
  afterEach: typeof import('node:test').afterEach
  beforeEach: typeof import('node:test').beforeEach
  test: typeof import('node:test').test
}

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLButtonElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'MutationObserver',
  'ResizeObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const
for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}
Object.defineProperty(globalThis, 'indexedDB', {
  configurable: true,
  value: new IDBFactory(),
})
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: { randomUUID: () => 'new-result' },
})
Object.defineProperty(URL, 'createObjectURL', {
  configurable: true,
  value: () => 'blob:test',
})
Object.defineProperty(URL, 'revokeObjectURL', {
  configurable: true,
  value: () => undefined,
})
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { EcommerceDrawing } = await import('../index')

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'zh', resources: { zh: { translation: {} } } })

const client = api as unknown as {
  get: (url: string, config?: unknown) => Promise<{ data: unknown }>
  post: (
    url: string,
    data?: unknown,
    config?: unknown
  ) => Promise<{ data: unknown }>
}
const originalGet = client.get
const originalPost = client.post
let imageRequest: { url: string; data: unknown } | undefined

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const result = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label
  )
  assert.ok(result instanceof HTMLButtonElement, `missing button ${label}`)
  return result
}

beforeEach(() => {
  document.body.replaceChildren()
  imageRequest = undefined
  client.get = async (url) => {
    if (url === '/api/user/self') {
      return { data: { success: true, data: { group: 'default' } } }
    }
    assert.equal(url, '/api/user/models')
    return { data: { success: true, data: ['gpt-image-2'] } }
  }
  client.post = async (url, data) => {
    imageRequest = { url, data }
    return {
      data: { data: [{ b64_json: 'aW1hZ2U=', mime_type: 'image/png' }] },
    }
  }
})

afterEach(() => {
  client.get = originalGet
  client.post = originalPost
})

test('page progressively unlocks steps and sends the fixed image contract', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <EcommerceDrawing />
      </I18nextProvider>
    )
  })

  assert.match(container.textContent ?? '', /1\. 图片目的/)
  assert.doesNotMatch(container.textContent ?? '', /2\. 商品信息/)
  assert.equal(container.querySelector('#desktop-ecommerce-prompt'), null)
  assert.equal(button(container, '生成图片').disabled, true)

  await act(async () => button(container, '下一步').click())
  assert.match(container.textContent ?? '', /1\. 图片目的/)
  assert.match(container.textContent ?? '', /2\. 商品信息/)

  const name = container.querySelector<HTMLInputElement>('#ecommerce-name')
  assert.ok(name)
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set
    assert.ok(valueSetter)
    valueSetter.call(name, '通勤包')
    name.dispatchEvent(new Event('input', { bubbles: true }))
  })
  for (let step = 2; step <= 4; step += 1) {
    await act(async () => button(container, '下一步').click())
  }
  assert.match(container.textContent ?? '', /5\. 风格与构图/)

  const quality = container.querySelector<HTMLSelectElement>(
    '#desktop-ecommerce-quality'
  )
  assert.ok(quality)
  await act(async () => {
    quality.value = 'low'
    quality.dispatchEvent(new Event('change', { bubbles: true }))
  })
  assert.match(container.textContent ?? '', /低质量模式建议仅用作预览/)

  const prompt = container.querySelector<HTMLTextAreaElement>(
    '#desktop-ecommerce-prompt'
  )
  assert.ok(prompt)
  assert.equal(prompt.readOnly, true)
  assert.match(prompt.value, /通勤包/)

  await act(async () => button(container, '生成图片').click())
  assert.equal(imageRequest?.url, '/v1/images/generations')
  assert.deepEqual(imageRequest?.data, {
    model: 'gpt-image-2',
    prompt: prompt.value,
    size: '1:1 1k',
    quality: 'low',
    n: 1,
    response_format: 'b64_json',
  })
  assert.match(container.textContent ?? '', /绘图历史/)

  await act(async () => root.unmount())
})
