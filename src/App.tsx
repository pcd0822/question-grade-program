import { useState } from 'react'
import LoginPage from './pages/LoginPage'
import TeacherDashboard from './pages/TeacherDashboard'
import StudentDashboard from './pages/StudentDashboard'
import { clearStudent, clearTeacher, getStudent, getTeacherCode } from './lib/session'

type Role = 'none' | 'teacher' | 'student'

function detectRole(): Role {
  if (getTeacherCode()) return 'teacher'
  if (getStudent()) return 'student'
  return 'none'
}

export default function App() {
  const [role, setRole] = useState<Role>(detectRole)
  // 프로필(아바타) 변경 시 세션 재읽기를 위한 강제 리렌더 토큰
  const [ver, setVer] = useState(0)

  function refresh() {
    setRole(detectRole())
    setVer((v) => v + 1)
  }
  function logout() {
    clearTeacher()
    clearStudent()
    setRole('none')
  }

  if (role === 'teacher') return <TeacherDashboard onLogout={logout} />

  if (role === 'student') {
    const student = getStudent()
    if (student)
      return (
        <StudentDashboard key={ver} student={student} onLogout={logout} onProfileChange={() => setVer((v) => v + 1)} />
      )
  }

  return <LoginPage onLoggedIn={refresh} />
}
