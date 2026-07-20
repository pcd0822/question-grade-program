// 새싹 지급 시 터지는 작은 초록 폭죽(컨페티). 라이브러리 없이 Canvas 로 구현.
const GREENS = ['#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0']

export function seedBurst(x: number, y: number) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const canvas = document.createElement('canvas')
  canvas.style.cssText = `position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:9999`
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')!

  const N = 26
  const parts = Array.from({ length: N }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = 3 + Math.random() * 5
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      size: 4 + Math.random() * 5,
      color: GREENS[Math.floor(Math.random() * GREENS.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      life: 1,
    }
  })

  let raf = 0
  const start = performance.now()
  function frame(now: number) {
    const t = now - start
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const p of parts) {
      p.vy += 0.22 // 중력
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      p.life = Math.max(0, 1 - t / 900)
      ctx.save()
      ctx.globalAlpha = p.life
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      ctx.restore()
    }
    if (t < 900) raf = requestAnimationFrame(frame)
    else {
      cancelAnimationFrame(raf)
      canvas.remove()
    }
  }
  raf = requestAnimationFrame(frame)
}

/** 클릭 이벤트 위치에서 폭죽 */
export function seedBurstAt(e: { clientX: number; clientY: number }) {
  seedBurst(e.clientX, e.clientY)
}
