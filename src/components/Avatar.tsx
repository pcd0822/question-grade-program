// 원형 프로필 아바타. 이미지가 없으면 이름 첫 글자를 색 배경으로 표시.
interface Props {
  name: string
  src?: string | null
  size?: number
  teacher?: boolean
  className?: string
}

const COLORS = ['#16a34a', '#0ea5e9', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6']

function colorFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % COLORS.length
  return COLORS[h]
}

export default function Avatar({ name, src, size = 40, teacher, className = '' }: Props) {
  const style = { width: size, height: size, fontSize: size * 0.42 }
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={style}
        className={`rounded-full object-cover bg-slate-100 shrink-0 ${className}`}
      />
    )
  }
  return (
    <div
      style={{ ...style, background: teacher ? '#16a34a' : colorFor(name) }}
      className={`rounded-full flex items-center justify-center text-white font-bold shrink-0 ${className}`}
    >
      {(name || '?').trim().charAt(0)}
    </div>
  )
}
