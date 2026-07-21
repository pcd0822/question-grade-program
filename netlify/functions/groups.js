// 교사용 모둠 관리 + 새싹 통계(개별/모둠/학급) + 새싹 획득 내역(형성평가 증빙).
import { admin, json, parseBody, requireTeacher, sumSeedByStudent, fetchAll } from '../lib/admin.js'

const SOURCE_LABEL = {
  question: '질문',
  comment: '댓글',
  answer: '답변(구)',
  heart: '하트 보너스',
  manual: '수동 조정',
}

/** 긴 본문은 증빙 표에서 읽기 좋게 자른다 */
function excerpt(text, max = 60) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

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
            .select('id, student_no, name, code, group_id, avatar_url')
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

      // ── 새싹 획득 상세 내역 (형성평가 증빙 CSV 원본) ──
      // 학생별로 "언제 · 무엇으로 · 몇 개" 받았는지 한 줄씩. 근거가 된 질문/댓글 본문도 함께.
      case 'seed-report': {
        const [logs, students, groups, lessons] = await Promise.all([
          fetchAll((from, to) =>
            admin
              .from('seed_log')
              .select('student_id, lesson_id, source, ref_id, amount, granted_by, created_at')
              .order('created_at', { ascending: true })
              .range(from, to),
          ),
          fetchAll((from, to) =>
            admin.from('students').select('id, student_no, name, group_id').range(from, to),
          ),
          fetchAll((from, to) => admin.from('groups').select('id, name').range(from, to)),
          fetchAll((from, to) =>
            admin.from('lessons').select('id, title, period_label').range(from, to),
          ),
        ])

        // 근거 본문은 실제로 참조된 id 만 골라 조회한다.
        const qIds = [...new Set(logs.filter((l) => l.source === 'question' || l.source === 'heart').map((l) => l.ref_id).filter(Boolean))]
        const cIds = [...new Set(logs.filter((l) => l.source === 'comment' || l.source === 'answer').map((l) => l.ref_id).filter(Boolean))]
        const [questions, comments] = await Promise.all([
          qIds.length
            ? fetchAll((from, to) => admin.from('questions').select('id, text').in('id', qIds).range(from, to))
            : Promise.resolve([]),
          cIds.length
            ? fetchAll((from, to) => admin.from('comments').select('id, text').in('id', cIds).range(from, to))
            : Promise.resolve([]),
        ])

        const studentOf = new Map(students.map((s) => [s.id, s]))
        const groupName = new Map(groups.map((g) => [g.id, g.name]))
        const lessonOf = new Map(lessons.map((l) => [l.id, l]))
        const refText = new Map([
          ...questions.map((q) => [q.id, q.text]),
          ...comments.map((c) => [c.id, c.text]),
        ])

        const rows = logs.map((l) => {
          const s = studentOf.get(l.student_id)
          const lesson = l.lesson_id ? lessonOf.get(l.lesson_id) : null
          return {
            created_at: l.created_at,
            student_no: s?.student_no || '(삭제된 학생)',
            name: s?.name || '',
            group_name: s?.group_id ? groupName.get(s.group_id) || '' : '',
            lesson_title: lesson ? [lesson.period_label, lesson.title].filter(Boolean).join(' ') : '',
            source: l.source,
            source_label: SOURCE_LABEL[l.source] || l.source,
            amount: l.amount,
            granted_by: l.granted_by,
            ref_excerpt: excerpt(refText.get(l.ref_id)),
          }
        })

        // 학번 → 시간 순으로 정렬해 학생별로 묶어 읽기 좋게
        rows.sort(
          (a, b) =>
            a.student_no.localeCompare(b.student_no, 'ko', { numeric: true }) ||
            a.created_at.localeCompare(b.created_at),
        )
        return json(200, { rows })
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
