// 교사용 수업(차시) 관리: 목록 / 개설 / 수정 / 삭제 / 활성 토글.
import { admin, json, parseBody, requireTeacher } from '../lib/admin.js'

const STAGES = ['factual', 'divergent', 'meta', 'creative']

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  const body = parseBody(event)
  if (!requireTeacher(body.teacherCode)) return json(401, { error: '교사 인증 실패' })

  try {
    switch (body.action) {
      case 'list': {
        const { data, error } = await admin
          .from('lessons')
          .select('*')
          .order('created_at', { ascending: false })
        if (error) throw error
        return json(200, { lessons: data })
      }

      case 'create':
      case 'update': {
        const p = body.lesson || {}
        const stage = STAGES.includes(p.stage) ? p.stage : 'factual'
        const row = {
          title: String(p.title || '').trim(),
          period_label: p.period_label?.trim() || null,
          content: String(p.content || ''),
          task: String(p.task || ''),
          stage,
          stage_guide: p.stage_guide?.trim() || null,
          heart_bonus_cap: Number.isFinite(+p.heart_bonus_cap) ? Math.max(0, +p.heart_bonus_cap) : 3,
          active: p.active !== false,
        }
        if (!row.title) return json(400, { error: '수업 제목을 입력하세요.' })

        if (body.action === 'create') {
          const { data, error } = await admin.from('lessons').insert(row).select('*').single()
          if (error) throw error
          return json(200, { lesson: data })
        } else {
          if (!p.id) return json(400, { error: 'id 누락' })
          const { data, error } = await admin
            .from('lessons')
            .update(row)
            .eq('id', p.id)
            .select('*')
            .single()
          if (error) throw error
          return json(200, { lesson: data })
        }
      }

      case 'toggle-active': {
        const { id, active } = body
        if (!id) return json(400, { error: 'id 누락' })
        const { data, error } = await admin
          .from('lessons')
          .update({ active: !!active })
          .eq('id', id)
          .select('*')
          .single()
        if (error) throw error
        return json(200, { lesson: data })
      }

      case 'delete': {
        if (!body.id) return json(400, { error: 'id 누락' })
        const { error } = await admin.from('lessons').delete().eq('id', body.id)
        if (error) throw error
        return json(200, { ok: true })
      }

      default:
        return json(400, { error: '알 수 없는 action' })
    }
  } catch (e) {
    console.error('[lessons]', e)
    return json(500, { error: '서버 오류가 발생했습니다.' })
  }
}
