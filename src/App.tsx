import { useState } from 'react'
import LoginPage from './pages/LoginPage'
import TeacherDashboard from './pages/TeacherDashboard'
import StudentDashboard from './pages/StudentDashboard'
import {
  clearStudent,
  clearTeacher,
  getStudent,
  getTeacherCode,
} from './lib/session'

type Role = 'none' | 'teacher' | 'student'

function detectRole(): Role {
  if (getTeacherCode()) return 'teacher'
  if (getStudent()) return 'student'
  return 'none'
}

export default function App() {
  const [role, setRole] = useState<Role>(detectRole)

  function refresh() {
    setRole(detectRole())
  }

  function logout() {
    clearTeacher()
    clearStudent()
    setRole('none')
  }

  if (role === 'teacher') {
    return <TeacherDashboard onLogout={logout} />
  }

  if (role === 'student') {
    const student = getStudent()
    if (student) return <StudentDashboard student={student} onLogout={logout} />
  }

  return <LoginPage onLoggedIn={refresh} />
}
