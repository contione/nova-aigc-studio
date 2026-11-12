import {
  Download,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  List,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
  Workflow,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { readReferenceImage } from '../lib/referenceImage'
import {
  deleteAsset,
  deleteCanvas,
  listAssets,
  listCanvases,
  saveAssets,
  subscribeStudioStorage,
  type StoredCanvas,
  type StudioAsset,
} from '../lib/studioStorage'
import '../assets-library.css'

type LibraryFilter = 'images' | 'all' | 'favorites' | 'canvases'
type Preview = { asset: StudioAsset }

const filterLabels: Record<LibraryFilter, string> = {
  images: '图片',
  all: '全部',
  favorites: '收藏',
  canvases: '画布',
}

function makeId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

function fileTitle(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '') || '上传图片'
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知时间'
  return date.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
}

function sourceLabel(source: StudioAsset['source']): string {
  return source === 'upload' ? '上传' : source === 'generated' ? '生成' : '画布'
}

function downloadName(title: string, dataUrl: string): string {
  const mime = dataUrl.match(/^data:image\/(png|jpeg|webp);/i)?.[1].toLowerCase()
  const extension = mime === 'jpeg' ? 'jpg' : mime || 'png'
  return `${title || 'asset'}.${extension}`
}

export function AssetsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const uploadInput = useRef<HTMLInputElement>(null)
  const [assets, setAssets] = useState<StudioAsset[]>([])
  const [canvases, setCanvases] = useState<StoredCanvas[]>([])
  const [selectedFilter, setSelectedFilter] = useState<LibraryFilter>(() => searchParams.get('type') === 'canvas' ? 'canvases' : 'images')
  const [grid, setGrid] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)

  const loadLibrary = useCallback(async () => {
    return Promise.all([listAssets(), listCanvases()])
  }, [])

  useEffect(() => {
    let active = true
    const refresh = () => {
      void loadLibrary().then(([storedAssets, storedCanvases]) => {
        if (!active) return
        setAssets(storedAssets)
        setCanvases(storedCanvases)
        setError('')
      }).catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : '无法加载本地工作室存储')
      }).finally(() => {
        if (active) setLoading(false)
      })
    }
    refresh()
    const unsubscribe = subscribeStudioStorage(refresh)
    return () => {
      active = false
      unsubscribe()
    }
  }, [loadLibrary])

  const query = searchParams.get('q') ?? ''
  const filter = searchParams.get('type') === 'canvas' ? 'canvases' : selectedFilter
  const updateQuery = (value: string) => {
    const nextParams = new URLSearchParams(searchParams)
    if (value) nextParams.set('q', value)
    else nextParams.delete('q')
    setSearchParams(nextParams, { replace: true })
  }
  const updateFilter = (value: LibraryFilter) => {
    setSelectedFilter(value)
    const nextParams = new URLSearchParams(searchParams)
    if (value === 'canvases') nextParams.set('type', 'canvas')
    else nextParams.delete('type')
    setSearchParams(nextParams, { replace: true })
  }
  const searchQuery = query.trim().toLowerCase()
  const visibleAssets = useMemo(() => assets.filter((asset) => {
    if (filter === 'favorites' && !asset.favorite) return false
    if (filter === 'canvases') return false
    return [asset.title, asset.prompt, asset.model].join(' ').toLowerCase().includes(searchQuery)
  }), [assets, filter, searchQuery])
  const visibleCanvases = useMemo(() => canvases.filter((canvas) => {
    if (filter !== 'all' && filter !== 'canvases') return false
    return canvas.name.toLowerCase().includes(searchQuery)
  }), [canvases, filter, searchQuery])
  const favoriteCount = assets.filter((asset) => asset.favorite).length

  const handleUpload = async (file: File) => {
    setBusy(true)
    setError('')
    try {
      const reference = await readReferenceImage(file)
      const nextAsset: StudioAsset = {
        id: makeId('asset'),
        dataUrl: reference.dataUrl,
        title: fileTitle(reference.fileName),
        prompt: '',
        model: '上传图片',
        ratio: '自定义',
        createdAt: new Date().toISOString(),
        favorite: false,
        source: 'upload',
      }
      await saveAssets([nextAsset])
      setAssets((current) => [nextAsset, ...current.filter((item) => item.id !== nextAsset.id)])
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '无法保存上传图片')
    } finally {
      setBusy(false)
    }
  }

  const toggleFavorite = async (asset: StudioAsset) => {
    const changedAsset = { ...asset, favorite: !asset.favorite }
    try {
      await saveAssets([changedAsset])
      setAssets((current) => current.map((item) => item.id === changedAsset.id ? changedAsset : item))
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '无法更新收藏状态')
    }
  }

  const removeImage = async (asset: StudioAsset) => {
    if (!window.confirm(`确定要从此设备删除“${asset.title}”吗？`)) return
    try {
      await deleteAsset(asset.id)
      setAssets((current) => current.filter((item) => item.id !== asset.id))
      if (preview?.asset.id === asset.id) setPreview(null)
      setError('')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '无法删除图片')
    }
  }

  const removeCanvas = async (canvas: StoredCanvas) => {
    if (!window.confirm(`确定要从此设备删除画布“${canvas.name}”吗？`)) return
    try {
      await deleteCanvas(canvas.id)
      setCanvases((current) => current.filter((item) => item.id !== canvas.id))
      setError('')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '无法删除画布')
    }
  }

  const isEmpty = !loading && visibleAssets.length === 0 && visibleCanvases.length === 0

  return (
    <div className="assets-page asset-library page-enter">
      <div className="page-title-row">
        <div>
          <h1>作品资产库</h1>
          <p>保存在此设备上的图片和画布项目。</p>
        </div>
        <button className="secondary-button" disabled={busy} onClick={() => uploadInput.current?.click()}><Upload size={16} />上传图片</button>
        <input ref={uploadInput} className="asset-hidden-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void handleUpload(file)
        }} />
      </div>

      <div className="asset-toolbar asset-library-toolbar">
        <label className="search-control asset-search"><Search size={16} /><input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="搜索标题、提示词或模型" aria-label="搜索资产" /></label>
        <div className="asset-filter-tabs" role="tablist" aria-label="资产筛选">
          {(Object.keys(filterLabels) as LibraryFilter[]).map((value) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => updateFilter(value)} role="tab" aria-selected={filter === value}>{filterLabels[value]} <span>{value === 'favorites' ? favoriteCount : value === 'canvases' ? canvases.length : value === 'images' ? assets.length : assets.length + canvases.length}</span></button>)}
        </div>
        <div className="segmented icon-segmented" aria-label="视图模式"><button className={grid ? 'active' : ''} onClick={() => setGrid(true)} title="网格视图" aria-label="网格视图"><Grid2X2 size={17} /></button><button className={!grid ? 'active' : ''} onClick={() => setGrid(false)} title="列表视图" aria-label="列表视图"><List size={17} /></button></div>
      </div>

      {error ? <div className="asset-library-message error" role="alert">{error}</div> : null}
      {loading ? <div className="asset-library-message">正在加载本地资产...</div> : null}
      {!loading && filter !== 'canvases' && visibleAssets.length > 0 ? <section className={grid ? 'asset-library-grid' : 'asset-library-list'} aria-label="图片">
        {visibleAssets.map((asset) => <article className="asset-library-card" key={asset.id}>
          <button className="asset-preview-trigger" onClick={() => setPreview({ asset })} aria-label={`预览${asset.title}`}><img src={asset.dataUrl} alt={asset.title} /></button>
          <div className="asset-card-details"><div className="asset-card-title"><strong title={asset.title}>{asset.title}</strong><span>{sourceLabel(asset.source)} · {formatDate(asset.createdAt)}</span></div><div className="asset-card-actions"><button className={`icon-button small ${asset.favorite ? 'is-favorite' : ''}`} onClick={() => void toggleFavorite(asset)} title={asset.favorite ? '取消收藏' : '收藏'} aria-label={asset.favorite ? `取消收藏${asset.title}` : `收藏${asset.title}`}><Heart size={16} fill={asset.favorite ? 'currentColor' : 'none'} /></button><a className="icon-button small" href={asset.dataUrl} download={downloadName(asset.title, asset.dataUrl)} title="下载" aria-label={`下载${asset.title}`}><Download size={16} /></a><button className="icon-button small" onClick={() => void removeImage(asset)} title="删除" aria-label={`删除${asset.title}`}><Trash2 size={16} /></button><button className="icon-button small" onClick={() => setPreview({ asset })} title="更多详情" aria-label={`${asset.title}的更多详情`}><MoreHorizontal size={16} /></button></div></div>
          <div className="asset-card-meta"><span>{asset.model || '未知模型'}</span><span>{asset.ratio || '自定义'}</span></div>
        </article>)}
      </section> : null}

      {!loading && visibleCanvases.length > 0 ? <section className="canvas-library-section" aria-label="画布项目"><div className="library-section-heading"><span><Workflow size={16} />画布项目</span><small>{visibleCanvases.length}</small></div><div className="canvas-library-grid">{visibleCanvases.map((canvas) => <article className="canvas-library-card" key={canvas.id}><div className="canvas-library-art"><Workflow size={26} /></div><div className="canvas-card-details"><strong title={canvas.name}>{canvas.name}</strong><span>更新于 {formatDate(canvas.updatedAt)}</span></div><div className="canvas-card-actions"><button className="secondary-button" onClick={() => navigate(`/canvas?project=${encodeURIComponent(canvas.id)}`)}>打开画布</button><button className="icon-button small" onClick={() => void removeCanvas(canvas)} title="删除画布" aria-label={`删除${canvas.name}`}><Trash2 size={16} /></button></div></article>)}</div></section> : null}

      {isEmpty ? <div className="asset-library-empty"><ImageIcon size={30} /><strong>{query ? '没有匹配的内容' : filter === 'canvases' ? '暂未保存画布' : filter === 'favorites' ? '暂时没有收藏图片' : '本地资产库为空'}</strong><p>{query ? '请尝试其他标题、提示词或模型。' : '上传图片或保存画布后，内容会显示在这里。'}</p></div> : null}

      {preview ? <div className="asset-preview-modal" role="dialog" aria-modal="true" aria-label={`资产详情：${preview.asset.title}`} onClick={() => setPreview(null)}><div className="asset-preview-dialog" onClick={(event) => event.stopPropagation()}><div className="asset-preview-head"><strong>{preview.asset.title}</strong><button className="icon-button" onClick={() => setPreview(null)} title="关闭详情" aria-label="关闭详情"><X size={18} /></button></div><img src={preview.asset.dataUrl} alt={preview.asset.title} /><div className="asset-preview-info"><div><span>标题</span><strong>{preview.asset.title}</strong></div><div><span>来源</span><strong>{sourceLabel(preview.asset.source)}</strong></div><div><span>模型</span><strong>{preview.asset.model || '未知模型'}</strong></div><div><span>比例</span><strong>{preview.asset.ratio || '自定义'}</strong></div><div><span>创建时间</span><strong>{formatDate(preview.asset.createdAt)}</strong></div><div className="asset-preview-prompt"><span>提示词</span><p>{preview.asset.prompt || '未填写提示词'}</p></div></div><a className="primary-button" href={preview.asset.dataUrl} download={downloadName(preview.asset.title, preview.asset.dataUrl)}><Download size={16} />下载图片</a></div></div> : null}
    </div>
  )
}
