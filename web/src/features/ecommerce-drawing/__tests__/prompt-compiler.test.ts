import { test } from 'bun:test'
import assert from 'node:assert/strict'

import {
  applyCategoryChange,
  applyPurposeChange,
  compileEcommercePrompt,
  createDefaultDraft,
  validateStep,
} from '../prompt-compiler'

test('purpose selection applies the prototype presentation defaults', () => {
  const draft = createDefaultDraft()

  assert.equal(applyPurposeChange(draft, 'use').presentation, 'scene')
  assert.equal(applyPurposeChange(draft, 'model').presentation, 'person')
  const detail = applyPurposeChange(draft, 'detail')
  assert.equal(detail.presentation, 'alone')
  assert.equal(detail.focus, 'selling')
})

test('category change resets a hidden category-specific focus', () => {
  const draft = {
    ...createDefaultDraft(),
    category: '连衣裙',
    focus: 'fit' as const,
  }

  assert.equal(applyCategoryChange(draft, '耳机').focus, 'overall')
  assert.equal(applyCategoryChange(draft, '连衣裙').focus, 'fit')
})

test('branch validation requires only the active conditional field', () => {
  const custom = {
    ...createDefaultDraft(),
    purpose: 'custom' as const,
    customPurpose: '',
  }
  assert.deepEqual(validateStep(custom, 1), {
    customPurpose: '请说明这张图片要表达什么',
  })

  const named = {
    ...createDefaultDraft(),
    presentation: 'set' as const,
    setScope: 'named' as const,
    namedAccessory: '',
  }
  assert.deepEqual(validateStep(named, 3), {
    namedAccessory: '请写出指定配件',
  })

  assert.deepEqual(validateStep(createDefaultDraft(), 2), {
    name: '请输入商品名称',
  })
})

test('prompt preserves selected facts and original Chinese input', () => {
  const draft = {
    ...createDefaultDraft(),
    purpose: 'detail' as const,
    name: '轻量通勤包',
    category: '包',
    facts: '黑色尼龙，只有一个主袋',
    focus: 'selling' as const,
    sellingPoint: '自重仅 400 克',
    detailType: 'structure' as const,
    composition: 'right' as const,
    channel: 'detail' as const,
    copy: '轻装出发',
  }

  const prompt = compileEcommercePrompt(draft)

  assert.match(prompt, /Create an ecommerce image for 轻量通勤包, a 包\./)
  assert.match(
    prompt,
    /Emphasize the supplied concrete selling point: 自重仅 400 克\./
  )
  assert.match(prompt, /Explain size or structure\./)
  assert.match(
    prompt,
    /Preserve these supplied facts exactly: 黑色尼龙，只有一个主袋\./
  )
  assert.match(
    prompt,
    /Render this exact short text: "轻装出发"\. Do not translate, add, or alter it\./
  )
})

test('prompt assigns reference images their stable semantic roles', () => {
  const image = new File(['image'], 'reference.png', { type: 'image/png' })
  const draft = {
    ...createDefaultDraft(),
    presentation: 'person' as const,
    personScene: true,
    productImage: image,
    personImage: image,
    personSceneImage: image,
    styleImage: image,
  }

  const prompt = compileEcommercePrompt(draft)

  assert.match(prompt, /product image as the highest-priority source of truth/)
  assert.match(prompt, /person image only for appearance and pose/)
  assert.match(prompt, /scene image only for setting and mood/)
  assert.match(
    prompt,
    /style image only for lighting, image quality, and overall visual expression/
  )
})

test('custom purpose is included verbatim instead of using the broken prototype placeholder', () => {
  const draft = {
    ...createDefaultDraft(),
    purpose: 'custom' as const,
    customPurpose: '让人觉得这个包很适合通勤',
  }

  assert.match(
    compileEcommercePrompt(draft),
    /The primary goal is to communicate this user-supplied intent: 让人觉得这个包很适合通勤\./
  )
})
