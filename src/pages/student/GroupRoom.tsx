import { useCallback, useEffect, useState } from 'react'
import type { StudentSession } from '../../types'
import { room, student, type RoomState, type ShopItem } from '../../lib/studentApi'
import { useRealtime } from '../../hooks/useRealtime'
import Avatar from '../../components/Avatar'

interface Props {
  me: StudentSession
}

export default function GroupRoom({ me }: Props) {
  const [shop, setShop] = useState<ShopItem[]>([])
  const [grid, setGrid] = useState({ cols: 8, rows: 5 })
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [viewGroupId, setViewGroupId] = useState<string | null>(me.group_id)
  const [state, setState] = useState<RoomState | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const emojiOf = (type: string) => shop.find((s) => s.type === type)?.emoji || '❓'
  const isMyRoom = viewGroupId === me.group_id && !!me.group_id

  useEffect(() => {
    room.catalog().then((c) => {
      setShop(c.shop)
      setGrid({ cols: c.cols, rows: c.rows })
    })
    student.ranking().then((r) => setGroups(r.ranking.map((g) => ({ id: g.id, name: g.name })))).catch(() => {})
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

  async function buy(type: string) {
    await act(() => room.buy(type))
  }
  async function moveTo(x: number, y: number) {
    if (!selected) return
    const id = selected
    setSelected(null)
    await act(() => room.move(id, x, y))
  }
  async function sell() {
    if (!selected) return
    const id = selected
    if (!confirm('이 아이템을 판매(새싹 환불)할까요?')) return
    setSelected(null)
    await act(() => room.remove(id))
  }

  if (!me.group_id) {
    return <p className="card text-center text-slate-500 py-10">아직 모둠에 배정되지 않았어요. 선생님이 모둠을 정해주면 공간을 꾸밀 수 있어요.</p>
  }

  const itemAt = (x: number, y: number) => state?.items.find((i) => i.x === x && i.y === y)

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
                viewGroupId === g.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-300'
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
        <p className="text-right text-emerald-100 text-xs">누적 {state?.cumulative ?? 0}<br />{isMyRoom ? '아이템을 사서 꾸며요' : '다른 모둠 구경 중'}</p>
      </div>

      {/* 방 격자 */}
      <div className="card">
        <div
          className="grid gap-1.5 rounded-xl bg-gradient-to-b from-sky-50 to-emerald-50 p-2"
          style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: grid.rows }).map((_, y) =>
            Array.from({ length: grid.cols }).map((_, x) => {
              const item = itemAt(x, y)
              const sel = item && selected === item.id
              return (
                <button
                  key={`${x},${y}`}
                  onClick={() => {
                    if (!isMyRoom) return
                    if (item) setSelected(sel ? null : item.id)
                    else if (selected) moveTo(x, y)
                  }}
                  disabled={busy}
                  className={`aspect-square rounded-lg flex items-center justify-center text-xl sm:text-2xl transition-all ${
                    sel ? 'bg-emerald-200 ring-2 ring-emerald-500 scale-105' : item ? 'bg-white/70' : 'bg-white/30'
                  } ${isMyRoom && !item && selected ? 'ring-1 ring-emerald-300' : ''}`}
                >
                  {item ? emojiOf(item.item_type) : ''}
                </button>
              )
            }),
          )}
        </div>
        {isMyRoom && (
          <p className="text-xs text-slate-400 mt-2 text-center">
            {selected ? '빈 칸을 누르면 옮겨져요 · 아래 판매 버튼으로 되팔 수 있어요' : '아이템을 눌러 선택하면 이동/판매할 수 있어요'}
          </p>
        )}
        {isMyRoom && selected && (
          <button onClick={sell} className="btn-secondary w-full mt-2 text-sm">🗑️ 선택 아이템 판매(환불)</button>
        )}
      </div>

      {/* 모둠 배지 전시 */}
      <div className="card">
        <h3 className="font-bold text-slate-800 mb-2">🏅 모둠 배지</h3>
        {(state?.badges.length ?? 0) === 0 ? (
          <p className="text-xs text-slate-400 py-2">아직 받은 배지가 없어요.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {state!.badges.map((b, i) => (
              <div key={b.id + i} className="flex flex-col items-center w-16 text-center">
                {b.image_url ? (
                  <img src={b.image_url} alt={b.name} className="w-12 h-12 rounded-xl object-cover border border-slate-200" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-xl">🏅</div>
                )}
                <span className="text-[11px] text-slate-600 mt-1 leading-tight truncate w-full">{b.name}</span>
                <span className="text-[10px] text-slate-400 truncate w-full">{b.student_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 모둠원 */}
      {state && state.members.length > 0 && (
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-2">모둠원</h3>
          <div className="flex flex-wrap gap-2">
            {state.members.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5 bg-slate-50 rounded-full pl-1 pr-3 py-1">
                <Avatar name={m.name} src={m.avatar_url} size={24} />
                <span className="text-sm text-slate-700">{m.name}</span>
              </div>
            ))}
          </div>
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
                  onClick={() => buy(s.type)}
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
    </div>
  )
}
