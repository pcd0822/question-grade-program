// 교사 쓰기: 질문 새싹 지급/취소, 답변 새싹 지급/취소, 답변 반려(피드백).
import { admin, json, parseBody, requireTeacher, setSeed, SEED } from '../lib/admin.js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  const body = parseBody(event)
  if (!requireTeacher(body.teacherCode)) return json(401, { error: '교사 인증 실패' })

  try {
    switch (body.action) {
      // ── 질문 새싹 지급/취소 (토글) ──
      case 'grant-question-seed': {
        const on = body.on !== false
        const { data: q } = await admin
          .from('questions')
          .select('id, author_id, lesson_id')
          .eq('id', body.questionId)
          .maybeSingle()
        if (!q) return json(404, { error: '질문을 찾을 수 없습니다.' })

        await admin.from('questions').update({ seed_granted: on }).eq('id', q.id)
        await setSeed({
          studentId: q.author_id,
          lessonId: q.lesson_id,
          source: 'question',
          refId: q.id,
          amount: on ? SEED.QUESTION : 0,
          grantedBy: 'teacher',
        })
        return json(200, { ok: true, seed_granted: on })
      }

      // ── 답변 새싹 지급/취소 (토글) ──
      case 'grant-answer-seed': {
        const on = body.on !== false
        const { data: a } = await admin
          .from('answers')
          .select('id, author_id, question_id, questions(lesson_id)')
          .eq('id', body.answerId)
          .maybeSingle()
        if (!a) return json(404, { error: '답변을 찾을 수 없습니다.' })

        await admin
          .from('answers')
          .update({ status: on ? 'approved' : 'submitted' })
          .eq('id', a.id)
        await setSeed({
          studentId: a.author_id,
          lessonId: a.questions?.lesson_id ?? null,
          source: 'answer',
          refId: a.id,
          amount: on ? SEED.ANSWER : 0,
          grantedBy: 'teacher',
        })
        return json(200, { ok: true, status: on ? 'approved' : 'submitted' })
      }

      // ── 답변 반려 + 피드백 (대댓글) ──
      case 'reject-answer': {
        const feedback = String(body.feedback || '').trim()
        if (!body.answerId) return json(400, { error: 'answerId 누락' })
        if (!feedback) return json(400, { error: '반려 사유(피드백)를 입력하세요.' })
        const { data: a } = await admin
          .from('answers')
          .select('id')
          .eq('id', body.answerId)
          .maybeSingle()
        if (!a) return json(404, { error: '답변을 찾을 수 없습니다.' })

        await admin
          .from('answers')
          .update({ status: 'rejected', teacher_feedback: feedback })
          .eq('id', body.answerId)
        // 반려 시 혹시 지급됐던 답변 새싹은 회수
        await setSeed({ source: 'answer', refId: body.answerId, amount: 0 })
        return json(200, { ok: true })
      }

      default:
        return json(400, { error: '알 수 없는 action' })
    }
  } catch (e) {
    console.error('[teacher-actions]', e)
    return json(500, { error: '서버 오류가 발생했습니다.' })
  }
}
