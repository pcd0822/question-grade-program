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
  ANSWER: 2, // 교사가 답변에 지급
  HEART: 1, // 하트 1개당 보너스
}

/** 학생별 누적 새싹 합계 맵 (seed_log 가 단일 진실 소스) */
export async function sumSeedByStudent() {
  const { data } = await admin.from('seed_log').select('student_id, amount')
  const map = new Map()
  for (const r of data || []) map.set(r.student_id, (map.get(r.student_id) || 0) + r.amount)
  return map
}

/**
 * (source, refId) 에 해당하는 새싹 로그를 목표 금액으로 "재조정"한다.
 * 기존 행을 지우고 amount>0 이면 한 줄로 다시 넣는다(멱등).
 * 개인/모둠 누적치는 seed_log 합계로 계산하므로 별도 카운터 갱신은 불필요.
 */
export async function setSeed({ studentId, lessonId, source, refId, amount, grantedBy = 'teacher' }) {
  // 기존 동일 (source, ref_id) 로그 제거
  await admin.from('seed_log').delete().eq('source', source).eq('ref_id', refId)
  if (amount && amount > 0) {
    const { error } = await admin.from('seed_log').insert({
      student_id: studentId,
      lesson_id: lessonId ?? null,
      source,
      ref_id: refId,
      amount,
      granted_by: grantedBy,
    })
    if (error) throw error
  }
}
