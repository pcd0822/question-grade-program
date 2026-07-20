// 학생 쓰기 API 래퍼 — 저장된 세션(학번+코드)을 자동으로 붙인다.
import { callFn } from './api'
import { getStudent } from './session'

function creds() {
  const s = getStudent()
  return { studentNo: s?.student_no, code: s?.code }
}

export const student = {
  submitTask: (lessonId: string, text: string) =>
    callFn('student-actions', { action: 'submit-task', ...creds(), lessonId, text }),
  createQuestion: (lessonId: string, text: string) =>
    callFn('student-actions', { action: 'create-question', ...creds(), lessonId, text }),
  createAnswer: (questionId: string, text: string) =>
    callFn('student-actions', { action: 'create-answer', ...creds(), questionId, text }),
  updateAnswer: (answerId: string, text: string) =>
    callFn('student-actions', { action: 'update-answer', ...creds(), answerId, text }),
  toggleHeart: (questionId: string) =>
    callFn<{ hearted: boolean; heartCount: number }>('student-actions', {
      action: 'toggle-heart',
      ...creds(),
      questionId,
    }),
}
