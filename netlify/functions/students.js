// 교사용 학생 관리: 목록 조회 / 등록(코드 자동생성) / 코드 재발급 / 삭제.
// 모든 동작은 교사 코드로 보호한다.
import { admin, json, parseBody, requireTeacher, generateUniqueCode } from '../lib/admin.js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  const body = parseBody(event)
  const { action, teacherCode } = body

  if (!requireTeacher(teacherCode)) return json(401, { error: '교사 인증 실패' })

  try {
    switch (action) {
      case 'list': {
        const { data, error } = await admin
          .from('students')
          .select('id, student_no, name, code, group_id, cumulative_seeds, created_at')
          .order('student_no', { ascending: true })
        if (error) throw error
        return json(200, { students: data })
      }

      case 'add': {
        const studentNo = String(body.studentNo || '').trim()
        const name = String(body.name || '').trim()
        if (!studentNo || !name) return json(400, { error: '학번과 이름을 입력하세요.' })

        // 학번 중복 확인
        const { data: exist } = await admin
          .from('students')
          .select('id')
          .eq('student_no', studentNo)
          .maybeSingle()
        if (exist) return json(409, { error: '이미 등록된 학번입니다.' })

        const code = await generateUniqueCode()
        const { data, error } = await admin
          .from('students')
          .insert({ student_no: studentNo, name, code })
          .select('id, student_no, name, code, group_id, cumulative_seeds, created_at')
          .single()
        if (error) throw error
        return json(200, { student: data })
      }

      case 'regenerate': {
        const { id } = body
        if (!id) return json(400, { error: 'id 누락' })
        const code = await generateUniqueCode()
        const { data, error } = await admin
          .from('students')
          .update({ code })
          .eq('id', id)
          .select('id, student_no, name, code, group_id, cumulative_seeds, created_at')
          .single()
        if (error) throw error
        return json(200, { student: data })
      }

      case 'delete': {
        const { id } = body
        if (!id) return json(400, { error: 'id 누락' })
        const { error } = await admin.from('students').delete().eq('id', id)
        if (error) throw error
        return json(200, { ok: true })
      }

      default:
        return json(400, { error: '알 수 없는 action' })
    }
  } catch (e) {
    console.error('[students]', e)
    return json(500, { error: '서버 오류가 발생했습니다.' })
  }
}
