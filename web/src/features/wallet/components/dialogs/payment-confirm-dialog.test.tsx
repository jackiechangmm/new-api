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
*/
import { afterAll, describe, test } from 'bun:test'
import assert from 'node:assert/strict'

import { Window } from 'happy-dom'

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
  'KeyboardEvent',
  'PointerEvent',
  'MouseEvent',
  'FocusEvent',
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

const { createRoot } = await import('react-dom/client')
const { flushSync } = await import('react-dom')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { useSystemConfigStore } = await import('@/stores/system-config-store')
const { PaymentConfirmDialog } = await import('./payment-confirm-dialog')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Confirm Payment': 'Confirm Payment',
        'Review your payment details': 'Review your payment details',
        'Topup Amount': 'Topup Amount',
        'You Pay': 'You Pay',
        'Payment Method': 'Payment Method',
        Cancel: 'Cancel',
      },
    },
  },
})

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('payment confirmation dialog', () => {
  afterAll(() => {
    domWindow.close()
  })

  test('shows custom-currency topup amount after conversion', async () => {
    useSystemConfigStore.getState().setConfig({
      currency: {
        displayInCurrency: true,
        quotaDisplayType: 'CUSTOM',
        quotaPerUnit: 500000,
        usdExchangeRate: 7.2,
        customCurrencySymbol: 'BB',
        customCurrencyExchangeRate: 120,
      },
    })

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)

    flushSync(() =>
      root.render(
        <I18nextProvider i18n={i18n}>
          <PaymentConfirmDialog
            open
            onOpenChange={() => undefined}
            onConfirm={() => undefined}
            topupAmount={1}
            paymentAmount={7.2}
            paymentMethod={{ name: 'Alipay', type: 'alipay' }}
            calculating={false}
            processing={false}
          />
        </I18nextProvider>
      )
    )

    assert.match(document.body.textContent ?? '', /BB\s*120/)
    assert.match(document.body.textContent ?? '', /You Pay7\.2/)

    root.unmount()
    host.remove()
  })
})
