import { useCallback, useEffect, useState } from 'react'
import type { Lesson, StudentSession } from '../types'
import { fetchActiveLessons, fetchMySeeds } from '../lib/studentData'
import { STAGE_LABEL } from '../types'
import { useRealtime } from '../hooks/useRealtime'
import LessonRoom from './student/LessonRoom'

interface Props {
  student: StudentSession
  onLogout: () => void
}

export default function StudentDashboard({ student, onLogout }: Props) {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [seeds, setSeeds] = useState(0)
  const [active, setActive] = useState<Lesson | null>(null)

  const load = useCallback(() => {
    fetchActiveLessons().then(setLessons)
    fetchMySeeds(student.id).then(setSeeds)
  }, [student.id])

  useEffect(() => {
    load()
  }, [load])
  useRealtime(['lessons', 'seed_log'], load)

  if (active) {
    return <LessonRoom lesson={active} myId={student.id} onBack={() => { setActive(null); load() }} />
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-5">
      <header className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm text-slate-500">{student.student_no}</p>
          <h1 className="text-xl font-black text-slate-900">{student.name} 님</h1>
        </div>
        <button onClick={onLogout} className="btn-secondary">로그아웃</button>
      </header>

      {/* 내 새싹 */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-5 mb-5 flex items-center justify-between">
        <div>
          <p className="text-emerald-100 text-sm font-bold">내 누적 새싹</p>
          <p className="text-4xl font-black mt-0.5">🌱 {seeds}</p>
        </div>
        <div className="text-right text-emerald-100 text-xs">
          <p>질문·답변·하트로</p>
          <p>새싹을 모아보세요</p>
        </div>
      </div>

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

      <p className="text-center text-xs text-slate-400 mt-8">
        다음 단계에서 모둠 랭킹·모둠 공간·배지가 열립니다.
      </p>
    </div>
  )
}
