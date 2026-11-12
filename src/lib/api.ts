import type { ReferenceImage } from './referenceImage'

export type ImageGenerationRequest = {
  prompt: string
  model?: string
  provider?: string
  ratio?: string
  count?: number
  style?: string
  referenceImage?: ReferenceImage
}

export type GeneratedImage = {
  dataUrl: string
  fileName: string
  provider: string
  model: string
}

export type ImageGenerationResponse = {
  requestId: string
  images: GeneratedImage[]
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5070').replace(/\/$/, '')

export async function generateImage(request: ImageGenerationRequest, signal?: AbortSignal): Promise<ImageGenerationResponse> {
  const response = await fetch(`${apiBaseUrl}/api/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })

  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { detail?: string; error?: string } | null
    throw new Error(problem?.detail || problem?.error || `图片生成失败（${response.status}）`)
  }

  const result = await response.json() as ImageGenerationResponse
  if (!Array.isArray(result.images) || !result.images.length || result.images.some((image) => !/^data:image\/(png|jpeg|webp);base64,/.test(image.dataUrl))) {
    throw new Error('生成服务未返回有效图片，请重试')
  }
  return result
}
