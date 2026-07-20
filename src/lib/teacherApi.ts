// 교사 쓰기/조회 API 래퍼 — 저장된 교사 코드를 자동으로 붙인다.
import { callFn } from './api'
import { getTeacherCode } from './session'
import type { Lesson, QuestionStage } from '../types'

function tc() {
  return getTeacherCode() || ''
}

// ── 학생 ──
export interface StudentRow {
  id: string
  student_no: string
  name: string
  code: string
  group_id: string | null
  cumulative_seeds: number
  created_at: string
}
export const teacher = {
  listStudents: () =>
    callFn<{ students: StudentRow[] }>('students', { action: 'list', teacherCode: tc() }).then(
      (r) => r.students,
    ),
  addStudent: (studentNo: string, name: string) =>
    callFn<{ student: StudentRow }>('students', {
      action: 'add',
      teacherCode: tc(),
      studentNo,
      name,
    }).then((r) => r.student),
  regenerateCode: (id: string) =>
    callFn('students', { action: 'regenerate', teacherCode: tc(), id }),
  deleteStudent: (id: string) => callFn('students', { action: 'delete', teacherCode: tc(), id }),

  // ── 수업 ──
  listLessons: () =>
    callFn<{ lessons: Lesson[] }>('lessons', { action: 'list', teacherCode: tc() }).then(
      (r) => r.lessons,
    ),
  saveLesson: (lesson: Partial<Lesson> & { title: string; stage: QuestionStage }) =>
    callFn<{ lesson: Lesson }>('lessons', {
      action: lesson.id ? 'update' : 'create',
      teacherCode: tc(),
      lesson,
    }).then((r) => r.lesson),
  toggleActive: (id: string, active: boolean) =>
    callFn('lessons', { action: 'toggle-active', teacherCode: tc(), id, active }),
  deleteLesson: (id: string) => callFn('lessons', { action: 'delete', teacherCode: tc(), id }),

  // ── 질문 대시보드 ──
  feed: (lessonId: string) =>
    callFn<{ questions: TeacherFeedQuestion[]; submissions: TeacherFeedSubmission[] }>(
      'teacher-feed',
      { teacherCode: tc(), lessonId },
    ),

  grantQuestionSeed: (questionId: string, on: boolean) =>
    callFn('teacher-actions', { action: 'grant-question-seed', teacherCode: tc(), questionId, on }),
  grantAnswerSeed: (answerId: string, on: boolean) =>
    callFn('teacher-actions', { action: 'grant-answer-seed', teacherCode: tc(), answerId, on }),
  rejectAnswer: (answerId: string, feedback: string) =>
    callFn('teacher-actions', { action: 'reject-answer', teacherCode: tc(), answerId, feedback }),
}

// 교사 피드 응답 타입
export interface FeedAuthor {
  student_no: string
  name: string
  group: string | null
}
export interface TeacherFeedAnswer {
  id: string
  question_id: string
  author_id: string
  text: string
  status: 'submitted' | 'approved' | 'rejected'
  teacher_feedback: string | null
  created_at: string
  updated_at: string
  author: FeedAuthor | null
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
  answers: TeacherFeedAnswer[]
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
