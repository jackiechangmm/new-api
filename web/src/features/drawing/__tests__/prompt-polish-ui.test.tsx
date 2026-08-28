/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import assert from 'node:assert/strict'

import { indexedDB } from 'fake-indexeddb'
import { Window } from 'happy-dom'

import { api } from '@/lib/api'

const bunTestModule = 'bun:test'
const { afterAll, afterEach, beforeEach, test } = (await import(
  bunTestModule
)) as {
  afterAll: typeof import('node:test').after
  afterEach: typeof import('node:test').afterEach
  beforeEach: typeof import('node:test').beforeEach
  test: typeof import('node:test').test
}

const domWindow = new Window()
domWindow.document.insertBefore(
  domWindow.document.implementation.createDocumentType('html', '', ''),
  domWindow.document.documentElement
)
Object.defineProperty(domWindow.document, 'compatMode', { value: 'CSS1Compat' })
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLButtonElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
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
  value: indexedDB,
})

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { Drawing } = await import('../index')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Polish prompt': 'Polish prompt',
        'Polishing...': 'Polishing...',
        'Undo polish': 'Undo polish',
      },
    },
  },
})

type ApiResponse = Promise<{ data: unknown }>
type ApiClient = {
  get: (url: string, config?: unknown) => ApiResponse
  post: (url: string, data?: unknown, config?: unknown) => ApiResponse
}

const client = api as unknown as ApiClient
const originalGet = client.get
const originalPost = client.post
let chatCompletion: (
  call: number,
  signal: AbortSignal | undefined
) => ApiResponse
let chatCalls = 0
let polishSignal: AbortSignal | undefined

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label
  )
  assert.ok(button instanceof HTMLButtonElement)
  return button
}

async function renderDrawing(): Promise<{
  container: HTMLDivElement
  root: ReturnType<typeof createRoot>
}> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <Drawing />
      </I18nextProvider>
    )
  })
  return { container, root }
}

async function enterPrompt(
  container: HTMLElement,
  value: string
): Promise<HTMLTextAreaElement> {
  const textarea = container.querySelector('textarea')
  assert.ok(textarea instanceof HTMLTextAreaElement)
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    )?.set
    assert.ok(valueSetter)
    valueSetter.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return textarea
}

beforeEach(() => {
  document.body.replaceChildren()
  chatCalls = 0
  polishSignal = undefined
  chatCompletion = async (call) => ({
    data: {
      choices: [
        {
          message: {
            content:
              call === 1
                ? '{"template_id":"poster-layout-system"}'
                : '{"prompt":"polished prompt"}',
          },
        },
      ],
    },
  })
  client.get = async (url) => {
    if (url === '/api/user/self') {
      return { data: { success: true, data: { group: 'default' } } }
    }
    assert.equal(url, '/api/user/models')
    return { data: { success: true, data: ['gpt-image-2'] } }
  }
  client.post = async (url, _data, config) => {
    assert.equal(url, '/v1/chat/completions')
    chatCalls++
    polishSignal = (config as { signal?: AbortSignal } | undefined)?.signal
    return chatCompletion(chatCalls, polishSignal)
  }
})

afterEach(() => {
  client.get = originalGet
  client.post = originalPost
})

test('editing during prompt polishing cancels the stale result and keeps generation blocked', async () => {
  let resolveClassification: (value: { data: unknown }) => void = () =>
    undefined
  chatCompletion = async () =>
    await new Promise((resolve) => {
      resolveClassification = resolve
    })
  const rendered = await renderDrawing()
  assert.equal(findButton(rendered.container, 'Polish prompt').disabled, true)

  const textarea = await enterPrompt(rendered.container, 'original prompt')
  const polishButton = findButton(rendered.container, 'Polish prompt')
  assert.equal(polishButton.disabled, false)
  await act(async () => polishButton.click())

  assert.equal(findButton(rendered.container, 'Polishing...').disabled, true)
  const generateButton = rendered.container.querySelector(
    'button[aria-label="Generate"]'
  )
  assert.ok(generateButton instanceof HTMLButtonElement)
  assert.equal(generateButton.disabled, true)
  assert.equal(textarea.disabled, false)

  await enterPrompt(rendered.container, 'new prompt')
  assert.equal(polishSignal?.aborted, true)
  await act(async () =>
    resolveClassification({
      data: {
        choices: [
          { message: { content: '{"template_id":"poster-layout-system"}' } },
        ],
      },
    })
  )
  assert.equal(chatCalls, 1)
  assert.equal(textarea.value, 'new prompt')

  await act(async () => rendered.root.unmount())
})

test('successful prompt polishing replaces the input and supports one undo', async () => {
  const rendered = await renderDrawing()
  const textarea = await enterPrompt(rendered.container, 'original prompt')

  await act(async () => findButton(rendered.container, 'Polish prompt').click())
  assert.equal(chatCalls, 2)
  assert.equal(textarea.value, 'polished prompt')

  await act(async () => findButton(rendered.container, 'Undo polish').click())
  assert.equal(textarea.value, 'original prompt')
  assert.equal(
    [...rendered.container.querySelectorAll('button')].some(
      (button) => button.textContent?.trim() === 'Undo polish'
    ),
    false
  )

  await act(async () => rendered.root.unmount())
})

afterAll(() => {
  client.get = originalGet
  client.post = originalPost
  domWindow.close()
})
