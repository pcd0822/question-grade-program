// 교사용 수업(차시) 관리: 목록 / 개설 / 수정 / 삭제 / 활성 토글 / 자료 파일 첨부·삭제.
import { admin, json, parseBody, requireTeacher, isMissingTable } from '../lib/admin.js'

const STAGES = ['factual', 'divergent', 'meta', 'creative']

// 수업 자료 파일 최대 크기. Netlify 함수 요청 본문은 base64 포함 ~6MB 제한이라
// 이진 파일 4MB(≈base64 5.3MB) 로 넉넉히 잡는다.
const MAX_FILE_BYTES = 4 * 1024 * 1024

// 파일명에서 확장자만 안전하게 뽑는다 (Storage 경로용)
function extOf(name) {
  const m = String(name || '').match(/\.([a-zA-Z0-9]{1,8})$/)
  return m ? m[1].toLowerCase() : 'bin'
}

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
        // 수업 자료 Storage 객체도 함께 정리한다(테이블 행은 FK cascade 로 지워지지만
        // Storage 실물은 남으므로 직접 삭제). 마이그레이션 013 미적용이면 조용히 건너뛴다.
        const { data: files, error: fErr } = await admin
          .from('lesson_files')
          .select('path')
          .eq('lesson_id', body.id)
        if (!fErr && files?.length) {
          await admin.storage.from('lesson_files').remove(files.map((f) => f.path))
        }
        const { error } = await admin.from('lessons').delete().eq('id', body.id)
        if (error) throw error
        return json(200, { ok: true })
      }

      // ── 수업 자료 목록 ──
      case 'list-files': {
        if (!body.lessonId) return json(400, { error: 'lessonId 누락' })
        const { data, error } = await admin
          .from('lesson_files')
          .select('*')
          .eq('lesson_id', body.lessonId)
          .order('created_at', { ascending: true })
        if (error) {
          if (isMissingTable(error)) return json(200, { files: [] })
          throw error
        }
        return json(200, { files: data || [] })
      }

      // ── 수업 자료 업로드 (dataURL → Storage → lesson_files) ──
      case 'add-file': {
        if (!body.lessonId) return json(400, { error: 'lessonId 누락' })
        const name = String(body.name || '').trim() || '파일'
        const dataUrl = String(body.dataUrl || '')
        const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
        if (!m) return json(400, { error: '파일 형식이 올바르지 않습니다.' })
        const mime = m[1]
        const buffer = Buffer.from(m[2], 'base64')
        if (buffer.length === 0) return json(400, { error: '빈 파일입니다.' })
        if (buffer.length > MAX_FILE_BYTES)
          return json(400, { error: '파일이 너무 큽니다(4MB 이하).' })

        // 수업이 실제로 있는지 확인
        const { data: lesson } = await admin
          .from('lessons')
          .select('id')
          .eq('id', body.lessonId)
          .maybeSingle()
        if (!lesson) return json(404, { error: '수업을 찾을 수 없습니다.' })

        // 경로는 랜덤 UUID + 확장자. 원본 파일명은 DB(name)에 보관해 다운로드 시 사용.
        const path = `${body.lessonId}/${crypto.randomUUID()}.${extOf(name)}`
        const { error: upErr } = await admin.storage
          .from('lesson_files')
          .upload(path, buffer, { contentType: mime, upsert: true })
        if (upErr) throw upErr

        const { data: pub } = admin.storage.from('lesson_files').getPublicUrl(path, { download: name })
        const { data: file, error } = await admin
          .from('lesson_files')
          .insert({ lesson_id: body.lessonId, name, path, url: pub.publicUrl, size: buffer.length, mime })
          .select('*')
          .single()
        if (error) {
          // 롤백: 방금 올린 실물 제거
          await admin.storage.from('lesson_files').remove([path])
          if (isMissingTable(error))
            return json(503, { error: '수업 자료 기능이 아직 준비되지 않았어요. (마이그레이션 013 필요)' })
          throw error
        }
        return json(200, { file })
      }

      // ── 수업 자료 삭제 ──
      case 'delete-file': {
        if (!body.fileId) return json(400, { error: 'fileId 누락' })
        const { data: file } = await admin
          .from('lesson_files')
          .select('id, path')
          .eq('id', body.fileId)
          .maybeSingle()
        if (!file) return json(404, { error: '파일을 찾을 수 없습니다.' })
        await admin.storage.from('lesson_files').remove([file.path])
        await admin.from('lesson_files').delete().eq('id', file.id)
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
