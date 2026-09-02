export type DrawingInputConfig = {
  formats: string[]
  maxImages?: number
  maxImageBytes?: number
  maxTotalBytes?: number
  maxWidth?: number
  maxHeight?: number
}

export type DrawingOperationConfig = {
  aspectRatios?: string[]
  resolutions?: string[]
  qualities?: string[]
  maxOutputs: number
  outputFormats?: string[]
  input?: DrawingInputConfig
}

export type DrawingRequestFormat =
  | 'openai-image'
  | 'gemini-generate-content'
  | 'midjourney'

export type DrawingModelConfig = {
  model: string
  requestFormat: DrawingRequestFormat
  textToImage?: DrawingOperationConfig
  imageToImage?: DrawingOperationConfig
}

const GPT_IMAGE_2_ASPECT_RATIOS = [
  'auto',
  '1:1',
  '1:3',
  '3:1',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '5:4',
  '4:5',
  '16:9',
  '9:16',
  '2:1',
  '1:2',
  '21:9',
  '9:21',
]
const GPT_IMAGE_2_INPUT: DrawingInputConfig = {
  formats: ['image/jpeg', 'image/png', 'image/webp'],
  maxImages: 4,
  maxImageBytes: 20 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  maxWidth: 4096,
  maxHeight: 4096,
}
const GROK_IMAGINE_2_ASPECT_RATIOS = [
  'auto',
  '1:1',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '2:3',
  '3:2',
  '9:19.5',
  '19.5:9',
  '9:20',
  '20:9',
  '1:2',
  '2:1',
]
const GROK_IMAGINE_2_INPUT: DrawingInputConfig = {
  formats: ['image/jpeg', 'image/png', 'image/webp'],
  maxImages: 3,
  maxImageBytes: 20 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
}

const NANO_BANANA_2_LITE_ASPECT_RATIOS = [
  '1:1',
  '1:4',
  '4:1',
  '1:8',
  '8:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
]

export const DRAWING_MODEL_CONFIGS: DrawingModelConfig[] = [
  {
    model: 'gpt-image-2',
    requestFormat: 'openai-image',
    textToImage: {
      aspectRatios: GPT_IMAGE_2_ASPECT_RATIOS,
      resolutions: ['1k', '2k', '4k'],
      qualities: ['auto', 'low', 'medium', 'high'],
      maxOutputs: 4,
      outputFormats: ['png'],
    },
    imageToImage: {
      aspectRatios: GPT_IMAGE_2_ASPECT_RATIOS,
      resolutions: ['1k', '2k', '4k'],
      qualities: ['auto', 'low', 'medium', 'high'],
      maxOutputs: 4,
      outputFormats: ['png'],
      input: GPT_IMAGE_2_INPUT,
    },
  },
  {
    model: 'nano-banana-2',
    requestFormat: 'gemini-generate-content',
    textToImage: {
      aspectRatios: NANO_BANANA_2_LITE_ASPECT_RATIOS,
      resolutions: ['512', '1k', '2k', '4k'],
      maxOutputs: 1,
      outputFormats: ['png'],
    },
    imageToImage: {
      aspectRatios: NANO_BANANA_2_LITE_ASPECT_RATIOS,
      resolutions: ['512', '1k', '2k', '4k'],
      maxOutputs: 1,
      outputFormats: ['png'],
      input: {
        formats: ['image/jpeg', 'image/png'],
        maxImages: 14,
        maxImageBytes: 7 * 1024 * 1024,
      },
    },
  },
  {
    model: 'nano-banana-2-lite',
    requestFormat: 'gemini-generate-content',
    textToImage: {
      aspectRatios: NANO_BANANA_2_LITE_ASPECT_RATIOS,
      resolutions: ['1k'],
      maxOutputs: 1,
      outputFormats: ['png'],
    },
    imageToImage: {
      aspectRatios: NANO_BANANA_2_LITE_ASPECT_RATIOS,
      resolutions: ['1k'],
      maxOutputs: 1,
      outputFormats: ['png'],
      input: {
        formats: ['image/jpeg', 'image/png'],
      },
    },
  },
  {
    model: 'grok-imagine-image-2.0',
    requestFormat: 'openai-image',
    textToImage: {
      aspectRatios: GROK_IMAGINE_2_ASPECT_RATIOS,
      resolutions: ['1k', '2k'],
      qualities: ['low', 'medium'],
      maxOutputs: 10,
      outputFormats: ['png'],
    },
    imageToImage: {
      aspectRatios: GROK_IMAGINE_2_ASPECT_RATIOS,
      resolutions: ['1k', '2k'],
      maxOutputs: 10,
      outputFormats: ['png'],
      input: GROK_IMAGINE_2_INPUT,
    },
  },
  {
    model: 'mj_imagine',
    requestFormat: 'midjourney',
    textToImage: {
      maxOutputs: 1,
    },
  },
]

export function getDrawingModelConfig(
  model: string
): DrawingModelConfig | undefined {
  return DRAWING_MODEL_CONFIGS.find((config) => config.model === model)
}

export function filterDrawingModels(models: string[]): string[] {
  const available = new Set(models)
  return DRAWING_MODEL_CONFIGS.map((config) => config.model).filter((model) =>
    available.has(model)
  )
}

export function getFixedOrSelectedValue(
  options: string[] | undefined,
  selected: string
): string | undefined {
  if (!options?.length) return undefined
  return options.includes(selected) ? selected : options[0]
}
