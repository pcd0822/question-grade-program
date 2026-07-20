// 모둠 공간 상점 카탈로그 + 격자 규격 (서버가 가격의 단일 진실 소스)
export const GRID_COLS = 8
export const GRID_ROWS = 5

export const SHOP = [
  { type: 'plant', name: '화분', emoji: '🪴', price: 3 },
  { type: 'plant_big', name: '큰나무', emoji: '🌳', price: 12 },
  { type: 'desk', name: '책상', emoji: '🪑', price: 6 },
  { type: 'sofa', name: '소파', emoji: '🛋️', price: 9 },
  { type: 'frame', name: '액자', emoji: '🖼️', price: 5 },
  { type: 'rug', name: '러그', emoji: '🟫', price: 4 },
  { type: 'window', name: '창문', emoji: '🪟', price: 7 },
  { type: 'bookshelf', name: '책장', emoji: '📚', price: 10 },
  { type: 'clock', name: '시계', emoji: '🕐', price: 4 },
  { type: 'lamp', name: '조명', emoji: '💡', price: 5 },
  { type: 'plush', name: '인형', emoji: '🧸', price: 6 },
  { type: 'trophy', name: '트로피', emoji: '🏆', price: 15 },
]

export const priceOf = (type) => SHOP.find((s) => s.type === type)?.price ?? null
