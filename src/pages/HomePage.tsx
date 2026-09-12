import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, MoreHorizontal, Play, Plus, RefreshCw, Workflow } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { artworks, assetUrl } from '../lib/assets'

const categories = ['全部', '精选画布', '广告视觉', '剧情短片', '人物肖像', '自然风光', '概念设计']
const banners = [
  { file: 'floating-city.webp', title: 'NOVA VISION 4.0', subtitle: '更懂中文表达的视觉生成模型' },
  { file: 'neon-car.webp', title: '城市灵感计划', subtitle: '用影像重构未来生活的想象' },
  { file: 'forest-library.webp', title: '建筑与自然', subtitle: '本周创作者作品精选' },
  { file: 'deep-whale.webp', title: '向深海', subtitle: '探索超现实影像的边界' },
]

export function HomePage() {
  const navigate = useNavigate()
  const [slide, setSlide] = useState(0)
  const [category, setCategory] = useState('全部')
  const [shuffle, setShuffle] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setSlide((value) => (value + 1) % banners.length), 6000)
    return () => window.clearInterval(timer)
  }, [])

  const inspiration = useMemo(() => {
    const filtered = category === '全部' || category === '精选画布' ? artworks : artworks.filter((item) => item.category === category)
    return shuffle ? [...filtered].reverse() : filtered
  }, [category, shuffle])
  const previous = (slide - 1 + banners.length) % banners.length
  const next = (slide + 1) % banners.length

  return (
    <div className="home-page shotlab-home page-enter">
      <section className="showcase" aria-label="精选创作">
        <button className="showcase-arrow left" onClick={() => setSlide(previous)} title="上一张"><ArrowLeft size={20} /></button>
        <button className="showcase-side side-left" onClick={() => setSlide(previous)} aria-label={`查看 ${banners[previous].title}`}><img src={assetUrl(banners[previous].file)} alt="" /></button>
        <article className="showcase-active">
          <img src={assetUrl(banners[slide].file)} alt={banners[slide].title} />
          <div className="showcase-copy"><strong>{banners[slide].title}</strong><span>{banners[slide].subtitle}</span><button onClick={() => navigate('/image')}><Play size={13} fill="currentColor" />立即创作</button></div>
        </article>
        <button className="showcase-side side-right" onClick={() => setSlide(next)} aria-label={`查看 ${banners[next].title}`}><img src={assetUrl(banners[next].file)} alt="" /></button>
        <button className="showcase-arrow right" onClick={() => setSlide(next)} title="下一张"><ArrowRight size={20} /></button>
        <div className="showcase-dots">{banners.map((banner, index) => <button key={banner.title} className={index === slide ? 'active' : ''} onClick={() => setSlide(index)} aria-label={`切换到 ${banner.title}`} />)}</div>
      </section>

      <section className="content-section recent-section">
        <div className="section-heading"><h2>最近项目</h2><button className="link-button" onClick={() => navigate('/assets')}>查看全部<ArrowRight size={15} /></button></div>
        <div className="recent-rail shotlab-rail">
          <button className="new-canvas-tile" onClick={() => navigate('/canvas')}><span><Plus size={24} /></span><strong>新建画布</strong><small>从空白工作区开始</small></button>
          {artworks.slice(0, 5).map((item) => (
            <article className="project-tile" key={item.file}>
              <button className="media-button" onClick={() => navigate('/canvas')} aria-label={`打开 ${item.title}`}><img src={assetUrl(item.file)} alt={item.title} /><i><Workflow size={14} />画布</i></button>
              <div><strong>{item.title}</strong><button className="icon-button small" title="更多操作"><MoreHorizontal size={17} /></button></div>
              <small>{item.meta}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="content-section discovery-section">
        <div className="discovery-tabs"><button className="active">发现</button><button>图片</button><button>视频</button><button>画布</button><button>短片</button></div>
        <div className="section-heading inspiration-head">
          <div><div className="category-tabs">{categories.map((item) => <button key={item} className={item === category ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
          <button className="link-button" onClick={() => setShuffle((value) => !value)}><RefreshCw size={15} />换一批</button>
        </div>
        <div className="discovery-grid">
          {inspiration.map((item) => (
            <button className="discovery-card" key={item.file} onClick={() => navigate(`/image?prompt=${encodeURIComponent(item.title)}`)}>
              <img src={assetUrl(item.file)} alt={item.title} />
              <span><strong>{item.title}</strong><small>{item.category}</small></span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
