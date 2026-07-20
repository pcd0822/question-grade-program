import { useState } from 'react'
import { callFn } from '../lib/api'
import { saveStudent, saveTeacher } from '../lib/session'
import type { StudentSession } from '../types'

type Tab = 'student' | 'teacher'

interface Props {
  onLoggedIn: () => void
}

export default function LoginPage({ onLoggedIn }: Props) {
  const [tab, setTab] = useState<Tab>('student')

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🌱</div>
          <h1 className="text-2xl font-black text-slate-900">질문 프로그램</h1>
          <p className="text-slate-500 mt-1 text-sm">언어와 매체 · 문법 탐구 수업</p>
        </div>

        {/* 탭 */}
        <div className="grid grid-cols-2 gap-2 mb-5 bg-slate-200 p-1 rounded-xl">
          <TabButton active={tab === 'student'} onClick={() => setTab('student')}>
            학생
          </TabButton>
          <TabButton active={tab === 'teacher'} onClick={() => setTab('teacher')}>
            교사
          </TabButton>
        </div>

        {tab === 'student' ? (
          <StudentForm onLoggedIn={onLoggedIn} />
        ) : (
          <TeacherForm onLoggedIn={onLoggedIn} />
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`touch-target rounded-lg font-bold text-base transition-colors ${
        active ? 'bg-white text-emerald-600 shadow' : 'text-slate-500'
      }`}
    >
      {children}
    </button>
  )
}

function StudentForm({ onLoggedIn }: Props) {
  const [studentNo, setStudentNo] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { student } = await callFn<{ student: Omit<StudentSession, 'code'> }>('student-login', {
        studentNo: studentNo.trim(),
        code: code.trim().toUpperCase(),
      })
      saveStudent({ ...student, code: code.trim().toUpperCase() })
      onLoggedIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="학번">
        <input
          inputMode="numeric"
          value={studentNo}
          onChange={(e) => setStudentNo(e.target.value)}
          placeholder="예: 30101"
          className="input"
          autoComplete="off"
        />
      </Field>
      <Field label="개인 코드 (6자리)">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="예: A3K9F2"
          maxLength={6}
          className="input tracking-widest uppercase"
          autoComplete="off"
        />
      </Field>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? '확인 중…' : '입장하기'}
      </button>
      <p className="text-center text-xs text-slate-400 pt-1">
        코드는 선생님께 받은 6자리 코드예요.
      </p>
    </form>
  )
}

function TeacherForm({ onLoggedIn }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await callFn('teacher-login', { code: code.trim() })
      saveTeacher(code.trim())
      onLoggedIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="교사 코드">
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="교사 코드를 입력하세요"
          className="input"
          autoComplete="off"
        />
      </Field>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? '확인 중…' : '교사 대시보드 열기'}
      </button>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-bold text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  )
}
