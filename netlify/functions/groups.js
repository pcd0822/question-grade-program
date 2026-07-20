// 교사용 모둠 관리 + 새싹 통계(개별/모둠/학급).
import { admin, json, parseBody, requireTeacher, sumSeedByStudent } from '../lib/admin.js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  const body = parseBody(event)
  if (!requireTeacher(body.teacherCode)) return json(401, { error: '교사 인증 실패' })

  try {
    switch (body.action) {
      // ── 모둠 + 학생 + 통계 한 번에 ──
      case 'overview': {
        const [{ data: groups }, { data: students }, totals] = await Promise.all([
          admin.from('groups').select('*').order('created_at', { ascending: true }),
          admin
            .from('students')
            .select('id, student_no, name, group_id, avatar_url')
            .order('student_no', { ascending: true }),
          sumSeedByStudent(),
        ])

        const studentRows = (students || []).map((s) => ({
          ...s,
          cumulative_seeds: totals.get(s.id) || 0,
        }))

        const groupRows = (groups || []).map((g) => {
          const members = studentRows.filter((s) => s.group_id === g.id)
          const cumulative = members.reduce((sum, m) => sum + m.cumulative_seeds, 0)
          return {
            ...g,
            members,
            cumulative_seeds: cumulative,
            wallet: cumulative - (g.spent_seeds || 0),
          }
        })

        const classTotal = studentRows.reduce((sum, s) => sum + s.cumulative_seeds, 0)
        const groupCount = groupRows.length
        const groupCumSum = groupRows.reduce((sum, g) => sum + g.cumulative_seeds, 0)
        return json(200, {
          students: studentRows,
          groups: groupRows,
          stats: {
            classTotal,
            // 모둠 평균 = 각 모둠 누적의 평균(미배정 학생 새싹 제외)
            groupAvg: groupCount ? Math.round(groupCumSum / groupCount) : 0,
            studentAvg: studentRows.length ? Math.round(classTotal / studentRows.length) : 0,
          },
        })
      }

      case 'create-group': {
        const name = String(body.name || '').trim()
        if (!name) return json(400, { error: '모둠 이름을 입력하세요.' })
        const { data, error } = await admin.from('groups').insert({ name }).select('*').single()
        if (error) throw error
        return json(200, { group: data })
      }

      case 'rename-group': {
        const name = String(body.name || '').trim()
        if (!body.id || !name) return json(400, { error: '이름 누락' })
        const { error } = await admin.from('groups').update({ name }).eq('id', body.id)
        if (error) throw error
        return json(200, { ok: true })
      }

      case 'delete-group': {
        if (!body.id) return json(400, { error: 'id 누락' })
        // 소속 학생은 미배정(null)로 (on delete set null 이지만 명시)
        await admin.from('students').update({ group_id: null }).eq('group_id', body.id)
        await admin.from('groups').delete().eq('id', body.id)
        return json(200, { ok: true })
      }

      case 'assign': {
        // studentId 를 groupId(또는 null)로 배정
        if (!body.studentId) return json(400, { error: 'studentId 누락' })
        const { error } = await admin
          .from('students')
          .update({ group_id: body.groupId || null })
          .eq('id', body.studentId)
        if (error) throw error
        return json(200, { ok: true })
      }

      default:
        return json(400, { error: '알 수 없는 action' })
    }
  } catch (e) {
    console.error('[groups]', e)
    return json(500, { error: '서버 오류가 발생했습니다.' })
  }
}
