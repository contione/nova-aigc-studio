import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronLeft, Database, FolderOpen, Home, Image, Menu, Search, Workflow, X } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Brand } from './Brand'
import '../home-workspace.css'

const navItems = [
  { to: '/', label: '首页', icon: Home, end: true },
  { to: '/image', label: '图片工作室', icon: Image },
  { to: '/canvas', label: '画布', icon: Workflow },
  { to: '/assets', label: '作品资产', icon: FolderOpen },
]

type WorkspacePopoverProps = { kind: 'notifications' | 'profile'; onClose: () => void }

function WorkspacePopover({ kind, onClose }: WorkspacePopoverProps) {
  const notifications = kind === 'notifications'
  return <div className="shell-popover" role="dialog" aria-label={notifications ? '工作区通知' : '本地工作区'}>
    <div className="shell-popover-head"><strong>{notifications ? '通知' : '本地工作区'}</strong><button className="icon-button small" onClick={onClose} title="关闭" aria-label="关闭"><X size={15} /></button></div>
    {notifications ? <><p>当前本地工作区暂无通知。</p><small>作品库和项目列表会在同源标签页之间刷新。已打开的画布编辑器请重新加载，不是实时多人协作。</small></> : <><p>未连接账户。</p><small>画布项目和图片保存在此浏览器中，未配置账户与计费。</small></>}
  </div>
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
      if (event.key === 'Escape') {
        setNotificationsOpen(false)
        setProfileOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate(`/assets?q=${encodeURIComponent(search.trim())}`)
  }

  const toggleNotifications = () => {
    setNotificationsOpen((value) => !value)
    setProfileOpen(false)
  }

  const toggleProfile = () => {
    setProfileOpen((value) => !value)
    setNotificationsOpen(false)
  }

  return (
    <div className={`app-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <Brand compact={collapsed} />
          <button className="icon-button sidebar-toggle" onClick={() => setCollapsed((value) => !value)} title={collapsed ? '展开侧栏' : '收起侧栏'} aria-label={collapsed ? '展开侧栏' : '收起侧栏'}>
            {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="主导航">
          {navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={collapsed ? label : undefined}><Icon size={19} /><span>{label}</span></NavLink>)}
        </nav>
        <div className="sidebar-foot">
          <div className="motto"><span>清晰创作</span><span>数据留在本地</span></div>
          <button className="profile-button" title="本地工作区" onClick={toggleProfile} aria-expanded={profileOpen}>
            <span className="avatar">N</span>
            <span className="profile-copy"><strong>本地工作区</strong><small>浏览器存储</small></span>
          </button>
        </div>
      </aside>
      <div className="app-column">
        <header className="topbar">
          <form className="global-search" onSubmit={submitSearch} role="search">
            <Search size={16} />
            <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} aria-label="全局搜索" placeholder="搜索资产、提示词或画布" />
            <kbd>Ctrl K</kbd>
          </form>
          <div className="topbar-actions">
            <button className="workspace-status" onClick={toggleProfile} title="查看本地工作区状态"><Database size={15} /><span>本地工作区</span></button>
            <button className="icon-button notify-button" onClick={toggleNotifications} title="工作区状态" aria-label="工作区状态" aria-expanded={notificationsOpen}><Bell size={18} /></button>
            <button className="profile-trigger" onClick={toggleProfile} title="本地工作区" aria-label="本地工作区" aria-expanded={profileOpen}><span className="avatar avatar-small">N</span></button>
          </div>
        </header>
        {notificationsOpen ? <WorkspacePopover kind="notifications" onClose={() => setNotificationsOpen(false)} /> : null}
        {profileOpen ? <WorkspacePopover kind="profile" onClose={() => setProfileOpen(false)} /> : null}
        <main className="main-content"><Outlet /></main>
      </div>
    </div>
  )
}
