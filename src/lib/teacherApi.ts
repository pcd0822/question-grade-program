// 교사 쓰기/조회 API 래퍼 — 저장된 교사 코드를 자동으로 붙인다.
import { callFn } from './api'
import { getTeacherCode } from './session'
import type { Comment, Lesson, QuestionStage, Student } from '../types'

function tc() {
  return getTeacherCode() || ''
}

// ── 피드 타입 ──
export interface FeedAuthor {
  student_no: string
  name: string
  group: string | null
  avatar_url: string | null
}
export interface TeacherFeedQuestion {
  id: string
  lesson_id: string
  author_id: string
  text: string
  seed_granted: boolean
  created_at: string
  author: FeedAuthor | null
  heart_count: number
  comments: Comment[]
}
export interface TeacherFeedSubmission {
  id: string
  lesson_id: string
  author_id: string
  text: string
  created_at: string
  updated_at: string
  author: FeedAuthor | null
}

// ── 모둠/통계 타입 ──
export interface GroupOverviewMember extends Student {}
export interface GroupOverviewGroup {
  id: string
  name: string
  spent_seeds: number
  created_at: string
  members: GroupOverviewMember[]
  cumulative_seeds: number
  wallet: number
}
export interface GroupsOverview {
  students: Student[]
  groups: GroupOverviewGroup[]
  stats: { classTotal: number; groupAvg: number; studentAvg: number }
}

export const teacher = {
  // 학생
  listStudents: () =>
    callFn<{ students: Student[] }>('students', { action: 'list', teacherCode: tc() }).then((r) => r.students),
  addStudent: (studentNo: string, name: string) =>
    callFn<{ student: Student }>('students', { action: 'add', teacherCode: tc(), studentNo, name }).then((r) => r.student),
  regenerateCode: (id: string) => callFn('students', { action: 'regenerate', teacherCode: tc(), id }),
  deleteStudent: (id: string) => callFn('students', { action: 'delete', teacherCode: tc(), id }),

  // 수업
  listLessons: () =>
    callFn<{ lessons: Lesson[] }>('lessons', { action: 'list', teacherCode: tc() }).then((r) => r.lessons),
  saveLesson: (lesson: Partial<Lesson> & { title: string; stage: QuestionStage }) =>
    callFn<{ lesson: Lesson }>('lessons', {
      action: lesson.id ? 'update' : 'create',
      teacherCode: tc(),
      lesson,
    }).then((r) => r.lesson),
  toggleActive: (id: string, active: boolean) =>
    callFn('lessons', { action: 'toggle-active', teacherCode: tc(), id, active }),
  deleteLesson: (id: string) => callFn('lessons', { action: 'delete', teacherCode: tc(), id }),

  // 질문 대시보드
  feed: (lessonId: string) =>
    callFn<{ questions: TeacherFeedQuestion[]; submissions: TeacherFeedSubmission[] }>('teacher-feed', {
      teacherCode: tc(),
      lessonId,
    }),
  grantQuestionSeed: (questionId: string, on: boolean) =>
    callFn('teacher-actions', { action: 'grant-question-seed', teacherCode: tc(), questionId, on }),
  grantCommentSeed: (commentId: string, on: boolean) =>
    callFn('teacher-actions', { action: 'grant-comment-seed', teacherCode: tc(), commentId, on }),
  rejectComment: (commentId: string, feedback: string) =>
    callFn('teacher-actions', { action: 'reject-comment', teacherCode: tc(), commentId, feedback }),
  addComment: (questionId: string, text: string) =>
    callFn('teacher-actions', { action: 'add-teacher-comment', teacherCode: tc(), questionId, text }),
  deleteComment: (commentId: string) =>
    callFn('teacher-actions', { action: 'delete-teacher-comment', teacherCode: tc(), commentId }),

  // 모둠 + 통계
  groupsOverview: () =>
    callFn<GroupsOverview>('groups', { action: 'overview', teacherCode: tc() }),
  createGroup: (name: string) => callFn('groups', { action: 'create-group', teacherCode: tc(), name }),
  renameGroup: (id: string, name: string) => callFn('groups', { action: 'rename-group', teacherCode: tc(), id, name }),
  deleteGroup: (id: string) => callFn('groups', { action: 'delete-group', teacherCode: tc(), id }),
  assign: (studentId: string, groupId: string | null) =>
    callFn('groups', { action: 'assign', teacherCode: tc(), studentId, groupId }),

  // 개인설정
  getSettings: () =>
    callFn<{ avatar_url: string | null }>('teacher-settings', { action: 'get', teacherCode: tc() }),
  setAvatar: (dataUrl: string) =>
    callFn<{ avatar_url: string }>('teacher-settings', {
      action: 'set-avatar',
      teacherCode: tc(),
      dataUrl,
    }).then((r) => r.avatar_url),
}
