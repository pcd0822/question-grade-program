// 교사 로그인: 코드 검증만 수행한다.
import { json, parseBody, requireTeacher } from '../lib/admin.js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  const { code } = parseBody(event)
  if (!requireTeacher(code)) return json(401, { error: '교사 코드가 일치하지 않습니다.' })
  return json(200, { ok: true })
}
