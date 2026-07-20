// 교사용 배지 관리: 등록(이미지 업로드) / 목록 / 삭제 / 학생 부여·회수.
import { admin, json, parseBody, requireTeacher } from '../lib/admin.js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  const body = parseBody(event)
  if (!requireTeacher(body.teacherCode)) return json(401, { error: '교사 인증 실패' })

  try {
    switch (body.action) {
      case 'list': {
        const [{ data: badges }, { data: awarded }] = await Promise.all([
          admin.from('badges').select('*').order('created_at', { ascending: true }),
          admin.from('student_badges').select('student_id, badge_id'),
        ])
        return json(200, { badges: badges || [], awarded: awarded || [] })
      }

      case 'create': {
        const name = String(body.name || '').trim()
        if (!name) return json(400, { error: '배지 이름을 입력하세요.' })
        const { data: badge, error } = await admin
          .from('badges')
          .insert({
            name,
            condition: String(body.condition || '').trim(),
            lesson_id: body.lessonId || null,
          })
          .select('*')
          .single()
        if (error) throw error

        // 이미지 업로드(선택)
        const dataUrl = String(body.imageDataUrl || '')
        const m = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/)
        if (m) {
          const mime = m[1]
          const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
          const buffer = Buffer.from(m[3], 'base64')
          if (buffer.length <= 2 * 1024 * 1024) {
            const path = `${badge.id}.${ext}`
            const { error: upErr } = await admin.storage
              .from('badges')
              .upload(path, buffer, { contentType: mime, upsert: true })
            if (!upErr) {
              const { data: pub } = admin.storage.from('badges').getPublicUrl(path)
              const url = `${pub.publicUrl}?v=${Date.now()}`
              await admin.from('badges').update({ image_url: url }).eq('id', badge.id)
              badge.image_url = url
            }
          }
        }
        return json(200, { badge })
      }

      case 'delete': {
        if (!body.id) return json(400, { error: 'id 누락' })
        await admin.from('badges').delete().eq('id', body.id)
        return json(200, { ok: true })
      }

      case 'award': {
        if (!body.studentId || !body.badgeId) return json(400, { error: '학생/배지 누락' })
        const { error } = await admin
          .from('student_badges')
          .upsert({ student_id: body.studentId, badge_id: body.badgeId }, { onConflict: 'student_id,badge_id' })
        if (error) throw error
        return json(200, { ok: true })
      }

      case 'revoke': {
        if (!body.studentId || !body.badgeId) return json(400, { error: '학생/배지 누락' })
        await admin
          .from('student_badges')
          .delete()
          .eq('student_id', body.studentId)
          .eq('badge_id', body.badgeId)
        return json(200, { ok: true })
      }

      default:
        return json(400, { error: '알 수 없는 action' })
    }
  } catch (e) {
    console.error('[badges]', e)
    return json(500, { error: '서버 오류가 발생했습니다.' })
  }
}
