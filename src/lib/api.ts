// Netlify Functions 호출 헬퍼.
// 모든 "쓰기"와 로그인은 이 함수를 통해 서버(service_role)로 간다.
const BASE = '/.netlify/functions'

export async function callFn<T = unknown>(name: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `요청 실패 (${res.status})`)
  }
  return data as T
}
