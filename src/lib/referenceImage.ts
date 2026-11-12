export type ReferenceImage = { fileName: string; dataUrl: string }

export async function readReferenceImage(file: File): Promise<ReferenceImage> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('参考图仅支持 PNG、JPEG 或 WebP 格式')
  }
  if (!file.size || file.size > 10 * 1024 * 1024) {
    throw new Error('参考图不能为空，且不能超过 10 MB')
  }
  const preview = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = preview
    await image.decode()
  } catch {
    throw new Error('无法读取参考图，请选择有效的图片文件')
  } finally {
    URL.revokeObjectURL(preview)
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('参考图读取失败'))
    reader.onerror = () => reject(new Error('参考图读取失败'))
    reader.readAsDataURL(file)
  })
  return { fileName: file.name, dataUrl }
}

export async function referenceImageFromUrl(url: string, fileName: string, signal?: AbortSignal): Promise<ReferenceImage> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error('无法加载参考图，请重新上传')
  const blob = await response.blob()
  return readReferenceImage(new File([blob], fileName, { type: blob.type }))
}
