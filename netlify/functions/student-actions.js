// 학생 쓰기: 질문 등록 / 댓글(작성·수정·삭제) / 하트 토글 / 과제 제출 / 프로필 사진.
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

      // ── 질문 등록 (익명) ──
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

      // ── 댓글 작성 (실명, 자기 질문에도 가능·여러 개 가능) ──
      case 'create-comment': {
        const text = String(body.text || '').trim()
        if (!body.questionId || !text) return json(400, { error: '댓글 내용을 입력하세요.' })
        const { data, error } = await admin
          .from('comments')
          .insert({
            question_id: body.questionId,
            author_type: 'student',
            student_id: me.id,
            author_name: me.name,
            author_avatar_url: me.avatar_url || null,
            text,
            status: 'normal',
          })
          .select('*')
          .single()
        if (error) throw error
        return json(200, { comment: data })
      }

      // ── 댓글 수정 (본인만; 반려됐으면 normal 로 복귀) ──
      case 'update-comment': {
        const text = String(body.text || '').trim()
        if (!body.commentId || !text) return json(400, { error: '댓글 내용을 입력하세요.' })
        const { data: c } = await admin
          .from('comments')
          .select('id, student_id')
          .eq('id', body.commentId)
          .maybeSingle()
        if (!c) return json(404, { error: '댓글을 찾을 수 없습니다.' })
        if (c.student_id !== me.id) return json(403, { error: '본인 댓글만 수정할 수 있습니다.' })
        const { data, error } = await admin
          .from('comments')
          .update({ text, status: 'normal', updated_at: new Date().toISOString() })
          .eq('id', body.commentId)
          .select('*')
          .single()
        if (error) throw error
        return json(200, { comment: data })
      }

      // ── 댓글 삭제 (본인만) + 지급됐던 새싹 회수 ──
      case 'delete-comment': {
        const { data: c } = await admin
          .from('comments')
          .select('id, student_id')
          .eq('id', body.commentId)
          .maybeSingle()
        if (!c) return json(404, { error: '댓글을 찾을 수 없습니다.' })
        if (c.student_id !== me.id) return json(403, { error: '본인 댓글만 삭제할 수 있습니다.' })
        await setSeed({ source: 'comment', refId: body.commentId, amount: 0 })
        await admin.from('comments').delete().eq('id', body.commentId)
        return json(200, { ok: true })
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

        if (existing) await admin.from('hearts').delete().eq('id', existing.id)
        else await admin.from('hearts').insert({ question_id: body.questionId, student_id: me.id })

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

      // ── 프로필 사진 업로드 (dataURL → Storage → students.avatar_url) ──
      case 'set-avatar': {
        const dataUrl = String(body.dataUrl || '')
        const m = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/)
        if (!m) return json(400, { error: '이미지 형식이 올바르지 않습니다.' })
        const mime = m[1]
        const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
        const buffer = Buffer.from(m[3], 'base64')
        if (buffer.length > 2 * 1024 * 1024) return json(400, { error: '이미지가 너무 큽니다(2MB 이하).' })

        const path = `${me.id}.${ext}`
        const { error: upErr } = await admin.storage
          .from('avatars')
          .upload(path, buffer, { contentType: mime, upsert: true })
        if (upErr) throw upErr
        const { data: pub } = admin.storage.from('avatars').getPublicUrl(path)
        // 캐시 무력화용 쿼리스트링
        const url = `${pub.publicUrl}?v=${Date.now()}`

        await admin.from('students').update({ avatar_url: url }).eq('id', me.id)
        // 이미 남긴 댓글의 아바타도 갱신
        await admin.from('comments').update({ author_avatar_url: url }).eq('student_id', me.id)
        return json(200, { avatar_url: url })
      }

      default:
        return json(400, { error: '알 수 없는 action' })
    }
  } catch (e) {
    console.error('[student-actions]', e)
    return json(500, { error: '서버 오류가 발생했습니다.' })
  }
}
