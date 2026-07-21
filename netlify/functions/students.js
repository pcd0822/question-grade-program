// 교사용 학생 관리: 목록 조회 / 등록(코드 자동생성) / 코드 재발급 / 삭제.
// 모든 동작은 교사 코드로 보호한다.
//
// 주의: students.cumulative_seeds 컬럼은 절대 읽지 않는다(항상 0인 죽은 컬럼).
// 누적 새싹의 단일 진실 소스는 seed_log 이므로 sumSeedByStudent() 로 계산해 붙인다.
import { admin, json, parseBody, requireTeacher, generateUniqueCode, sumSeedByStudent } from '../lib/admin.js'

const COLUMNS = 'id, student_no, name, code, group_id, avatar_url, created_at'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  const body = parseBody(event)
  const { action, teacherCode } = body

  if (!requireTeacher(teacherCode)) return json(401, { error: '교사 인증 실패' })

  try {
    switch (action) {
      case 'list': {
        const [{ data, error }, totals] = await Promise.all([
          admin.from('students').select(COLUMNS).order('student_no', { ascending: true }),
          sumSeedByStudent(),
        ])
        if (error) throw error
        const students = (data || []).map((s) => ({ ...s, cumulative_seeds: totals.get(s.id) || 0 }))
        return json(200, { students })
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

        // 코드 유니크 제약(006)에 걸리면 새 코드로 재시도한다.
        let data, error
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = await generateUniqueCode()
          ;({ data, error } = await admin
            .from('students')
            .insert({ student_no: studentNo, name, code })
            .select(COLUMNS)
            .single())
          if (!error) break
          if (error.code !== '23505') throw error
          // 학번 중복이면 재시도해도 소용없다
          if (String(error.message || '').includes('student_no')) return json(409, { error: '이미 등록된 학번입니다.' })
        }
        if (error) throw error
        return json(200, { student: { ...data, cumulative_seeds: 0 } })
      }

      case 'regenerate': {
        const { id } = body
        if (!id) return json(400, { error: 'id 누락' })
        let data, error
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = await generateUniqueCode()
          ;({ data, error } = await admin
            .from('students')
            .update({ code })
            .eq('id', id)
            .select(COLUMNS)
            .single())
          if (!error) break
          if (error.code !== '23505') throw error
        }
        if (error) throw error
        const totals = await sumSeedByStudent()
        return json(200, { student: { ...data, cumulative_seeds: totals.get(data.id) || 0 } })
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
