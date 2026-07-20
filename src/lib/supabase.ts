import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  // 개발 초기 설정 실수를 빨리 알아채기 위한 경고
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 설정되지 않았습니다. .env 를 확인하세요.',
  )
}

/**
 * 브라우저용 Supabase 클라이언트 (anon 키).
 * - 읽기 / Realtime 구독 전용으로 사용한다.
 * - 새싹 지급·반려·학생 관리 등 "쓰기"는 절대 여기서 하지 말고
 *   Netlify Functions(service_role 키 보관)를 통해서만 수행한다.
 */
export const supabase = createClient(url, anonKey, {
  auth: {
    // 우리는 Supabase Auth 세션을 쓰지 않는다(학번+코드 자체 인증).
    persistSession: false,
    autoRefreshToken: false,
  },
})
