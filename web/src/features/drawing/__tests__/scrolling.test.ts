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

import { focusPromptEditor } from '../prompt-scroll'

const bunTestModule = 'bun:test'
const { test } = (await import(bunTestModule)) as {
  test: typeof import('node:test').test
}

test('prompt selection prevents focus from replacing the smooth container scroll', () => {
  const calls: Array<{ name: string; options: unknown }> = []
  const scrollContainer = {
    scrollTo: (options: ScrollToOptions) => {
      calls.push({ name: 'scroll', options })
    },
  } as HTMLElement
  const input = {
    focus: (options?: FocusOptions) => {
      calls.push({ name: 'focus', options })
    },
  } as HTMLTextAreaElement

  focusPromptEditor(scrollContainer, input)

  assert.deepEqual(calls, [
    { name: 'focus', options: { preventScroll: true } },
    { name: 'scroll', options: { top: 0, behavior: 'smooth' } },
  ])
})
