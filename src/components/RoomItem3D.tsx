// 모둠 공간 아이템을 three.js(procedural) 로 사실적으로 그린다.
//  - three.js 는 동적 import(코드 스플릿). 로딩 중이거나 WebGL 을 못 쓰면 순수 CSS 폴백.
//  - 공유 렌더러(lib/room3d) 로 그린 결과를 이 컴포넌트의 2D 캔버스에 복사한다.
//  - 회전(rotation)은 mesh 의 Y축 회전으로 매끄럽게 반영. spin 은 프리뷰 자동 360° 회전.
import { useEffect, useRef, useState } from 'react'
import { drawRoomItem, ensureRoom3d } from '../lib/room3d'
import RoomItemCSS from './RoomItemCSS'

// 캔버스 backing store 해상도(물리 px). 공유 GL 렌더러(300px)가 여기에 다운샘플로
// 복사돼 슈퍼샘플링된 것처럼 선명하다. 방에 40개가 떠도 메모리가 과하지 않게 220 로 둔다.
// (표시 최대 크기 ≈ size 54 × depthScale 1.25 × scale 2.5 ≈ 170px 보다 크므로 확대돼도 선명)
const INTERNAL = 220

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function RoomItem3D({
  type,
  rotation = 0,
  size = 64,
  spin = false,
}: {
  type: string
  /** 세로축(Y축) 회전각. 학생이 끌어서 바꾼다. */
  rotation?: number
  /** 화면 표시 크기(px). 부모의 depthScale×scale 로 다시 확대된다. */
  size?: number
  /** 상점·구매확인 프리뷰에서 천천히 자동 회전(360° 시연). reduced-motion 이면 멈춘다. */
  spin?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // three.js 준비 상태: null=로딩중, true=사용, false=WebGL 불가(CSS 폴백)
  const [ready, setReady] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    ensureRoom3d().then((okFlag) => {
      if (alive) setReady(okFlag)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (ready !== true) return
    const canvas = canvasRef.current
    if (!canvas) return

    // 자동 스핀은 rAF 로만(온디맨드). 정지 시엔 rotation 이 바뀔 때 1회만 그린다.
    if (spin && !prefersReducedMotion()) {
      let angle = rotation
      let raf = 0
      const tick = () => {
        angle = (angle + 0.6) % 360
        drawRoomItem(canvas, type, angle)
        raf = requestAnimationFrame(tick)
      }
      tick()
      return () => cancelAnimationFrame(raf)
    }
    drawRoomItem(canvas, type, rotation)
  }, [ready, type, rotation, spin])

  // 로딩 중이거나 WebGL 불가 → CSS 폴백
  if (ready !== true) return <RoomItemCSS type={type} rotation={rotation} size={size} spin={spin} />

  return (
    <canvas
      ref={canvasRef}
      width={INTERNAL}
      height={INTERNAL}
      style={{ width: size, height: size, display: 'block' }}
    />
  )
}
