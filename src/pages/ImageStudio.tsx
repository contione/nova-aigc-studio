import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  Download,
  Heart,
  History,
  Image as ImageIcon,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { artworks, assetUrl } from '../lib/assets'
import { generateImage } from '../lib/api'
import { readReferenceImage, type ReferenceImage } from '../lib/referenceImage'
import {
  deleteAsset,
  listAssets,
  saveAssets,
  subscribeStudioStorage,
  type StudioAsset,
} from '../lib/studioStorage'
import '../image-studio.css'

const ratios = ['1:1', '16:9', '9:16', '4:3', '3:4']
const styles = [
  ['默认', 'floating-city.webp'],
  ['写实', 'wind-portrait.webp'],
  ['动漫', 'red-maple.webp'],
  ['自然', 'forest-library.webp'],
  ['电影', 'neon-car.webp'],
] as const
const additionalStyles = ['水彩插画', '复古胶片', '低多边形', '杂志封面']
const sourceLabels: Record<StudioAsset['source'], string> = {
  generated: '生成结果',
  upload: '上传资产',
  canvas: '画布资产',
}
const detailOptions = [
  { value: 'standard', label: '标准细节', prompt: '' },
  { value: 'rich', label: '细节丰富', prompt: '细节丰富，材质清晰，光影层次自然' },
  { value: 'precise', label: '精细刻画', prompt: '精细刻画材质与纹理，边缘清晰，画面层次丰富' },
] as const

type Filter = '全部' | '收藏'
type SortOrder = 'latest' | 'oldest'

function createAssetId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function ratioToCss(ratio: string) {
  const [width, height] = ratio.split(':').map(Number)
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? `${width} / ${height}` : 'auto'
}

function assetDownloadName(asset: StudioAsset) {
  const extension = asset.dataUrl.startsWith('data:image/jpeg') ? 'jpg' : asset.dataUrl.startsWith('data:image/webp') ? 'webp' : 'png'
  return (asset.title || 'nova-asset').replace(/\.(png|jpe?g|webp)$/i, '').replace(/[\\/:*?"<>|]/g, '_') + '.' + extension
}

function gcd(first: number, second: number): number {
  return second ? gcd(second, first % second) : first
}

function readImageRatio(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const width = Math.round(image.naturalWidth)
      const height = Math.round(image.naturalHeight)
      const divisor = gcd(width, height)
      resolve(width && height && divisor ? `${width / divisor}:${height / divisor}` : 'custom')
    }
    image.onerror = () => resolve('custom')
    image.src = dataUrl
  })
}

function formatCreatedAt(createdAt: string) {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? createdAt : date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
}

export function ImageStudio() {
  const [searchParams] = useSearchParams()
  const [prompt, setPrompt] = useState(searchParams.get('prompt') || '雨后的未来城市，巨大的悬浮列车从空中驶过，霓虹灯映在湿润的街道上，一个穿着连帽外套的少女站在天台，电影感，细节丰富，氛围感强')
  const [reference, setReference] = useState<ReferenceImage | null>(null)
  const [readingReference, setReadingReference] = useState(false)
  const referenceVersion = useRef(0)
  const pendingRequest = useRef<AbortController | null>(null)
  const [ratio, setRatio] = useState('16:9')
  const [style, setStyle] = useState('默认')
  const [showMoreStyles, setShowMoreStyles] = useState(false)
  const [advanced, setAdvanced] = useState(true)
  const [extraPrompt, setExtraPrompt] = useState('')
  const [detailLevel, setDetailLevel] = useState<(typeof detailOptions)[number]['value']>('standard')
  const [preserveFace, setPreserveFace] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generationNotice, setGenerationNotice] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('全部')
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest')
  const [assets, setAssets] = useState<StudioAsset[]>([])
  const [storageError, setStorageError] = useState('')
  const [generationError, setGenerationError] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [previewAsset, setPreviewAsset] = useState<StudioAsset | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    let active = true
    const refreshAssets = async () => {
      try {
        const storedAssets = await listAssets()
        if (active) {
          setAssets(storedAssets)
          setStorageError('')
        }
      } catch (error) {
        if (active) setStorageError(error instanceof Error ? error.message : '资产库读取失败')
      }
    }

    void refreshAssets()
    const unsubscribe = subscribeStudioStorage(() => void refreshAssets())
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => () => {
    pendingRequest.current?.abort()
    referenceVersion.current += 1
  }, [])

  useEffect(() => {
    if (!historyOpen && !previewAsset) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHistoryOpen(false)
        setPreviewAsset(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [historyOpen, previewAsset])

  const sortedAssets = useMemo(() => [...assets].sort((first, second) => {
    const firstTime = new Date(first.createdAt).getTime() || 0
    const secondTime = new Date(second.createdAt).getTime() || 0
    return sortOrder === 'latest' ? secondTime - firstTime : firstTime - secondTime
  }), [assets, sortOrder])
  const visibleAssets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return sortedAssets.filter((asset) => {
      const matchesFilter = filter === '全部' || asset.favorite
      const matchesSearch = !normalizedSearch || [asset.title, asset.prompt, asset.model, sourceLabels[asset.source]].join(' ').toLowerCase().includes(normalizedSearch)
      return matchesFilter && matchesSearch
    })
  }, [filter, search, sortedAssets])
  const favoriteCount = useMemo(() => assets.filter((asset) => asset.favorite).length, [assets])
  const selectedDetail = detailOptions.find((option) => option.value === detailLevel) || detailOptions[0]

  const persistAssets = async (nextAssets: StudioAsset[]): Promise<boolean> => {
    const changedIds = new Set(nextAssets.map((asset) => asset.id))
    setAssets((current) => [...nextAssets, ...current.filter((asset) => !changedIds.has(asset.id))])
    try {
      await saveAssets(nextAssets)
      setStorageError('')
      return true
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : '资产保存失败')
      return false
    }
  }

  const toggleFavorite = (assetId: string) => {
    const asset = assets.find((item) => item.id === assetId)
    if (asset) void persistAssets([{ ...asset, favorite: !asset.favorite }])
  }

  const buildRequestPrompt = () => [
    prompt.trim(),
    style !== '默认' ? `风格偏好：${style}` : '',
    selectedDetail.prompt,
    extraPrompt.trim(),
    preserveFace ? '保留人物面部特征，保持身份特征自然一致' : '',
  ].filter(Boolean).join('。')

  const handleGenerate = async () => {
    if (!prompt.trim() || pendingRequest.current || readingReference) return
    const controller = new AbortController()
    const requestedRatio = ratio
    const requestPrompt = buildRequestPrompt()
    pendingRequest.current = controller
    setGenerationError('')
    setGenerationNotice('')
    setGenerating(true)
    try {
      const response = await generateImage({
        prompt: requestPrompt,
        model: 'gpt-image-2',
        provider: 'local-gpt-image',
        ratio: requestedRatio,
        count: 1,
        referenceImage: reference ?? undefined,
      }, controller.signal)
      if (controller.signal.aborted || pendingRequest.current !== controller) return
      const createdAt = new Date().toISOString()
      const createdAssets = response.images.map((image, index): StudioAsset => ({
        id: createAssetId(),
        dataUrl: image.dataUrl,
        title: `AI 生成 ${index + 1}`,
        prompt: requestPrompt,
        model: image.model || 'gpt-image-2',
        ratio: requestedRatio,
        createdAt,
        favorite: false,
        source: 'generated',
      }))
      const persisted = await persistAssets(createdAssets)
      if (controller.signal.aborted || pendingRequest.current !== controller) return
      setGenerationNotice(persisted ? '生成完成，图片已保存到创作结果' : '生成完成，图片已添加，但资产库保存失败')
    } catch (error) {
      if (!controller.signal.aborted && pendingRequest.current === controller) {
        setGenerationError(error instanceof Error ? error.message : '生成服务暂不可用，请确认后端已启动')
      }
    } finally {
      if (pendingRequest.current === controller && !controller.signal.aborted) {
        pendingRequest.current = null
        setGenerating(false)
      }
    }
  }

  const cancelGeneration = () => {
    pendingRequest.current?.abort()
    pendingRequest.current = null
    setGenerating(false)
    setGenerationNotice('已取消生成')
  }

  const selectReference = async (file: File) => {
    const version = ++referenceVersion.current
    setReadingReference(true)
    setGenerationError('')
    setReference(null)
    try {
      const image = await readReferenceImage(file)
      const uploadedRatio = await readImageRatio(image.dataUrl)
      if (version !== referenceVersion.current) return
      setReference(image)
      const uploadedAsset: StudioAsset = {
        id: createAssetId(),
        dataUrl: image.dataUrl,
        title: image.fileName,
        prompt: '上传的参考图',
        model: 'uploaded',
        ratio: uploadedRatio,
        createdAt: new Date().toISOString(),
        favorite: false,
        source: 'upload',
      }
      await persistAssets([uploadedAsset])
    } catch (error) {
      if (version === referenceVersion.current) setGenerationError(error instanceof Error ? error.message : '参考图读取失败')
    } finally {
      if (version === referenceVersion.current) setReadingReference(false)
    }
  }

  const removeReference = () => {
    referenceVersion.current += 1
    setReference(null)
  }

  const setReferenceFromAsset = (asset: StudioAsset) => {
    if (pendingRequest.current) return
    referenceVersion.current += 1
    setReadingReference(false)
    setReference({ fileName: asset.title, dataUrl: asset.dataUrl })
    setOpenMenuId(null)
    setHistoryOpen(false)
    setPreviewAsset(null)
    setGenerationNotice(`已将“${asset.title}”设为参考图`)
  }

  const removeAsset = async (asset: StudioAsset) => {
    if (!window.confirm(`确定删除“${asset.title}”吗？此操作无法撤销。`)) return
    try {
      await deleteAsset(asset.id)
      setAssets((current) => current.filter((item) => item.id !== asset.id))
      setOpenMenuId(null)
      setPreviewAsset(null)
      setStorageError('')
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : '资产删除失败')
    }
  }

  const renderAssetActions = (asset: StudioAsset) => (
    <>
      <button className={asset.favorite ? 'active' : ''} onClick={() => toggleFavorite(asset.id)} title={asset.favorite ? '取消收藏' : '收藏'}>
        <Heart size={17} fill={asset.favorite ? 'currentColor' : 'none'} />
      </button>
      <a href={asset.dataUrl} download={assetDownloadName(asset)} title="下载">
        <Download size={17} />
      </a>
      <button title="更多操作" onClick={() => setOpenMenuId((current) => current === asset.id ? null : asset.id)}>
        <MoreHorizontal size={17} />
      </button>
    </>
  )

  const renderAssetMenu = (asset: StudioAsset) => openMenuId === asset.id ? (
    <div className="asset-menu" role="menu">
      <button role="menuitem" onClick={() => { setPreviewAsset(asset); setOpenMenuId(null) }}>预览</button>
      <button role="menuitem" onClick={() => setReferenceFromAsset(asset)}>用作参考图</button>
      <button className="danger" role="menuitem" onClick={() => void removeAsset(asset)}><Trash2 size={14} />删除</button>
    </div>
  ) : null

  const renderAssetCard = (asset: StudioAsset) => (
    <article className="result-card" key={asset.id}>
      <div className="result-media">
        <img src={asset.dataUrl} alt={asset.title} style={{ aspectRatio: ratioToCss(asset.ratio) }} />
        <div className="media-actions">{renderAssetActions(asset)}</div>
      </div>
      {renderAssetMenu(asset)}
      <strong title={asset.title}>{asset.title}</strong>
      <small>
        <span>{sourceLabels[asset.source]}</span>
        <span>{asset.ratio}</span>
        {formatCreatedAt(asset.createdAt)}
      </small>
    </article>
  )

  return (
    <div className="image-studio page-enter">
      <aside className="generation-panel">
        <div className="panel-title">
          <h1>生成设置</h1>
          <button className="icon-button" title="打开历史记录" onClick={() => setHistoryOpen(true)}><History size={18} /></button>
        </div>
        <section className="setting-section">
          <div className="setting-label"><strong>提示词</strong><span>{prompt.length}/2000</span></div>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value.slice(0, 2000))} aria-label="图片提示词" />
          <div className="reference-row">
            <label className="reference-upload-button"><ImageIcon size={15} />添加参考图<input type="file" aria-label="添加参考图" accept="image/png,image/jpeg,image/webp" disabled={generating} onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void selectReference(file)
            }} /></label>
            {reference ? <span className="reference-chip"><img src={reference.dataUrl} alt="参考图预览" /><em>{reference.fileName}</em><button disabled={generating} onClick={removeReference} title="移除参考图"><X size={13} /></button></span> : <small>PNG / JPEG / WebP，最大 10 MB</small>}
          </div>
          <div className="prompt-tags">{['赛博朋克', '未来城市', '少女', '电影感'].map((tag) => <button key={tag} onClick={() => setPrompt((value) => `${value}，${tag}`.slice(0, 2000))}>+ {tag}</button>)}</div>
        </section>
        <section className="setting-section">
          <div className="setting-label"><strong>模型</strong><span>当前唯一可用模型</span></div>
          <div className="model-select model-info" aria-label="当前模型 GPT Image 2">
            <span className="model-thumb"><Sparkles size={18} /></span>
            <span><strong>GPT Image 2</strong><small>本地 Provider，当前页面仅使用此模型</small></span>
          </div>
        </section>
        <section className="setting-section">
          <div className="setting-label"><strong>风格选择</strong><button onClick={() => setShowMoreStyles((value) => !value)}>{showMoreStyles ? '收起选项' : '查看更多'}</button></div>
          <div className="style-swatches">{styles.map(([name, file]) => <button key={name} className={style === name ? 'active' : ''} onClick={() => setStyle(name)}><img src={assetUrl(file)} alt="" /><span>{name}</span></button>)}</div>
          {showMoreStyles ? <div className="style-more-options">{additionalStyles.map((option) => <button key={option} className={style === option ? 'active' : ''} onClick={() => setStyle(option)}>{option}</button>)}</div> : null}
        </section>
        <section className="setting-section">
          <div className="setting-label"><strong>画面比例</strong></div>
          <div className="ratio-tiles">{ratios.map((value) => <button key={value} className={ratio === value ? 'active' : ''} onClick={() => setRatio(value)}><i className={`ratio-shape ratio-${value.replace(':', '-')}`} />{value}</button>)}</div>
        </section>
        <section className="setting-section advanced-section">
          <button className="advanced-toggle" onClick={() => setAdvanced((value) => !value)}><span><SlidersHorizontal size={16} />提示词增强</span><ChevronDown size={16} className={advanced ? 'rotate' : ''} /></button>
          {advanced ? <div className="advanced-body">
            <label className="prompt-enhancement-field"><span>额外描述 <small>会加入发送的提示词</small></span><textarea value={extraPrompt} onChange={(event) => setExtraPrompt(event.target.value)} placeholder="例如：柔和逆光，低饱和色彩" /></label>
            <label className="prompt-enhancement-field"><span>细节偏好 <small>提示词文本，不是独立 API 参数</small></span><select value={detailLevel} onChange={(event) => setDetailLevel(event.target.value as typeof detailLevel)}>{detailOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="toggle-row"><span>保留面部特征 <small>加入提示词偏好</small></span><input type="checkbox" checked={preserveFace} onChange={(event) => setPreserveFace(event.target.checked)} /></label>
            <p className="prompt-hint">以上选项只会组合成提示词，不代表后端支持独立的 CFG、高清修复或面部修复参数。</p>
          </div> : null}
        </section>
        <button className="primary-button generate-button" disabled={!prompt.trim() || generating || readingReference} onClick={() => void handleGenerate()}><Sparkles size={18} />{generating ? '正在生成' : readingReference ? '读取参考图…' : reference ? '参考图生成' : '立即生成'}</button>
      </aside>

      <section className="results-panel">
        <div className="results-head">
          <div><h2>创作结果</h2><div className="result-filters"><button className={filter === '全部' ? 'active' : ''} onClick={() => setFilter('全部')}>全部 <span>{assets.length}</span></button><button className={filter === '收藏' ? 'active' : ''} onClick={() => setFilter('收藏')}>收藏 <span>{favoriteCount}</span></button></div></div>
          <div className="results-tools"><label className="search-control"><Search size={16} /><input placeholder="搜索提示词、模型或来源" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className="secondary-button" onClick={() => setSortOrder((current) => current === 'latest' ? 'oldest' : 'latest')} title="切换结果排序">{sortOrder === 'latest' ? '最新生成' : '最早生成'}<ChevronDown size={15} /></button><button className="icon-button bordered" title="打开历史记录" onClick={() => setHistoryOpen(true)}><History size={17} /></button></div>
        </div>
        {generationNotice ? <p className="studio-notice" role="status">{generationNotice}</p> : null}
        {generationError ? <p className="generation-error" role="alert">{generationError}</p> : null}
        {storageError ? <p className="generation-error" role="alert">{storageError}</p> : null}
        <div className="results-grid">
          {visibleAssets.map(renderAssetCard)}
          {visibleAssets.length === 0 ? <div className="empty-state"><ImageIcon size={28} /><strong>{search ? '没有匹配的资产' : filter === '收藏' ? '还没有收藏作品' : '还没有创作结果'}</strong><p>{search ? '试试其他关键词。' : filter === '收藏' ? '点亮作品右上角的爱心后，会在这里出现。' : '生成或上传图片后，结果会持久保存在这里。'}</p></div> : null}
        </div>

        <section className="sample-section" aria-labelledby="sample-assets-title">
          <div className="sample-section-heading"><div><h3 id="sample-assets-title">灵感示例</h3><p>示例资产与实际结果分开显示，不会计入你的资产库。</p></div><span>示例资产</span></div>
          <div className="sample-grid">{artworks.map((item) => <article className="sample-card" key={item.file}><img src={assetUrl(item.file)} alt={item.title} /><strong>{item.title}</strong><small><span>示例资产</span>{item.category}</small></article>)}</div>
        </section>
      </section>

      {generating ? <div className="generation-progress" role="status"><span className="spinner" /><div><strong>正在生成中…</strong><p>等待模型返回图片，接口暂不提供实时百分比</p></div><button className="icon-button" onClick={cancelGeneration} title="取消生成"><X size={18} /></button></div> : null}

      {historyOpen ? <div className="studio-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setHistoryOpen(false) }}><section className="studio-dialog history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-dialog-title"><div className="studio-dialog-heading"><div><h2 id="history-dialog-title">历史记录</h2><p>来自生成、上传和画布的已保存资产。</p></div><button className="icon-button" title="关闭历史记录" onClick={() => setHistoryOpen(false)}><X size={18} /></button></div><div className="history-list">{sortedAssets.length ? sortedAssets.map((asset) => <article className="history-row" key={asset.id}><img src={asset.dataUrl} alt="" /><div><strong>{asset.title}</strong><small>{sourceLabels[asset.source]} · {asset.ratio} · {formatCreatedAt(asset.createdAt)}</small></div><button onClick={() => { setPreviewAsset(asset); setHistoryOpen(false) }}>预览</button><button onClick={() => setReferenceFromAsset(asset)}>用作参考图</button><button className="danger-icon" title="删除资产" onClick={() => void removeAsset(asset)}><Trash2 size={15} /></button></article>) : <div className="history-empty">暂无已保存资产。</div>}</div></section></div> : null}

      {previewAsset ? <div className="studio-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPreviewAsset(null) }}><section className="studio-dialog preview-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-dialog-title"><div className="studio-dialog-heading"><div><h2 id="preview-dialog-title">{previewAsset.title}</h2><p>{sourceLabels[previewAsset.source]} · {previewAsset.ratio} · {formatCreatedAt(previewAsset.createdAt)}</p></div><button className="icon-button" title="关闭预览" onClick={() => setPreviewAsset(null)}><X size={18} /></button></div><img className="preview-image" src={previewAsset.dataUrl} alt={previewAsset.title} /><div className="preview-actions"><button className="secondary-button" onClick={() => setReferenceFromAsset(previewAsset)}>用作参考图</button><a className="secondary-button" href={previewAsset.dataUrl} download={assetDownloadName(previewAsset)}><Download size={15} />下载</a></div></section></div> : null}
    </div>
  )
}
