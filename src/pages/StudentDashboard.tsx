import type { StudentSession } from '../types'

interface Props {
  student: StudentSession
  onLogout: () => void
}

export default function StudentDashboard({ student, onLogout }: Props) {
  return (
    <div className="max-w-xl mx-auto px-4 py-5">
      <header className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-slate-500">{student.student_no}</p>
          <h1 className="text-xl font-black text-slate-900">{student.name} 님</h1>
        </div>
        <button onClick={onLogout} className="btn-secondary">
          로그아웃
        </button>
      </header>

      <div className="card text-center py-10">
        <div className="text-5xl mb-3">🌱</div>
        <p className="text-slate-600 font-medium">로그인 성공!</p>
        <p className="text-sm text-slate-400 mt-1">
          다음 단계에서 수업 목록·질문 만들기·내 새싹·모둠 공간이 열립니다.
        </p>
      </div>
    </div>
  )
}
