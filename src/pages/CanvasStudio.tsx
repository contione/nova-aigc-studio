import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  ArrowLeft,
  AtSign,
  Box,
  Check,
  ChevronDown,
  Download,
  FileText,
  Frame,
  Hand,
  Image as ImageIcon,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  MousePointer2,
  Plus,
  Redo2,
  RefreshCw,
  Share2,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Upload,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { assetUrl } from '../lib/assets'
import { generateImage, type GeneratedImage } from '../lib/api'

type NodeKind = 'prompt' | 'model' | 'image' | 'output'
type NovaNodeData = {
  [key: string]: unknown
  kind: NodeKind
  title: string
  text?: string
  image?: string
  ratio?: string
  model?: string
  seed?: string
  strength?: number
}
type NovaNode = Node<NovaNodeData, 'nova'>

const kindIcon = {
  prompt: FileText,
  model: Box,
  image: ImageIcon,
  output: Sparkles,
}

function NovaNodeCard({ data, selected }: NodeProps<NovaNode>) {
  const Icon = kindIcon[data.kind]
  return (
    <div className={`nova-node kind-${data.kind} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-head"><span><Icon size={15} />{data.title}</span><MoreHorizontal size={16} /></div>
      {data.image ? <img className="node-image" src={data.image} alt={data.title} /> : null}
      {data.kind === 'prompt' ? <><p>{data.text}</p><div className="node-tags"><span>赛博朋克</span><span>未来城市</span><span>电影感</span></div></> : null}
      {data.kind === 'model' ? <div className="model-node-body"><strong>{data.model}</strong><span>写实 Cinematic</span><span>16:9 · 2 张</span></div> : null}
      {data.kind === 'image' ? <div className="image-node-meta"><span>1536 × 1024</span><span>#{data.seed}</span></div> : null}
      {data.kind === 'output' ? <div className="output-node-body"><label>放大倍数 <strong>2×</strong></label><label>增强细节 <i className="mini-toggle on" /></label><button><Download size={14} />输出高质量图像</button></div> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes: NodeTypes = { nova: NovaNodeCard }
const initialNodes: NovaNode[] = [
  { id: 'prompt-1', type: 'nova', position: { x: 80, y: 210 }, data: { kind: 'prompt', title: '提示词 Prompt', text: '未来的霓虹城市，雨夜，巨大的全息广告，飞行汽车穿梭在高楼之间，电影级画面，赛博朋克风格，细节丰富，光影对比强烈。' } },
  { id: 'model-1', type: 'nova', position: { x: 400, y: 230 }, data: { kind: 'model', title: '模型 Model', model: 'GPT Image 2' } },
  { id: 'image-1', type: 'nova', position: { x: 720, y: 80 }, data: { kind: 'image', title: '图像结果 01', image: assetUrl('neon-car.webp'), ratio: '16:9', model: 'GPT Image 2', seed: '824731', strength: 0.8 } },
  { id: 'image-2', type: 'nova', position: { x: 720, y: 430 }, data: { kind: 'image', title: '图像结果 02', image: assetUrl('floating-city.webp'), ratio: '16:9', model: 'GPT Image 2', seed: '291046', strength: 0.8 } },
  { id: 'output-1', type: 'nova', position: { x: 1080, y: 270 }, data: { kind: 'output', title: '超像输出' } },
]
const initialEdges: Edge[] = [
  { id: 'e1', source: 'prompt-1', target: 'model-1', animated: true },
  { id: 'e2', source: 'model-1', target: 'image-1', animated: true },
  { id: 'e3', source: 'model-1', target: 'image-2', animated: true },
  { id: 'e4', source: 'image-1', target: 'output-1', animated: true },
  { id: 'e5', source: 'image-2', target: 'output-1', animated: true },
]

const addTools = [
  { kind: 'prompt' as const, label: '提示词', icon: FileText },
  { kind: 'image' as const, label: '图像', icon: ImageIcon },
  { kind: 'model' as const, label: '模型', icon: Box },
  { kind: 'output' as const, label: '后处理', icon: WandSparkles },
]

export function CanvasStudio() {
  return <ReactFlowProvider><CanvasWorkspace /></ReactFlowProvider>
}

function CanvasWorkspace() {
  const navigate = useNavigate()
  const { fitView } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<NovaNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState('image-1')
  const [projectName, setProjectName] = useState('霓虹城市分镜')
  const [quickMenu, setQuickMenu] = useState(false)
  const [shared, setShared] = useState(false)
  const [canvasMode, setCanvasMode] = useState<'select' | 'pan'>('select')
  const [canvasPrompt, setCanvasPrompt] = useState('雨夜的未来城市，霓虹倒映在街道上，飞行汽车穿过高楼之间')
  const [generating, setGenerating] = useState(false)
  const [canvasError, setCanvasError] = useState('')
  const [history, setHistory] = useState([{ nodes: initialNodes, edges: initialEdges }])
  const [historyIndex, setHistoryIndex] = useState(0)
  const nodeCounter = useRef(6)
  const selectedNode = nodes.find((node) => node.id === selectedId)

  const recordHistory = useCallback((nextNodes: NovaNode[], nextEdges: Edge[]) => {
    setHistory((current) => [...current.slice(0, historyIndex + 1), { nodes: nextNodes, edges: nextEdges }])
    setHistoryIndex((current) => current + 1)
  }, [historyIndex])
  const commitState = useCallback((nextNodes: NovaNode[], nextEdges: Edge[]) => {
    setNodes(nextNodes)
    setEdges(nextEdges)
    recordHistory(nextNodes, nextEdges)
  }, [recordHistory, setEdges, setNodes])
  const onConnect = useCallback((connection: Connection) => {
    const nextEdges = addEdge({ ...connection, animated: true }, edges)
    commitState(nodes, nextEdges)
  }, [commitState, edges, nodes])
  const addNode = (kind: NodeKind) => {
    const id = `${kind}-${nodeCounter.current++}`
    const fallbackImage = kind === 'image' ? assetUrl(nodeCounter.current % 2 ? 'deep-whale.webp' : 'red-maple.webp') : undefined
    const nextNodes: NovaNode[] = [...nodes, { id, type: 'nova', position: { x: 470 + nodeCounter.current * 18, y: 170 + nodeCounter.current * 14 }, data: { kind, title: kind === 'prompt' ? '新提示词' : kind === 'model' ? '模型 Model' : kind === 'image' ? '图像结果' : '后处理输出', text: '描述你想要生成的画面内容...', model: 'GPT Image 2', image: fallbackImage, ratio: '16:9', seed: String(100000 + nodeCounter.current * 7919), strength: 0.7 } }]
    commitState(nextNodes, edges)
    setSelectedId(id)
    setQuickMenu(false)
  }
  const addGeneratedImages = useCallback((images: GeneratedImage[]) => {
    const generatedNodes = images.map((image, index) => {
      const id = `image-${nodeCounter.current++}`
      return {
        id,
        type: 'nova' as const,
        position: { x: 700 + index * 280, y: 130 + (index % 2) * 300 },
        data: { kind: 'image' as const, title: `生成结果 ${index + 1}`, image: image.dataUrl, ratio: '16:9', model: image.model, seed: image.fileName, strength: 0.8 },
      }
    })
    if (!generatedNodes.length) return
    commitState([...nodes, ...generatedNodes], edges)
    setSelectedId(generatedNodes[0].id)
    setQuickMenu(false)
  }, [commitState, edges, nodes])
  const updateSelected = (patch: Partial<NovaNodeData>) => setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, ...patch } } : node))
  const removeSelected = useCallback(() => {
    if (!selectedId) return
    const nextNodes = nodes.filter((node) => node.id !== selectedId)
    const nextEdges = edges.filter((edge) => edge.source !== selectedId && edge.target !== selectedId)
    commitState(nextNodes, nextEdges)
    setSelectedId('')
  }, [commitState, edges, nodes, selectedId])
  const duplicateSelected = useCallback(() => {
    if (!selectedNode) return
    const id = `${selectedNode.data.kind}-${nodeCounter.current++}`
    const clone: NovaNode = { ...selectedNode, id, selected: false, position: { x: selectedNode.position.x + 40, y: selectedNode.position.y + 40 }, data: { ...selectedNode.data, title: `${selectedNode.data.title} 副本` } }
    commitState([...nodes, clone], edges)
    setSelectedId(id)
  }, [commitState, edges, nodes, selectedNode])
  const undo = useCallback(() => {
    if (historyIndex === 0) return
    const nextIndex = historyIndex - 1
    setHistoryIndex(nextIndex)
    setNodes(history[nextIndex].nodes)
    setEdges(history[nextIndex].edges)
    setSelectedId('')
  }, [history, historyIndex, setEdges, setNodes])
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return
    const nextIndex = historyIndex + 1
    setHistoryIndex(nextIndex)
    setNodes(history[nextIndex].nodes)
    setEdges(history[nextIndex].edges)
    setSelectedId('')
  }, [history, historyIndex, setEdges, setNodes])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) removeSelected()
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelected() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
      }
      if (event.key === 'Escape') setSelectedId('')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [duplicateSelected, redo, removeSelected, selectedId, undo])
  const share = async () => {
    await navigator.clipboard?.writeText(window.location.href)
    setShared(true)
    window.setTimeout(() => setShared(false), 1600)
  }
  const exportWorkflow = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ projectName, nodes, edges }, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'nova-workflow.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const runCanvasGeneration = async () => {
    if (!canvasPrompt.trim() || generating) return
    setGenerating(true)
    setCanvasError('')
    try {
      const response = await generateImage({ prompt: canvasPrompt, model: 'gpt-image-2', provider: 'local-gpt-image', ratio: '16:9', count: 2 })
      if (response.images.length) addGeneratedImages(response.images)
    } catch (error) {
      setCanvasError(error instanceof Error ? error.message : '生成服务暂不可用')
      addNode('image')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="canvas-studio">
      <header className="canvas-topbar">
        <div className="canvas-brand"><Brand /><button className="canvas-back" onClick={() => navigate('/')} title="返回首页"><ArrowLeft size={18} /></button><input value={projectName} onChange={(event) => setProjectName(event.target.value)} aria-label="项目名称" /><span className="save-status"><Check size={12} />已保存</span></div>
        <div className="canvas-mode-tools"><button title="撤销 Ctrl+Z" onClick={undo} disabled={historyIndex === 0}><Undo2 size={17} /></button><button title="重做 Ctrl+Shift+Z" onClick={redo} disabled={historyIndex >= history.length - 1}><Redo2 size={17} /></button><i /><button className={canvasMode === 'select' ? 'active' : ''} title="选择 V" onClick={() => setCanvasMode('select')}><MousePointer2 size={17} /></button><button className={canvasMode === 'pan' ? 'active' : ''} title="抓手 H" onClick={() => setCanvasMode('pan')}><Hand size={17} /></button><button title="评论"><MessageSquare size={17} /></button><i /><button onClick={() => fitView({ duration: 500 })}><Maximize2 size={16} />适应画布</button></div>
        <div className="canvas-actions"><button onClick={share}>{shared ? <Check size={17} /> : <Share2 size={17} />}{shared ? '已复制' : '分享'}</button><button className="primary-button" onClick={exportWorkflow}><Download size={17} />导出</button><span className="avatar avatar-small">N</span></div>
      </header>

      <aside className="canvas-toolrail">
        {addTools.map(({ kind, label, icon: Icon }) => <button key={kind} onClick={() => addNode(kind)} title={`添加${label}`}><Icon size={19} /><span>{label}</span></button>)}
        <i />
        <button title="添加文本"><Type size={19} /><span>文本</span></button>
        <button title="添加画框"><Frame size={19} /><span>画框</span></button>
        <button title="上传素材"><Upload size={19} /><span>上传</span></button>
      </aside>

      <main className="flow-stage">
        <ReactFlow<NovaNode, Edge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={() => recordHistory(nodes, edges)}
          onSelectionChange={({ nodes: selected }) => setSelectedId(selected[0]?.id ?? '')}
          panOnDrag={canvasMode === 'pan'}
          nodesDraggable={canvasMode === 'select'}
          selectionOnDrag={canvasMode === 'select'}
          fitView
          minZoom={0.25}
          maxZoom={1.8}
          defaultEdgeOptions={{ style: { stroke: '#5ce7ee', strokeWidth: 2 } }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.1} color="#23343a" />
          <MiniMap pannable zoomable nodeStrokeWidth={2} nodeColor={(node) => node.data?.kind === 'prompt' ? '#f36c64' : node.data?.kind === 'output' ? '#7df58a' : '#4adce8'} maskColor="rgba(5, 9, 12, .72)" />
          <Controls showInteractive={false} />
        </ReactFlow>
        <button className="add-node-trigger" onClick={() => setQuickMenu((value) => !value)}><Plus size={18} />添加节点<ChevronDown size={15} /></button>
        {quickMenu ? <div className="add-node-menu">{addTools.map(({ kind, label, icon: Icon }) => <button key={kind} onClick={() => addNode(kind)}><Icon size={17} /><span>{label}{kind === 'image' ? '生成' : kind === 'output' ? '与输出' : ''}</span></button>)}<button><Zap size={17} /><span>条件分支</span></button></div> : null}
        <section className="canvas-composer">
          <div className="canvas-composer-tools"><button><Plus size={13} />参考</button><button>标记</button><button>特效</button><button>角色库</button><button>运镜</button></div>
          <label><AtSign size={18} /><textarea value={canvasPrompt} onChange={(event) => setCanvasPrompt(event.target.value)} placeholder="描述你想要生成的画面内容，@ 引用素材" /></label>
          <div className="canvas-composer-foot"><span className="canvas-error">{canvasError}</span><button className="composer-add" title="添加素材"><Plus size={18} /></button><button>GPT Image 2<ChevronDown size={14} /></button><button>16:9 · 1 张<ChevronDown size={14} /></button><button className="canvas-generate" onClick={runCanvasGeneration} disabled={generating || !canvasPrompt.trim()}>{generating ? <span className="spinner" /> : <Sparkles size={15} />}{generating ? '生成中' : '生成'}</button></div>
        </section>
      </main>

      {selectedNode ? (
        <aside className="node-inspector">
          <div className="inspector-head"><span><ImageIcon size={17} />{selectedNode.data.title}</span><button className="icon-button" onClick={() => setSelectedId('')} title="关闭属性面板"><X size={17} /></button></div>
          {selectedNode.data.image ? <img className="inspector-preview" src={selectedNode.data.image} alt="当前节点预览" /> : <div className={`inspector-kind kind-${selectedNode.data.kind}`}><span>{selectedNode.data.kind.toUpperCase()}</span></div>}
          <div className="inspector-tabs"><button className="active">属性</button><button>历史记录</button></div>
          <div className="inspector-form">
            <label><span>节点名称</span><input value={selectedNode.data.title} onChange={(event) => updateSelected({ title: event.target.value })} /></label>
            {selectedNode.data.kind === 'prompt' ? <label><span>提示词</span><textarea value={selectedNode.data.text || ''} onChange={(event) => updateSelected({ text: event.target.value })} /></label> : null}
            {selectedNode.data.kind === 'image' ? <><label><span>使用模型</span><button>GPT Image 2<ChevronDown size={15} /></button></label><label><span>生成比例</span><button>16:9（1536 × 864）<ChevronDown size={15} /></button></label><label><span>随机种子</span><input value={selectedNode.data.seed || ''} onChange={(event) => updateSelected({ seed: event.target.value })} /></label><label><span>提示词强度 <b>{selectedNode.data.strength}</b></span><input type="range" min="0" max="1" step="0.1" value={selectedNode.data.strength || 0} onChange={(event) => updateSelected({ strength: Number(event.target.value) })} /></label><button className="primary-button inspector-primary"><RefreshCw size={16} />重新生成</button></> : null}
            <button className="danger-button" onClick={removeSelected}><Trash2 size={16} />删除节点</button>
          </div>
        </aside>
      ) : null}
    </div>
  )
}
