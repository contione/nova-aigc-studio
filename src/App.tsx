import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AssetsPage } from './pages/AssetsPage'
import { CanvasStudio } from './pages/CanvasStudio'
import { HomePage } from './pages/HomePage'
import { ImageStudio } from './pages/ImageStudio'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/canvas" element={<CanvasStudio />} />
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
