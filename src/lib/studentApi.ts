// 학생 쓰기 API 래퍼 — 저장된 세션(학번+코드)을 자동으로 붙인다.
import { callFn } from './api'
import { getStudent, saveStudent } from './session'

function creds() {
  const s = getStudent()
  return { studentNo: s?.student_no, code: s?.code }
}

export interface RankingRow {
  id: string
  name: string
  cumulative_seeds: number
  wallet: number
}

export const student = {
  submitTask: (lessonId: string, text: string) =>
    callFn('student-actions', { action: 'submit-task', ...creds(), lessonId, text }),
  createQuestion: (lessonId: string, text: string) =>
    callFn('student-actions', { action: 'create-question', ...creds(), lessonId, text }),

  createComment: (questionId: string, text: string) =>
    callFn('student-actions', { action: 'create-comment', ...creds(), questionId, text }),
  updateComment: (commentId: string, text: string) =>
    callFn('student-actions', { action: 'update-comment', ...creds(), commentId, text }),
  deleteComment: (commentId: string) =>
    callFn('student-actions', { action: 'delete-comment', ...creds(), commentId }),

  toggleHeart: (questionId: string) =>
    callFn<{ hearted: boolean; heartCount: number }>('student-actions', {
      action: 'toggle-heart',
      ...creds(),
      questionId,
    }),

  setAvatar: async (dataUrl: string) => {
    const { avatar_url } = await callFn<{ avatar_url: string }>('student-actions', {
      action: 'set-avatar',
      ...creds(),
      dataUrl,
    })
    // 세션의 아바타도 갱신
    const s = getStudent()
    if (s) saveStudent({ ...s, avatar_url })
    return avatar_url
  },

  ranking: () => callFn<{ ranking: RankingRow[]; classTotal: number }>('ranking', {}),
}
