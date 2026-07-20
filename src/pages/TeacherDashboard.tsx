import { useEffect, useState } from 'react'
import LessonManager from './teacher/LessonManager'
import QuestionDashboard from './teacher/QuestionDashboard'
import GroupManager from './teacher/GroupManager'

interface Props {
  onLogout: () => void
}

type Tab = 'dashboard' | 'lessons' | 'students'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'dashboard', label: '질문 대시보드', icon: '💬' },
  { key: 'lessons', label: '수업 관리', icon: '📚' },
  { key: 'students', label: '학생·모둠 관리', icon: '👥' },
]

export default function TeacherDashboard({ onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard')
  // 데스크톱은 기본 펼침, 모바일은 기본 접힘
  const [open, setOpen] = useState(() => window.innerWidth >= 768)

  // 모바일에서 탭 선택 시 자동으로 접기
  function selectTab(t: Tab) {
    setTab(t)
    if (window.innerWidth < 768) setOpen(false)
  }

  useEffect(() => {
    document.body.style.background = '#f4f7f4'
  }, [])

  const current = TABS.find((t) => t.key === tab)!

  return (
    <div className="min-h-screen">
      {/* 상단 바 */}
      <div className="sticky top-0 z-30 h-14 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center gap-3 px-3">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="메뉴 열고 닫기"
          className="touch-target w-11 flex items-center justify-center rounded-xl hover:bg-slate-100 active:bg-slate-200"
        >
          <Hamburger open={open} />
        </button>
        <span className="text-lg">{current.icon}</span>
        <h1 className="font-black text-slate-900">{current.label}</h1>
      </div>

      {/* 백드롭 (모바일) */}
      {open && (
        <div className="fixed inset-0 top-14 bg-black/30 z-30 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* 사이드바 (종이접기 폴드) */}
      <div
        className="fixed top-14 left-0 bottom-0 z-40"
        style={{ perspective: '1600px', pointerEvents: open ? 'auto' : 'none' }}
      >
        <aside
          className="h-full w-64 bg-white border-r border-slate-200 shadow-xl flex flex-col p-3"
          style={{
            transformOrigin: 'left center',
            transform: open ? 'rotateY(0deg)' : 'rotateY(-92deg)',
            opacity: open ? 1 : 0,
            transition: 'transform .45s cubic-bezier(.22,.61,.36,1), opacity .3s ease',
          }}
        >
          <div className="flex items-center gap-2 px-2 py-3">
            <span className="text-2xl">🌱</span>
            <div>
              <p className="font-black text-slate-900 leading-tight">질문 프로그램</p>
              <p className="text-xs text-slate-400">교사 모드</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1 mt-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => selectTab(t.key)}
                className={`flex items-center gap-3 px-3 h-12 rounded-xl font-bold text-left transition-colors ${
                  tab === t.key ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-lg">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>

          <button
            onClick={onLogout}
            className="mt-auto flex items-center gap-3 px-3 h-12 rounded-xl font-bold text-slate-500 hover:bg-slate-50"
          >
            <span className="text-lg">↩</span> 로그아웃
          </button>
        </aside>
      </div>

      {/* 메인 */}
      <main
        className="px-4 py-5 transition-[margin] duration-300"
        style={{ marginLeft: open && window.innerWidth >= 768 ? 256 : 0 }}
      >
        <div className="max-w-3xl mx-auto">
          {tab === 'dashboard' && <QuestionDashboard />}
          {tab === 'lessons' && <LessonManager />}
          {tab === 'students' && <GroupManager />}
        </div>
      </main>
    </div>
  )
}

function Hamburger({ open }: { open: boolean }) {
  const base = 'block h-0.5 w-6 bg-slate-700 rounded transition-all duration-300'
  return (
    <span className="relative flex flex-col gap-1.5">
      <span className={base} style={open ? { transform: 'translateY(8px) rotate(45deg)' } : undefined} />
      <span className={base} style={open ? { opacity: 0 } : undefined} />
      <span className={base} style={open ? { transform: 'translateY(-8px) rotate(-45deg)' } : undefined} />
    </span>
  )
}
