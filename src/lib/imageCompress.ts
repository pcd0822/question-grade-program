// 업로드 이미지를 정사각형으로 크롭·축소해 작은 JPEG dataURL 로 변환.
// (프로필 아바타용 — 저장 용량·전송량 최소화)
export function compressToSquare(file: File, size = 256, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')!
        // 투명 PNG 등이 검게 나오지 않도록 흰 배경을 먼저 채운다.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, size, size)
        // 중앙 정사각형 크롭
        const side = Math.min(img.width, img.height)
        const sx = (img.width - side) / 2
        const sy = (img.height - side) / 2
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
