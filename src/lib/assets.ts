export const assetUrl = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`

export const artworks = [
  { file: 'floating-city.webp', title: '云海之城', meta: '今天 14:28 · 16:9', category: '科幻未来' },
  { file: 'wind-portrait.webp', title: '风中的她', meta: '今天 11:03 · 3:2', category: '人物肖像' },
  { file: 'forest-library.webp', title: '森林图书馆', meta: '昨天 20:17 · 16:9', category: '建筑设计' },
  { file: 'neon-car.webp', title: '霓虹旅程', meta: '昨天 18:05 · 16:9', category: '产品设计' },
  { file: 'deep-whale.webp', title: '向深海', meta: '5 月 14 日 · 3:2', category: '自然风光' },
  { file: 'red-maple.webp', title: '红叶之镜', meta: '5 月 12 日 · 3:2', category: '空间设计' },
] as const
