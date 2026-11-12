import type { Edge, Node, Viewport } from '@xyflow/react'
import type { ReferenceImage } from './referenceImage'

export const canvasRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const
export const nodeKinds = ['prompt', 'model', 'image', 'output', 'text', 'frame', 'note', 'branch'] as const
export type NodeKind = typeof nodeKinds[number]
export type CanvasNodeData = {
  [key: string]: unknown
  kind: NodeKind
  title: string
  text?: string
  image?: string
  ratio?: string
  model?: string
  prompt?: string
  enabled?: boolean
  locked?: boolean
  scale?: number
  color?: string
}
export type CanvasNode = Node<CanvasNodeData, 'nova'>
export type CanvasGraph = { nodes: CanvasNode[]; edges: Edge[] }
export type CanvasDocument = CanvasGraph & {
  version: 1
  viewport: Viewport
  prompt: string
  ratio: string
  reference?: ReferenceImage
}
export const nodeLabels: Record<NodeKind, string> = { prompt: '提示词', model: '模型', image: '图像', output: '输出', text: '文本', frame: '画框', note: '备注', branch: '条件开关' }
export function generationRatio(value: string | undefined, fallback = '16:9'): string {
  return canvasRatios.some((ratio) => ratio === value) ? value! : fallback
}
export function emptyCanvas(): CanvasDocument {
  return { version: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, prompt: '', ratio: '16:9' }
}
export function newCanvasNode(kind: NodeKind, position: { x: number; y: number }): CanvasNode {
  return {
    id: crypto.randomUUID(), type: 'nova', position,
    style: { width: kind === 'frame' ? 600 : 260, ...(kind === 'frame' ? { height: 420 } : {}) },
    zIndex: kind === 'frame' ? -1 : 0,
    data: { kind, title: nodeLabels[kind], ...(kind === 'model' ? { model: 'gpt-image-2', ratio: '16:9' } : {}), ...(kind === 'output' ? { scale: 1 } : {}), ...(kind === 'branch' ? { enabled: true } : {}), ...(['prompt', 'text', 'note'].includes(kind) ? { text: '' } : {}) },
  }
}
export function availablePosition(nodes: CanvasNode[], origin: { x: number; y: number }, width = 260, height = 460) {
  for (let attempt = 0; attempt <= nodes.length * 4; attempt += 1) {
    const position = { x: origin.x + (attempt % 4) * (width + 60), y: origin.y + Math.floor(attempt / 4) * (height + 60) }
    const overlaps = nodes.some((node) => {
      if (node.data.kind === 'frame') return false
      const parent = nodes.find((item) => item.id === node.parentId)
      const left = node.position.x + (parent?.position.x || 0)
      const top = node.position.y + (parent?.position.y || 0)
      const nodeWidth = node.measured?.width || Number(node.style?.width) || 260
      const nodeHeight = node.measured?.height || Number(node.style?.height) || (node.data.kind === 'image' ? 460 : 220)
      return position.x < left + nodeWidth + 20 && position.x + width + 20 > left && position.y < top + nodeHeight + 20 && position.y + height + 20 > top
    })
    if (!overlaps) return position
  }
  return { x: origin.x, y: Math.max(origin.y, ...nodes.map((node) => node.position.y + 500)) + 60 }
}
export function safeImageSource(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 28 * 1024 * 1024) return false
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) return true
  try {
    const url = new URL(value, window.location.href)
    return url.origin === window.location.origin && url.pathname.startsWith(import.meta.env.BASE_URL + 'assets/') && !url.search && !url.hash
  } catch { return false }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000000 }
export function parseCanvas(value: unknown): CanvasDocument {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.nodes) || !Array.isArray(value.edges) || value.nodes.length > 500 || value.edges.length > 2000) throw new Error('画布格式无效：需要版本 1，最多 500 个节点和 2000 条连线')
  const ids = new Set<string>()
  const nodes: CanvasNode[] = value.nodes.map((raw) => {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id || raw.id.length > 200 || ids.has(raw.id) || !isRecord(raw.data) || !isRecord(raw.position) || !finite(raw.position.x) || !finite(raw.position.y) || !nodeKinds.includes(raw.data.kind as NodeKind)) throw new Error('画布包含无效或重复节点')
    ids.add(raw.id)
    const data: CanvasNodeData = { kind: raw.data.kind as NodeKind, title: typeof raw.data.title === 'string' ? raw.data.title.slice(0, 200) : '未命名节点' }
    for (const key of ['text', 'prompt', 'ratio', 'model'] as const) if (typeof raw.data[key] === 'string') data[key] = raw.data[key].slice(0, 12000)
    if (raw.data.image !== undefined) { if (!safeImageSource(raw.data.image)) throw new Error('画布包含不支持的图片地址，请使用内嵌 PNG、JPEG 或 WebP'); data.image = raw.data.image }
    data.enabled = raw.data.enabled !== false
    data.locked = raw.data.locked === true
    data.scale = [1, 2, 4].includes(Number(raw.data.scale)) ? Number(raw.data.scale) : 1
    if (typeof raw.data.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.data.color)) data.color = raw.data.color
    const width = isRecord(raw.style) && finite(raw.style.width) ? Math.max(160, Math.min(4000, raw.style.width)) : data.kind === 'frame' ? 600 : 260
    const height = isRecord(raw.style) && finite(raw.style.height) ? Math.max(100, Math.min(4000, raw.style.height)) : undefined
    return { id: raw.id, type: 'nova', position: { x: raw.position.x, y: raw.position.y }, data, draggable: !data.locked, style: { width, ...(height ? { height } : {}) }, zIndex: data.kind === 'frame' ? -1 : 0, ...(typeof raw.parentId === 'string' ? { parentId: raw.parentId, extent: 'parent' as const } : {}) }
  })
  for (const node of nodes) if (node.parentId && (!nodes.some((parent) => parent.id === node.parentId && parent.data.kind === 'frame' && !parent.parentId) || node.data.kind === 'frame')) throw new Error('画框分组关系无效')
  const edgeIds = new Set<string>()
  const edges: Edge[] = value.edges.map((raw) => {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id || raw.id.length > 200 || edgeIds.has(raw.id) || typeof raw.source !== 'string' || typeof raw.target !== 'string' || !ids.has(raw.source) || !ids.has(raw.target) || raw.source === raw.target) throw new Error('画布连线无效')
    edgeIds.add(raw.id)
    if (nodes.some((node) => (node.id === raw.source || node.id === raw.target) && node.data.kind === 'frame')) throw new Error('画框不能作为工作流连线端点')
    return { id: raw.id, source: raw.source, target: raw.target, animated: true }
  })
  const viewport = isRecord(value.viewport) && finite(value.viewport.x) && finite(value.viewport.y) && finite(value.viewport.zoom) ? { x: value.viewport.x, y: value.viewport.y, zoom: Math.min(2.5, Math.max(0.1, value.viewport.zoom)) } : { x: 0, y: 0, zoom: 1 }
  const checked: CanvasGraph = { nodes, edges: [] }
  for (const edge of edges) {
    if (!canConnect(checked, edge.source, edge.target)) throw new Error('画布包含重复或循环连线')
    checked.edges.push(edge)
  }
  let reference: ReferenceImage | undefined
  if (isRecord(value.reference) && typeof value.reference.fileName === 'string' && safeImageSource(value.reference.dataUrl) && value.reference.dataUrl.startsWith('data:')) reference = { fileName: value.reference.fileName.slice(0, 200), dataUrl: value.reference.dataUrl }
  return { version: 1, nodes: nodes.sort((left, right) => Number(!!left.parentId) - Number(!!right.parentId)), edges, viewport, prompt: typeof value.prompt === 'string' ? value.prompt.slice(0, 12000) : '', ratio: canvasRatios.includes(value.ratio as typeof canvasRatios[number]) ? String(value.ratio) : '16:9', reference }
}
export function upstreamNodes(graph: CanvasGraph, targetId: string): CanvasNode[] {
  const visited = new Set<string>()
  const found: CanvasNode[] = []
  const visit = (id: string) => {
    if (visited.has(id)) return
    visited.add(id)
    const node = graph.nodes.find((item) => item.id === id)
    if (!node || (node.data.kind === 'branch' && node.data.enabled === false)) return
    for (const edge of graph.edges.filter((item) => item.target === id)) visit(edge.source)
    found.push(node)
  }
  visit(targetId)
  return found
}
export function canConnect(graph: CanvasGraph, source: string, target: string): boolean {
  if (source === target || graph.edges.some((edge) => edge.source === source && edge.target === target)) return false
  const visit = (id: string, seen = new Set<string>()): boolean => {
    if (id === source) return true
    if (seen.has(id)) return false
    seen.add(id)
    return graph.edges.some((edge) => edge.source === id && visit(edge.target, seen))
  }
  return !visit(target)
}
