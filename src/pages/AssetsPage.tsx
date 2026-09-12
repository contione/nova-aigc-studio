import { Download, Grid2X2, List, MoreHorizontal, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { artworks, assetUrl } from '../lib/assets'

export function AssetsPage() {
  const [query, setQuery] = useState('')
  const [grid, setGrid] = useState(true)
  const filtered = useMemo(() => artworks.filter((item) => item.title.includes(query) || item.category.includes(query)), [query])

  return (
    <div className="assets-page page-enter">
      <div className="page-title-row"><div><h1>作品资产</h1><p>你的生成作品与画布导出集中在这里。</p></div><button className="secondary-button"><Download size={16} />批量导出</button></div>
      <div className="asset-toolbar">
        <label className="search-control"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索作品" /></label>
        <div className="segmented icon-segmented"><button className={grid ? 'active' : ''} onClick={() => setGrid(true)} title="网格视图"><Grid2X2 size={17} /></button><button className={!grid ? 'active' : ''} onClick={() => setGrid(false)} title="列表视图"><List size={17} /></button></div>
      </div>
      <div className={grid ? 'asset-grid' : 'asset-list'}>
        {filtered.map((item) => (
          <article className="asset-card" key={item.file}>
            <img src={assetUrl(item.file)} alt={item.title} />
            <div><span><strong>{item.title}</strong><small>{item.category} · {item.meta}</small></span><button className="icon-button small" title="更多操作"><MoreHorizontal size={17} /></button></div>
          </article>
        ))}
      </div>
    </div>
  )
}
