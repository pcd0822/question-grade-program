// [폴백] WebGL(three.js) 을 못 쓰거나 로딩 중일 때 쓰는 순수 CSS 3D 렌더.
// 정상 경로는 components/RoomItem3D.tsx(three.js procedural). 여기는 그 대비책이다.
// 각진 가구(책상·소파·책장·액자 등)는 preserve-3d 로 6면을 세운 직육면체(Cuboid)로,
// 둥근/유기적 물체(화분·나무·인형·트로피·조명)는 구(Sphere)·원뿔/원기둥(Cone)으로 조립한다.
//
// ★ 둥근 물체는 "카메라를 향하는 음영 도형"으로 그린다.
//   구·원기둥은 회전 대칭이라 어느 각도에서 봐도 실루엣이 같다. 그래서 모델이 rotateY 로
//   돌아가도 그만큼 반대로(-rotation) 되돌려 항상 정면을 보게 하면, 이모지처럼 납작해지지
//   않고 실제 3D 처럼 보인다(자동 스핀 프리뷰에서는 역방향 애니메이션으로 상쇄한다).
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

// 모든 하위 도형에 공유되는 회전 문맥
interface Ctx {
  /** 세로축 회전각(수동) */
  rot: number
  /** 자동 스핀(프리뷰) 중인지 */
  spin: boolean
}

// ── 직육면체 프리미티브 (각진 가구용) ────────────────────────────
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
      {mk(w, h, `translateZ(${d / 2}px)`, shade(color, 6), front)}
      {mk(w, h, `rotateY(180deg) translateZ(${d / 2}px)`, shade(color, -24))}
      {mk(d, h, `rotateY(90deg) translateZ(${w / 2}px)`, shade(color, -14))}
      {mk(d, h, `rotateY(-90deg) translateZ(${w / 2}px)`, shade(color, -6))}
      {mk(w, d, `rotateX(90deg) translateZ(${h / 2}px)`, shade(color, 18))}
      {mk(w, d, `rotateX(-90deg) translateZ(${h / 2}px)`, shade(color, -32))}
    </div>
  )
}

// ── 카메라를 향하는 빌보드 래퍼 (구·원뿔의 회전 상쇄) ────────────
function Billboard({
  cx = 0,
  cy,
  cz = 0,
  ctx,
  children,
}: {
  cx?: number
  cy: number
  cz?: number
  ctx: Ctx
  children: ReactNode
}) {
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
      {/* 모델의 rotateY 를 반대로 되돌려 항상 정면을 보게 한다 */}
      <div
        className={ctx.spin ? 'ri3d-spin-rev' : undefined}
        style={{ transformStyle: 'preserve-3d', transform: ctx.spin ? undefined : `rotateY(${-ctx.rot}deg)` }}
      >
        {children}
      </div>
    </div>
  )
}

// ── 구 프리미티브 (나뭇잎 뭉치·인형 등 둥근 것) ──────────────────
function Sphere({
  d,
  cx = 0,
  cy,
  cz = 0,
  color,
  ctx,
  children,
}: {
  d: number
  cx?: number
  cy: number
  cz?: number
  color: string
  ctx: Ctx
  children?: ReactNode
}) {
  return (
    <Billboard cx={cx} cy={cy} cz={cz} ctx={ctx}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: d,
          height: d,
          transform: 'translate(-50%,-50%)',
          borderRadius: '50%',
          // 왼쪽 위에서 빛을 받는 공 음영 + 아래쪽 옅은 그림자 테두리
          background: `radial-gradient(circle at 34% 28%, ${shade(color, 45)} 0%, ${color} 52%, ${shade(color, -30)} 100%)`,
          boxShadow: 'inset -2px -3px 5px rgba(0,0,0,.18)',
        }}
      >
        {children}
      </div>
    </Billboard>
  )
}

// ── 원뿔/원기둥 프리미티브 (화분·전등갓·컵·기둥) ─────────────────
// wTop·wBot 이 다르면 원뿔(사다리꼴), 같으면 원기둥. 위쪽에 열린 타원 뚜껑을 얹는다.
function Cone({
  wTop,
  wBot,
  h,
  cx = 0,
  cy,
  cz = 0,
  color,
  ctx,
  capColor,
}: {
  wTop: number
  wBot: number
  h: number
  cx?: number
  cy: number
  cz?: number
  color: string
  ctx: Ctx
  /** 위 뚜껑(테/개구부) 색. 안 주면 옆면보다 밝게 */
  capColor?: string
}) {
  const W = Math.max(wTop, wBot)
  const tl = ((W - wTop) / 2 / W) * 100
  const tr = 100 - tl
  const bl = ((W - wBot) / 2 / W) * 100
  const br = 100 - bl
  const capH = wTop * 0.32
  return (
    <Billboard cx={cx} cy={cy} cz={cz} ctx={ctx}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: h, transform: 'translate(-50%,-50%)' }}>
        {/* 옆면 — 가로 방향 음영으로 원통 느낌 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            clipPath: `polygon(${tl}% 0%, ${tr}% 0%, ${br}% 100%, ${bl}% 100%)`,
            background: `linear-gradient(90deg, ${shade(color, -26)} 0%, ${shade(color, 20)} 40%, ${shade(color, 2)} 62%, ${shade(color, -28)} 100%)`,
          }}
        />
        {/* 위 뚜껑(타원) — 살짝 내려다보는 각도라 개구부가 보인다 */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            width: wTop,
            height: capH,
            transform: 'translate(-50%,-50%)',
            borderRadius: '50%',
            background: capColor || shade(color, 26),
            boxShadow: 'inset 0 2px 3px rgba(0,0,0,.18)',
          }}
        />
      </div>
    </Billboard>
  )
}

// ── 색 팔레트 ────────────────────────────────────────────────────
const C = {
  wood: '#b98a5a',
  woodDark: '#8a5a34',
  terra: '#cf7f52',
  terraDark: '#a85f38',
  green: '#57b877',
  greenDeep: '#3f9c63',
  greenMoss: '#4caf6e',
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
  bearDark: '#7a5533',
  white: '#f6faf8',
  ink: '#334155',
}

// ── 아이템별 모형 ───────────────────────────────────────────────
function Model({ type, ctx }: { type: string; ctx: Ctx }) {
  switch (type) {
    // 화분 — 원뿔 화분 + 둥근 나뭇잎 뭉치(구 여러 개)
    case 'plant':
      return (
        <>
          <Cone wTop={22} wBot={15} h={17} cy={9} color={C.terra} ctx={ctx} capColor={shade(C.woodDark, -6)} />
          <Sphere d={24} cy={30} color={C.green} ctx={ctx} />
          <Sphere d={16} cx={-8} cy={26} cz={4} color={C.greenDeep} ctx={ctx} />
          <Sphere d={15} cx={8} cy={27} cz={-3} color={C.greenMoss} ctx={ctx} />
          <Sphere d={14} cy={40} color={shade(C.green, 8)} ctx={ctx} />
        </>
      )
    // 큰나무 — 화분 + 기둥(원기둥) + 큼직한 나뭇잎 뭉치
    case 'plant_big':
      return (
        <>
          <Cone wTop={18} wBot={13} h={12} cy={6} color={C.terra} ctx={ctx} capColor={shade(C.woodDark, -6)} />
          <Cone wTop={7} wBot={9} h={18} cy={19} color={C.woodDark} ctx={ctx} capColor={C.woodDark} />
          <Sphere d={34} cy={42} color={C.greenDeep} ctx={ctx} />
          <Sphere d={22} cx={-12} cy={36} cz={3} color={C.green} ctx={ctx} />
          <Sphere d={22} cx={12} cy={37} cz={-3} color={C.greenMoss} ctx={ctx} />
          <Sphere d={20} cy={54} color={shade(C.green, 6)} ctx={ctx} />
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
    // 조명 — 원기둥 받침 + 가는 기둥 + 원뿔 갓
    case 'lamp':
      return (
        <>
          <Cone wTop={16} wBot={18} h={5} cy={2.5} color={C.metalDark} ctx={ctx} capColor={shade(C.metal, 10)} />
          <Cone wTop={4} wBot={4} h={30} cy={18} color={C.metal} ctx={ctx} capColor={C.metal} />
          <Cone wTop={14} wBot={24} h={16} cy={41} color={C.lampWarm} ctx={ctx} capColor={shade(C.lampWarm, -10)} />
        </>
      )
    // 인형(곰) — 둥근 몸·머리·귀 (모두 구)
    case 'plush':
      return (
        <>
          <Sphere d={24} cy={13} color={C.bear} ctx={ctx} />
          <Sphere d={7} cx={-8} cy={22} cz={4} color={C.bear} ctx={ctx} />
          <Sphere d={7} cx={8} cy={22} cz={4} color={C.bear} ctx={ctx} />
          <Sphere d={19} cy={31} color={C.bearLight} ctx={ctx}>
            {/* 얼굴 — 빌보드라 항상 정면을 본다 */}
            <div style={{ position: 'absolute', left: '32%', top: '42%', width: 2.5, height: 2.5, borderRadius: '50%', background: C.bearDark }} />
            <div style={{ position: 'absolute', left: '62%', top: '42%', width: 2.5, height: 2.5, borderRadius: '50%', background: C.bearDark }} />
            <div style={{ position: 'absolute', left: '50%', top: '60%', width: 4, height: 3, marginLeft: -2, borderRadius: '50%', background: C.bearDark }} />
          </Sphere>
          <Sphere d={7} cx={-8} cy={40} color={C.bear} ctx={ctx} />
          <Sphere d={7} cx={8} cy={40} color={C.bear} ctx={ctx} />
        </>
      )
    // 트로피 — 각진 받침 + 원기둥 기둥 + 원뿔 컵
    case 'trophy':
      return (
        <>
          <Cuboid w={20} h={6} d={20} cy={3} color={C.goldDark} radius={2} />
          <Cone wTop={6} wBot={6} h={8} cy={10} color={C.gold} ctx={ctx} capColor={shade(C.gold, 12)} />
          <Cone wTop={24} wBot={12} h={20} cy={26} color={C.gold} ctx={ctx} capColor={shade(C.gold, 24)} />
        </>
      )
    default:
      return <Cuboid w={26} h={26} d={26} cy={13} color={C.sage} radius={6} />
  }
}

// ── 공개 컴포넌트(폴백) ─────────────────────────────────────────
export default function RoomItemCSS({
  type,
  rotation = 0,
  size = 64,
  spin = false,
}: {
  type: string
  rotation?: number
  size?: number
  spin?: boolean
}) {
  const ctx: Ctx = { rot: rotation, spin }
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
          <Model type={type} ctx={ctx} />
        </div>
      </div>
    </div>
  )
}
