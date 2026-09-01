import { api } from '@/lib/api'

export interface EcommerceCopyInput {
  productName: string
  category: string
  facts: string
  purpose: string
  customPurpose: string
  focus: string
  sellingPoint: string
  targetLanguage: string
}

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>
}

export async function generateEcommerceCopy(
  input: EcommerceCopyInput,
  signal?: AbortSignal
): Promise<string> {
  const response = await api.post<ChatCompletionResponse>(
    '/v1/chat/completions',
    {
      model: 'gpt-5.6-terra',
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            '你是电商图片短文案助手。只返回一条适合直接放在画面中的简短文案，不要解释，不要引号，不要添加未经用户提供的价格、功效、认证或事实。严格使用目标语言。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            product_name: input.productName,
            product_category: input.category,
            supplied_facts: input.facts,
            image_purpose: input.purpose,
            custom_purpose: input.customPurpose,
            visual_focus: input.focus,
            selling_point: input.sellingPoint,
            target_language: input.targetLanguage,
          }),
        },
      ],
    },
    { signal, skipErrorHandler: true }
  )
  const content = response.data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('AI copy returned an empty response')
  return content
}
