import { useEffect, useState } from 'react'
import AppShell, { type NavItem } from '../components/AppShell'
import Avatar from '../components/Avatar'
import LessonManager from './teacher/LessonManager'
import QuestionDashboard from './teacher/QuestionDashboard'
import GroupManager from './teacher/GroupManager'
import BadgeManager from './teacher/BadgeManager'
import TeacherSettings from './teacher/TeacherSettings'
import { teacher } from '../lib/teacherApi'

interface Props {
  onLogout: () => void
}

const NAV: NavItem[] = [
  { key: 'dashboard', label: '질문 대시보드', icon: '💬' },
  { key: 'lessons', label: '수업 관리', icon: '📚' },
  { key: 'students', label: '학생·모둠 관리', icon: '👥' },
  { key: 'badges', label: '배지', icon: '🏅' },
  { key: 'settings', label: '개인설정', icon: '⚙️' },
]

export default function TeacherDashboard({ onLogout }: Props) {
  const [tab, setTab] = useState('dashboard')
  const [avatar, setAvatar] = useState<string | null>(null)

  useEffect(() => {
    document.body.style.background = '#f4f7f4'
    teacher.getSettings().then((s) => setAvatar(s.avatar_url)).catch(() => {})
  }, [])

  return (
    <AppShell
      brandTitle="질문 프로그램"
      brandSubtitle="교사 모드"
      brandAvatar={<Avatar name="선생님" src={avatar} teacher size={36} />}
      nav={NAV}
      current={tab}
      onSelect={setTab}
      onLogout={onLogout}
    >
      {tab === 'dashboard' && <QuestionDashboard />}
      {tab === 'lessons' && <LessonManager />}
      {tab === 'students' && <GroupManager />}
      {tab === 'badges' && <BadgeManager />}
      {tab === 'settings' && <TeacherSettings avatar={avatar} onAvatarChange={setAvatar} />}
    </AppShell>
  )
}
