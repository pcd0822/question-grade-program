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

/** @deprecated 답변(answers)은 댓글(Comment)로 대체됐다. 새 코드에서 쓰지 말 것. */
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
  // 누적 새싹. DB 컬럼이 아니라 서버가 seed_log 합계로 계산해 채워 준다(단일 진실 소스).
  cumulative_seeds: number
  avatar_url: string | null
  created_at: string
}

/** 학생 로그인 세션에서 클라이언트가 보관하는 최소 정보 */
export interface StudentSession {
  id: string
  student_no: string
  name: string
  group_id: string | null
  avatar_url: string | null
  code: string // 이후 서버 쓰기 요청 재검증용으로만 로컬 보관
  qid?: string | null // 공개용 식별자 — 내 질문 판별에만 쓴다(마이그레이션 005 이전이면 null)
}

/** 질문에 달리는 실명 댓글 (답변을 대체). 교사 댓글도 포함 */
export interface Comment {
  id: string
  question_id: string
  author_type: 'student' | 'teacher'
  student_id: string | null
  author_name: string
  author_avatar_url: string | null
  text: string
  status: 'normal' | 'approved' | 'rejected'
  teacher_feedback: string | null
  created_at: string
  updated_at: string
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
  // 작성자(학생)의 실제 id. anon 은 이 컬럼을 읽을 수 없다(005) — 서버·교사용.
  author_id?: string
  // 작성자의 공개용 식별자. 학생 화면에서 "내 질문" 판별에만 쓴다.
  // students.id 와 다른 값이라 댓글(실명)과 이어붙여도 작성자를 알 수 없다.
  author_qid?: string | null
  lesson_id: string
  text: string
  seed_granted: boolean // 교사가 이 질문에 새싹을 지급했는지
  created_at: string
}

/** @deprecated 댓글(Comment)이 답변을 대체했다. 마이그레이션 007 에서 테이블도 삭제된다. */
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
  | 'comment' // 댓글에 대한 교사 지급
  | 'submission' // 과제 답변 승인에 대한 교사 지급
  | 'answer' // 답변(레거시)에 대한 교사 지급
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

/** 과제 답변 제출 (수업당 학생 1개) */
export interface Submission {
  id: string
  lesson_id: string
  author_id: string
  text: string
  // 교사 검토 상태(댓글과 동일 모델). approved = 새싹 지급, rejected = 반려(피드백)
  status: 'normal' | 'approved' | 'rejected'
  teacher_feedback: string | null // 반려 시 교사 피드백
  created_at: string
  updated_at: string
}

/** 수업 자료 파일 (교사 업로드 → 학생 다운로드). 실물은 Storage, 메타는 lesson_files 테이블 */
export interface LessonFile {
  id: string
  lesson_id: string
  name: string // 원본 파일명
  url: string // 공개 다운로드 URL
  size: number // 바이트
  mime: string | null
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
