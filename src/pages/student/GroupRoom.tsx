import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudentSession } from '../../types'
import { room, student, type ChatMessage, type RoomState, type ShopItem } from '../../lib/studentApi'
import { fetchGroupChat } from '../../lib/studentData'
import { useRealtime } from '../../hooks/useRealtime'
import Avatar from '../../components/Avatar'
import type { RoomSideData } from '../StudentDashboard'

interface Props {
  me: StudentSession
  /** 모둠원·모둠 배지를 우측 배너에 띄우도록 부모에게 올려 보낸다 */
  onSideData?: (d: RoomSideData | null) => void
}

// ── 3D 공간의 기하 ──────────────────────────────────────────────
// 사용자 쪽으로 열린 방: 뒷벽 + 우측벽 + 바닥만 그리고 왼쪽은 트여 있다.
// 좌표는 공간 가로·세로의 비율(0~100)이다.
const BACK_Y = 45 // 뒷벽과 바닥이 만나는 높이
const BACK_X = 78 // 뒷벽의 오른쪽 끝(= 우측벽이 시작하는 곳)
const RIGHT_FRONT_Y = 82 // 우측벽의 앞쪽 아래 모서리 높이

/** 바닥 위 한 점이 벗어나지 않도록 가둔다(우측벽 쪽 경사를 따라간다) */
function clampToFloor(x: number, y: number) {
  const cy = Math.min(96, Math.max(BACK_Y + 3, y))
  // 바닥의 오른쪽 경계는 (BACK_X, BACK_Y) → (100, RIGHT_FRONT_Y) 로 비스듬하다
  const maxX =
    cy >= RIGHT_FRONT_Y
      ? 97
      : BACK_X + ((cy - BACK_Y) / (RIGHT_FRONT_Y - BACK_Y)) * (100 - BACK_X) - 3
  return { x: Math.min(maxX, Math.max(3, x)), y: cy }
}

/** 뒤쪽에 놓을수록 작게 보이게 해서 깊이감을 만든다 */
function depthScale(y: number) {
  return 0.72 + ((y - BACK_Y) / (100 - BACK_Y)) * 0.5
}

export default function GroupRoom({ me, onSideData }: Props) {
  const [shop, setShop] = useState<ShopItem[]>([])
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [viewGroupId, setViewGroupId] = useState<string | null>(me.group_id)
  const [state, setState] = useState<RoomState | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<ShopItem | null>(null) // 구매 확인 팝업

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
    // 앞쪽 가운데에 조금씩 흩어 놓아 새로 산 물건이 겹쳐 보이지 않게 한다
    const x = 30 + Math.random() * 35
    const y = 70 + Math.random() * 18
    const p = clampToFloor(x, y)
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
        editable={isMyRoom && !busy}
        selected={selected}
        onSelect={setSelected}
        onMove={(id, x, y) => act(() => room.move(id, x, y))}
      />

      {isMyRoom && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-400 flex-1">
            {selected ? '아이템을 끌어 옮기거나, 오른쪽 버튼으로 되팔 수 있어요.' : '아이템을 끌어서 원하는 자리에 놓아보세요.'}
          </p>
          {selected && (
            <button onClick={sell} className="btn-secondary text-sm shrink-0">
              🗑️ 판매(환불)
            </button>
          )}
        </div>
      )}

      {/* 상점 (우리 모둠만) */}
      {isMyRoom && (
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-2">🛒 상점</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {shop.map((s) => {
              const afford = (state?.wallet ?? 0) >= s.price
              return (
                <button
                  key={s.type}
                  onClick={() => setPending(s)}
                  disabled={busy || !afford}
                  className={`rounded-xl border p-2 flex flex-col items-center transition-colors ${
                    afford ? 'bg-white border-slate-200 hover:border-emerald-300' : 'bg-slate-50 border-slate-100 opacity-50'
                  }`}
                >
                  <span className="text-2xl">{s.emoji}</span>
                  <span className="text-xs font-medium text-slate-700 mt-1">{s.name}</span>
                  <span className="text-xs font-bold text-emerald-600">🌱 {s.price}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 모둠 채팅 (우리 모둠만) */}
      {isMyRoom && me.group_id && <GroupChat me={me} groupId={me.group_id} />}

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
}: {
  items: RoomState['items']
  shop: ShopItem[]
  editable: boolean
  selected: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, y: number) => void
}) {
  const areaRef = useRef<HTMLDivElement>(null)
  // 끄는 동안에는 서버 응답을 기다리지 않고 화면에서 바로 따라 움직인다
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; moved: boolean } | null>(null)

  const emojiOf = (type: string) => shop.find((s) => s.type === type)?.emoji || '❓'

  function pointOf(e: React.PointerEvent) {
    const r = areaRef.current?.getBoundingClientRect()
    if (!r) return { x: 50, y: 80 }
    return clampToFloor(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100)
  }

  function onPointerDown(e: React.PointerEvent, item: RoomState['items'][number]) {
    if (!editable) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ id: item.id, x: Number(item.x), y: Number(item.y), moved: false })
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return
    const p = pointOf(e)
    setDrag({ ...drag, ...p, moved: true })
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!drag) return
    const d = drag
    setDrag(null)
    if (d.moved) {
      const p = pointOf(e)
      onMove(d.id, p.x, p.y)
      onSelect(d.id)
    } else {
      // 끌지 않고 톡 누른 것 = 선택 토글
      onSelect(selected === d.id ? null : d.id)
    }
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div
        ref={areaRef}
        className="relative w-full select-none"
        style={{ aspectRatio: '16 / 11', background: '#eef7f0' }}
      >
        {/* 뒷벽 */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: `polygon(0% 0%, ${BACK_X}% 0%, ${BACK_X}% ${BACK_Y}%, 0% ${BACK_Y}%)`,
            background: 'linear-gradient(180deg, #f7fbf8 0%, #e6f2ea 100%)',
          }}
        />
        {/* 뒷벽 굽도리 */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: `polygon(0% ${BACK_Y - 2.5}%, ${BACK_X}% ${BACK_Y - 2.5}%, ${BACK_X}% ${BACK_Y}%, 0% ${BACK_Y}%)`,
            background: '#d7e9dd',
          }}
        />
        {/* 우측벽 (안쪽으로 물러나는 사다리꼴) */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: `polygon(${BACK_X}% 0%, 100% 0%, 100% ${RIGHT_FRONT_Y}%, ${BACK_X}% ${BACK_Y}%)`,
            background: 'linear-gradient(100deg, #dbeee2 0%, #c7e2d1 100%)',
          }}
        />
        {/* 바닥 */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: `polygon(0% ${BACK_Y}%, ${BACK_X}% ${BACK_Y}%, 100% ${RIGHT_FRONT_Y}%, 0% 100%)`,
            background: 'linear-gradient(180deg, #e3efe4 0%, #cfe6d4 60%, #c2ddc9 100%)',
          }}
        />
        {/* 바닥 결(안쪽으로 모이는 선) */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            clipPath: `polygon(0% ${BACK_Y}%, ${BACK_X}% ${BACK_Y}%, 100% ${RIGHT_FRONT_Y}%, 0% 100%)`,
            background:
              'repeating-linear-gradient(93deg, rgba(255,255,255,.55) 0 1px, transparent 1px 7%), repeating-linear-gradient(180deg, rgba(255,255,255,.45) 0 1px, transparent 1px 14%)',
          }}
        />

        {/* 아이템 (앞쪽에 있을수록 크고 위에 그린다) */}
        {items.map((it) => {
          const live = drag && drag.id === it.id ? drag : { x: Number(it.x), y: Number(it.y) }
          const s = depthScale(live.y)
          const isSel = selected === it.id
          const dragging = drag?.id === it.id
          return (
            <button
              key={it.id}
              onPointerDown={(e) => onPointerDown(e, it)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => setDrag(null)}
              disabled={!editable}
              className={`absolute no-touch-scroll ${editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
              style={{
                left: `${live.x}%`,
                top: `${live.y}%`,
                transform: `translate(-50%, -100%) scale(${s})`,
                transformOrigin: 'bottom center',
                zIndex: Math.round(live.y * 10),
                transition: dragging ? 'none' : 'left .18s ease, top .18s ease',
                filter: dragging ? 'drop-shadow(0 10px 8px rgba(0,0,0,.25))' : 'none',
              }}
              title={shop.find((sh) => sh.type === it.item_type)?.name || it.item_type}
            >
              <span className="block text-4xl leading-none">{emojiOf(it.item_type)}</span>
              {/* 바닥 그림자 */}
              <span
                className="block mx-auto rounded-[50%]"
                style={{
                  width: 28,
                  height: 7,
                  marginTop: -4,
                  background: 'rgba(15,23,42,.18)',
                  filter: 'blur(2px)',
                }}
              />
              {isSel && (
                <span className="absolute -inset-1 rounded-xl ring-2 ring-emerald-500 pointer-events-none" />
              )}
            </button>
          )
        })}

        {items.length === 0 && (
          <p className="absolute inset-x-0 bottom-6 text-center text-sm text-slate-400">
            상점에서 아이템을 사서 공간을 꾸며보세요.
          </p>
        )}
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
        <div className="w-24 h-24 mx-auto rounded-2xl bg-emerald-50 flex items-center justify-center text-6xl">
          {item.emoji}
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
