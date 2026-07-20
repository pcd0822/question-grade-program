// 로그인 세션을 localStorage 에 보관한다(Supabase Auth 미사용).
// 학생 세션에는 이후 서버 쓰기 재검증용 code 를 함께 보관한다.
import type { StudentSession } from '../types'

const TEACHER_KEY = 'qgp.teacher'
const STUDENT_KEY = 'qgp.student'

// ── 교사 ──
export function saveTeacher(code: string) {
  localStorage.setItem(TEACHER_KEY, code)
}
export function getTeacherCode(): string | null {
  return localStorage.getItem(TEACHER_KEY)
}
export function clearTeacher() {
  localStorage.removeItem(TEACHER_KEY)
}

// ── 학생 ──
export function saveStudent(s: StudentSession) {
  localStorage.setItem(STUDENT_KEY, JSON.stringify(s))
}
export function getStudent(): StudentSession | null {
  const raw = localStorage.getItem(STUDENT_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StudentSession
  } catch {
    return null
  }
}
export function clearStudent() {
  localStorage.removeItem(STUDENT_KEY)
}
