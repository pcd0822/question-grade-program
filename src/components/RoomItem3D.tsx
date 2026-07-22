// 모둠 공간 아이템을 "진짜 3D" 로 그린다.
// 이모지에 rotateY 를 걸면 납작해지지만, 여기서는 상자·기둥 같은 CSS 3D 프리미티브
// (preserve-3d 로 6면을 세운 직육면체)로 모형을 조립하므로 돌리면 옆·뒤가 실제로 보인다.
// 부모(GroupRoom)가 위치·심도 배율·바닥 그림자를 맡고, 이 컴포넌트는 모형과 회전만 맡는다.
import type { CSSProperties, ReactNode } from 'react'

// ── 색 음영 헬퍼 ────────────────────────────────────────────────
function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)))
}
/** hex 색을 percent(+밝게 / -어둡게) 만큼 조정 */
function shade(hex: string, percent: number) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const f = percent / 100
  const adj = (c: number) => clampByte(percent >= 0 ? c + (255 - c) * f : c + c * f)
  return `rgb(${adj(r)}, ${adj(g)}, ${adj(b)})`
}

// ── 직육면체 프리미티브 ──────────────────────────────────────────
// cx·cy·cz = 모형 좌표(px)에서의 중심. 바닥이 y=0, 위로 갈수록 cy 증가.
interface CuboidProps {
  w: number
  h: number
  d: number
  cx?: number
  cy: number
  cz?: number
  color: string
  radius?: number
  /** 앞면(+z)에 얹을 장식 (액자 그림·창문 유리·책등 등) */
  front?: ReactNode
}

function Cuboid({ w, h, d, cx = 0, cy, cz = 0, color, radius = 0, front }: CuboidProps) {
  const face: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: radius,
    backfaceVisibility: 'hidden',
    // 아주 옅은 테두리로 면 경계를 또렷하게
    boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,.04)',
  }
  const mk = (fw: number, fh: number, t: string, bg: string, child?: ReactNode) => (
    <div style={{ ...face, width: fw, height: fh, transform: `translate(-50%,-50%) ${t}`, background: bg }}>
      {child}
    </div>
  )
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 0,
        transformStyle: 'preserve-3d',
        transform: `translate3d(${cx}px, ${-cy}px, ${cz}px)`,
      }}
    >
      {/* 앞 · 뒤 */}
      {mk(w, h, `translateZ(${d / 2}px)`, shade(color, 6), front)}
      {mk(w, h, `rotateY(180deg) translateZ(${d / 2}px)`, shade(color, -24))}
      {/* 오른쪽 · 왼쪽 */}
      {mk(d, h, `rotateY(90deg) translateZ(${w / 2}px)`, shade(color, -14))}
      {mk(d, h, `rotateY(-90deg) translateZ(${w / 2}px)`, shade(color, -6))}
      {/* 위 · 아래 */}
      {mk(w, d, `rotateX(90deg) translateZ(${h / 2}px)`, shade(color, 18))}
      {mk(w, d, `rotateX(-90deg) translateZ(${h / 2}px)`, shade(color, -32))}
    </div>
  )
}

// ── 색 팔레트 ────────────────────────────────────────────────────
const C = {
  wood: '#b98a5a',
  woodDark: '#8a5a34',
  terra: '#d98a5f',
  green: '#57b877',
  greenDeep: '#3f9c63',
  sage: '#86b798',
  rug: '#cf7f7f',
  rugLight: '#e0a0a0',
  frame: '#e6ebe8',
  glass: '#bfe3f2',
  gold: '#e8c25a',
  goldDark: '#c9a63f',
  metal: '#94a3b8',
  metalDark: '#64748b',
  lampWarm: '#f4dc8f',
  bear: '#c79a6b',
  bearLight: '#d6ac80',
  white: '#f6faf8',
  ink: '#334155',
}

// ── 아이템별 모형 ───────────────────────────────────────────────
function Model({ type }: { type: string }) {
  switch (type) {
    case 'plant':
      return (
        <>
          <Cuboid w={22} h={16} d={22} cy={8} color={C.terra} radius={3} />
          <Cuboid w={26} h={22} d={26} cy={31} color={C.green} radius={12} />
        </>
      )
    case 'plant_big':
      return (
        <>
          <Cuboid w={18} h={12} d={18} cy={6} color={C.terra} radius={3} />
          <Cuboid w={7} h={18} d={7} cy={19} color={C.woodDark} />
          <Cuboid w={36} h={30} d={36} cy={44} color={C.greenDeep} radius={18} />
        </>
      )
    case 'desk':
      return (
        <>
          <Cuboid w={46} h={6} d={28} cy={36} color={C.wood} radius={2} />
          <Cuboid w={5} h={32} d={5} cx={-18} cz={10} cy={16} color={C.woodDark} />
          <Cuboid w={5} h={32} d={5} cx={18} cz={10} cy={16} color={C.woodDark} />
          <Cuboid w={5} h={32} d={5} cx={-18} cz={-10} cy={16} color={C.woodDark} />
          <Cuboid w={5} h={32} d={5} cx={18} cz={-10} cy={16} color={C.woodDark} />
        </>
      )
    case 'sofa':
      return (
        <>
          <Cuboid w={42} h={12} d={24} cy={12} color={C.sage} radius={4} />
          <Cuboid w={42} h={20} d={6} cz={-9} cy={26} color={shade(C.sage, -8)} radius={4} />
          <Cuboid w={6} h={18} d={24} cx={-18} cy={16} color={C.sage} radius={4} />
          <Cuboid w={6} h={18} d={24} cx={18} cy={16} color={C.sage} radius={4} />
        </>
      )
    case 'frame':
      return (
        <Cuboid
          w={32}
          h={40}
          d={5}
          cy={28}
          color={C.wood}
          radius={3}
          front={
            <div
              style={{
                position: 'absolute',
                inset: 5,
                borderRadius: 2,
                background: 'linear-gradient(180deg, #bfe3f2 0%, #d9f0e0 55%, #7fc79a 56%, #57b877 100%)',
              }}
            >
              <div style={{ position: 'absolute', right: 5, top: 5, width: 7, height: 7, borderRadius: '50%', background: '#ffe9a8' }} />
            </div>
          }
        />
      )
    case 'rug':
      return (
        <>
          <Cuboid w={48} h={3} d={34} cy={1.5} color={C.rug} radius={5} />
          <Cuboid w={38} h={3.6} d={26} cy={1.8} color={C.rugLight} radius={4} />
        </>
      )
    case 'window':
      return (
        <Cuboid
          w={40}
          h={34}
          d={5}
          cy={28}
          color={C.frame}
          radius={3}
          front={
            <div style={{ position: 'absolute', inset: 4, background: C.glass, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 3, marginLeft: -1.5, background: C.frame }} />
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 3, marginTop: -1.5, background: C.frame }} />
            </div>
          }
        />
      )
    case 'bookshelf':
      return (
        <Cuboid
          w={34}
          h={48}
          d={20}
          cy={24}
          color={C.wood}
          radius={2}
          front={
            <div style={{ position: 'absolute', inset: 4, background: shade(C.woodDark, -20), borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 3, padding: 3 }}>
              {[['#e57373', '#64b5f6', '#81c784', '#ffb74d'], ['#9575cd', '#4db6ac', '#f06292', '#fff176'], ['#4fc3f7', '#aed581', '#ff8a65', '#ba68c8']].map((row, ri) => (
                <div key={ri} style={{ flex: 1, display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                  {row.map((c, ci) => (
                    <div key={ci} style={{ flex: 1, height: `${70 + ((ri + ci) % 3) * 10}%`, background: c, borderRadius: 1 }} />
                  ))}
                </div>
              ))}
            </div>
          }
        />
      )
    case 'clock':
      return (
        <Cuboid
          w={34}
          h={34}
          d={8}
          cy={28}
          color={C.greenDeep}
          radius={17}
          front={
            <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: C.white }}>
              <div style={{ position: 'absolute', left: '50%', top: '50%', width: 2, height: 9, marginLeft: -1, marginTop: -9, background: C.ink, transformOrigin: 'bottom center', transform: 'rotate(20deg)' }} />
              <div style={{ position: 'absolute', left: '50%', top: '50%', width: 2, height: 6, marginLeft: -1, marginTop: -6, background: C.ink, transformOrigin: 'bottom center', transform: 'rotate(-70deg)' }} />
              <div style={{ position: 'absolute', left: '50%', top: '50%', width: 4, height: 4, margin: '-2px 0 0 -2px', borderRadius: '50%', background: C.ink }} />
            </div>
          }
        />
      )
    case 'lamp':
      return (
        <>
          <Cuboid w={18} h={4} d={18} cy={2} color={C.metalDark} radius={3} />
          <Cuboid w={4} h={30} d={4} cy={18} color={C.metal} />
          <Cuboid w={24} h={14} d={24} cy={40} color={C.lampWarm} radius={4} />
        </>
      )
    case 'plush':
      return (
        <>
          <Cuboid w={22} h={20} d={16} cy={12} color={C.bear} radius={8} />
          <Cuboid w={18} h={16} d={15} cy={32} color={C.bearLight} radius={9} />
          <Cuboid w={6} h={6} d={5} cx={-6} cy={41} color={C.bear} radius={3} />
          <Cuboid w={6} h={6} d={5} cx={6} cy={41} color={C.bear} radius={3} />
        </>
      )
    case 'trophy':
      return (
        <>
          <Cuboid w={20} h={6} d={20} cy={3} color={C.goldDark} radius={2} />
          <Cuboid w={6} h={8} d={6} cy={10} color={C.gold} />
          <Cuboid w={22} h={20} d={16} cy={26} color={C.gold} radius={8} />
        </>
      )
    default:
      // 알 수 없는 타입은 단순 상자
      return <Cuboid w={26} h={26} d={26} cy={13} color={C.sage} radius={6} />
  }
}

// ── 공개 컴포넌트 ───────────────────────────────────────────────
export default function RoomItem3D({
  type,
  rotation = 0,
  size = 64,
  spin = false,
}: {
  type: string
  /** 세로축(Y축) 회전각. 학생이 끌어서 바꾼다. */
  rotation?: number
  /** 렌더 박스 한 변(px). 부모의 depthScale×scale 로 다시 확대된다. */
  size?: number
  /** 상점·구매확인 프리뷰에서 천천히 자동 회전(360° 시연). reduced-motion 이면 멈춘다. */
  spin?: boolean
}) {
  return (
    <div style={{ width: size, height: size, position: 'relative', perspective: 620 }}>
      {/* 기울기(위에서 살짝 내려다봄) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transformStyle: 'preserve-3d',
          transform: 'rotateX(-16deg)',
          transformOrigin: '50% 100%',
        }}
      >
        {/* 회전(수동 rotateY 또는 자동 스핀) */}
        <div
          className={spin ? 'ri3d-spin' : undefined}
          style={{
            position: 'absolute',
            inset: 0,
            transformStyle: 'preserve-3d',
            transformOrigin: '50% 100%',
            transform: spin ? undefined : `rotateY(${rotation}deg)`,
          }}
        >
          <Model type={type} />
        </div>
      </div>
    </div>
  )
}
