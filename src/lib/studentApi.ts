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

  // 모둠 채팅
  sendChat: (text: string) => callFn('student-actions', { action: 'send-chat', ...creds(), text }),
  deleteChat: (messageId: string) =>
    callFn('student-actions', { action: 'delete-chat', ...creds(), messageId }),
}

// ── 모둠 공간 ──
export interface ShopItem {
  type: string
  name: string
  emoji: string
  price: number
}
/** 모둠 공간 아이템. x·y 는 격자 칸이 아니라 공간 내 비율(0~100). */
export interface RoomItemT {
  id: string
  group_id: string
  item_type: string
  x: number
  y: number
}

/** 모둠 채팅 메시지 */
export interface ChatMessage {
  id: string
  group_id: string
  student_id: string | null
  author_name: string
  author_avatar_url: string | null
  text: string
  created_at: string
}
export interface RoomBadge {
  id: string
  name: string
  image_url: string | null
  student_name: string
}
export interface RoomMember {
  id: string
  name: string
  avatar_url: string | null
}
export interface RoomState {
  group: { id: string; name: string } | null
  cumulative: number
  wallet: number
  items: RoomItemT[]
  members: RoomMember[]
  badges: RoomBadge[]
}

export const room = {
  catalog: () => callFn<{ shop: ShopItem[]; cols: number; rows: number }>('room', { action: 'catalog' }),
  // 모둠원 실명이 담기므로 서버가 학생 인증을 요구한다.
  state: (groupId: string) => callFn<RoomState>('room', { action: 'state', ...creds(), groupId }),
  // x·y 는 공간 내 비율(0~100). 생략하면 바닥 가운데쯤에 놓인다.
  buy: (itemType: string, x?: number, y?: number) =>
    callFn<RoomState>('room', { action: 'buy', ...creds(), itemType, x, y }),
  move: (itemId: string, x: number, y: number) =>
    callFn<RoomState>('room', { action: 'move', ...creds(), itemId, x, y }),
  remove: (itemId: string) => callFn<RoomState>('room', { action: 'remove', ...creds(), itemId }),
}
