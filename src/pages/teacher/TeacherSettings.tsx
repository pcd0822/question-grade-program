import { useRef, useState } from 'react'
import Avatar from '../../components/Avatar'
import { teacher } from '../../lib/teacherApi'
import { getTeacherCode } from '../../lib/session'
import { compressToSquare } from '../../lib/imageCompress'

interface Props {
  avatar: string | null
  onAvatarChange: (url: string) => void
}

export default function TeacherSettings({ avatar, onAvatarChange }: Props) {
  const code = getTeacherCode() || ''
  const [uploading, setUploading] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const dataUrl = await compressToSquare(file)
      const url = await teacher.setAvatar(dataUrl)
      onAvatarChange(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : '업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* 프로필 사진 */}
      <section className="card">
        <h2 className="font-bold text-slate-800 mb-4">프로필 사진</h2>
        <div className="flex items-center gap-4">
          <button onClick={() => fileRef.current?.click()} className="relative" title="사진 변경">
            <Avatar name="선생님" src={avatar} teacher size={72} />
            <span className="absolute -bottom-1 -right-1 bg-emerald-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs border-2 border-white">
              {uploading ? '…' : '📷'}
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
          <div>
            <p className="text-sm text-slate-600 font-medium">선생님 프로필</p>
            <p className="text-xs text-slate-400">교사 댓글에 이 사진이 함께 표시됩니다.</p>
            <button onClick={() => fileRef.current?.click()} className="btn-secondary text-sm mt-2">
              사진 업로드
            </button>
          </div>
        </div>
      </section>

      {/* 교사 입장 코드 */}
      <section className="card">
        <h2 className="font-bold text-slate-800 mb-2">교사 입장 코드</h2>
        <p className="text-xs text-slate-400 mb-3">이 코드로 교사 대시보드에 로그인합니다. 노출에 주의하세요.</p>
        <div className="flex items-center gap-3">
          <span className="font-mono font-black text-2xl tracking-widest text-emerald-600">
            {revealed ? code : '•'.repeat(code.length || 4)}
          </span>
          <button onClick={() => setRevealed((v) => !v)} className="btn-secondary text-sm">
            {revealed ? '숨기기' : '보기'}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          ※ 코드 변경은 서버 환경변수(<code>TEACHER_CODE</code>)에서 설정합니다.
        </p>
      </section>
    </div>
  )
}
