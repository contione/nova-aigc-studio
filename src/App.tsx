import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AssetsPage } from './pages/AssetsPage'
import { HomePage } from './pages/HomePage'
import { ImageStudio } from './pages/ImageStudio'

const CanvasStudio = lazy(() => import('./pages/CanvasStudio').then((module) => ({ default: module.CanvasStudio })))

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/canvas" element={<Suspense fallback={<div role="status">正在加载画布…</div>}><CanvasStudio /></Suspense>} />
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="/image" element={<ImageStudio />} />
          <Route path="/assets" element={<AssetsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
