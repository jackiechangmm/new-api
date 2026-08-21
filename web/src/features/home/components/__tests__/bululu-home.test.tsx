/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

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
import type { ReactNode } from 'react'

const bunTestModule = 'bun:test'
const { afterAll, test } = (await import(bunTestModule)) as {
  afterAll: typeof import('node:test').after
  test: typeof import('node:test').test
}

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLButtonElement',
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

const { mock } = (await import(bunTestModule)) as {
  mock: {
    module(specifier: string, factory: () => Record<string, unknown>): void
  }
}
mock.module('@tanstack/react-router', () => ({
  Link: (props: { children: ReactNode; to: string; className?: string }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { BululuHome } = await import('../bululu-home')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

test('homepage renders its primary sections and dashboard navigation', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <BululuHome />
      </I18nextProvider>
    )
  })

  assert.ok(container.querySelector('main#top'))
  for (const id of [
    'section-api',
    'section-all-in-one',
    'section-studio',
    'section-get-started',
  ]) {
    assert.ok(container.querySelector(`#${id}`))
  }
  assert.ok(
    container.querySelector('a[href="/dashboard"]'),
    'homepage should expose a dashboard navigation link'
  )

  await act(async () => root.unmount())
  container.remove()
})

afterAll(() => {
  domWindow.close()
})
