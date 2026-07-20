// 교사 쓰기: 질문 새싹, 댓글 새싹/반려, 교사 댓글(피드백) 작성.
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
        })
        return json(200, { ok: true, seed_granted: on })
      }

      // ── 댓글 새싹 지급/취소 (토글, 학생 댓글만) ──
      case 'grant-comment-seed': {
        const on = body.on !== false
        const { data: c } = await admin
          .from('comments')
          .select('id, student_id, author_type, question_id, questions(lesson_id)')
          .eq('id', body.commentId)
          .maybeSingle()
        if (!c) return json(404, { error: '댓글을 찾을 수 없습니다.' })
        if (c.author_type !== 'student' || !c.student_id)
          return json(400, { error: '학생 댓글에만 새싹을 지급할 수 있습니다.' })

        await admin
          .from('comments')
          .update({ status: on ? 'approved' : 'normal' })
          .eq('id', c.id)
        await setSeed({
          studentId: c.student_id,
          lessonId: c.questions?.lesson_id ?? null,
          source: 'comment',
          refId: c.id,
          amount: on ? SEED.ANSWER : 0,
        })
        return json(200, { ok: true, status: on ? 'approved' : 'normal' })
      }

      // ── 댓글 반려 + 피드백 ──
      case 'reject-comment': {
        const feedback = String(body.feedback || '').trim()
        if (!body.commentId) return json(400, { error: 'commentId 누락' })
        if (!feedback) return json(400, { error: '반려 사유(피드백)를 입력하세요.' })
        const { data: c } = await admin
          .from('comments')
          .select('id, author_type')
          .eq('id', body.commentId)
          .maybeSingle()
        if (!c) return json(404, { error: '댓글을 찾을 수 없습니다.' })
        if (c.author_type !== 'student') return json(400, { error: '학생 댓글만 반려할 수 있습니다.' })

        await admin
          .from('comments')
          .update({ status: 'rejected', teacher_feedback: feedback })
          .eq('id', body.commentId)
        await setSeed({ source: 'comment', refId: body.commentId, amount: 0 })
        return json(200, { ok: true })
      }

      // ── 교사 댓글(피드백) 작성 ──
      case 'add-teacher-comment': {
        const text = String(body.text || '').trim()
        if (!body.questionId || !text) return json(400, { error: '댓글 내용을 입력하세요.' })
        const { data: setting } = await admin
          .from('app_settings')
          .select('value')
          .eq('key', 'teacher_avatar_url')
          .maybeSingle()
        const { data, error } = await admin
          .from('comments')
          .insert({
            question_id: body.questionId,
            author_type: 'teacher',
            student_id: null,
            author_name: '선생님',
            author_avatar_url: setting?.value || null,
            text,
            status: 'normal',
          })
          .select('*')
          .single()
        if (error) throw error
        return json(200, { comment: data })
      }

      // ── 교사 댓글 삭제 ──
      case 'delete-teacher-comment': {
        const { data: c } = await admin
          .from('comments')
          .select('id, author_type')
          .eq('id', body.commentId)
          .maybeSingle()
        if (!c) return json(404, { error: '댓글을 찾을 수 없습니다.' })
        if (c.author_type !== 'teacher') return json(400, { error: '교사 댓글만 삭제할 수 있습니다.' })
        await admin.from('comments').delete().eq('id', body.commentId)
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
