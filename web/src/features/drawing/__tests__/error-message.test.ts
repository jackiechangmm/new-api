import { test } from 'bun:test'
import assert from 'node:assert/strict'

import { getDrawingErrorMessage } from '../error-message'

const translations: Record<string, string> = {
  'Insufficient balance. Please top up and try again.':
    '余额不足，请充值后重试',
  'The prompt may contain disallowed content. Please revise it and try again.':
    '提示词可能包含不符合要求的内容，请修改后重试',
  'The image generation queue is full. Please try again later.':
    '当前生成队列已满，请稍后重试',
  'The image generation service is busy. Please try again later.':
    '当前生成服务繁忙，请稍后重试',
  'The request is too large. Please reduce the number or size of reference images.':
    '请求内容过大，请减少参考图片数量或文件大小',
  'This model is currently unavailable. Please choose another model.':
    '当前模型不可用，请选择其他模型',
  'The image generation task was cancelled.': '图片生成任务已取消',
  'Network connection failed or server not responding':
    '网络连接失败或服务器未响应',
  'Image generation failed. Please try again later.':
    '图片生成失败，请稍后重试',
}

const translate = (key: string) => translations[key] ?? key

test('formats OpenAI-compatible quota errors with code and Chinese guidance', () => {
  const error = {
    response: {
      status: 403,
      data: {
        error: {
          code: 'insufficient_user_quota',
          message: '用户额度不足, 剩余额度: 0',
        },
      },
    },
  }

  assert.equal(
    getDrawingErrorMessage(error, translate),
    'insufficient_user_quota 余额不足，请充值后重试'
  )
})

test('formats Midjourney quota errors with the semantic description code', () => {
  const error = {
    response: {
      status: 400,
      data: {
        code: 4,
        description: 'quota_not_enough ',
        type: 'upstream_error',
      },
    },
  }

  assert.equal(
    getDrawingErrorMessage(error, translate),
    'quota_not_enough 余额不足，请充值后重试'
  )
})

test('formats known Midjourney business and task failures', () => {
  assert.equal(
    getDrawingErrorMessage(
      { code: 24, description: '可能包含敏感词' },
      translate
    ),
    '24 提示词可能包含不符合要求的内容，请修改后重试'
  )
  assert.equal(
    getDrawingErrorMessage(
      { code: 23, description: '队列已满，请稍后尝试' },
      translate
    ),
    '23 当前生成队列已满，请稍后重试'
  )
  assert.equal(
    getDrawingErrorMessage({ status: 'CANCELLED' }, translate),
    'CANCELLED 图片生成任务已取消'
  )
})

test('uses stable diagnostic codes for HTTP and network failures', () => {
  assert.equal(
    getDrawingErrorMessage({ response: { status: 429, data: {} } }, translate),
    'http_429 当前生成服务繁忙，请稍后重试'
  )
  assert.equal(
    getDrawingErrorMessage(
      {
        response: {
          status: 413,
          data: { error: { code: 'read_request_body_failed' } },
        },
      },
      translate
    ),
    'read_request_body_failed 请求内容过大，请减少参考图片数量或文件大小'
  )
  assert.equal(
    getDrawingErrorMessage(
      { request: {}, message: 'Network Error' },
      translate
    ),
    'network_error 网络连接失败或服务器未响应'
  )
})

test('keeps unknown Midjourney failures generic despite their HTTP 400 status', () => {
  const error = {
    response: {
      status: 400,
      data: {
        code: 4,
        description: 'provider_internal_error',
        type: 'upstream_error',
      },
    },
  }

  assert.equal(
    getDrawingErrorMessage(error, translate),
    'provider_internal_error 图片生成失败，请稍后重试'
  )
})

test('preserves unknown server codes without exposing upstream messages', () => {
  const error = {
    response: {
      status: 502,
      data: {
        error: {
          code: 'provider_internal_error',
          message: 'channel 12 failed with secret upstream details',
        },
      },
    },
  }

  assert.equal(
    getDrawingErrorMessage(error, translate),
    'provider_internal_error 图片生成失败，请稍后重试'
  )
})

test('uses an explicit code when no structured error details exist', () => {
  assert.equal(
    getDrawingErrorMessage(new Error('Image generation failed'), translate),
    'unknown_error 图片生成失败，请稍后重试'
  )
})
