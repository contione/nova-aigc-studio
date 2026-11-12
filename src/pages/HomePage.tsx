import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, MoreHorizontal, Plus, RefreshCw, Sparkles, Workflow } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { artworks, assetUrl } from '../lib/assets'
import { emptyCanvas, parseCanvas, safeImageSource } from '../lib/canvasDocument'
import { deleteCanvas, listCanvases, saveCanvas, subscribeStudioStorage, type StoredCanvas } from '../lib/studioStorage'
import '../home-workspace.css'

const allCategory = '全部图片'
const categories = [allCategory, ...Array.from(new Set(artworks.map((item) => item.category)))]
const banners = artworks.slice(0, 4).map((item) => ({
  file: item.file,
  title: item.title,
  subtitle: `图片灵感 - ${item.category}`,
}))

function createId(): string {
  return globalThis.crypto?.randomUUID?.() || `canvas-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '未知日期' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function canvasPreview(project: StoredCanvas): string | undefined {
  try {
    const document = parseCanvas(project.payload)
    for (const node of document.nodes) {
      const image = node.data.image
      if (safeImageSource(image)) return image
    }
  } catch {
    return undefined
  }
  return undefined
}

export function HomePage() {
  const navigate = useNavigate()
  const [slide, setSlide] = useState(0)
  const [category, setCategory] = useState(allCategory)
  const [shuffleSeed, setShuffleSeed] = useState(0)
  const [projects, setProjects] = useState<StoredCanvas[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      setProjects(await listCanvases())
      setLoadError('')
    } catch (loadError) {
      setLoadError(loadError instanceof Error ? loadError.message : '无法加载本地画布项目')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeStudioStorage(() => { void loadProjects() })
    const timer = window.setTimeout(() => { void loadProjects() }, 0)
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [loadProjects])

  useEffect(() => {
    const timer = window.setInterval(() => setSlide((value) => (value + 1) % banners.length), 6000)
    return () => window.clearInterval(timer)
  }, [])

  const inspiration = useMemo(() => {
    const filtered = category === allCategory ? artworks : artworks.filter((item) => item.category === category)
    if (!filtered.length) return filtered
    const offset = shuffleSeed % filtered.length
    return [...filtered.slice(offset), ...filtered.slice(0, offset)]
  }, [category, shuffleSeed])

  const previous = (slide - 1 + banners.length) % banners.length
  const next = (slide + 1) % banners.length

  const createCanvas = async () => {
    setCreating(true)
    setActionError('')
    const id = createId()
    try {
      await saveCanvas({ id, name: '未命名画布', updatedAt: new Date().toISOString(), payload: emptyCanvas() })
      navigate(`/canvas?project=${encodeURIComponent(id)}`)
    } catch (createError) {
      setActionError(createError instanceof Error ? createError.message : '无法创建本地画布')
    } finally {
      setCreating(false)
    }
  }

  const openCanvas = (id: string) => navigate(`/canvas?project=${encodeURIComponent(id)}`)

  const renameProject = async (project: StoredCanvas) => {
    setOpenMenuId(null)
    const nextName = window.prompt('重命名画布', project.name)
    if (nextName === null) return
    const name = nextName.trim()
    if (!name) {
      setActionError('画布名称不能为空')
      return
    }
    try {
      const updated = { ...project, name, updatedAt: new Date().toISOString() }
      await saveCanvas(updated)
      setProjects((current) => current.map((item) => item.id === project.id ? updated : item).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)))
      setActionError('')
    } catch (renameError) {
      setActionError(renameError instanceof Error ? renameError.message : '无法重命名此画布')
    }
  }

  const removeProject = async (project: StoredCanvas) => {
    setOpenMenuId(null)
    if (!window.confirm(`要从此设备删除“${project.name}”吗？`)) return
    try {
      await deleteCanvas(project.id)
      setProjects((current) => current.filter((item) => item.id !== project.id))
      setActionError('')
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : '无法删除此画布')
    }
  }

  return (
    <div className="home-page shotlab-home page-enter">
      <section className="showcase" aria-label="图片灵感">
        <button className="showcase-arrow left" onClick={() => setSlide(previous)} title="上一组灵感" aria-label="上一组灵感"><ArrowLeft size={20} /></button>
        <button className="showcase-side side-left" onClick={() => setSlide(previous)} aria-label={`查看 ${banners[previous].title}`}><img src={assetUrl(banners[previous].file)} alt="" /></button>
        <article className="showcase-active">
          <img src={assetUrl(banners[slide].file)} alt={banners[slide].title} />
          <div className="showcase-copy"><strong>{banners[slide].title}</strong><span>{banners[slide].subtitle}</span><button onClick={() => navigate(`/image?prompt=${encodeURIComponent(banners[slide].title)}`)}><Sparkles size={13} />打开图片工作室</button></div>
        </article>
        <button className="showcase-side side-right" onClick={() => setSlide(next)} aria-label={`查看 ${banners[next].title}`}><img src={assetUrl(banners[next].file)} alt="" /></button>
        <button className="showcase-arrow right" onClick={() => setSlide(next)} title="下一组灵感" aria-label="下一组灵感"><ArrowRight size={20} /></button>
        <div className="showcase-dots">{banners.map((banner, index) => <button key={banner.title} className={index === slide ? 'active' : ''} onClick={() => setSlide(index)} aria-label={`显示 ${banner.title}`} />)}</div>
      </section>

      <section className="content-section recent-section">
        <div className="section-heading"><h2>最近画布</h2><button className="link-button" onClick={() => navigate('/assets?q=')}><span>打开资产库</span><ArrowRight size={15} /></button></div>
        <div className="recent-rail shotlab-rail">
          <button className="new-canvas-tile" disabled={creating} onClick={() => void createCanvas()}><span><Plus size={24} /></span><strong>{creating ? '正在创建画布...' : '新建画布'}</strong><small>从空白本地工作区开始</small></button>
          {actionError ? <div className="home-action-message" role="alert">{actionError}</div> : null}
          {loading ? <div className="home-list-state" role="status">正在加载本地画布...</div> : null}
          {!loading && loadError ? <div className="home-list-state error" role="alert"><strong>画布不可用</strong><span>{loadError}</span><button className="secondary-button" onClick={() => void loadProjects()}>重试</button></div> : null}
          {!loading && !loadError && projects.length === 0 ? <div className="home-list-state"><strong>暂无已保存画布</strong><span>新建画布后会显示在这里。</span></div> : null}
          {!loading && !loadError ? projects.map((project) => {
            const preview = canvasPreview(project)
            return <article className="project-tile" key={project.id}>
              <button className="media-button" onClick={() => openCanvas(project.id)} aria-label={`打开 ${project.name}`}>
                {preview ? <img src={preview} alt="" /> : <span className="project-preview-empty"><Workflow size={22} /><small>暂无图片预览</small></span>}
                <i><Workflow size={14} />画布</i>
              </button>
              <div className="project-tile-body"><strong title={project.name}>{project.name}</strong><div className="project-menu-wrap"><button className="icon-button small" title="画布操作" aria-label={`${project.name}的操作`} aria-expanded={openMenuId === project.id} onClick={() => setOpenMenuId((current) => current === project.id ? null : project.id)}><MoreHorizontal size={17} /></button>{openMenuId === project.id ? <div className="project-menu" role="menu"><button role="menuitem" onClick={() => void renameProject(project)}>重命名</button><button role="menuitem" onClick={() => void removeProject(project)}>删除</button></div> : null}</div></div>
              <small>更新于 {formatUpdatedAt(project.updatedAt)}</small>
            </article>
          }) : null}
        </div>
      </section>

      <section className="content-section discovery-section">
        <div className="section-heading"><h2>图片灵感</h2><button className="link-button" onClick={() => setShuffleSeed((value) => value + 1)}><RefreshCw size={15} />换一批图片</button></div>
        <div className="section-heading inspiration-head"><div><div className="category-tabs" role="tablist" aria-label="图片灵感分类">{categories.map((item) => <button key={item} className={item === category ? 'active' : ''} onClick={() => setCategory(item)} role="tab" aria-selected={item === category}>{item}</button>)}</div></div></div>
        <div className="discovery-grid">
          {inspiration.map((item) => <button className="discovery-card" key={item.file} onClick={() => navigate(`/image?prompt=${encodeURIComponent(item.title)}`)} aria-label={`将${item.title}用作图片灵感`}>
            <img src={assetUrl(item.file)} alt={item.title} />
            <span><strong>{item.title}</strong><small>{item.category}</small></span>
          </button>)}
        </div>
      </section>
    </div>
  )
}
