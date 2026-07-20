// 학생 쓰기: 질문 등록 / 답변 작성·수정 / 하트 토글.
// 모든 요청은 학번+코드로 재검증한다.
import { admin, json, parseBody, verifyStudent, setSeed, SEED } from '../lib/admin.js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  const body = parseBody(event)
  const me = await verifyStudent(body.studentNo, body.code)
  if (!me) return json(401, { error: '학생 인증 실패' })

  try {
    switch (body.action) {
      // ── 과제 답변 제출/수정 (수업당 1개, upsert) ──
      case 'submit-task': {
        const text = String(body.text || '').trim()
        if (!body.lessonId || !text) return json(400, { error: '과제 답변을 입력하세요.' })
        const { data, error } = await admin
          .from('submissions')
          .upsert(
            { lesson_id: body.lessonId, author_id: me.id, text, updated_at: new Date().toISOString() },
            { onConflict: 'lesson_id,author_id' },
          )
          .select('*')
          .single()
        if (error) throw error
        return json(200, { submission: data })
      }

      // ── 질문 등록 ──
      case 'create-question': {
        const text = String(body.text || '').trim()
        if (!body.lessonId || !text) return json(400, { error: '질문 내용을 입력하세요.' })
        const { data, error } = await admin
          .from('questions')
          .insert({ lesson_id: body.lessonId, author_id: me.id, text })
          .select('*')
          .single()
        if (error) throw error
        return json(200, { question: data })
      }

      // ── 답변 작성 (질문당 1회, 자기 질문 불가) ──
      case 'create-answer': {
        const text = String(body.text || '').trim()
        if (!body.questionId || !text) return json(400, { error: '답변 내용을 입력하세요.' })

        const { data: q } = await admin
          .from('questions')
          .select('id, author_id')
          .eq('id', body.questionId)
          .maybeSingle()
        if (!q) return json(404, { error: '질문을 찾을 수 없습니다.' })
        if (q.author_id === me.id) return json(400, { error: '자기 질문에는 답변할 수 없습니다.' })

        const { data, error } = await admin
          .from('answers')
          .insert({ question_id: body.questionId, author_id: me.id, text, status: 'submitted' })
          .select('*')
          .single()
        if (error) {
          if (error.code === '23505') return json(409, { error: '이미 답변한 질문입니다.' })
          throw error
        }
        return json(200, { answer: data })
      }

      // ── 답변 수정 (본인 답변만; 반려/제출 상태에서만) ──
      case 'update-answer': {
        const text = String(body.text || '').trim()
        if (!body.answerId || !text) return json(400, { error: '답변 내용을 입력하세요.' })
        const { data: a } = await admin
          .from('answers')
          .select('id, author_id, status')
          .eq('id', body.answerId)
          .maybeSingle()
        if (!a) return json(404, { error: '답변을 찾을 수 없습니다.' })
        if (a.author_id !== me.id) return json(403, { error: '본인 답변만 수정할 수 있습니다.' })
        if (a.status === 'approved')
          return json(400, { error: '이미 새싹을 받은 답변은 수정할 수 없습니다.' })

        // 수정하면 다시 '제출' 상태로 → 교사 재검토
        const { data, error } = await admin
          .from('answers')
          .update({ text, status: 'submitted', updated_at: new Date().toISOString() })
          .eq('id', body.answerId)
          .select('*')
          .single()
        if (error) throw error
        return json(200, { answer: data })
      }

      // ── 하트 토글 (자기 질문 제외, 1인 1회) + 보너스 새싹 재조정 ──
      case 'toggle-heart': {
        if (!body.questionId) return json(400, { error: 'questionId 누락' })
        const { data: q } = await admin
          .from('questions')
          .select('id, author_id, lesson_id, lessons(heart_bonus_cap)')
          .eq('id', body.questionId)
          .maybeSingle()
        if (!q) return json(404, { error: '질문을 찾을 수 없습니다.' })
        if (q.author_id === me.id) return json(400, { error: '자기 질문에는 하트를 누를 수 없습니다.' })

        const { data: existing } = await admin
          .from('hearts')
          .select('id')
          .eq('question_id', body.questionId)
          .eq('student_id', me.id)
          .maybeSingle()

        if (existing) {
          await admin.from('hearts').delete().eq('id', existing.id)
        } else {
          await admin.from('hearts').insert({ question_id: body.questionId, student_id: me.id })
        }

        // 현재 하트 수 재계산 → 보너스 새싹 = min(하트수, 상한)
        const { count } = await admin
          .from('hearts')
          .select('id', { count: 'exact', head: true })
          .eq('question_id', body.questionId)
        const cap = q.lessons?.heart_bonus_cap ?? 3
        const bonus = Math.min(count || 0, cap) * SEED.HEART
        await setSeed({
          studentId: q.author_id,
          lessonId: q.lesson_id,
          source: 'heart',
          refId: body.questionId,
          amount: bonus,
          grantedBy: 'system',
        })
        return json(200, { hearted: !existing, heartCount: count || 0 })
      }

      default:
        return json(400, { error: '알 수 없는 action' })
    }
  } catch (e) {
    console.error('[student-actions]', e)
    return json(500, { error: '서버 오류가 발생했습니다.' })
  }
}
