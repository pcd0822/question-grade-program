import { useCallback, useEffect, useRef, useState } from 'react'
import type { Badge, Lesson, StudentSession } from '../types'
import { fetchActiveLessons, fetchMyBadges, fetchMySeeds } from '../lib/studentData'
import { student, type RankingRow, type RoomBadge, type RoomMember } from '../lib/studentApi'
import { compressToSquare } from '../lib/imageCompress'
import { STAGE_LABEL } from '../types'
import { useRealtime } from '../hooks/useRealtime'
import Avatar from '../components/Avatar'
import AppShell, { type NavItem } from '../components/AppShell'
import LessonRoom from './student/LessonRoom'
import GroupRoom from './student/GroupRoom'

interface Props {
  student: StudentSession
  onLogout: () => void
  onProfileChange: () => void
}

const NAV: NavItem[] = [
  { key: 'home', label: '홈', icon: '🏠' },
  { key: 'room', label: '모둠 공간', icon: '🏡' },
  { key: 'settings', label: '개인설정', icon: '⚙️' },
]

/** 모둠 공간이 우측 배너에 띄우는 정보 */
export interface RoomSideData {
  groupName: string
  members: RoomMember[]
  badges: RoomBadge[]
}

export default function StudentDashboard({ student: me, onLogout, onProfileChange }: Props) {
  const [tab, setTab] = useState('home')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [seeds, setSeeds] = useState(0)
  const [ranking, setRanking] = useState<RankingRow[]>([])
  const [badges, setBadges] = useState<Badge[]>([])
  const [active, setActive] = useState<Lesson | null>(null)
  const [roomSide, setRoomSide] = useState<RoomSideData | null>(null)

  const load = useCallback(() => {
    fetchActiveLessons().then(setLessons)
    fetchMySeeds(me.id).then(setSeeds)
    fetchMyBadges(me.id).then(setBadges)
    student.ranking().then((r) => setRanking(r.ranking)).catch(() => {})
  }, [me.id])

  useEffect(() => {
    document.body.style.background = '#f4f7f4'
    load()
  }, [load])
  useRealtime(['lessons', 'seed_log', 'groups', 'students', 'student_badges'], load)

  function goTab(key: string) {
    setActive(null) // 수업에서 나가기
    setTab(key)
  }
  function backToList() {
    setActive(null)
    load()
  }

  // 우측 배너: 모둠 공간에서는 모둠원·모둠 배지, 그 외에는 내 배지·모둠 랭킹
  const rightPanel =
    tab === 'room' ? (
      <RoomSidePanel data={roomSide} />
    ) : (
      <HomeSidePanel me={me} seeds={seeds} badges={badges} ranking={ranking} />
    )

  return (
    <AppShell
      brandTitle={`${me.name} 님`}
      brandSubtitle={me.student_no}
      brandAvatar={<Avatar name={me.name} src={me.avatar_url} size={36} />}
      nav={NAV}
      current={tab}
      onSelect={goTab}
      onLogout={onLogout}
      maxWidth={tab === 'room' ? 'max-w-5xl' : 'max-w-3xl'}
      title={active ? active.title : undefined}
      topLeftExtra={
        active ? (
          <button
            onClick={backToList}
            className="flex items-center gap-1 h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm font-bold shadow-sm hover:bg-emerald-700 active:scale-95 transition whitespace-nowrap"
          >
            ← 수업 목록
          </button>
        ) : undefined
      }
      rightPanel={rightPanel}
      rightIcon={tab === 'room' ? '👥' : '🏅'}
    >
      {tab === 'home' &&
        (active ? (
          <LessonRoom lesson={active} me={me} />
        ) : (
          <Home seeds={seeds} lessons={lessons} onEnter={setActive} />
        ))}
      {tab === 'room' && <GroupRoom me={me} onSideData={setRoomSide} />}
      {tab === 'settings' && <StudentSettings me={me} onProfileChange={onProfileChange} />}
    </AppShell>
  )
}

// ─────────────────────────────────────────────────────────────
// 우측 배너
// ─────────────────────────────────────────────────────────────

function HomeSidePanel({
  me,
  seeds,
  badges,
  ranking,
}: {
  me: StudentSession
  seeds: number
  badges: Badge[]
  ranking: RankingRow[]
}) {
  return (
    <>
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-4">
        <p className="text-emerald-100 text-xs font-bold">내 누적 새싹</p>
        <p className="text-3xl font-black mt-0.5">🌱 {seeds}</p>
      </div>

      <section>
        <h2 className="font-bold text-slate-700 mb-2 px-1">
          내 배지 <span className="text-slate-400 font-normal">({badges.length})</span>
        </h2>
        {badges.length === 0 ? (
          <p className="text-xs text-slate-400 card py-4 text-center">아직 받은 배지가 없어요.</p>
        ) : (
          <div className="flex flex-wrap gap-3 card">
            {badges.map((b) => (
              <div key={b.id} className="flex flex-col items-center w-16 text-center" title={b.condition}>
                {b.image_url ? (
                  <img src={b.image_url} alt={b.name} className="w-12 h-12 rounded-xl object-cover border border-slate-200" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-xl">🏅</div>
                )}
                <span className="text-[11px] text-slate-600 mt-1 leading-tight">{b.name}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-bold text-slate-700 mb-2 px-1">모둠 랭킹</h2>
        {ranking.length === 0 ? (
          <p className="text-xs text-slate-400 card py-4 text-center">아직 모둠이 없어요.</p>
        ) : (
          <ul className="space-y-1.5">
            {ranking.map((g, i) => {
              const mine = g.id === me.group_id
              return (
                <li
                  key={g.id}
                  className={`card flex items-center gap-2 py-2.5 ${mine ? 'border-emerald-300 bg-emerald-50/50' : ''}`}
                >
                  <span className="text-base w-6 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
                  <span className="flex-1 font-bold text-slate-800 text-sm truncate">
                    {g.name} {mine && <span className="text-[11px] text-emerald-600">(우리)</span>}
                  </span>
                  <span className="text-emerald-600 font-black text-sm whitespace-nowrap">🌱 {g.cumulative_seeds}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}

function RoomSidePanel({ data }: { data: RoomSideData | null }) {
  if (!data) return <p className="text-xs text-slate-400 card py-6 text-center">모둠 정보를 불러오는 중…</p>
  return (
    <>
      <section>
        <h2 className="font-bold text-slate-700 mb-2 px-1">
          모둠원 <span className="text-slate-400 font-normal">({data.members.length})</span>
        </h2>
        {data.members.length === 0 ? (
          <p className="text-xs text-slate-400 card py-4 text-center">모둠원이 없어요.</p>
        ) : (
          <div className="card flex flex-col gap-2">
            {data.members.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <Avatar name={m.name} src={m.avatar_url} size={28} />
                <span className="text-sm text-slate-700">{m.name}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-bold text-slate-700 mb-2 px-1">🏅 모둠 배지</h2>
        {data.badges.length === 0 ? (
          <p className="text-xs text-slate-400 card py-4 text-center">아직 받은 배지가 없어요.</p>
        ) : (
          <div className="flex flex-wrap gap-3 card">
            {data.badges.map((b, i) => (
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
      </section>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// 홈 (수업 목록 — 가로 카드뷰)
// ─────────────────────────────────────────────────────────────

function Home({
  seeds,
  lessons,
  onEnter,
}: {
  seeds: number
  lessons: Lesson[]
  onEnter: (l: Lesson) => void
}) {
  return (
    <div className="space-y-5">
      {/* 내 새싹 (배너를 닫아도 보이도록 본문에도 둔다) */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-5 flex items-center justify-between">
        <div>
          <p className="text-emerald-100 text-sm font-bold">내 누적 새싹</p>
          <p className="text-4xl font-black mt-0.5">🌱 {seeds}</p>
        </div>
        <p className="text-right text-emerald-100 text-xs">
          질문·댓글·하트로
          <br />
          새싹을 모아보세요
        </p>
      </div>

      <div>
        <h2 className="font-bold text-slate-700 mb-2">수업 목록</h2>
        {lessons.length === 0 ? (
          <p className="text-slate-400 text-sm py-8 text-center card">아직 열린 수업이 없어요.</p>
        ) : (
          // 가로 카드뷰 — 좌우로 밀어 넘긴다.
          // 위아래 여백을 둬야 카드가 떠오를 때 그림자가 잘리지 않는다.
          <div className="flex gap-3 overflow-x-auto py-2 -mx-1 px-1 snap-x snap-mandatory">
            {lessons.map((l) => (
              <button
                key={l.id}
                onClick={() => onEnter(l)}
                className="lesson-card snap-start shrink-0 w-56 sm:w-60 text-left card flex flex-col gap-2"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  {l.period_label && <span className="text-xs text-slate-400">{l.period_label}</span>}
                  <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">{STAGE_LABEL[l.stage]}</span>
                </div>
                <p className="font-bold text-slate-800 leading-snug line-clamp-3">{l.title}</p>
                <span className="mt-auto text-xs font-bold text-emerald-600">들어가기 →</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StudentSettings({ me, onProfileChange }: { me: StudentSession; onProfileChange: () => void }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const dataUrl = await compressToSquare(file)
      await student.setAvatar(dataUrl)
      onProfileChange()
    } catch (err) {
      alert(err instanceof Error ? err.message : '업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="card">
      <h2 className="font-bold text-slate-800 mb-4">프로필 사진</h2>
      <div className="flex items-center gap-4">
        <button onClick={() => fileRef.current?.click()} className="relative" title="사진 변경">
          <Avatar name={me.name} src={me.avatar_url} size={72} />
          <span className="absolute -bottom-1 -right-1 bg-emerald-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs border-2 border-white">
            {uploading ? '…' : '📷'}
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
        <div>
          <p className="text-sm text-slate-600 font-medium">
            {me.name} · {me.student_no}
          </p>
          <p className="text-xs text-slate-400">댓글에 이 사진과 이름이 함께 표시됩니다.</p>
          <button onClick={() => fileRef.current?.click()} className="btn-secondary text-sm mt-2">
            사진 업로드
          </button>
        </div>
      </div>
    </section>
  )
}
