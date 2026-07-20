import { useState } from 'react'
import StudentManager from './teacher/StudentManager'
import LessonManager from './teacher/LessonManager'
import QuestionDashboard from './teacher/QuestionDashboard'

interface Props {
  onLogout: () => void
}

type Tab = 'dashboard' | 'lessons' | 'students'

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: '질문 대시보드' },
  { key: 'lessons', label: '수업 관리' },
  { key: 'students', label: '학생 관리' },
]

export default function TeacherDashboard({ onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard')

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">🌱 교사 대시보드</h1>
          <p className="text-sm text-slate-500">질문 프로그램</p>
        </div>
        <button onClick={onLogout} className="btn-secondary">로그아웃</button>
      </header>

      <div className="grid grid-cols-3 gap-2 mb-5 bg-slate-200 p-1 rounded-xl sticky top-2 z-10">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`touch-target rounded-lg font-bold text-sm transition-colors ${
              tab === t.key ? 'bg-white text-emerald-600 shadow' : 'text-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <QuestionDashboard />}
      {tab === 'lessons' && <LessonManager />}
      {tab === 'students' && <StudentManager />}
    </div>
  )
}
