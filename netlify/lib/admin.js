// Netlify Functions 공용 헬퍼.
// service_role 키로 Supabase 에 접근하므로 절대 클라이언트로 노출되면 안 된다.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

/** service_role Supabase 클라이언트 (RLS 우회) */
export const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** 교사 로그인 코드 (Netlify 환경변수) */
export const TEACHER_CODE = process.env.TEACHER_CODE || '0822'

/** JSON 응답 헬퍼 */
export function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  }
}

/** 요청 body 파싱 (실패 시 빈 객체) */
export function parseBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {}
  } catch {
    return {}
  }
}

/** 교사 코드 검증 */
export function requireTeacher(code) {
  return typeof code === 'string' && code === TEACHER_CODE
}

/**
 * 학생 자격 검증: 학번 + 코드 일치 시 학생 레코드 반환, 아니면 null.
 * 서버 전용(코드 대조는 service_role 로만).
 */
export async function verifyStudent(studentNo, code) {
  if (!studentNo || !code) return null
  const { data, error } = await admin
    .from('students')
    .select('id, student_no, name, group_id, code, avatar_url')
    .eq('student_no', String(studentNo).trim())
    .maybeSingle()
  if (error || !data) return null
  if (data.code !== String(code).trim().toUpperCase()) return null
  return data
}

/**
 * 학생의 공개용 식별자(qid). students.id 와 다른 UUID 라서
 * anon 이 댓글(실명)과 질문 작성자를 이어붙이지 못하게 막는다.
 * 마이그레이션 005 이전 환경에서는 컬럼이 없으므로 null 을 돌려준다.
 */
export async function getStudentQid(studentId) {
  const { data, error } = await admin.from('students').select('qid').eq('id', studentId).maybeSingle()
  if (error || !data) return null
  return data.qid ?? null
}

// 혼동하기 쉬운 문자(0/O, 1/I 등) 제외한 6자리 코드 문자셋
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** 6자리 개별 코드 생성 (crypto 기반) */
export function generateCode() {
  // Node 18+ 전역 crypto 사용
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  let out = ''
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out
}

/** 충돌 없는 유니크 코드 생성 (students 전체에서 중복 회피) */
export async function generateUniqueCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode()
    const { data } = await admin.from('students').select('id').eq('code', code).maybeSingle()
    if (!data) return code
  }
  // 극히 드묾: 마지막 시도값 그대로 반환
  return generateCode()
}

// ── 새싹 지급 규칙 ──────────────────────────────────────────────
export const SEED = {
  QUESTION: 1, // 교사가 질문에 지급
  COMMENT: 2, // 교사가 (좋은) 댓글에 지급 — 답변(answers)을 대체한 개념
  HEART: 1, // 하트 1개당 보너스
}

/**
 * PostgREST 는 한 번에 최대 1000행만 준다. 그 이상을 확실히 다 읽기 위한 페이지 루프.
 * 사용 예: fetchAll((from, to) => admin.from('seed_log').select('*').range(from, to))
 */
export async function fetchAll(queryFn, pageSize = 1000) {
  const out = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFn(from, from + pageSize - 1)
    if (error) throw error
    const rows = data || []
    out.push(...rows)
    if (rows.length < pageSize) return out
  }
}

/**
 * 학생별 누적 새싹 합계 맵 (seed_log 가 단일 진실 소스).
 * DB 집계 함수(seed_totals)를 우선 사용하고, 아직 마이그레이션(006)을 안 돌렸으면
 * 전체 행을 페이지 루프로 읽어 합산하는 방식으로 자동 폴백한다.
 */
export async function sumSeedByStudent() {
  const map = new Map()
  const { data, error } = await admin.rpc('seed_totals')
  if (!error) {
    for (const r of data || []) map.set(r.student_id, Number(r.total) || 0)
    return map
  }
  if (!isMissingFunction(error)) throw error
  // 폴백: 006 미적용 환경
  const rows = await fetchAll((from, to) =>
    admin.from('seed_log').select('student_id, amount').range(from, to),
  )
  for (const r of rows) map.set(r.student_id, (map.get(r.student_id) || 0) + r.amount)
  return map
}

/**
 * (source, refId) 에 해당하는 새싹 로그를 목표 금액으로 "재조정"한다(멱등).
 *
 * 006 이후에는 DB 함수 set_seed 로 단일 upsert 를 수행한다.
 * 예전의 "삭제 후 삽입"은 두 요청이 겹치면 로그가 두 줄 생겨 새싹이 두 배가 됐다.
 */
export async function setSeed({ studentId, lessonId, source, refId, amount, grantedBy = 'teacher' }) {
  const { error } = await admin.rpc('set_seed', {
    p_student: studentId ?? null,
    p_lesson: lessonId ?? null,
    p_source: source,
    p_ref: refId ?? null,
    p_amount: amount && amount > 0 ? amount : 0,
    p_granted_by: grantedBy,
  })
  if (!error) return
  if (!isMissingFunction(error)) throw error

  // 폴백: 006 미적용 환경 (경합에 취약하므로 마이그레이션을 꼭 실행할 것)
  await admin.from('seed_log').delete().eq('source', source).eq('ref_id', refId)
  if (amount && amount > 0) {
    const { error: insErr } = await admin.from('seed_log').insert({
      student_id: studentId,
      lesson_id: lessonId ?? null,
      source,
      ref_id: refId,
      amount,
      granted_by: grantedBy,
    })
    if (insErr) throw insErr
  }
}

/**
 * 하트 토글 + 보너스 새싹 재조정.
 * 006 이후에는 DB 함수(toggle_heart)가 질문 행을 잠그고 한 트랜잭션에서 처리하므로
 * 같은 질문에 동시 요청이 몰려도 하트 수·보너스가 어긋나지 않는다.
 *
 * 반환: { hearted, heartCount } | { error: 'question_not_found' | 'own_question' }
 */
export async function toggleHeart(questionId, studentId) {
  const { data, error } = await admin.rpc('toggle_heart', {
    p_question: questionId,
    p_student: studentId,
    p_per_heart: SEED.HEART,
  })
  if (!error) {
    const row = Array.isArray(data) ? data[0] : data
    return { hearted: !!row?.hearted, heartCount: row?.heart_count ?? 0 }
  }
  if (!isMissingFunction(error)) {
    const name = pgErrorName(error)
    if (name.includes('question_not_found')) return { error: 'question_not_found' }
    if (name.includes('own_question')) return { error: 'own_question' }
    throw error
  }

  // ── 폴백: 006 미적용 환경 ──
  // 경합에 취약하다(동시 하트 시 보너스가 어긋날 수 있음). 마이그레이션을 꼭 실행할 것.
  const { data: q } = await admin
    .from('questions')
    .select('id, author_id, lesson_id, lessons(heart_bonus_cap)')
    .eq('id', questionId)
    .maybeSingle()
  if (!q) return { error: 'question_not_found' }
  if (q.author_id === studentId) return { error: 'own_question' }

  const { data: existing } = await admin
    .from('hearts')
    .select('id')
    .eq('question_id', questionId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (existing) {
    await admin.from('hearts').delete().eq('id', existing.id)
  } else {
    const { error: insErr } = await admin.from('hearts').insert({ question_id: questionId, student_id: studentId })
    // 23505 = 동시 클릭으로 이미 들어간 경우. 눌린 것으로 간주하고 계속 진행한다.
    if (insErr && insErr.code !== '23505') throw insErr
  }

  const { count } = await admin
    .from('hearts')
    .select('id', { count: 'exact', head: true })
    .eq('question_id', questionId)
  const cap = q.lessons?.heart_bonus_cap ?? 3
  await setSeed({
    studentId: q.author_id,
    lessonId: q.lesson_id,
    source: 'heart',
    refId: questionId,
    amount: Math.min(count || 0, cap) * SEED.HEART,
    grantedBy: 'system',
  })
  return { hearted: !existing, heartCount: count || 0 }
}

/** RPC 대상 함수가 아직 없는 경우(마이그레이션 미적용)인지 판별 */
export function isMissingFunction(error) {
  // PGRST202 = PostgREST 스키마 캐시에 해당 함수 없음, 42883 = undefined_function
  return error?.code === 'PGRST202' || error?.code === '42883'
}

/** plpgsql 이 raise 한 사용자 예외 이름 추출 (예: 'insufficient_seeds') */
export function pgErrorName(error) {
  return String(error?.message || '').trim()
}
