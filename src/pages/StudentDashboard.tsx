import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lesson, StudentSession } from '../types'
import { fetchActiveLessons, fetchMySeeds } from '../lib/studentData'
import { student, type RankingRow } from '../lib/studentApi'
import { compressToSquare } from '../lib/imageCompress'
import { STAGE_LABEL } from '../types'
import { useRealtime } from '../hooks/useRealtime'
import Avatar from '../components/Avatar'
import LessonRoom from './student/LessonRoom'

interface Props {
  student: StudentSession
  onLogout: () => void
  onProfileChange: () => void
}

export default function StudentDashboard({ student: me, onLogout, onProfileChange }: Props) {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [seeds, setSeeds] = useState(0)
  const [ranking, setRanking] = useState<RankingRow[]>([])
  const [active, setActive] = useState<Lesson | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetchActiveLessons().then(setLessons)
    fetchMySeeds(me.id).then(setSeeds)
    student.ranking().then((r) => setRanking(r.ranking)).catch(() => {})
  }, [me.id])

  useEffect(() => {
    load()
  }, [load])
  useRealtime(['lessons', 'seed_log', 'groups', 'students'], load)

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
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

  if (active) {
    return <LessonRoom lesson={active} me={me} onBack={() => { setActive(null); load() }} />
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-5">
      <header className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => fileRef.current?.click()} className="relative" title="프로필 사진 변경">
            <Avatar name={me.name} src={me.avatar_url} size={52} />
            <span className="absolute -bottom-1 -right-1 bg-emerald-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[11px] border-2 border-white">
              {uploading ? '…' : '📷'}
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
          <div>
            <p className="text-sm text-slate-500">{me.student_no}</p>
            <h1 className="text-xl font-black text-slate-900">{me.name} 님</h1>
          </div>
        </div>
        <button onClick={onLogout} className="btn-secondary">로그아웃</button>
      </header>

      {/* 내 새싹 */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-5 mb-5 flex items-center justify-between">
        <div>
          <p className="text-emerald-100 text-sm font-bold">내 누적 새싹</p>
          <p className="text-4xl font-black mt-0.5">🌱 {seeds}</p>
        </div>
        <p className="text-right text-emerald-100 text-xs">질문·댓글·하트로<br />새싹을 모아보세요</p>
      </div>

      {/* 모둠 랭킹 */}
      {ranking.length > 0 && (
        <div className="mb-5">
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
      <h2 className="font-bold text-slate-700 mb-2">수업 목록</h2>
      {lessons.length === 0 ? (
        <p className="text-slate-400 text-sm py-8 text-center card">아직 열린 수업이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {lessons.map((l) => (
            <li key={l.id}>
              <button onClick={() => setActive(l)} className="w-full text-left card hover:border-emerald-300 transition-colors">
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
  )
}
