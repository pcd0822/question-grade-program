// 수업 목록 정렬 토글 (최신순 / 오래된 순). 섹션 헤더 우측 상단에 놓는다.
// 정렬 로직·타입은 lib/sort.ts 에 있다(fast-refresh 를 위해 컴포넌트 파일에는 컴포넌트만 둔다).
import type { SortOrder } from '../lib/sort'

export default function SortToggle({
  value,
  onChange,
}: {
  value: SortOrder
  onChange: (v: SortOrder) => void
}) {
  const opts: { key: SortOrder; label: string }[] = [
    { key: 'newest', label: '최신순' },
    { key: 'oldest', label: '오래된 순' },
  ]
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold shrink-0">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`px-2.5 py-1 rounded-md transition-colors ${
            value === o.key ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
