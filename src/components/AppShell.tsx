import { useEffect, useState, type ReactNode } from 'react'

/** md 브레이크포인트(768px) 이상인지. 창 크기 변경·화면 회전에 반응한다. */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isDesktop
}

export interface NavItem {
  key: string
  label: string
  icon: string
}

interface Props {
  brandTitle: string
  brandSubtitle: string
  brandAvatar?: ReactNode
  nav: NavItem[]
  current: string
  onSelect: (key: string) => void
  onLogout: () => void
  children: ReactNode
  /** 메인 콘텐츠 최대 너비 (tailwind max-w-* 클래스) */
  maxWidth?: string
}

export default function AppShell({
  brandTitle,
  brandSubtitle,
  brandAvatar,
  nav,
  current,
  onSelect,
  onLogout,
  children,
  maxWidth = 'max-w-4xl',
}: Props) {
  // 창 크기를 렌더 중에 직접 읽으면 회전·창 크기 변경에 반응하지 못한다.
  // 데스크톱 여부를 상태로 두고 resize 를 구독한다.
  const isDesktop = useIsDesktop()
  const [open, setOpen] = useState(isDesktop)
  const currentItem = nav.find((n) => n.key === current)

  function select(k: string) {
    onSelect(k)
    if (!isDesktop) setOpen(false)
  }

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
        {currentItem && <span className="text-lg">{currentItem.icon}</span>}
        <h1 className="font-black text-slate-900">{currentItem?.label}</h1>
      </div>

      {/* 백드롭(모바일) */}
      {open && <div className="fixed inset-0 top-14 bg-black/30 z-30 md:hidden" onClick={() => setOpen(false)} />}

      {/* 사이드바 (종이접기 폴드) */}
      <div className="fixed top-14 left-0 bottom-0 z-40" style={{ perspective: '1600px', pointerEvents: open ? 'auto' : 'none' }}>
        <aside
          className="h-full w-64 bg-white border-r border-slate-200 shadow-xl flex flex-col p-3"
          style={{
            transformOrigin: 'left center',
            transform: open ? 'rotateY(0deg)' : 'rotateY(-92deg)',
            opacity: open ? 1 : 0,
            transition: 'transform .45s cubic-bezier(.22,.61,.36,1), opacity .3s ease',
          }}
        >
          <div className="flex items-center gap-2.5 px-2 py-3">
            {brandAvatar ?? <span className="text-2xl">🌱</span>}
            <div className="min-w-0">
              <p className="font-black text-slate-900 leading-tight truncate">{brandTitle}</p>
              <p className="text-xs text-slate-400">{brandSubtitle}</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1 mt-2">
            {nav.map((t) => (
              <button
                key={t.key}
                onClick={() => select(t.key)}
                className={`flex items-center gap-3 px-3 h-12 rounded-xl font-bold text-left transition-colors ${
                  current === t.key ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'
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
      <main className="px-4 py-5 transition-[margin] duration-300" style={{ marginLeft: open && isDesktop ? 256 : 0 }}>
        <div className={`${maxWidth} mx-auto`}>{children}</div>
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
