import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lesson, StudentSession } from '../types'
import { fetchActiveLessons, fetchMySeeds } from '../lib/studentData'
import { student, type RankingRow } from '../lib/studentApi'
import { compressToSquare } from '../lib/imageCompress'
import { STAGE_LABEL } from '../types'
import { useRealtime } from '../hooks/useRealtime'
import Avatar from '../components/Avatar'
import AppShell, { type NavItem } from '../components/AppShell'
import LessonRoom from './student/LessonRoom'

interface Props {
  student: StudentSession
  onLogout: () => void
  onProfileChange: () => void
}

const NAV: NavItem[] = [
  { key: 'home', label: '홈', icon: '🏠' },
  { key: 'settings', label: '개인설정', icon: '⚙️' },
]

export default function StudentDashboard({ student: me, onLogout, onProfileChange }: Props) {
  const [tab, setTab] = useState('home')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [seeds, setSeeds] = useState(0)
  const [ranking, setRanking] = useState<RankingRow[]>([])
  const [active, setActive] = useState<Lesson | null>(null)

  const load = useCallback(() => {
    fetchActiveLessons().then(setLessons)
    fetchMySeeds(me.id).then(setSeeds)
    student.ranking().then((r) => setRanking(r.ranking)).catch(() => {})
  }, [me.id])

  useEffect(() => {
    document.body.style.background = '#f4f7f4'
    load()
  }, [load])
  useRealtime(['lessons', 'seed_log', 'groups', 'students'], load)

  // 수업 입장 시 전체화면 리딩뷰
  if (active) {
    return <LessonRoom lesson={active} me={me} onBack={() => { setActive(null); load() }} />
  }

  return (
    <AppShell
      brandTitle={`${me.name} 님`}
      brandSubtitle={me.student_no}
      brandAvatar={<Avatar name={me.name} src={me.avatar_url} size={36} />}
      nav={NAV}
      current={tab}
      onSelect={setTab}
      onLogout={onLogout}
      maxWidth="max-w-3xl"
    >
      {tab === 'home' ? (
        <Home me={me} seeds={seeds} ranking={ranking} lessons={lessons} onEnter={setActive} />
      ) : (
        <StudentSettings me={me} onProfileChange={onProfileChange} />
      )}
    </AppShell>
  )
}

function Home({
  me,
  seeds,
  ranking,
  lessons,
  onEnter,
}: {
  me: StudentSession
  seeds: number
  ranking: RankingRow[]
  lessons: Lesson[]
  onEnter: (l: Lesson) => void
}) {
  return (
    <div className="space-y-5">
      {/* 내 새싹 */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-5 flex items-center justify-between">
        <div>
          <p className="text-emerald-100 text-sm font-bold">내 누적 새싹</p>
          <p className="text-4xl font-black mt-0.5">🌱 {seeds}</p>
        </div>
        <p className="text-right text-emerald-100 text-xs">질문·댓글·하트로<br />새싹을 모아보세요</p>
      </div>

      {/* 모둠 랭킹 */}
      {ranking.length > 0 && (
        <div>
          <h2 className="font-bold text-slate-700 mb-2">모둠 랭킹</h2>
          <ul className="space-y-1.5">
            {ranking.map((g, i) => {
              const mine = g.id === me.group_id
              return (
                <li key={g.id} className={`card flex items-center gap-3 ${mine ? 'border-emerald-300 bg-emerald-50/50' : ''}`}>
                  <span className="text-lg w-7 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
                  <span className="flex-1 font-bold text-slate-800">
                    {g.name} {mine && <span className="text-xs text-emerald-600">(우리 모둠)</span>}
                  </span>
                  <span className="text-emerald-600 font-black">🌱 {g.cumulative_seeds}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* 수업 목록 */}
      <div>
        <h2 className="font-bold text-slate-700 mb-2">수업 목록</h2>
        {lessons.length === 0 ? (
          <p className="text-slate-400 text-sm py-8 text-center card">아직 열린 수업이 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {lessons.map((l) => (
              <li key={l.id}>
                <button onClick={() => onEnter(l)} className="w-full text-left card hover:border-emerald-300 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    {l.period_label && <span className="text-xs text-slate-400">{l.period_label}</span>}
                    <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">{STAGE_LABEL[l.stage]}</span>
                  </div>
                  <p className="font-bold text-slate-800 mt-1">{l.title}</p>
                </button>
              </li>
            ))}
          </ul>
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
          <p className="text-sm text-slate-600 font-medium">{me.name} · {me.student_no}</p>
          <p className="text-xs text-slate-400">댓글에 이 사진과 이름이 함께 표시됩니다.</p>
          <button onClick={() => fileRef.current?.click()} className="btn-secondary text-sm mt-2">사진 업로드</button>
        </div>
      </div>
    </section>
  )
}
