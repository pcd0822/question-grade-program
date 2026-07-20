// ─────────────────────────────────────────────────────────────
// 도메인 타입 (Supabase 테이블과 1:1 대응)
// 포인트 명칭은 "새싹"(seed)으로 통일한다.
// ─────────────────────────────────────────────────────────────

/** 이번 차시 질문 단계 */
export type QuestionStage =
  | 'factual' // 사실적 질문
  | 'divergent' // 발산적 질문
  | 'meta' // 메타·종합 질문
  | 'creative' // 창의·평가 질문

export const STAGE_LABEL: Record<QuestionStage, string> = {
  factual: '사실적 질문',
  divergent: '발산적 질문',
  meta: '메타·종합 질문',
  creative: '창의·평가 질문',
}

/** 답변 상태 */
export type AnswerStatus =
  | 'submitted' // 제출됨(미검토)
  | 'approved' // 교사가 새싹 지급(승인)
  | 'rejected' // 교사가 반려(피드백 있음)

/** 모둠 */
export interface Group {
  id: string
  name: string
  spent_seeds: number // 지갑에서 아이템 구매로 차감된 누적치
  created_at: string
}

/** 학생 (code 는 민감정보 — 교사/서버만 접근) */
export interface Student {
  id: string
  student_no: string // 학번
  name: string
  code: string // 6자리 개별 로그인 코드
  group_id: string | null
  cumulative_seeds: number // 누적 새싹(랭킹 기준, 감소하지 않음)
  created_at: string
}

/** 학생 로그인 세션에서 클라이언트가 보관하는 최소 정보(코드 제외) */
export interface StudentSession {
  id: string
  student_no: string
  name: string
  group_id: string | null
  code: string // 이후 서버 쓰기 요청 재검증용으로만 로컬 보관
}

/** 수업(차시) */
export interface Lesson {
  id: string
  title: string
  period_label: string | null // 차시 정보 (예: "1차시")
  content: string // 수업 내용 / 제시문
  task: string // 과제 설명
  stage: QuestionStage // 이번 차시 질문 단계
  stage_guide: string | null // 신호어 등 안내문
  heart_bonus_cap: number // 질문당 하트 보너스 새싹 상한
  active: boolean
  created_at: string
}

/** 질문 */
export interface Question {
  id: string
  lesson_id: string
  author_id: string // 작성자(학생). 학생 화면에서는 숨김(익명)
  text: string
  seed_granted: boolean // 교사가 이 질문에 새싹을 지급했는지
  created_at: string
}

/** 답변 (한 학생당 한 질문에 하나) */
export interface Answer {
  id: string
  question_id: string
  author_id: string
  text: string
  status: AnswerStatus
  teacher_feedback: string | null // 반려 시 교사 대댓글
  created_at: string
  updated_at: string
}

/** 하트(동료 추천) — (question_id, student_id) 유니크 */
export interface Heart {
  id: string
  question_id: string
  student_id: string
  created_at: string
}

/** 배지 (수업별 등록) */
export interface Badge {
  id: string
  lesson_id: string
  name: string
  image_url: string | null
  condition: string // 부여 조건(텍스트)
  created_at: string
}

/** 학생에게 부여된 배지 (교사 수동 부여) */
export interface StudentBadge {
  id: string
  student_id: string
  badge_id: string
  granted_at: string
}

/** 새싹 지급 로그 (형성평가 증빙 · CSV 내보내기) */
export type SeedSource =
  | 'question' // 질문에 대한 교사 지급
  | 'answer' // 답변에 대한 교사 지급
  | 'heart' // 하트 보너스(시스템 자동)
  | 'manual' // 기타 수동 조정

export interface SeedLog {
  id: string
  student_id: string
  lesson_id: string | null
  source: SeedSource
  ref_id: string | null // 관련 질문/답변 id
  amount: number // 지급 새싹 수(취소 시 음수 기록 또는 행 삭제)
  granted_by: string // 'teacher' | 'system'
  created_at: string
}

/** 모둠 공간에 배치된 아이템 */
export interface RoomItem {
  id: string
  group_id: string
  item_type: string // 상점 카탈로그 키 (책상/화분/액자 등)
  x: number
  y: number
  created_at: string
}
