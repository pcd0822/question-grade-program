import { useEffect, useState } from 'react'
import { teacher, type StudentRow } from '../../lib/teacherApi'

export default function StudentManager() {
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [studentNo, setStudentNo] = useState('')
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setStudents(await teacher.listStudents())
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function addStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!studentNo.trim() || !name.trim()) return
    setAdding(true)
    setError('')
    try {
      await teacher.addStudent(studentNo.trim(), name.trim())
      setStudentNo('')
      setName('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setAdding(false)
    }
  }

  async function regenerate(s: StudentRow) {
    if (!confirm(`${s.name}(${s.student_no}) 학생의 코드를 재발급할까요?\n기존 코드는 즉시 사용할 수 없게 됩니다.`)) return
    try {
      await teacher.regenerateCode(s.id)
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : '재발급 실패')
    }
  }

  async function remove(s: StudentRow) {
    if (!confirm(`${s.name}(${s.student_no}) 학생을 삭제할까요?\n이 학생의 질문·답변·새싹 기록도 함께 삭제됩니다. 되돌릴 수 없습니다.`)) return
    try {
      await teacher.deleteStudent(s.id)
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  function exportCsv() {
    const rows = [['학번', '이름', '코드'], ...students.map((s) => [s.student_no, s.name, s.code])]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
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
      <section className="card">
        <h2 className="font-bold text-slate-800 mb-3">학생 등록</h2>
        <form onSubmit={addStudent} className="flex flex-col sm:flex-row gap-2">
          <input className="input sm:w-40" inputMode="numeric" placeholder="학번" value={studentNo} onChange={(e) => setStudentNo(e.target.value)} />
          <input className="input flex-1" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" disabled={adding} className="btn-primary">
            {adding ? '등록 중…' : '등록'}
          </button>
        </form>
        <p className="text-xs text-slate-400 mt-2">등록하면 6자리 코드가 자동으로 만들어집니다.</p>
      </section>

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
                <span className="font-mono font-bold tracking-widest text-emerald-600 shrink-0">{s.code}</span>
                <button onClick={() => regenerate(s)} className="text-xs text-slate-400 hover:text-slate-600 shrink-0">재발급</button>
                <button onClick={() => remove(s)} className="text-xs text-red-400 hover:text-red-600 shrink-0">삭제</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
