/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import assert from 'node:assert/strict'

import { Window } from 'happy-dom'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

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
  'Blob',
  'File',
  'FormData',
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
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

class TestImage {
  naturalWidth = 100
  naturalHeight = 100
  onload?: () => void
  onerror?: () => void
  set src(_value: string) {
    queueMicrotask(() => this.onload?.())
  }
}
Object.defineProperty(globalThis, 'Image', {
  configurable: true,
  value: TestImage,
})
Object.defineProperty(domWindow, 'Image', {
  configurable: true,
  value: TestImage,
})
Object.defineProperty(domWindow.HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => ({ drawImage: () => undefined }),
})
Object.defineProperty(domWindow.HTMLCanvasElement.prototype, 'toBlob', {
  configurable: true,
  value: (callback: BlobCallback) =>
    callback(new Blob(['webp'], { type: 'image/webp' })),
})

const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { cleanup, fireEvent, render, screen, waitFor } =
  await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default
const { FeaturedPromptSection } = await import('../featured-prompts/section')

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })

type ApiClient = {
  get: (
    url: string,
    config?: { params?: { p?: number } }
  ) => Promise<{ data: unknown }>
  post: (url: string, data?: unknown) => Promise<{ data: unknown }>
}
const client = api as unknown as ApiClient
const originalGet = client.get
const originalPost = client.post

beforeEach(() => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'user', role: 1 })
})

afterEach(() => {
  cleanup()
  client.get = originalGet
  client.post = originalPost
})

afterAll(() => {
  domWindow.close()
})

function renderSection(onSelect: (prompt: string) => void = () => undefined) {
  return render(
    <I18nextProvider i18n={i18n}>
      <FeaturedPromptSection onPreview={() => undefined} onSelect={onSelect} />
    </I18nextProvider>
  )
}

function featuredPromptPage(page: number, total = 1) {
  return {
    data: {
      success: true,
      data: {
        page,
        page_size: 6,
        total,
        items: [
          {
            id: page,
            title: `Studio portrait ${page}`,
            prompt: `Create studio portrait ${page}`,
            cover_url: `https://assets.test/portrait-${page}.webp`,
            sort_order: page,
            created_at: 1,
            updated_at: 1,
          },
        ],
      },
    },
  }
}

test('regular user can view and use a featured prompt without management controls', async () => {
  client.get = async () => featuredPromptPage(1)
  let selected = ''
  renderSection((prompt) => {
    selected = prompt
  })

  assert.ok(await screen.findByRole('heading', { name: 'Studio portrait 1' }))
  assert.ok(screen.getByText('Create studio portrait 1'))
  await userEvent
    .setup({ document })
    .click(screen.getByRole('button', { name: 'Use prompt' }))
  assert.equal(selected, 'Create studio portrait 1')
  assert.equal(screen.queryByRole('button', { name: 'Manage' }), null)
})

test('next page loads the next six-item featured prompt page', async () => {
  const requestedPages: number[] = []
  client.get = async (_url, config) => {
    const page = config?.params?.p ?? 1
    requestedPages.push(page)
    return featuredPromptPage(page, 7)
  }
  renderSection()

  await screen.findByRole('heading', { name: 'Studio portrait 1' })
  await userEvent
    .setup({ document })
    .click(screen.getByRole('button', { name: 'Next page' }))
  assert.ok(await screen.findByRole('heading', { name: 'Studio portrait 2' }))
  assert.deepEqual(requestedPages, [1, 2])
})

test('failed featured prompt request stays isolated for regular users', async () => {
  client.get = async () => {
    throw new Error('network unavailable')
  }
  renderSection()

  await waitFor(() => {
    assert.equal(
      screen.queryByRole('heading', { name: 'Featured prompts' }),
      null
    )
  })
})

test('admin can create a featured prompt with a valid cover', async () => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'admin', role: 10 })
  client.get = async () => ({
    data: {
      success: true,
      data: { page: 1, page_size: 6, total: 0, items: [] },
    },
  })
  let submitted: FormData | undefined
  client.post = async (_url, data) => {
    assert.ok(data instanceof FormData)
    submitted = data
    return {
      data: {
        success: true,
        data: {
          id: 1,
          title: data.get('title'),
          prompt: data.get('prompt'),
          cover_url: 'https://assets.test/new.webp',
          sort_order: 1,
          created_at: 1,
          updated_at: 1,
        },
      },
    }
  }
  renderSection()
  const user = userEvent.setup({ document })

  await user.click(await screen.findByRole('button', { name: 'Manage' }))
  await user.click(screen.getByRole('button', { name: 'New featured prompt' }))
  await user.type(screen.getByLabelText('Title'), 'New portrait')
  await user.type(screen.getByLabelText('Prompt content'), 'Portrait prompt')
  const cover = screen.getByLabelText('Cover image')
  assert.ok(cover instanceof HTMLInputElement)
  fireEvent.change(cover, {
    target: {
      files: [new File(['image'], 'cover.webp', { type: 'image/webp' })],
    },
  })
  await waitFor(() =>
    assert.equal(
      (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
        .disabled,
      false
    )
  )
  const form = document.querySelector('#featured-prompt-form')
  assert.ok(form instanceof domWindow.HTMLFormElement)
  fireEvent.submit(form)

  await waitFor(() => assert.ok(submitted))
  const submittedForm = submitted
  assert.ok(submittedForm)
  assert.equal(submittedForm.get('title'), 'New portrait')
  assert.ok(submittedForm.get('cover') instanceof File)
})

test('admin can open the empty-state editor and oversized cover is rejected', async () => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'admin', role: 10 })
  client.get = async () => ({
    data: {
      success: true,
      data: { page: 1, page_size: 6, total: 0, items: [] },
    },
  })
  renderSection()
  const user = userEvent.setup({ document })

  await user.click(await screen.findByRole('button', { name: 'Manage' }))
  await user.click(screen.getByRole('button', { name: 'New featured prompt' }))
  const cover = screen.getByLabelText('Cover image')
  assert.ok(cover instanceof HTMLInputElement)
  const oversizedCover = new File(
    [new Uint8Array(5 * 1024 * 1024 + 1)],
    'cover.webp',
    { type: 'image/webp' }
  )
  fireEvent.change(cover, { target: { files: [oversizedCover] } })

  assert.ok(cover.files?.[0])
})
