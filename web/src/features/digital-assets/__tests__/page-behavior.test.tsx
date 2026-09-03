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

import { Window } from 'happy-dom'

import { api } from '@/lib/api'

const bunTestModule = 'bun:test'
const { afterEach, beforeEach, test } = (await import(bunTestModule)) as {
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
Object.defineProperty(domWindow.navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async () => undefined },
})
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { DigitalAssets } = await import('../index')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
  returnNull: false,
})

type ApiClient = {
  get: (
    url: string,
    config?: { params?: Record<string, unknown> }
  ) => Promise<{ data: unknown }>
  post: (url: string, data?: unknown) => Promise<{ data: unknown }>
  put: (url: string, data?: unknown) => Promise<{ data: unknown }>
  patch: (url: string, data?: unknown) => Promise<{ data: unknown }>
  delete: (url: string) => Promise<{ data: unknown }>
}

const client = api as unknown as ApiClient
const originals = {
  get: client.get,
  post: client.post,
  put: client.put,
  patch: client.patch,
  delete: client.delete,
}
const getCalls: { url: string; params?: Record<string, unknown> }[] = []
const patchCalls: { url: string; data: unknown }[] = []

const asset = {
  id: 7,
  user_id: 1,
  asset_type: 'text' as const,
  title: 'Portrait prompt',
  content: 'Create a detailed portrait',
  is_favorite: true,
  created_at: 10,
  updated_at: 20,
  tags: [{ id: 3, user_id: 1, name: '角色', created_at: 10, updated_at: 10 }],
}

async function flushQueries(queryClient: InstanceType<typeof QueryClient>) {
  await act(async () => {
    while (queryClient.isFetching() > 0) {
      await Promise.resolve()
    }
    await Promise.resolve()
  })
}

async function renderPage() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <DigitalAssets />
        </I18nextProvider>
      </QueryClientProvider>
    )
  })
  await act(async () => {
    await queryClient.refetchQueries()
  })
  return { container, root, queryClient }
}

beforeEach(() => {
  document.body.replaceChildren()
  getCalls.length = 0
  patchCalls.length = 0
  client.get = async (url, config) => {
    getCalls.push({ url, params: config?.params })
    if (url.endsWith('/tags')) {
      return { data: { success: true, message: '', data: asset.tags } }
    }
    const favorite = config?.params?.favorite === true
    return {
      data: {
        success: true,
        message: '',
        data: {
          page: config?.params?.p ?? 1,
          page_size: config?.params?.page_size,
          total: 1,
          items: favorite ? [asset] : [asset],
        },
      },
    }
  }
  client.patch = async (url, data) => {
    patchCalls.push({ url, data })
    return {
      data: {
        success: true,
        message: '',
        data: { ...asset, is_favorite: false },
      },
    }
  }
  client.post = async () => ({
    data: { success: true, message: '', data: asset },
  })
  client.put = async () => ({
    data: { success: true, message: '', data: asset },
  })
  client.delete = async () => ({
    data: { success: true, message: '', data: null },
  })
})

afterEach(() => {
  client.get = originals.get
  client.post = originals.post
  client.put = originals.put
  client.patch = originals.patch
  client.delete = originals.delete
})

test('favorites and all assets use independent list contracts while search only filters all assets', async () => {
  const rendered = await renderPage()
  const listCalls = getCalls.filter(
    (call) => call.url === '/api/digital-assets/'
  )
  assert.ok(listCalls.length >= 2)
  assert.ok(
    listCalls.some(
      (call) => call.params?.favorite === true && call.params?.page_size === 6
    )
  )
  assert.ok(
    listCalls.some(
      (call) =>
        call.params?.favorite === undefined && call.params?.page_size === 12
    )
  )

  const search = rendered.container.querySelector(
    '[aria-label="Search assets"]'
  )
  assert.ok(search instanceof HTMLInputElement)
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set
    assert.ok(setter)
    setter.call(search, 'portrait')
    search.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await flushQueries(rendered.queryClient)

  const searchedCalls = getCalls.filter(
    (call) =>
      call.url === '/api/digital-assets/' && call.params?.search === 'portrait'
  )
  assert.equal(searchedCalls.length, 1)
  assert.equal(searchedCalls[0]?.params?.favorite, undefined)

  const openButton = rendered.container.querySelector(
    '[aria-label="Open prompt Portrait prompt"]'
  )
  assert.ok(openButton instanceof HTMLButtonElement)
  await act(async () => openButton.click())
  assert.match(document.body.textContent ?? '', /Create a detailed portrait/)

  const favoriteButton = [...document.body.querySelectorAll('button')].find(
    (button) => button.textContent?.includes('Remove from favorites')
  )
  assert.ok(favoriteButton instanceof HTMLButtonElement)
  await act(async () => favoriteButton.click())
  await flushQueries(rendered.queryClient)
  assert.equal(patchCalls.length, 1)
  assert.equal(patchCalls[0]?.url, '/api/digital-assets/7/favorite')
  assert.deepEqual(patchCalls[0]?.data, { is_favorite: false })

  await act(async () => rendered.root.unmount())
  rendered.queryClient.clear()
})
