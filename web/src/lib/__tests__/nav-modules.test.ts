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
import { isSidebarModuleEnabledFromStatus } from '../nav-modules'

const bunTestModule = 'bun:test'
const { describe, expect, test } = (await import(bunTestModule)) as {
  describe: typeof import('node:test').describe
  expect: (value: boolean) => {
    toBe: (expected: boolean) => void
  }
  test: typeof import('node:test').test
}

describe('digital asset route visibility', () => {
  test('keeps the route enabled for legacy status without an asset setting', () => {
    const status = {
      SidebarModulesAdmin: JSON.stringify({
        chat: { enabled: true, playground: true },
      }),
    }

    expect(isSidebarModuleEnabledFromStatus(status, 'chat', 'assets')).toBe(
      true
    )
  })

  test('blocks the route when the administrator disables digital assets', () => {
    const status = {
      SidebarModulesAdmin: JSON.stringify({
        chat: { enabled: true, assets: false },
      }),
    }

    expect(isSidebarModuleEnabledFromStatus(status, 'chat', 'assets')).toBe(
      false
    )
  })

  test('does not apply user sidebar preferences at the route boundary', () => {
    const status = {
      SidebarModulesAdmin: JSON.stringify({
        chat: { enabled: true, assets: true },
      }),
      SidebarModulesUser: JSON.stringify({
        chat: { enabled: true, assets: false },
      }),
    }

    expect(isSidebarModuleEnabledFromStatus(status, 'chat', 'assets')).toBe(
      true
    )
  })
})
