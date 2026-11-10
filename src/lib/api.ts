export type ImageGenerationRequest = {
  prompt: string
  model?: string
  provider?: string
  ratio?: string
  count?: number
  style?: string
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

export async function generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
  const response = await fetch(`${apiBaseUrl}/api/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `图片生成失败（${response.status}）`)
  }

  return response.json() as Promise<ImageGenerationResponse>
}
