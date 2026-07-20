// 학생 로그인: 학번 + 6자리 코드 검증. 성공 시 코드 제외한 세션 정보 반환.
import { json, parseBody, verifyStudent } from '../lib/admin.js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  const { studentNo, code } = parseBody(event)
  const student = await verifyStudent(studentNo, code)
  if (!student) return json(401, { error: '학번 또는 코드가 올바르지 않습니다.' })
  return json(200, {
    student: {
      id: student.id,
      student_no: student.student_no,
      name: student.name,
      group_id: student.group_id,
      avatar_url: student.avatar_url || null,
    },
  })
}
