import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { addEdge, applyEdgeChanges, applyNodeChanges, Background, BackgroundVariant, Controls, Handle, MiniMap, NodeResizer, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Connection, type EdgeChange, type NodeChange, type NodeProps, type Viewport } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowLeft, AtSign, Box, Check, ChevronDown, Copy, Download, FileText, FolderOpen, Frame, Hand, Image as ImageIcon, List, Lock, Maximize2, MessageSquare, MousePointer2, Plus, Redo2, RefreshCw, Search, Share2, Sparkles, Trash2, Type, Undo2, Unlock, Upload, WandSparkles, X, Zap } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { generateImage } from '../lib/api'
import { readReferenceImage, referenceImageFromUrl, type ReferenceImage } from '../lib/referenceImage'
import { availablePosition, canConnect, canvasRatios, emptyCanvas, generationRatio, newCanvasNode, nodeLabels, parseCanvas, upstreamNodes, type CanvasDocument, type CanvasGraph, type CanvasNode, type CanvasNodeData, type NodeKind } from '../lib/canvasDocument'
import { getCanvas, listAssets, saveAssets, saveCanvas, type StoredCanvas, type StudioAsset } from '../lib/studioStorage'
import '../canvas-workspace.css'

const icons = { prompt: FileText, model: Box, image: ImageIcon, output: WandSparkles, text: Type, frame: Frame, note: MessageSquare, branch: Zap }
const NodeActions = createContext<{ begin: () => void; end: () => void; update: (id: string, patch: Partial<CanvasNodeData>) => void; run: (id: string) => void; output: (id: string) => void } | null>(null)

function NodeCard({ id, data, selected }: NodeProps<CanvasNode>) {
  const actions = useContext(NodeActions)
  const Icon = icons[data.kind]
  return <div className={'nova-node kind-' + data.kind + (selected ? ' selected' : '')} style={{ ...(data.color ? { borderColor: data.color } : {}) }}>
    <NodeResizer isVisible={selected && !data.locked} minWidth={160} minHeight={data.kind === 'frame' ? 180 : 100} onResizeStart={actions?.begin} onResizeEnd={actions?.end} color="#48e3ed" />
    {data.kind !== 'frame' ? <Handle type="target" position={Position.Left} /> : null}
    <div className="node-head"><span><Icon size={15} />{data.title}</span>{data.locked ? <Lock size={13} /> : null}</div>
    {data.image ? <img className="node-image" src={data.image} alt={data.title} draggable={false} /> : null}
    {['prompt', 'text', 'note'].includes(data.kind) ? <textarea className="nodrag nowheel canvas-node-text" aria-label={nodeLabels[data.kind] + '内容'} value={data.text || ''} placeholder={data.kind === 'prompt' ? '输入提示词并连线到模型或图像' : '双击编辑内容'} onFocus={actions?.begin} onBlur={actions?.end} onChange={(event) => actions?.update(id, { text: event.target.value })} maxLength={12000} readOnly={data.locked} /> : null}
    {data.kind === 'model' ? <div className="model-node-body"><strong>{data.model || 'gpt-image-2'}</strong><span>{data.ratio || '16:9'} · 1 张</span><button className="nodrag" onClick={() => actions?.run(id)}>运行上游提示词</button></div> : null}
    {data.kind === 'image' ? <div className="image-node-meta"><span>{data.ratio || '原图'}</span><button className="nodrag" onClick={() => actions?.run(id)}>{data.image ? '参考此图生成' : '生成图像'}</button></div> : null}
    {data.kind === 'output' ? <div className="output-node-body"><label>输出倍率 <strong>{data.scale || 1}×</strong></label><small>本地重采样，非 AI 超分辨率</small><button className="nodrag" onClick={() => actions?.output(id)}><Download size={14} />导出上游图片</button></div> : null}
    {data.kind === 'branch' ? <div className="output-node-body"><label><input className="nodrag" type="checkbox" checked={data.enabled !== false} onChange={(event) => actions?.update(id, { enabled: event.target.checked })} />启用此路上游输入</label><small>关闭后不会传递上游提示词与参考图</small></div> : null}
    {data.kind !== 'frame' ? <Handle type="source" position={Position.Right} /> : null}
  </div>
}
const nodeTypes = { nova: NodeCard }
type CanvasMetadata = { name: string; prompt: string; ratio: string; reference: ReferenceImage | null; viewport: Viewport }

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName.replace(/[\\/:*?"<>|]/g, '_')
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function CanvasStudio() {
  const [params] = useSearchParams()
  const id = params.get('project') || 'default'
  const [loaded, setLoaded] = useState<{ id: string; name: string; document: CanvasDocument } | null>(null)
  const [loadFailure, setLoadFailure] = useState<{ id: string; message: string } | null>(null)
  const loadError = loadFailure?.id === id ? loadFailure.message : ''
  const navigate = useNavigate()
  useEffect(() => {
    let active = true
    void getCanvas(id).then((record) => {
      if (!active) return
      if (!record && id !== 'default') throw new Error('找不到此画布。画布保存在当前浏览器中，可通过 JSON 文件跨设备导入。')
      setLoaded({ id, name: record?.name || '未命名画布', document: record ? parseCanvas(record.payload) : emptyCanvas() })
    }).catch((error: unknown) => { if (active) setLoadFailure({ id, message: error instanceof Error ? error.message : '画布加载失败' }) })
    return () => { active = false }
  }, [id])
  if (loadError) return <div className="canvas-load-state"><p role="alert">{loadError}</p><button onClick={() => navigate('/assets')}>返回作品资产</button></div>
  if (!loaded || loaded.id !== id) return <div className="canvas-load-state" role="status">正在恢复画布…</div>
  return <ReactFlowProvider><CanvasWorkspace key={id} projectId={id} initialName={loaded.name} initial={loaded.document} /></ReactFlowProvider>
}

function CanvasWorkspace({ projectId, initialName, initial }: { projectId: string; initialName: string; initial: CanvasDocument }) {
  const navigate = useNavigate()
  const { fitView, screenToFlowPosition, getViewport, setViewport } = useReactFlow<CanvasNode>()
  const [graph, setGraph] = useState<CanvasGraph>({ nodes: initial.nodes, edges: initial.edges })
  const graphRef = useRef(graph)
  const [projectName, setProjectName] = useState(initialName)
  const [canvasPrompt, setCanvasPrompt] = useState(initial.prompt)
  const [ratio, setRatio] = useState(initial.ratio)
  const [reference, setReference] = useState<ReferenceImage | null>(initial.reference || null)
  const [viewport, updateViewport] = useState(initial.viewport)
  const [revision, setRevision] = useState(0)
  const currentDraft = useMemo(() => ({ revision, projectName, canvasPrompt, ratio, reference, viewport }), [revision, projectName, canvasPrompt, ratio, reference, viewport])
  const [savedDraft, setSavedDraft] = useState<typeof currentDraft | null>(null)
  const saved = savedDraft === currentDraft
  const [saveError, setSaveError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [mode, setMode] = useState<'select' | 'pan'>('select')
  const [showList, setShowList] = useState(true)
  const [nodeQuery, setNodeQuery] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [showMenu, setShowMenu] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showAssets, setShowAssets] = useState(false)
  const [assetQuery, setAssetQuery] = useState('')
  const [assets, setAssets] = useState<StudioAsset[]>([])
  const [generating, setGenerating] = useState(false)
  const [reading, setReading] = useState(false)
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 })
  const history = useRef<{ past: CanvasGraph[]; future: CanvasGraph[] }>({ past: [], future: [] })
  const historyMetadata = useRef(new WeakMap<CanvasGraph, CanvasMetadata>())
  const metadataRef = useRef<CanvasMetadata>({ name: initialName, prompt: initial.prompt, ratio: initial.ratio, reference: initial.reference || null, viewport: initial.viewport })
  const editStart = useRef<CanvasGraph | null>(null)
  const generation = useRef<AbortController | null>(null)
  const referenceLoad = useRef<AbortController | null>(null)
  const referenceVersion = useRef(0)
  const mounted = useRef(true)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const latestRecord = useRef<StoredCanvas | null>(null)
  const lastSavedRecord = useRef<StoredCanvas | null>(null)
  const draftByRecord = useRef(new WeakMap<StoredCanvas, typeof currentDraft>())
  const latestSaveToken = useRef(0)
  const uploadInput = useRef<HTMLInputElement>(null)
  const referenceInput = useRef<HTMLInputElement>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const selected = graph.nodes.find((node) => node.id === selectedId)
  useEffect(() => {
    metadataRef.current = { name: projectName, prompt: canvasPrompt, ratio, reference, viewport }
  }, [projectName, canvasPrompt, ratio, reference, viewport])
  const restoreMetadata = useCallback((snapshot: CanvasGraph) => {
    const metadata = historyMetadata.current.get(snapshot)
    if (!metadata) return
    setProjectName(metadata.name)
    setCanvasPrompt(metadata.prompt)
    setRatio(metadata.ratio)
    setReference(metadata.reference)
    updateViewport(metadata.viewport)
    void setViewport(metadata.viewport)
  }, [setViewport])

  const saveRecord = useCallback((record: StoredCanvas) => {
    const token = ++latestSaveToken.current
    const next = saveQueue.current.catch(() => {}).then(() => saveCanvas(record))
    saveQueue.current = next
    void next.then(() => { lastSavedRecord.current = record; if (mounted.current && token === latestSaveToken.current) { setSavedDraft(draftByRecord.current.get(record) || null); setSaveError('') } }).catch((reason: unknown) => { if (mounted.current) { setSavedDraft(null); setSaveError(reason instanceof Error ? reason.message : '保存失败，请先导出备份') } })
    return next
  }, [])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current?.abort()
      referenceLoad.current?.abort()
      referenceVersion.current += 1
      if (latestRecord.current && latestRecord.current !== lastSavedRecord.current) void saveRecord(latestRecord.current).catch(() => {})
    }
  }, [saveRecord])
  useEffect(() => {
    const { projectName, canvasPrompt, ratio, reference, viewport } = currentDraft
    const record: StoredCanvas = { id: projectId, name: projectName.trim() || '未命名画布', updatedAt: new Date().toISOString(), payload: { version: 1, ...graphRef.current, viewport, prompt: canvasPrompt, ratio, ...(reference ? { reference } : {}) } }
    draftByRecord.current.set(record, currentDraft)
    latestRecord.current = record
    const timer = window.setTimeout(() => { void saveRecord(record).catch(() => {}) }, 350)
    return () => window.clearTimeout(timer)
  }, [currentDraft, projectId, saveRecord])

  const syncHistory = useCallback(() => setHistoryCounts({ past: history.current.past.length, future: history.current.future.length }), [])
  const markChanged = useCallback(() => { setRevision((current) => current + 1) }, [])
  const replaceGraph = useCallback((next: CanvasGraph, record = true, dirty = true) => {
    if (record) {
      history.current.past = [...history.current.past.slice(-79), graphRef.current]
      history.current.future = []
      syncHistory()
    }
    graphRef.current = next
    setGraph(next)
    if (dirty) markChanged()
  }, [markChanged, syncHistory])
  const beginEdit = useCallback(() => { if (!editStart.current) editStart.current = graphRef.current }, [])
  const endEdit = useCallback(() => {
    const before = editStart.current
    editStart.current = null
    if (before && before !== graphRef.current) {
      history.current.past = [...history.current.past.slice(-79), before]
      history.current.future = []
      syncHistory()
      markChanged()
    }
  }, [markChanged, syncHistory])
  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    const current = graphRef.current
    const next = { ...current, nodes: applyNodeChanges(changes, current.nodes) }
    const substantive = changes.some((change) => change.type !== 'select' && change.type !== 'dimensions')
    const dirty = substantive || changes.some((change) => change.type === 'dimensions' && change.resizing !== undefined)
    replaceGraph(next, substantive && !editStart.current, dirty)
  }, [replaceGraph])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const current = graphRef.current
    const substantive = changes.some((change) => change.type !== 'select')
    replaceGraph({ ...current, edges: applyEdgeChanges(changes, current.edges) }, substantive, substantive)
  }, [replaceGraph])
  const undo = useCallback(() => {
    endEdit()
    const previous = history.current.past.pop()
    if (!previous) return
    historyMetadata.current.set(graphRef.current, metadataRef.current)
    history.current.future.unshift(graphRef.current)
    restoreMetadata(previous)
    replaceGraph(previous, false)
    syncHistory()
    setSelectedId('')
  }, [endEdit, replaceGraph, restoreMetadata, syncHistory])
  const redo = useCallback(() => {
    const next = history.current.future.shift()
    if (!next) return
    historyMetadata.current.set(graphRef.current, metadataRef.current)
    history.current.past.push(graphRef.current)
    restoreMetadata(next)
    replaceGraph(next, false)
    syncHistory()
    setSelectedId('')
  }, [replaceGraph, restoreMetadata, syncHistory])
  const updateNode = useCallback((id: string, patch: Partial<CanvasNodeData>) => {
    const current = graphRef.current
    replaceGraph({ ...current, nodes: current.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, ...patch }, ...(patch.locked !== undefined ? { draggable: !patch.locked } : {}) } : node) }, !editStart.current)
  }, [replaceGraph])
  const centerPosition = useCallback(() => {
    const bounds = stage.current?.getBoundingClientRect()
    return screenToFlowPosition({ x: bounds ? bounds.left + bounds.width / 2 - 130 : window.innerWidth / 2, y: bounds ? bounds.top + bounds.height / 2 - 100 : window.innerHeight / 2 })
  }, [screenToFlowPosition])
  const focusNode = useCallback((id: string) => {
    const current = graphRef.current
    const node = current.nodes.find((item) => item.id === id)
    if (!node) return
    replaceGraph({ ...current, nodes: current.nodes.map((item) => ({ ...item, selected: item.id === id })) }, false, false)
    setSelectedId(id)
    void fitView({ nodes: [node], duration: 300, padding: 0.7, maxZoom: 1.2 })
  }, [fitView, replaceGraph])
  const addNode = useCallback((kind: NodeKind, patch?: Partial<CanvasNodeData>, position?: { x: number; y: number }) => {
    const current = graphRef.current
    const origin = position || centerPosition()
    const location = { ...origin }
    if (!position) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const overlaps = current.nodes.some((item) => !item.parentId && item.data.kind !== 'frame' && Math.abs(item.position.x - location.x) < 280 && Math.abs(item.position.y - location.y) < 200)
        if (!overlaps) break
        location.x = origin.x + ((attempt + 1) % 3) * 300
        location.y = origin.y + Math.floor((attempt + 1) / 3) * 240
      }
    }
    const node = newCanvasNode(kind, location)
    node.data = { ...node.data, ...patch }
    replaceGraph({ ...current, nodes: [...current.nodes.map((item) => ({ ...item, selected: false })), { ...node, selected: true }] })
    setSelectedId(node.id)
    setShowMenu(false)
    return node
  }, [centerPosition, replaceGraph])
  const removeSelection = useCallback(() => {
    const current = graphRef.current
    const ids = new Set(current.nodes.filter((node) => node.selected || node.id === selectedId).map((node) => node.id))
    for (const node of current.nodes) if (node.parentId && ids.has(node.parentId)) ids.add(node.id)
    const removable = new Set(current.nodes.filter((node) => ids.has(node.id) && !node.data.locked).map((node) => node.id))
    for (const node of current.nodes) if (node.parentId && removable.has(node.parentId)) removable.add(node.id)
    if (!removable.size && !current.edges.some((edge) => edge.selected)) return
    replaceGraph({ nodes: current.nodes.filter((node) => !removable.has(node.id)), edges: current.edges.filter((edge) => !edge.selected && !removable.has(edge.source) && !removable.has(edge.target)) })
    setSelectedId('')
  }, [replaceGraph, selectedId])
  const duplicateSelection = useCallback(() => {
    const current = graphRef.current
    const chosen = current.nodes.filter((node) => node.selected || node.id === selectedId)
    const chosenIds = new Set(chosen.map((node) => node.id))
    const originals = current.nodes.filter((node) => chosenIds.has(node.id) || (node.parentId && chosenIds.has(node.parentId)))
    if (!originals.length) return
    const ids = new Map(originals.map((node) => [node.id, crypto.randomUUID()]))
    const clones = originals.map((node): CanvasNode => {
      const parentCloned = node.parentId && ids.has(node.parentId)
      const parent = current.nodes.find((item) => item.id === node.parentId)
      return { ...node, id: ids.get(node.id)!, selected: true, parentId: parentCloned ? ids.get(node.parentId!) : undefined, extent: parentCloned ? 'parent' : undefined, position: { x: node.position.x + (parentCloned ? 0 : (parent?.position.x || 0) + 40), y: node.position.y + (parentCloned ? 0 : (parent?.position.y || 0) + 40) }, data: { ...node.data, title: node.data.title + ' 副本', locked: false }, draggable: true }
    })
    const edges = current.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).map((edge) => ({ ...edge, id: crypto.randomUUID(), source: ids.get(edge.source)!, target: ids.get(edge.target)! }))
    replaceGraph({ nodes: [...current.nodes.map((node) => ({ ...node, selected: false })), ...clones], edges: [...current.edges, ...edges] })
    setSelectedId(clones[0].id)
  }, [replaceGraph, selectedId])
  const groupSelection = useCallback(() => {
    const current = graphRef.current
    const chosen = current.nodes.filter((node) => node.selected && !node.parentId && node.data.kind !== 'frame' && !node.data.locked)
    if (!chosen.length) { addNode('frame'); return }
    const left = Math.min(...chosen.map((node) => node.position.x)) - 30
    const top = Math.min(...chosen.map((node) => node.position.y)) - 60
    const right = Math.max(...chosen.map((node) => node.position.x + (node.measured?.width || Number(node.style?.width) || 260))) + 30
    const bottom = Math.max(...chosen.map((node) => node.position.y + (node.measured?.height || 220))) + 30
    const frame = newCanvasNode('frame', { x: left, y: top })
    frame.style = { width: right - left, height: bottom - top }
    const ids = new Set(chosen.map((node) => node.id))
    replaceGraph({ ...current, nodes: [frame, ...current.nodes.map((node) => ids.has(node.id) ? { ...node, selected: false, parentId: frame.id, extent: 'parent' as const, position: { x: node.position.x - left, y: node.position.y - top } } : node)] })
    setSelectedId(frame.id)
  }, [addNode, replaceGraph])
  const ungroup = () => {
    if (!selected || selected.data.kind !== 'frame') return
    replaceGraph({ ...graphRef.current, nodes: graphRef.current.nodes.filter((node) => node.id !== selected.id).map((node) => node.parentId === selected.id ? { ...node, parentId: undefined, extent: undefined, position: { x: node.position.x + selected.position.x, y: node.position.y + selected.position.y } } : node) })
    setSelectedId('')
  }
  const onConnect = (connection: Connection) => {
    if (!canConnect(graphRef.current, connection.source, connection.target)) { setError('不能重复连线或建立循环依赖'); return }
    replaceGraph({ ...graphRef.current, edges: addEdge({ ...connection, animated: true }, graphRef.current.edges) })
  }
  const clearReference = () => {
    referenceVersion.current += 1
    referenceLoad.current?.abort()
    setReading(false)
    setReference(null)
  }
  const loadReference = useCallback(async (node: CanvasNode) => {
    if (!node.data.image || generation.current) return null
    const version = ++referenceVersion.current
    referenceLoad.current?.abort()
    const controller = new AbortController()
    referenceLoad.current = controller
    setReading(true)
    setError('')
    setReference(null)
    try {
      const image = await referenceImageFromUrl(node.data.image, node.data.title, controller.signal)
      if (!mounted.current || version !== referenceVersion.current || controller.signal.aborted) return null
      setReference(image)
      return image
    } catch (reason) {
      if (!controller.signal.aborted && mounted.current) setError(reason instanceof Error ? reason.message : '参考图读取失败')
      return null
    } finally {
      if (mounted.current && version === referenceVersion.current) setReading(false)
    }
  }, [])
  const uploadFiles = async (files: File[], asReference: boolean, position?: { x: number; y: number }) => {
    if (generation.current) return
    const version = ++referenceVersion.current
    referenceLoad.current?.abort()
    setReading(true)
    setError('')
    try {
      for (const [index, file] of files.slice(0, asReference ? 1 : 20).entries()) {
        const image = await readReferenceImage(file)
        if (!mounted.current || version !== referenceVersion.current) return
        if (asReference) { setReference(image); break }
        const location = position || centerPosition()
        const node = addNode('image', { title: file.name, image: image.dataUrl }, { x: location.x + index * 50, y: location.y + index * 50 })
        await saveAssets([{ id: node.id, dataUrl: image.dataUrl, title: file.name, prompt: '', model: '', ratio: '原图', createdAt: new Date().toISOString(), favorite: false, source: 'upload' }])
      }
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : '上传失败') }
    finally { if (mounted.current && version === referenceVersion.current) setReading(false) }
  }
  const cancelGeneration = () => {
    generation.current?.abort()
    generation.current = null
    setGenerating(false)
    setNotice('已取消当前请求')
  }
  const runGeneration = useCallback(async (targetId?: string) => {
    if (generation.current || reading) return
    setError('')
    setNotice('')
    const current = graphRef.current
    const target = current.nodes.find((node) => node.id === targetId)
    const upstream = target ? upstreamNodes(current, target.id) : []
    const promptParts = upstream.filter((node) => node.data.kind === 'prompt').map((node) => node.data.text?.trim()).filter(Boolean)
    const prompt = promptParts.length ? promptParts.join('\n') : canvasPrompt.trim()
    if (!prompt) { setError('请输入提示词，或连接一个有内容的提示词节点'); return }
    const modelNode = upstream.findLast((node) => node.data.kind === 'model')
    const requestRatio = generationRatio(modelNode?.data.ratio, generationRatio(target?.data.ratio, ratio))
    const imageNode = target?.data.image ? target : upstream.findLast((node) => !!node.data.image)
    const controller = new AbortController()
    generation.current = controller
    setGenerating(true)
    try {
      const referenceImage = imageNode?.data.image ? await referenceImageFromUrl(imageNode.data.image, imageNode.data.title, controller.signal) : reference
      const response = await generateImage({ prompt, ratio: requestRatio, count: 1, model: 'gpt-image-2', provider: 'local-gpt-image', referenceImage: referenceImage || undefined }, controller.signal)
      if (!mounted.current || controller.signal.aborted || generation.current !== controller) return
      const parent = target?.parentId ? current.nodes.find((item) => item.id === target.parentId) : undefined
      const origin = target ? { x: target.position.x + (parent?.position.x || 0) + 320, y: target.position.y + (parent?.position.y || 0) + 30 } : centerPosition()
      const node = newCanvasNode('image', availablePosition(graphRef.current.nodes, origin))
      node.data = { kind: 'image', title: '生成结果 ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), image: response.images[0].dataUrl, prompt, ratio: requestRatio, model: response.images[0].model }
      const latest = graphRef.current
      replaceGraph({ nodes: [...latest.nodes.map((item) => ({ ...item, selected: false })), { ...node, selected: true }], edges: target && latest.nodes.some((item) => item.id === target.id) ? [...latest.edges, { id: crypto.randomUUID(), source: target.id, target: node.id, animated: true }] : latest.edges })
      setSelectedId(node.id)
      setNotice('生成完成，结果已插入画布')
      await saveAssets([{ id: node.id, dataUrl: response.images[0].dataUrl, title: node.data.title, prompt, ratio: requestRatio, model: response.images[0].model, createdAt: new Date().toISOString(), favorite: false, source: 'canvas' }])
    } catch (reason) { if (mounted.current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : '生成失败') }
    finally { if (mounted.current && generation.current === controller) { generation.current = null; setGenerating(false) } }
  }, [canvasPrompt, centerPosition, ratio, reading, reference, replaceGraph])
  const outputImage = useCallback(async (id: string) => {
    setError('')
    try {
      const current = graphRef.current
      const node = current.nodes.find((item) => item.id === id)
      const imageNode = node?.data.image ? node : upstreamNodes(current, id).findLast((item) => !!item.data.image)
      if (!imageNode?.data.image) throw new Error('请先连接一个有图片的上游节点')
      const image = new Image()
      image.src = imageNode.data.image
      await image.decode()
      const scale = node?.data.kind === 'output' ? node.data.scale || 1 : 1
      const width = image.naturalWidth * scale
      const height = image.naturalHeight * scale
      if (width * height > 32000000 || width > 16000 || height > 16000) throw new Error('输出过大，请降低倍率（最大 3200 万像素）')
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('浏览器不支持图片导出')
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, width, height)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('导出图片失败')), 'image/png'))
      downloadBlob(blob, imageNode.data.title + '.png')
      setNotice('图片已导出')
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : '图片导出失败') }
  }, [])
  const openAssetPicker = async () => {
    setShowAssets(true)
    setError('')
    try { setAssets(await listAssets()) } catch (reason) { setError(reason instanceof Error ? reason.message : '素材加载失败') }
  }
  const currentDocument = (): CanvasDocument => ({ version: 1, ...graphRef.current, prompt: canvasPrompt, ratio, viewport: getViewport(), ...(reference ? { reference } : {}) })
  const exportWorkflow = () => {
    downloadBlob(new Blob([JSON.stringify({ name: projectName, ...currentDocument() }, null, 2)], { type: 'application/json' }), (projectName || 'nova-canvas') + '.json')
    setNotice('已导出画布文件，可在其他浏览器导入')
  }
  const importWorkflow = async (file: File) => {
    setError('')
    try {
      if (file.size > 80 * 1024 * 1024) throw new Error('画布文件不能超过 80 MB')
      const value = JSON.parse(await file.text()) as unknown
      const document = parseCanvas(value)
      if (graphRef.current.nodes.length && !window.confirm('导入会替换当前画布内容，现有内容可撤销。是否继续？')) return
      historyMetadata.current.set(graphRef.current, metadataRef.current)
      replaceGraph({ nodes: document.nodes, edges: document.edges })
      setCanvasPrompt(document.prompt)
      setRatio(document.ratio)
      setReference(document.reference || null)
      if (typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string') setProjectName(value.name.slice(0, 120))
      void setViewport(document.viewport)
      updateViewport(document.viewport)
      setSelectedId('')
      setNotice('画布导入成功')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法导入画布文件') }
  }
  const newProject = async () => {
    try {
      if (latestRecord.current) await saveRecord(latestRecord.current)
      const id = crypto.randomUUID()
      await saveCanvas({ id, name: '未命名画布', updatedAt: new Date().toISOString(), payload: emptyCanvas() })
      navigate('/canvas?project=' + encodeURIComponent(id))
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法创建画布') }
  }
  const share = async () => {
    try {
      if (latestRecord.current) await saveRecord(latestRecord.current)
      const url = new URL(window.location.href)
      url.hash = '/canvas?project=' + encodeURIComponent(projectId)
      await navigator.clipboard.writeText(url.toString())
      setNotice('已复制本机画布链接。跨设备分享请导出 JSON 文件。')
    } catch { setError('链接复制失败，请使用导出 JSON 分享画布') }
  }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedId('')
        setShowAssets(false)
        setShowHelp(false)
        setShowMenu(false)
        return
      }
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const command = event.ctrlKey || event.metaKey
      if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
      if (command && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
      if (command && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelection() }
      if (command && event.key.toLowerCase() === 'g') { event.preventDefault(); groupSelection() }
      if (command && event.key.toLowerCase() === 'a') { event.preventDefault(); replaceGraph({ ...graphRef.current, nodes: graphRef.current.nodes.map((node) => ({ ...node, selected: true })) }, false, false) }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelection() }
      if (event.key.toLowerCase() === 'v' && !command) setMode('select')
      if (event.key.toLowerCase() === 'h' && !command) setMode('pan')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [duplicateSelection, groupSelection, redo, removeSelection, replaceGraph, undo])
  const visibleNodes = useMemo(() => graph.nodes.filter((node) => (kindFilter === 'all' || node.data.kind === kindFilter) && [node.data.title, node.data.text, node.data.prompt, nodeLabels[node.data.kind]].join(' ').toLowerCase().includes(nodeQuery.trim().toLowerCase())), [graph.nodes, kindFilter, nodeQuery])
  const nodeActions = useMemo(() => ({ begin: beginEdit, end: endEdit, update: updateNode, run: (id: string) => { void runGeneration(id) }, output: (id: string) => { void outputImage(id) } }), [beginEdit, endEdit, updateNode, runGeneration, outputImage])
  const insertPromptHint = (hint: string) => setCanvasPrompt((current) => current ? current + '，' + hint : hint)

  return <div className="canvas-studio">
    <header className="canvas-topbar">
      <div className="canvas-brand"><Brand /><button className="canvas-back" onClick={() => navigate('/')} title="返回首页"><ArrowLeft size={18} /></button><input value={projectName} onChange={(event) => setProjectName(event.target.value)} aria-label="项目名称" maxLength={120} /><span className={'save-status' + (saveError ? ' has-error' : '')} role="status">{saved ? <Check size={12} /> : null}{saveError ? '保存失败' : saved ? '已保存到本机' : '保存中…'}</span></div>
      <div className="canvas-mode-tools"><button title="撤销 Ctrl+Z" onClick={undo} disabled={!historyCounts.past}><Undo2 size={17} /></button><button title="重做 Ctrl+Shift+Z" onClick={redo} disabled={!historyCounts.future}><Redo2 size={17} /></button><i /><button className={mode === 'select' ? 'active' : ''} title="选择 V" onClick={() => setMode('select')}><MousePointer2 size={17} /></button><button className={mode === 'pan' ? 'active' : ''} title="抓手 H" onClick={() => setMode('pan')}><Hand size={17} /></button><button title="添加备注" onClick={() => addNode('note')}><MessageSquare size={17} /></button><button title="显示节点列表" onClick={() => setShowList((value) => !value)}><List size={17} /></button><button onClick={() => void fitView({ duration: 300, padding: 0.3, maxZoom: 1.2 })}><Maximize2 size={16} />适应画布</button></div>
      <div className="canvas-actions"><button onClick={() => navigate('/assets')} title="画布项目列表"><FolderOpen size={16} /></button><button onClick={() => void newProject()} title="新建空白画布"><Plus size={16} /></button><button onClick={share} title="复制本机画布链接"><Share2 size={16} /></button><button onClick={() => importInput.current?.click()} title="导入画布 JSON"><Upload size={16} /></button><button className="primary-button" onClick={exportWorkflow} title="导出画布 JSON"><Download size={16} />导出</button><button onClick={() => setShowHelp(true)} title="快捷键帮助">?</button></div>
    </header>
    <input ref={uploadInput} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple aria-label="上传画布素材" onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ''; void uploadFiles(files, false) }} />
    <input ref={referenceInput} hidden type="file" accept="image/png,image/jpeg,image/webp" aria-label="上传画布参考图" onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ''; void uploadFiles(files, true) }} />
    <input ref={importInput} hidden type="file" accept=".json,application/json" aria-label="导入画布文件" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importWorkflow(file) }} />
    <aside className="canvas-toolrail">
      {(['prompt', 'image', 'model', 'output', 'text', 'frame', 'note'] as NodeKind[]).map((kind) => { const Icon = icons[kind]; return <button key={kind} title={'添加' + nodeLabels[kind]} onClick={() => kind === 'frame' ? groupSelection() : addNode(kind)}><Icon size={19} /><span>{nodeLabels[kind]}</span></button> })}
      <i /><button onClick={() => uploadInput.current?.click()} title="上传素材" disabled={reading || generating}><Upload size={19} /><span>上传</span></button><button onClick={() => void openAssetPicker()} title="从作品库插入"><FolderOpen size={19} /><span>素材库</span></button>
    </aside>
    <main className="flow-stage" ref={stage} onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }} onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); void uploadFiles(Array.from(event.dataTransfer.files), false, screenToFlowPosition({ x: event.clientX, y: event.clientY })) } }}>
      <NodeActions.Provider value={nodeActions}>
        <ReactFlow<CanvasNode> nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeDragStart={beginEdit} onNodeDragStop={endEdit} onSelectionDragStart={beginEdit} onSelectionDragStop={endEdit} onNodeClick={(_, node) => setSelectedId(node.id)} onPaneClick={() => setSelectedId('')} onMoveEnd={(_, nextViewport: Viewport) => updateViewport(nextViewport)} defaultViewport={initial.viewport} panOnDrag={mode === 'pan' ? true : [1, 2]} selectionOnDrag={mode === 'select'} nodesDraggable={mode === 'select'} deleteKeyCode={null} multiSelectionKeyCode="Shift" minZoom={0.1} maxZoom={2.5} defaultEdgeOptions={{ style: { stroke: '#5ce7ee', strokeWidth: 2 } }}>
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.1} color="#23343a" /><MiniMap pannable zoomable nodeColor={(node) => node.data.kind === 'frame' ? '#243d49' : '#4adce8'} maskColor="rgba(5,9,12,.72)" /><Controls showInteractive={false} />
        </ReactFlow>
      </NodeActions.Provider>
      {!graph.nodes.length ? <div className="canvas-empty-hint"><Frame size={30} /><strong>从一张图片或一句提示词开始</strong><span>拖入图片 · 左侧添加节点 · 连线组织创意</span></div> : null}
      {showList ? <section className="canvas-node-list" aria-label="节点列表"><div><strong>节点 <small>{visibleNodes.length}/{graph.nodes.length}</small></strong><button className="icon-button" onClick={() => setShowList(false)} title="收起节点列表"><X size={14} /></button></div><label><Search size={14} /><input aria-label="搜索节点" placeholder="名称、内容或提示词" value={nodeQuery} onChange={(event) => setNodeQuery(event.target.value)} /></label><select aria-label="节点类型筛选" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}><option value="all">全部类型</option>{Object.entries(nodeLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select><div className="canvas-node-options" role="listbox" aria-label="可选择的节点">{visibleNodes.map((node) => <button key={node.id} role="option" aria-selected={node.id === selectedId} onClick={() => focusNode(node.id)} title={'选择并定位：' + node.data.title}><span>{node.data.title}</span><small>{nodeLabels[node.data.kind]}{node.data.locked ? ' · 锁定' : ''}</small></button>)}{!visibleNodes.length ? <p>没有匹配节点</p> : null}</div></section> : <button className="canvas-list-toggle" onClick={() => setShowList(true)} title="显示节点列表"><List size={18} /></button>}
      <button className="add-node-trigger" onClick={() => setShowMenu((value) => !value)}><Plus size={18} />添加节点<ChevronDown size={15} /></button>
      {showMenu ? <div className="add-node-menu">{Object.entries(nodeLabels).map(([kind, label]) => <button key={kind} onClick={() => addNode(kind as NodeKind)}>{label}</button>)}</div> : null}
      <section className="canvas-composer">
        <div className="canvas-composer-tools"><button disabled={reading || generating} onClick={() => referenceInput.current?.click()}><Plus size={13} />参考</button><button onClick={() => addNode('note', { text: canvasPrompt, title: '创作标记' })}>标记</button><button onClick={() => insertPromptHint('柔和辉光，电影胶片质感')}>特效提示</button><button onClick={() => void openAssetPicker()}>角色/素材库</button><button onClick={() => insertPromptHint('低机位广角构图，主体居中，动态透视')}>镜头提示</button></div>
        <div className="reference-row">{reading ? <small role="status">正在读取参考图…</small> : reference ? <span className="reference-chip"><img src={reference.dataUrl} alt="已选择参考图预览" /><em>{reference.fileName}</em><button disabled={generating} title="移除参考图" onClick={clearReference}><X size={13} /></button></span> : <small>可上传参考图，或在图像节点属性中选择“用作参考图”</small>}</div>
        <label><AtSign size={18} /><textarea aria-label="画布提示词" value={canvasPrompt} onChange={(event) => setCanvasPrompt(event.target.value)} maxLength={12000} placeholder="描述画面；运行节点时会读取连线的上游提示词和图片" /></label>
        <div className="canvas-composer-foot"><button title="上传素材" onClick={() => uploadInput.current?.click()} disabled={reading || generating}><Plus size={18} /></button><span>GPT Image 2</span><select aria-label="画布生成比例" value={ratio} onChange={(event) => setRatio(event.target.value)}>{canvasRatios.map((value) => <option key={value}>{value}</option>)}</select>{generating ? <button onClick={cancelGeneration} title="取消生成"><X size={16} />取消</button> : null}<button className="canvas-generate" onClick={() => void runGeneration()} disabled={generating || reading || !canvasPrompt.trim()}>{generating ? <span className="spinner" /> : <Sparkles size={15} />}{generating ? '生成中' : '生成'}</button></div>
      </section>
      {error || saveError || notice ? <div className={'canvas-message' + (error || saveError ? ' error' : '')} role={error || saveError ? 'alert' : 'status'}><span>{error || saveError || notice}</span><button title="关闭提示" onClick={() => { setError(''); setNotice('') }}><X size={14} /></button>{saveError ? <button onClick={exportWorkflow}>导出备份</button> : null}</div> : null}
    </main>
    {selected ? <aside className="node-inspector"><div className="inspector-head"><span>{nodeLabels[selected.data.kind]}属性</span><button className="icon-button" title="关闭属性面板" onClick={() => setSelectedId('')}><X size={17} /></button></div>{selected.data.image ? <img className="inspector-preview" src={selected.data.image} alt="当前节点预览" /> : null}<div className="inspector-form">
      <label><span>节点名称</span><input aria-label="节点名称" value={selected.data.title} maxLength={200} onFocus={beginEdit} onBlur={endEdit} onChange={(event) => updateNode(selected.id, { title: event.target.value })} /></label>
      {['prompt', 'text', 'note'].includes(selected.data.kind) ? <label><span>内容</span><textarea aria-label="节点内容" value={selected.data.text || ''} maxLength={12000} onFocus={beginEdit} onBlur={endEdit} onChange={(event) => updateNode(selected.id, { text: event.target.value })} /></label> : null}
      {['model', 'image'].includes(selected.data.kind) ? <><label><span>使用模型</span><input value={'gpt-image-2'} readOnly /></label><label><span>生成比例</span><select aria-label="节点生成比例" value={generationRatio(selected.data.ratio, ratio)} onChange={(event) => updateNode(selected.id, { ratio: event.target.value })}>{canvasRatios.map((value) => <option key={value}>{value}</option>)}</select></label></> : null}
      {selected.data.prompt ? <label><span>生成时的提示词</span><textarea readOnly value={selected.data.prompt} /></label> : null}
      {selected.data.kind === 'output' ? <label><span>本地输出倍率（非 AI 放大）</span><select aria-label="输出倍率" value={selected.data.scale || 1} onChange={(event) => updateNode(selected.id, { scale: Number(event.target.value) })}>{[1, 2, 4].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label> : null}
      {selected.data.kind === 'branch' ? <label><span>允许此路上游输入</span><input type="checkbox" checked={selected.data.enabled !== false} onChange={(event) => updateNode(selected.id, { enabled: event.target.checked })} /></label> : null}
      {selected.data.image ? <><button className="primary-button inspector-primary" onClick={() => void loadReference(selected)} disabled={reading || generating}><ImageIcon size={16} />用作参考图</button><button className="secondary-button" onClick={() => void outputImage(selected.id)}><Download size={16} />下载原图 PNG</button></> : null}
      {['model', 'image', 'prompt'].includes(selected.data.kind) ? <button className="primary-button inspector-primary" disabled={generating || reading} onClick={() => void runGeneration(selected.id)}><RefreshCw size={16} />{selected.data.image ? '重新生成（使用此图作为参考）' : '运行节点'}</button> : null}
      {selected.data.kind === 'output' ? <button className="primary-button inspector-primary" onClick={() => void outputImage(selected.id)}><Download size={16} />导出上游图片</button> : null}
      <label><span>边框颜色</span><input aria-label="节点边框颜色" type="color" value={selected.data.color || '#48e3ed'} onFocus={beginEdit} onBlur={endEdit} onChange={(event) => updateNode(selected.id, { color: event.target.value })} /></label>
      <div className="canvas-inspector-actions"><button onClick={duplicateSelection}><Copy size={15} />复制</button><button onClick={() => updateNode(selected.id, { locked: !selected.data.locked })}>{selected.data.locked ? <Unlock size={15} /> : <Lock size={15} />}{selected.data.locked ? '解锁' : '锁定'}</button></div>
      {selected.data.kind === 'frame' ? <button onClick={ungroup}>解散画框（保留内容）</button> : null}
      <button className="danger-button" disabled={selected.data.locked} onClick={removeSelection}><Trash2 size={16} />删除所选</button>
    </div></aside> : null}
    {showAssets ? <div className="canvas-modal-backdrop" onClick={() => setShowAssets(false)}><section className="canvas-modal" role="dialog" aria-modal="true" aria-label="作品素材库" onClick={(event) => event.stopPropagation()}><header><h2>作品素材库</h2><button className="icon-button" onClick={() => setShowAssets(false)} title="关闭素材库"><X size={20} /></button></header><input aria-label="搜索素材" value={assetQuery} onChange={(event) => setAssetQuery(event.target.value)} placeholder="搜索作品名称或提示词" /><div className="canvas-asset-grid">{assets.filter((asset) => (asset.title + ' ' + asset.prompt).toLowerCase().includes(assetQuery.toLowerCase())).map((asset) => <button key={asset.id} onClick={() => { addNode('image', { title: asset.title, image: asset.dataUrl, prompt: asset.prompt, ratio: asset.ratio, model: asset.model }); setShowAssets(false) }}><img src={asset.dataUrl} alt={asset.title} /><span>{asset.title}</span></button>)}</div>{!assets.length ? <p>暂无作品。上传图片或生成后会保存在这里。</p> : null}</section></div> : null}
    {showHelp ? <div className="canvas-modal-backdrop" onClick={() => setShowHelp(false)}><section className="canvas-modal" role="dialog" aria-modal="true" aria-label="画布快捷键" onClick={(event) => event.stopPropagation()}><header><h2>画布快捷键</h2><button className="icon-button" onClick={() => setShowHelp(false)} title="关闭帮助"><X size={20} /></button></header><p>V 选择 · H 抓手 · Shift 点击多选 · 拖动框选</p><p>Ctrl / ⌘ + Z 撤销 · Shift + Z 重做 · D 复制 · G 编组 · A 全选</p><p>Delete 删除未锁定节点及连线 · Escape 关闭面板</p><p>双击节点文本编辑；拖动选中节点的边角缩放。</p><p>运行模型或图像节点时读取上游提示词与图片；条件开关关闭后阻止此路输入。</p><p>图片、作品和画布仅存储在当前浏览器。跨设备请导出/导入 JSON；清除浏览器数据前请备份。</p></section></div> : null}
  </div>
}
