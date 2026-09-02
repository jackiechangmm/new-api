type DrawingErrorTranslator = (key: string) => string

type ErrorDetails = {
  code: string | null
  statusCode: number | null
  taskStatus: string | null
  hasRequest: boolean
  isMidjourney: boolean
}

const MESSAGE_KEYS = {
  balance: 'Insufficient balance. Please top up and try again.',
  content:
    'The prompt may contain disallowed content. Please revise it and try again.',
  queue: 'The image generation queue is full. Please try again later.',
  busy: 'The image generation service is busy. Please try again later.',
  unauthorized: 'You are not authorized to use this model.',
  tooLarge:
    'The request is too large. Please reduce the number or size of reference images.',
  invalid:
    'The image generation parameters are invalid. Please adjust them and try again.',
  modelUnavailable:
    'This model is currently unavailable. Please choose another model.',
  cancelled: 'The image generation task was cancelled.',
  network: 'Network connection failed or server not responding',
  fallback: 'Image generation failed. Please try again later.',
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

const EMBEDDED_CODES = [
  'quota_not_enough',
  'prompt_blocked',
  'sensitive_words_detected',
  'content_moderation_failed',
] as const

function diagnosticCode(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  const normalized = trimmed.toLowerCase()
  const embeddedCode = EMBEDDED_CODES.find((code) => normalized.includes(code))
  if (embeddedCode) return embeddedCode
  if (!/^[a-z][a-z0-9_.:-]*$/i.test(trimmed)) return null
  return trimmed
}

function getErrorDetails(error: unknown): ErrorDetails {
  if (!isRecord(error)) {
    return {
      code: null,
      statusCode: null,
      taskStatus: null,
      hasRequest: false,
      isMidjourney: false,
    }
  }

  const response = isRecord(error.response) ? error.response : null
  const statusCode =
    typeof response?.status === 'number' ? response.status : null
  const payload = response && isRecord(response.data) ? response.data : error
  const nestedError = isRecord(payload.error) ? payload.error : null
  const semanticCode =
    diagnosticCode(payload.description) ?? diagnosticCode(payload.failReason)
  const code =
    diagnosticCode(nestedError?.code) ??
    semanticCode ??
    diagnosticCode(payload.code)
  const taskStatus =
    typeof payload.status === 'string' ? payload.status.toUpperCase() : null

  return {
    code,
    statusCode,
    taskStatus,
    hasRequest: Boolean(error.request),
    isMidjourney:
      !nestedError &&
      (typeof payload.code === 'number' ||
        typeof payload.description === 'string' ||
        taskStatus !== null),
  }
}

function getMessageKey(details: ErrorDetails): string {
  const normalizedCode = details.code?.toLowerCase()

  if (
    normalizedCode === 'insufficient_user_quota' ||
    normalizedCode === 'quota_not_enough'
  ) {
    return MESSAGE_KEYS.balance
  }
  if (
    normalizedCode === 'prompt_blocked' ||
    normalizedCode === 'sensitive_words_detected' ||
    normalizedCode === 'content_moderation_failed' ||
    details.code === '24'
  ) {
    return MESSAGE_KEYS.content
  }
  if (details.code === '23') return MESSAGE_KEYS.queue
  if (details.code === '30' || details.statusCode === 429) {
    return MESSAGE_KEYS.busy
  }
  if (
    normalizedCode === 'model_not_found' ||
    normalizedCode === 'channel:no_available_key'
  ) {
    return MESSAGE_KEYS.modelUnavailable
  }
  if (details.statusCode === 401) return 'Session expired!'
  if (details.statusCode === 413) return MESSAGE_KEYS.tooLarge
  if (
    normalizedCode === 'invalid_request' ||
    normalizedCode === 'bad_request_body' ||
    normalizedCode === 'read_request_body_failed' ||
    (details.statusCode === 400 && !details.isMidjourney)
  ) {
    return MESSAGE_KEYS.invalid
  }
  if (details.statusCode === 403) return MESSAGE_KEYS.unauthorized
  if (details.taskStatus === 'CANCELLED') return MESSAGE_KEYS.cancelled
  if (details.hasRequest && details.statusCode === null) {
    return MESSAGE_KEYS.network
  }
  return MESSAGE_KEYS.fallback
}

export function getDrawingErrorMessage(
  error: unknown,
  translate: DrawingErrorTranslator
): string {
  const details = getErrorDetails(error)
  const code =
    details.code ??
    details.taskStatus ??
    (details.statusCode ? `http_${details.statusCode}` : null) ??
    (details.hasRequest ? 'network_error' : 'unknown_error')
  return `${code} ${translate(getMessageKey(details))}`
}
