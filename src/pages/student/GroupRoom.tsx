import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudentSession } from '../../types'
import { room, student, type ChatMessage, type RoomState, type ShopItem } from '../../lib/studentApi'
import { fetchGroupChat } from '../../lib/studentData'
import { useRealtime } from '../../hooks/useRealtime'
import Avatar from '../../components/Avatar'
import RoomItem3D from '../../components/RoomItem3D'
import type { RoomSideData } from '../StudentDashboard'

interface Props {
  me: StudentSession
  /** 모둠원·모둠 배지를 우측 배너에 띄우도록 부모에게 올려 보낸다 */
  onSideData?: (d: RoomSideData | null) => void
}

// ── 방의 기하 (1점 투시) ────────────────────────────────────────
// 사용자가 바라보는 쪽만 뚫린 상자. 정면 벽(뒷벽)을 가운데 직사각형으로 두고,
// 거기서 화면 네 모서리로 뻗어 나가는 사다리꼴 넷이 각각
// 천장 · 바닥 · 왼쪽 벽 · 오른쪽 벽이 된다. 좌표는 공간 가로·세로의 비율(0~100).
const BACK_L = 20 // 정면 벽의 왼쪽 변
const BACK_R = 80 // 정면 벽의 오른쪽 변
const BACK_T = 12 // 정면 벽의 윗변 (= 천장이 만나는 곳)
const BACK_B = 56 // 정면 벽의 아랫변 (= 바닥이 만나는 곳)

/** 아이템이 놓인 면. 좌표만으로 판정하므로 따로 저장할 필요가 없다. */
type Surface = 'floor' | 'ceiling' | 'left' | 'right' | 'back'

/** 다섯 면의 다각형 — clip-path 와 같은 좌표를 쓴다(그림과 판정이 어긋나지 않도록) */
const FACES: { id: Surface; poly: [number, number][] }[] = [
  {
    id: 'back',
    poly: [
      [BACK_L, BACK_T],
      [BACK_R, BACK_T],
      [BACK_R, BACK_B],
      [BACK_L, BACK_B],
    ],
  },
  {
    id: 'ceiling',
    poly: [
      [0, 0],
      [100, 0],
      [BACK_R, BACK_T],
      [BACK_L, BACK_T],
    ],
  },
  {
    id: 'floor',
    poly: [
      [BACK_L, BACK_B],
      [BACK_R, BACK_B],
      [100, 100],
      [0, 100],
    ],
  },
  {
    id: 'left',
    poly: [
      [0, 0],
      [BACK_L, BACK_T],
      [BACK_L, BACK_B],
      [0, 100],
    ],
  },
  {
    id: 'right',
    poly: [
      [100, 0],
      [100, 100],
      [BACK_R, BACK_B],
      [BACK_R, BACK_T],
    ],
  },
]

/** 다각형 내부 판정(광선 교차법) */
function pointInPoly(x: number, y: number, poly: [number, number][]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 이 좌표가 어느 면 위인가 (창문·선반은 벽에, 화분·책상은 바닥에) */
function surfaceAt(x: number, y: number): Surface {
  for (const f of FACES) if (pointInPoly(x, y, f.poly)) return f.id
  return 'floor'
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * 그 지점의 심도에 따른 크기.
 * 안쪽(정면 벽)일수록 작고, 화면 앞쪽으로 나올수록 크다.
 */
function depthScaleAt(x: number, y: number, s: Surface) {
  switch (s) {
    case 'back':
      return 0.55 // 가장 먼 면이라 일정하다
    case 'floor':
      return 0.55 + clamp01((y - BACK_B) / (100 - BACK_B)) * 0.7
    case 'ceiling':
      return 0.55 + clamp01((BACK_T - y) / BACK_T) * 0.7
    case 'left':
      return 0.55 + clamp01((BACK_L - x) / BACK_L) * 0.7
    case 'right':
      return 0.55 + clamp01((x - BACK_R) / (100 - BACK_R)) * 0.7
  }
}

/** 겹칠 때 앞뒤 순서 — 정면 벽이 가장 뒤, 바닥에 선 물건이 가장 앞 */
function zIndexAt(x: number, y: number, s: Surface) {
  if (s === 'back') return 1
  if (s === 'ceiling') return 2
  if (s === 'floor') return 400 + Math.round(y * 10)
  return 10 + Math.round(depthScaleAt(x, y, s) * 100)
}

/** 방 안(모든 면)으로 좌표를 가둔다 */
function clampToRoom(x: number, y: number) {
  return { x: Math.min(98, Math.max(2, x)), y: Math.min(98, Math.max(2, y)) }
}

/** 바닥 위로만 가둔다 — 새로 산 아이템을 놓을 때 쓴다 */
function clampToFloor(x: number, y: number) {
  const cy = Math.min(96, Math.max(BACK_B + 2, y))
  const t = clamp01((cy - BACK_B) / (100 - BACK_B))
  // 바닥의 좌우 경계는 안쪽 (BACK_L, BACK_R) 에서 앞쪽 (0, 100) 으로 곧게 벌어진다
  const left = BACK_L * (1 - t)
  const right = BACK_R + (100 - BACK_R) * t
  const pad = 2 + 2 * (1 - t)
  return { x: Math.min(right - pad, Math.max(left + pad, x)), y: cy }
}

/** 저장된 배율(011 이전 데이터면 1) */
function scaleOf(it: { scale?: number }) {
  const n = Number(it.scale)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/** 저장된 회전각(011 이전 데이터면 0) */
function rotationOf(it: { rotation?: number }) {
  const n = Number(it.rotation)
  return Number.isFinite(n) ? n : 0
}

// 새 아이템을 놓을 기본 위치(바닥 가운데 앞쪽)
const SPAWN_X = 50
const SPAWN_Y = BACK_B + (100 - BACK_B) * 0.45

// 바닥 격자. 세로선은 안쪽 벽면을 0~1 로 나눈 지점에서 시작해 화면 앞쪽으로 벌어진다.
const FLOOR_COLS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]
// 가로선은 안쪽(t=0)일수록 촘촘하게 — 이게 심도를 만든다.
const FLOOR_ROWS = [0.05, 0.12, 0.21, 0.33, 0.48, 0.67, 0.9]

// 학생이 조절할 수 있는 아이템 크기 범위 (DB check 제약과 같은 값)
const SCALE_MIN = 0.5
const SCALE_MAX = 2.5

/** 아이템의 배치 상태 = 위치 + 크기 + 방향 */
interface Placement {
  x: number
  y: number
  scale: number
  rotation: number
}
interface Drag extends Placement {
  id: string
  mode: 'move' | 'resize' | 'rotate'
  moved: boolean
  /** 조절 시작 시점의 손가락-아이템 거리와 그때의 배율 */
  startDist: number
  startScale: number
  /** 회전 시작 시점의 손가락 x 좌표와 그때의 회전값 */
  startClientX: number
  startRotation: number
}

/** 가로로 이만큼(px) 끌면 한 바퀴(360°) 돈다 */
const ROTATE_PX_PER_TURN = 260
interface Pending extends Placement {
  id: string
  from: Placement
}

export default function GroupRoom({ me, onSideData }: Props) {
  const [shop, setShop] = useState<ShopItem[]>([])
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [viewGroupId, setViewGroupId] = useState<string | null>(me.group_id)
  const [state, setState] = useState<RoomState | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<ShopItem | null>(null) // 구매 확인 팝업
  const [shopOpen, setShopOpen] = useState(false)

  const isMyRoom = viewGroupId === me.group_id && !!me.group_id

  useEffect(() => {
    room.catalog().then((c) => setShop(c.shop)).catch(() => {})
    student
      .ranking()
      .then((r) => setGroups(r.ranking.map((g) => ({ id: g.id, name: g.name }))))
      .catch(() => {})
  }, [])

  const loadState = useCallback(() => {
    if (!viewGroupId) return
    room.state(viewGroupId).then(setState).catch(() => {})
  }, [viewGroupId])

  useEffect(() => {
    loadState()
    setSelected(null)
  }, [loadState])
  useRealtime(['room_items', 'groups', 'seed_log', 'student_badges'], loadState)

  // 모둠원·배지는 우측 배너로 올려 보낸다
  useEffect(() => {
    onSideData?.(
      state
        ? { groupName: state.group?.name || '모둠', members: state.members, badges: state.badges }
        : null,
    )
  }, [state, onSideData])
  useEffect(() => () => onSideData?.(null), [onSideData])

  async function act(fn: () => Promise<RoomState>) {
    setBusy(true)
    try {
      setState(await fn())
    } catch (e) {
      alert(e instanceof Error ? e.message : '오류')
    } finally {
      setBusy(false)
    }
  }

  async function confirmBuy() {
    const item = pending
    if (!item) return
    setPending(null)
    setShopOpen(false) // 새로 산 아이템이 보이도록 상점을 닫는다
    // 바닥 가운데 언저리에 조금씩 흩어 놓아 새로 산 물건이 겹쳐 보이지 않게 한다
    const p = clampToFloor(
      SPAWN_X + (Math.random() - 0.5) * 40,
      SPAWN_Y + (Math.random() - 0.5) * 22,
    )
    await act(() => room.buy(item.type, p.x, p.y))
  }

  async function sell() {
    if (!selected) return
    const id = selected
    if (!confirm('이 아이템을 판매(새싹 환불)할까요?')) return
    setSelected(null)
    await act(() => room.remove(id))
  }

  if (!me.group_id) {
    return (
      <p className="card text-center text-slate-500 py-10">
        아직 모둠에 배정되지 않았어요. 선생님이 모둠을 정해주면 공간을 꾸밀 수 있어요.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* 모둠 선택(구경) */}
      {groups.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setViewGroupId(g.id)}
              className={`px-3 h-9 rounded-full text-sm font-bold whitespace-nowrap border ${
                viewGroupId === g.id
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-300'
              }`}
            >
              {g.id === me.group_id ? '🏡 우리 모둠' : g.name}
            </button>
          ))}
        </div>
      )}

      {/* 지갑 */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-4 flex items-center justify-between">
        <div>
          <p className="text-emerald-100 text-sm font-bold">{state?.group?.name || '모둠'} · 보유 새싹(지갑)</p>
          <p className="text-3xl font-black mt-0.5">🌱 {state?.wallet ?? 0}</p>
        </div>
        <p className="text-right text-emerald-100 text-xs">
          누적 {state?.cumulative ?? 0}
          <br />
          {isMyRoom ? '끌어서 원하는 곳에 놓아요' : '다른 모둠 구경 중'}
        </p>
      </div>

      <Room3D
        items={state?.items ?? []}
        shop={shop}
        // 저장 중(busy)에도 계속 만질 수 있어야 한다. 이동은 화면에 먼저 반영되고
        // 저장은 뒤에서 진행되므로 여기서 잠그면 괜히 멈칫하는 느낌만 준다.
        editable={isMyRoom}
        selected={selected}
        onSelect={setSelected}
        onMove={(id, x, y, scale, rotation) => act(() => room.move(id, x, y, scale, rotation))}
        onOpenShop={isMyRoom ? () => setShopOpen(true) : undefined}
      />

      {isMyRoom && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-400 flex-1">
            {selected
              ? '⤢ 크기 · ↻ 방향을 끌어서 조절하고, 오른쪽 버튼으로 되팔 수 있어요.'
              : '끌어서 바닥은 물론 벽에도 붙일 수 있어요. (창문·액자·선반)'}
          </p>
          {selected && (
            <button onClick={sell} className="btn-secondary text-sm shrink-0">
              🗑️ 판매(환불)
            </button>
          )}
        </div>
      )}

      {/* 모둠 채팅 (우리 모둠만) */}
      {isMyRoom && me.group_id && <GroupChat me={me} groupId={me.group_id} />}

      {/* 상점 팝업 (방 안의 상점 버튼으로 연다) */}
      {shopOpen && (
        <ShopModal
          shop={shop}
          wallet={state?.wallet ?? 0}
          busy={busy}
          onPick={setPending}
          onClose={() => setShopOpen(false)}
        />
      )}

      {/* 구매 확인 팝업 */}
      {pending && (
        <BuyConfirm
          item={pending}
          wallet={state?.wallet ?? 0}
          onCancel={() => setPending(null)}
          onConfirm={confirmBuy}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 사용자 쪽으로 열린 3D 공간 + 드래그 앤 드롭 배치
// ─────────────────────────────────────────────────────────────

function Room3D({
  items,
  shop,
  editable,
  selected,
  onSelect,
  onMove,
  onOpenShop,
}: {
  items: RoomState['items']
  shop: ShopItem[]
  editable: boolean
  selected: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, y: number, scale: number, rotation: number) => void
  /** 주면 방 안에 상점 버튼이 뜬다 */
  onOpenShop?: () => void
}) {
  const areaRef = useRef<HTMLDivElement>(null)
  // 끄는 동안에는 서버 응답을 기다리지 않고 화면에서 바로 따라 움직인다.
  // mode 로 "옮기는 중"과 "크기 바꾸는 중"을 구분한다.
  const [drag, setDrag] = useState<Drag | null>(null)
  // 끌어다 놓은 뒤 확인/취소를 기다리는 상태 (원래 상태를 기억해 뒀다가 취소 시 되돌린다)
  const [pending, setPending] = useState<Pending | null>(null)
  // 서버 응답을 기다리는 동안에도 화면은 새 상태를 유지하게 해 주는 값(저장 후 지연 방지)
  const [localPos, setLocalPos] = useState<Record<string, Placement>>({})

  // 서버가 새 값을 돌려줬거나 아이템이 사라지면 임시 상태를 정리한다
  // (emojiOf 는 3D 모형으로 대체돼 더 이상 쓰지 않는다)
  useEffect(() => {
    setLocalPos((prev) => {
      const next = { ...prev }
      let changed = false
      for (const id of Object.keys(prev)) {
        const it = items.find((i) => i.id === id)
        const same =
          it &&
          Math.abs(Number(it.x) - prev[id].x) < 0.06 &&
          Math.abs(Number(it.y) - prev[id].y) < 0.06 &&
          Math.abs(scaleOf(it) - prev[id].scale) < 0.02 &&
          Math.abs(rotationOf(it) - prev[id].rotation) < 0.5
        if (!it || same) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [items])

  /** 아이템을 지금 어떤 상태로 그려야 하는가 (끄는 중 → 확인 대기 → 임시 값 → 서버 값) */
  function placementOf(it: RoomState['items'][number]): Placement {
    if (drag?.id === it.id) return { x: drag.x, y: drag.y, scale: drag.scale, rotation: drag.rotation }
    if (pending?.id === it.id)
      return { x: pending.x, y: pending.y, scale: pending.scale, rotation: pending.rotation }
    const local = localPos[it.id]
    if (local) return local
    return { ...clampToRoom(Number(it.x), Number(it.y)), scale: scaleOf(it), rotation: rotationOf(it) }
  }

  /** 컨테이너 기준 비율 좌표. 바닥뿐 아니라 벽·천장 어디든 놓을 수 있다. */
  function pointOf(e: React.PointerEvent) {
    const r = areaRef.current?.getBoundingClientRect()
    if (!r) return { x: SPAWN_X, y: SPAWN_Y }
    return clampToRoom(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100)
  }
  /** 아이템이 놓인 지점에서 손가락까지의 거리(px) — 크기 조절에 쓴다 */
  function distFrom(e: React.PointerEvent, p: Placement) {
    const r = areaRef.current?.getBoundingClientRect()
    if (!r) return 1
    const ax = r.left + (p.x / 100) * r.width
    const ay = r.top + (p.y / 100) * r.height
    return Math.max(1, Math.hypot(e.clientX - ax, e.clientY - ay))
  }

  /** 이 아이템의 "되돌릴 상태"(확인 대기 중이면 최초 상태) */
  function originOf(it: RoomState['items'][number]): Placement {
    if (pending?.id === it.id) return pending.from
    const local = localPos[it.id]
    if (local) return local
    return { ...clampToRoom(Number(it.x), Number(it.y)), scale: scaleOf(it), rotation: rotationOf(it) }
  }

  function startDrag(e: React.PointerEvent, it: RoomState['items'][number], mode: Drag['mode']) {
    if (!editable) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const cur = placementOf(it)
    setDrag({
      id: it.id,
      mode,
      ...cur,
      moved: false,
      startDist: distFrom(e, cur),
      startScale: cur.scale,
      startClientX: e.clientX,
      startRotation: cur.rotation,
    })
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return
    if (drag.mode === 'move') {
      setDrag({ ...drag, ...pointOf(e), moved: true })
    } else if (drag.mode === 'resize') {
      // 아이템에서 손가락이 멀어진 만큼 커진다
      const scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, drag.startScale * (distFrom(e, drag) / drag.startDist)))
      setDrag({ ...drag, scale, moved: true })
    } else {
      // 세로축(Y축)을 중심으로 도는 회전. 가로로 끈 만큼 돌아간다(제자리에서 방향 바꾸기).
      const delta = ((e.clientX - drag.startClientX) / ROTATE_PX_PER_TURN) * 360
      const rotation = (((drag.startRotation + delta) % 360) + 360) % 360
      setDrag({ ...drag, rotation, moved: true })
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drag) return
    const d = drag
    setDrag(null)
    if (!d.moved) {
      onSelect(selected === d.id ? null : d.id) // 톡 누르면 선택 토글
      return
    }
    const it = items.find((i) => i.id === d.id)
    const next: Placement =
      d.mode === 'move'
        ? { ...pointOf(e), scale: d.scale, rotation: d.rotation }
        : { x: d.x, y: d.y, scale: d.scale, rotation: d.rotation }
    // 아직 저장하지 않는다 — 확인을 눌러야 저장된다
    setPending({ id: d.id, ...next, from: it ? originOf(it) : next })
    onSelect(d.id)
  }

  function confirmChange() {
    if (!pending) return
    const p = pending
    setPending(null)
    onSelect(null) // 초록 테두리를 없앤다
    // 화면은 새 상태를 그대로 유지한 채(지연 없음) 저장만 뒤에서 진행된다
    setLocalPos((prev) => ({ ...prev, [p.id]: { x: p.x, y: p.y, scale: p.scale, rotation: p.rotation } }))
    onMove(p.id, p.x, p.y, p.scale, p.rotation)
  }
  function cancelChange() {
    if (!pending) return
    const p = pending
    setPending(null)
    onSelect(null)
    // 원래 상태로 되돌려 둔다(서버 값이 이미 옛 값이면 곧 정리된다)
    setLocalPos((prev) => ({ ...prev, [p.id]: p.from }))
  }

  // 각 면의 clip-path — 정면 벽을 가운데 두고 네 사다리꼴이 화면 모서리로 뻗는다
  const BACK_WALL = `polygon(${BACK_L}% ${BACK_T}%, ${BACK_R}% ${BACK_T}%, ${BACK_R}% ${BACK_B}%, ${BACK_L}% ${BACK_B}%)`
  const CEILING = `polygon(0% 0%, 100% 0%, ${BACK_R}% ${BACK_T}%, ${BACK_L}% ${BACK_T}%)`
  const FLOOR = `polygon(${BACK_L}% ${BACK_B}%, ${BACK_R}% ${BACK_B}%, 100% 100%, 0% 100%)`
  const LEFT_WALL = `polygon(0% 0%, ${BACK_L}% ${BACK_T}%, ${BACK_L}% ${BACK_B}%, 0% 100%)`
  const RIGHT_WALL = `polygon(100% 0%, 100% 100%, ${BACK_R}% ${BACK_B}%, ${BACK_R}% ${BACK_T}%)`

  return (
    <div className="card p-0 overflow-hidden">
      <div ref={areaRef} className="relative w-full select-none" style={{ aspectRatio: '16 / 10' }}>
        {/* ── 색은 앱 전체 톤(새싹 그린 · 화이트)에 맞춘 연한 계열 ──
            같은 초록이라도 면마다 밝기를 달리해 다섯 면이 서로 구분되게 한다.
            천장(가장 밝음) → 왼쪽 벽 → 정면 벽 → 오른쪽 벽(그늘) → 바닥 순 */}
        {/* 천장 */}
        <div
          className="absolute inset-0"
          style={{ clipPath: CEILING, background: 'linear-gradient(180deg, #ffffff 0%, #f2faf5 100%)' }}
        />
        {/* 왼쪽 벽 — 빛을 받는 쪽 */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: LEFT_WALL,
            background:
              'radial-gradient(circle at 50% 50%, rgba(255,255,255,.85) 1.5px, transparent 1.6px) 0 0/15px 15px, linear-gradient(90deg, #e9f5ee 0%, #fbfefc 100%)',
          }}
        />
        {/* 오른쪽 벽 — 그늘진 쪽이라 한 톤 어둡게 (좌우가 확실히 구분된다) */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: RIGHT_WALL,
            background:
              'radial-gradient(circle at 50% 50%, rgba(255,255,255,.6) 1.5px, transparent 1.6px) 0 0/15px 15px, linear-gradient(90deg, #d9ecdf 0%, #cfe5d7 100%)',
          }}
        />
        {/* 정면 벽 — 창문·액자를 걸 수 있는 면 */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: BACK_WALL,
            background:
              'radial-gradient(circle at 50% 50%, rgba(255,255,255,.8) 1.5px, transparent 1.6px) 0 0/15px 15px, linear-gradient(180deg, #f6fcf8 0%, #e8f4ec 100%)',
          }}
        />
        {/* 바닥 */}
        <div
          className="absolute inset-0"
          style={{ clipPath: FLOOR, background: 'linear-gradient(180deg, #e2f0e7 0%, #d7ebde 55%, #cbe4d4 100%)' }}
        />
        {/* 바닥 타일 — 안쪽으로 모이는 세로선 + 멀수록 촘촘해지는 가로선이 심도를 만든다.
            preserveAspectRatio="none" 로 비율 좌표를 그대로 쓰고,
            non-scaling-stroke 로 선 두께만 일정하게 유지한다. */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ clipPath: FLOOR }}
        >
          <g stroke="rgba(255,255,255,.7)" strokeWidth={1} vectorEffect="non-scaling-stroke">
            {FLOOR_COLS.map((f, i) => (
              <line
                key={`v${i}`}
                x1={BACK_L + (BACK_R - BACK_L) * f}
                y1={BACK_B}
                x2={100 * f}
                y2={100}
              />
            ))}
            {FLOOR_ROWS.map((t, i) => {
              const y = BACK_B + (100 - BACK_B) * t
              return <line key={`h${i}`} x1={BACK_L * (1 - t)} y1={y} x2={BACK_R + (100 - BACK_R) * t} y2={y} />
            })}
          </g>
        </svg>
        {/* 굽도리 — 벽과 바닥이 만나는 선 */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: `polygon(0% 100%, ${BACK_L}% ${BACK_B}%, ${BACK_R}% ${BACK_B}%, 100% 100%, 100% 98.6%, ${BACK_R}% ${BACK_B - 1.4}%, ${BACK_L}% ${BACK_B - 1.4}%, 0% 98.6%)`,
            background: 'rgba(134,183,152,.5)',
          }}
        />

        {/* 아이템 (앞쪽에 있을수록 크고 위에 그린다) */}
        {items.map((it) => {
          const live = placementOf(it)
          const face = surfaceAt(live.x, live.y)
          const onFloor = face === 'floor'
          const s = depthScaleAt(live.x, live.y, face) * live.scale
          const isSel = selected === it.id
          const dragging = drag?.id === it.id
          return (
            <div
              key={it.id}
              className="absolute"
              style={{
                left: `${live.x}%`,
                top: `${live.y}%`,
                // 바닥에 놓인 것은 그 지점에 "서고", 벽·천장에 붙인 것은 그 지점을 중심으로 걸린다
                transform: onFloor ? 'translate(-50%, -100%)' : 'translate(-50%, -50%)',
                zIndex: zIndexAt(live.x, live.y, face),
              }}
            >
              <button
                onPointerDown={(e) => startDrag(e, it, 'move')}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                disabled={!editable}
                className={`block no-touch-scroll ${editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                style={{
                  transform: `scale(${s})`,
                  transformOrigin: onFloor ? 'bottom center' : 'center',
                  filter: dragging ? 'drop-shadow(0 10px 8px rgba(0,0,0,.25))' : 'none',
                }}
                title={shop.find((sh) => sh.type === it.item_type)?.name || it.item_type}
              >
                {/* 진짜 3D 모형. 세로축(Y축) 회전이라 끌면 옆·뒤가 실제로 보인다. */}
                <RoomItem3D type={it.item_type} rotation={live.rotation} size={54} />
                {/* 바닥 그림자 — 바닥에 선 물건에만 */}
                {onFloor && (
                  <span
                    className="block mx-auto rounded-[50%]"
                    style={{ width: 26, height: 7, marginTop: -4, background: 'rgba(15,23,42,.16)', filter: 'blur(2px)' }}
                  />
                )}
                {isSel && <span className="absolute -inset-1 rounded-xl ring-2 ring-emerald-500 pointer-events-none" />}
              </button>

              {/* 선택했을 때만 나오는 손잡이 두 개 */}
              {isSel && editable && (
                <>
                  <button
                    onPointerDown={(e) => startDrag(e, it, 'resize')}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => setDrag(null)}
                    className="absolute no-touch-scroll w-7 h-7 rounded-full bg-white border-2 border-emerald-500 shadow flex items-center justify-center text-emerald-600 text-xs font-black cursor-nwse-resize"
                    style={{ right: -14, top: -14 }}
                    title="끌어서 크기 조절"
                  >
                    ⤢
                  </button>
                  <button
                    onPointerDown={(e) => startDrag(e, it, 'rotate')}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => setDrag(null)}
                    className="absolute no-touch-scroll w-7 h-7 rounded-full bg-white border-2 border-sky-500 shadow flex items-center justify-center text-sky-600 text-xs font-black cursor-grab active:cursor-grabbing"
                    style={{ left: -14, top: -14 }}
                    title="끌어서 회전"
                  >
                    ↻
                  </button>
                </>
              )}
            </div>
          )
        })}

        {/* 변경 확인 — 확인을 누르면 저장되고 초록 테두리가 사라진다 */}
        {pending && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-2 z-[2000] flex items-center gap-2 bg-white/95 backdrop-blur rounded-full shadow-lg px-2 py-1.5">
            <span className="text-xs text-slate-500 pl-2">이렇게 둘까요?</span>
            <button onClick={cancelChange} className="h-9 px-3 rounded-full bg-slate-200 text-slate-700 text-sm font-bold">
              취소
            </button>
            <button onClick={confirmChange} className="h-9 px-4 rounded-full bg-emerald-600 text-white text-sm font-bold">
              확인
            </button>
          </div>
        )}

        {/* 방 안의 상점 버튼 */}
        {onOpenShop && (
          <button
            onClick={onOpenShop}
            className="absolute left-3 bottom-3 z-[1500] flex items-center gap-1.5 h-10 px-4 rounded-full bg-white/95 backdrop-blur shadow-lg border border-emerald-200 text-emerald-700 font-bold text-sm hover:bg-white active:scale-95 transition"
          >
            🛒 상점
          </button>
        )}

        {items.length === 0 && (
          <p className="absolute inset-x-0 text-center text-sm text-slate-500/80" style={{ top: `${SPAWN_Y}%` }}>
            상점에서 아이템을 사서 공간을 꾸며보세요.
          </p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 상점 팝업
// ─────────────────────────────────────────────────────────────

function ShopModal({
  shop,
  wallet,
  busy,
  onPick,
  onClose,
}: {
  shop: ShopItem[]
  wallet: number
  busy: boolean
  onPick: (s: ShopItem) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <h3 className="font-black text-slate-900 text-lg flex-1">🛒 상점</h3>
          <span className="text-emerald-600 font-bold text-sm">🌱 {wallet}</span>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-400 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5">
          <div className="grid grid-cols-3 gap-2">
            {shop.map((s) => {
              const afford = wallet >= s.price
              return (
                <button
                  key={s.type}
                  onClick={() => onPick(s)}
                  disabled={busy || !afford}
                  className={`rounded-xl border p-2 flex flex-col items-center transition-colors ${
                    afford ? 'bg-white border-slate-200 hover:border-emerald-300' : 'bg-slate-50 border-slate-100 opacity-50'
                  }`}
                >
                  <RoomItem3D type={s.type} size={52} spin />
                  <span className="text-xs font-medium text-slate-700 mt-1">{s.name}</span>
                  <span className="text-xs font-bold text-emerald-600">🌱 {s.price}</span>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-400 mt-3 text-center leading-relaxed">
            산 아이템은 끌어서 바닥·벽 어디에나 놓을 수 있어요.
            <br />
            톡 누르면 크기(⤢)와 방향(↻)을 바꿀 수 있어요.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 구매 확인 팝업
// ─────────────────────────────────────────────────────────────

function BuyConfirm({
  item,
  wallet,
  onCancel,
  onConfirm,
}: {
  item: ShopItem
  wallet: number
  onCancel: () => void
  onConfirm: () => void
}) {
  const left = wallet - item.price
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCancel}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xs p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-24 h-24 mx-auto rounded-2xl bg-emerald-50 flex items-center justify-center">
          <RoomItem3D type={item.type} size={80} spin />
        </div>
        <p className="font-black text-slate-900 text-xl mt-3">{item.name}</p>
        <p className="text-emerald-600 font-bold mt-0.5">🌱 {item.price}</p>
        <p className="text-slate-700 font-bold mt-4">정말 구입하시겠습니까?</p>
        <p className="text-xs text-slate-400 mt-1">사고 나면 남는 새싹 🌱 {left}</p>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="btn-secondary flex-1">
            취소
          </button>
          <button onClick={onConfirm} className="btn-primary flex-1">
            구매할래요!
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 모둠 채팅
// ─────────────────────────────────────────────────────────────

function GroupChat({ me, groupId }: { me: StudentSession; groupId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    fetchGroupChat(groupId).then(setMessages).catch(() => {})
  }, [groupId])

  useEffect(() => {
    load()
  }, [load])
  useRealtime(['group_chat'], load)

  // 새 메시지가 오면 아래로 붙인다
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  async function send() {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    setText('')
    try {
      await student.sendChat(t)
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : '전송 실패')
      setText(t)
    } finally {
      setBusy(false)
    }
  }

  async function del(id: string) {
    if (!confirm('메시지를 삭제할까요?')) return
    try {
      await student.deleteChat(id)
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  return (
    <div className="card">
      <h3 className="font-bold text-slate-800 mb-2">💬 모둠 채팅</h3>
      <div ref={listRef} className="h-64 overflow-y-auto space-y-2 pr-1">
        {messages.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">아직 대화가 없어요. 먼저 인사해볼까요?</p>
        ) : (
          messages.map((m) => {
            const mine = m.student_id === me.id
            return (
              <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                <Avatar name={m.author_name} src={m.author_avatar_url} size={28} />
                <div className={`max-w-[75%] ${mine ? 'text-right' : ''}`}>
                  <p className="text-[11px] text-slate-400 mb-0.5">
                    {m.author_name} · {timeOf(m.created_at)}
                  </p>
                  <p
                    className={`inline-block px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words text-left ${
                      mine ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {m.text}
                  </p>
                  {mine && (
                    <button onClick={() => del(m.id)} className="block ml-auto text-[11px] text-slate-400 hover:text-red-500 mt-0.5">
                      삭제
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <Avatar name={me.name} src={me.avatar_url} size={32} />
        <input
          className="input flex-1"
          placeholder="모둠원에게 메시지 보내기…"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button onClick={send} disabled={busy || !text.trim()} className="btn-primary text-sm">
          보내기
        </button>
      </div>
    </div>
  )
}

function timeOf(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}
