import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  Download,
  Grid2X2,
  Heart,
  History,
  Image as ImageIcon,
  Minus,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { artworks, assetUrl } from '../lib/assets'
import { generateImage } from '../lib/api'

const ratios = ['1:1', '16:9', '9:16', '4:3', '3:4']
type GeneratedArtwork = { file: string; title: string; meta: string; category: string }

const styles = [
  ['默认', 'floating-city.webp'],
  ['写实', 'wind-portrait.webp'],
  ['动漫', 'red-maple.webp'],
  ['自然', 'forest-library.webp'],
  ['电影', 'neon-car.webp'],
] as const

export function ImageStudio() {
  const [searchParams] = useSearchParams()
  const [prompt, setPrompt] = useState(searchParams.get('prompt') || '雨后的未来城市，巨大的悬浮列车从空中驶过，霓虹灯映在湿润的街道上，一个穿着连帽外套的少女站在天台，电影感，细节丰富，氛围感强')
  const [reference, setReference] = useState<{ name: string; url: string } | null>(null)
  const [ratio, setRatio] = useState('16:9')
  const [style, setStyle] = useState('默认')
  const [count, setCount] = useState(4)
  const [advanced, setAdvanced] = useState(true)
  const [progress, setProgress] = useState<number | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('全部')
  const [generatedArtworks, setGeneratedArtworks] = useState<GeneratedArtwork[]>([])
  const [generationError, setGenerationError] = useState('')

  useEffect(() => {
    if (progress === null) return
    if (progress >= 100) {
      const done = window.setTimeout(() => setProgress(null), 900)
      return () => window.clearTimeout(done)
    }
    const timer = window.setTimeout(() => setProgress((value) => Math.min(100, (value ?? 0) + 7)), 180)
    return () => window.clearTimeout(timer)
  }, [progress])

  useEffect(() => {
    if (!reference) return
    return () => URL.revokeObjectURL(reference.url)
  }, [reference])

  const allArtworks = useMemo(() => [...generatedArtworks, ...artworks], [generatedArtworks])
  const visibleArtworks = useMemo(() => filter === '收藏' ? allArtworks.filter((item) => favorites.has(item.file)) : allArtworks, [allArtworks, favorites, filter])
  const toggleFavorite = (file: string) => setFavorites((current) => {
    const next = new Set(current)
    if (next.has(file)) {
      next.delete(file)
    } else {
      next.add(file)
    }
    return next
  })
  const handleGenerate = async () => {
    if (!prompt.trim() || progress !== null) return
    setGenerationError('')
    setProgress(8)
    try {
      const response = await generateImage({ prompt, model: 'gpt-image-2', provider: 'local-gpt-image', ratio, count, style: style === '默认' ? undefined : style })
      const createdAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setGeneratedArtworks((current) => [...response.images.map((image, index) => ({ file: image.dataUrl, title: `AI 生成 ${index + 1}`, meta: `${createdAt} · ${ratio}`, category: style })), ...current])
      setProgress(100)
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : '生成服务暂不可用，请确认后端已启动')
      setProgress(null)
    }
  }

  return (
    <div className="image-studio page-enter">
      <aside className="generation-panel">
        <div className="panel-title"><h1>生成设置</h1><button className="icon-button" title="历史记录"><History size={18} /></button></div>
        <section className="setting-section">
          <div className="setting-label"><strong>提示词</strong><span>{prompt.length}/2000</span></div>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="图片提示词" />
          <div className="reference-row">
            <label className="reference-upload-button"><ImageIcon size={15} />添加参考图<input type="file" accept="image/*" onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) setReference({ name: file.name, url: URL.createObjectURL(file) })
            }} /></label>
            {reference ? <span className="reference-chip"><img src={reference.url} alt="参考图预览" /><em>{reference.name}</em><button onClick={() => setReference(null)} title="移除参考图"><X size={13} /></button></span> : <small>可选，用于控制构图或风格</small>}
          </div>
          <div className="prompt-tags">{['赛博朋克', '未来城市', '少女', '电影感'].map((tag) => <button key={tag} onClick={() => setPrompt((value) => `${value}，${tag}`)}>+ {tag}</button>)}</div>
        </section>
        <section className="setting-section">
          <div className="setting-label"><strong>模型</strong></div>
          <button className="model-select"><span className="model-thumb"><Sparkles size={18} /></span><span><strong>GPT Image 2</strong><small>本地生成，支持后续扩展更多 Provider</small></span><ChevronDown size={17} /></button>
        </section>
        <section className="setting-section">
          <div className="setting-label"><strong>风格选择</strong><button>查看更多</button></div>
          <div className="style-swatches">{styles.map(([name, file]) => <button key={name} className={style === name ? 'active' : ''} onClick={() => setStyle(name)}><img src={assetUrl(file)} alt="" /><span>{name}</span></button>)}</div>
        </section>
        <section className="setting-section">
          <div className="setting-label"><strong>画面比例</strong></div>
          <div className="ratio-tiles">{ratios.map((value) => <button key={value} className={ratio === value ? 'active' : ''} onClick={() => setRatio(value)}><i className={`ratio-shape ratio-${value.replace(':', '-')}`} />{value}</button>)}</div>
        </section>
        <section className="setting-section inline-setting"><strong>生成数量</strong><div className="stepper"><button onClick={() => setCount((value) => Math.max(1, value - 1))}><Minus size={15} /></button><span>{count}</span><button onClick={() => setCount((value) => Math.min(8, value + 1))}><Plus size={15} /></button></div></section>
        <section className="setting-section advanced-section">
          <button className="advanced-toggle" onClick={() => setAdvanced((value) => !value)}><span><SlidersHorizontal size={16} />高级设置</span><ChevronDown size={16} className={advanced ? 'rotate' : ''} /></button>
          {advanced ? <div className="advanced-body"><label><span>提示词引导 <small>7.5</small></span><input type="range" min="1" max="10" step="0.5" defaultValue="7.5" /></label><div className="toggle-row"><span>高清修复</span><input type="checkbox" defaultChecked /><span>面部优化</span><input type="checkbox" defaultChecked /></div></div> : null}
        </section>
        <button className="primary-button generate-button" disabled={!prompt.trim() || progress !== null} onClick={handleGenerate}><Sparkles size={18} />{progress === null ? '立即生成' : '正在生成'}<kbd>⌘ Enter</kbd></button>
      </aside>

      <section className="results-panel">
        <div className="results-head">
          <div><h2>创作结果</h2><div className="result-filters"><button className={filter === '全部' ? 'active' : ''} onClick={() => setFilter('全部')}>全部 <span>{allArtworks.length}</span></button><button className={filter === '收藏' ? 'active' : ''} onClick={() => setFilter('收藏')}>收藏 <span>{favorites.size}</span></button></div></div>
          <div className="results-tools"><label className="search-control"><Search size={16} /><input placeholder="搜索提示词、风格或标签" /></label><button className="secondary-button">最新生成<ChevronDown size={15} /></button><button className="icon-button bordered" title="网格视图"><Grid2X2 size={17} /></button></div>
        </div>
        <div className="results-grid">{generationError ? <div className="generation-error">{generationError}</div> : null}
          {visibleArtworks.map((item) => (
            <article className="result-card" key={item.file}>
              <div className="result-media"><img src={(item.file.startsWith('data:') ? item.file : assetUrl(item.file))} alt={item.title} /><div className="media-actions"><button className={favorites.has(item.file) ? 'active' : ''} onClick={() => toggleFavorite(item.file)} title="收藏"><Heart size={17} fill={favorites.has(item.file) ? 'currentColor' : 'none'} /></button><a href={item.file.startsWith('data:') ? item.file : assetUrl(item.file)} download title="下载"><Download size={17} /></a><button title="更多"><MoreHorizontal size={17} /></button></div></div>
              <strong>{item.title}</strong><small><span>{item.file.startsWith('data:') ? 'GPT Image 2' : '示例资产'}</span><span>{ratio}</span>{item.meta.split('·')[0]}</small>
            </article>
          ))}
          {visibleArtworks.length === 0 ? <div className="empty-state"><Heart size={28} /><strong>还没有收藏作品</strong><p>点亮作品右上角的爱心后，会在这里出现。</p></div> : null}
        </div>
      </section>

      {progress !== null ? (
        <div className="generation-progress" role="status">
          <img src={assetUrl('deep-whale.webp')} alt="生成预览" />
          <div><strong>{progress >= 100 ? '生成完成' : '正在生成中...'}</strong><p>{prompt.slice(0, 46)}{prompt.length > 46 ? '...' : ''}</p><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>
          <b>{progress}%</b><button className="icon-button" onClick={() => setProgress(null)} title="取消生成"><X size={18} /></button>
        </div>
      ) : null}
    </div>
  )
}
