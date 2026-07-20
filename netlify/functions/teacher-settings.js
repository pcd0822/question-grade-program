// 교사 개인설정: 프로필 사진 조회/설정.
import { admin, json, parseBody, requireTeacher } from '../lib/admin.js'

const AVATAR_KEY = 'teacher_avatar_url'

async function getSetting(key) {
  const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle()
  return data?.value || null
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  const body = parseBody(event)
  if (!requireTeacher(body.teacherCode)) return json(401, { error: '교사 인증 실패' })

  try {
    switch (body.action) {
      case 'get': {
        return json(200, { avatar_url: await getSetting(AVATAR_KEY) })
      }

      case 'set-avatar': {
        const dataUrl = String(body.dataUrl || '')
        const m = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/)
        if (!m) return json(400, { error: '이미지 형식이 올바르지 않습니다.' })
        const mime = m[1]
        const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
        const buffer = Buffer.from(m[3], 'base64')
        if (buffer.length > 2 * 1024 * 1024) return json(400, { error: '이미지가 너무 큽니다(2MB 이하).' })

        const path = `teacher.${ext}`
        const { error: upErr } = await admin.storage
          .from('avatars')
          .upload(path, buffer, { contentType: mime, upsert: true })
        if (upErr) throw upErr
        const { data: pub } = admin.storage.from('avatars').getPublicUrl(path)
        const url = `${pub.publicUrl}?v=${Date.now()}`

        await admin
          .from('app_settings')
          .upsert({ key: AVATAR_KEY, value: url, updated_at: new Date().toISOString() })
        // 기존 교사 댓글 아바타도 갱신
        await admin.from('comments').update({ author_avatar_url: url }).eq('author_type', 'teacher')
        return json(200, { avatar_url: url })
      }

      default:
        return json(400, { error: '알 수 없는 action' })
    }
  } catch (e) {
    console.error('[teacher-settings]', e)
    return json(500, { error: '서버 오류가 발생했습니다.' })
  }
}
