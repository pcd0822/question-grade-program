import { useEffect, useState } from 'react'
import { callFn } from '../lib/api'
import { getTeacherCode } from '../lib/session'
import type { Student } from '../types'

interface Props {
  onLogout: () => void
}

export default function TeacherDashboard({ onLogout }: Props) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-slate-900">교사 대시보드</h1>
          <p className="text-sm text-slate-500">학생 관리</p>
        </div>
        <button onClick={onLogout} className="btn-secondary">
          로그아웃
        </button>
      </header>

      <StudentManager />

      <p className="text-center text-xs text-slate-400 mt-8">
        다음 단계에서 수업 개설·질문/답변·새싹 지급·모둠이 추가됩니다.
      </p>
    </div>
  )
}

function StudentManager() {
  const teacherCode = getTeacherCode() || ''
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [studentNo, setStudentNo] = useState('')
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { students } = await callFn<{ students: Student[] }>('students', {
        action: 'list',
        teacherCode,
      })
      setStudents(students)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function addStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!studentNo.trim() || !name.trim()) return
    setAdding(true)
    setError('')
    try {
      await callFn('students', {
        action: 'add',
        teacherCode,
        studentNo: studentNo.trim(),
        name: name.trim(),
      })
      setStudentNo('')
      setName('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setAdding(false)
    }
  }

  async function regenerate(s: Student) {
    if (!confirm(`${s.name}(${s.student_no}) 학생의 코드를 재발급할까요?\n기존 코드는 즉시 사용할 수 없게 됩니다.`)) return
    try {
      await callFn('students', { action: 'regenerate', teacherCode, id: s.id })
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : '재발급 실패')
    }
  }

  async function remove(s: Student) {
    if (!confirm(`${s.name}(${s.student_no}) 학생을 삭제할까요?\n이 학생의 질문·답변·새싹 기록도 함께 삭제됩니다. 되돌릴 수 없습니다.`)) return
    try {
      await callFn('students', { action: 'delete', teacherCode, id: s.id })
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  function exportCsv() {
    const header = ['학번', '이름', '코드']
    const rows = students.map((s) => [s.student_no, s.name, s.code])
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
    // 엑셀 한글 깨짐 방지 BOM
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '학생명단_코드.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* 등록 폼 */}
      <section className="card">
        <h2 className="font-bold text-slate-800 mb-3">학생 등록</h2>
        <form onSubmit={addStudent} className="flex flex-col sm:flex-row gap-2">
          <input
            className="input sm:w-40"
            inputMode="numeric"
            placeholder="학번"
            value={studentNo}
            onChange={(e) => setStudentNo(e.target.value)}
          />
          <input
            className="input flex-1"
            placeholder="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" disabled={adding} className="btn-primary">
            {adding ? '등록 중…' : '등록'}
          </button>
        </form>
        <p className="text-xs text-slate-400 mt-2">등록하면 6자리 코드가 자동으로 만들어집니다.</p>
      </section>

      {/* 명단 */}
      <section className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800">
            학생 명단 <span className="text-slate-400 font-normal">({students.length})</span>
          </h2>
          <button onClick={exportCsv} disabled={!students.length} className="btn-secondary text-sm">
            CSV 내보내기
          </button>
        </div>

        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
        {loading ? (
          <p className="text-slate-400 text-sm py-6 text-center">불러오는 중…</p>
        ) : students.length === 0 ? (
          <p className="text-slate-400 text-sm py-6 text-center">아직 등록된 학생이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {students.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <span className="w-16 text-sm text-slate-500 shrink-0">{s.student_no}</span>
                <span className="flex-1 font-medium text-slate-800 truncate">{s.name}</span>
                <span className="font-mono font-bold tracking-widest text-emerald-600 shrink-0">
                  {s.code}
                </span>
                <button onClick={() => regenerate(s)} className="text-xs text-slate-400 hover:text-slate-600 shrink-0">
                  재발급
                </button>
                <button onClick={() => remove(s)} className="text-xs text-red-400 hover:text-red-600 shrink-0">
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
