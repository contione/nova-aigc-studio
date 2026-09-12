import { useState } from 'react'
import {
  Bell,
  ChevronLeft,
  Coins,
  FolderOpen,
  Home,
  Image,
  Menu,
  Search,
  Workflow,
} from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Brand } from './Brand'

const navItems = [
  { to: '/', label: '首页', icon: Home, end: true },
  { to: '/image', label: '图片生成', icon: Image },
  { to: '/canvas', label: '无限画布', icon: Workflow },
  { to: '/assets', label: '作品资产', icon: FolderOpen },
]

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <div className={`app-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <Brand compact={collapsed} />
          <button className="icon-button sidebar-toggle" onClick={() => setCollapsed((value) => !value)} title={collapsed ? '展开侧栏' : '收起侧栏'}>
            {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="主导航">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={collapsed ? label : undefined}>
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="motto"><span>CREATE A BRIGHTER</span><span>TOMORROW WITH AI</span></div>
          <button className="profile-button" title="个人中心">
            <span className="avatar">N</span>
            <span className="profile-copy"><strong>星河旅人</strong><small>NOVA Pro</small></span>
          </button>
        </div>
      </aside>
      <div className={`app-column ${isHome ? 'no-topbar' : ''}`}>
        {isHome ? null : <header className="topbar">
          <label className="global-search">
            <Search size={16} />
            <input aria-label="全局搜索" placeholder="搜索作品、提示词或灵感" />
            <kbd>⌘ K</kbd>
          </label>
          <div className="topbar-actions">
            <button className="credit-button"><Coins size={16} /><strong>2,360</strong><span>+</span></button>
            <button className="icon-button notify-button" title="通知"><Bell size={18} /><i /></button>
            <span className="avatar avatar-small">N</span>
          </div>
        </header>}
        <main className="main-content"><Outlet /></main>
      </div>
    </div>
  )
}
