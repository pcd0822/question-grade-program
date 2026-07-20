// 교사 질문 대시보드 데이터: 수업의 질문 + 댓글(실명·프로필) + 과제 제출.
// 학생 이름/아바타는 anon 에 안 나가므로 교사는 이 함수(service_role)로만 조회.
import { admin, json, parseBody, requireTeacher } from '../lib/admin.js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  const body = parseBody(event)
  if (!requireTeacher(body.teacherCode)) return json(401, { error: '교사 인증 실패' })
  if (!body.lessonId) return json(400, { error: 'lessonId 누락' })

  try {
    const { data: students } = await admin
      .from('students')
      .select('id, student_no, name, group_id, avatar_url, groups(name)')
    const infoOf = new Map(
      (students || []).map((s) => [
        s.id,
        {
          student_no: s.student_no,
          name: s.name,
          group: s.groups?.name || null,
          avatar_url: s.avatar_url || null,
        },
      ]),
    )

    const { data: questions } = await admin
      .from('questions')
      .select('*')
      .eq('lesson_id', body.lessonId)
      .order('created_at', { ascending: true })
    const qIds = (questions || []).map((q) => q.id)

    const { data: comments } = qIds.length
      ? await admin.from('comments').select('*').in('question_id', qIds).order('created_at')
      : { data: [] }

    const { data: hearts } = qIds.length
      ? await admin.from('hearts').select('question_id').in('question_id', qIds)
      : { data: [] }
    const heartCount = {}
    for (const h of hearts || []) heartCount[h.question_id] = (heartCount[h.question_id] || 0) + 1

    const commentsByQ = {}
    for (const c of comments || []) (commentsByQ[c.question_id] ||= []).push(c)

    const feed = (questions || []).map((q) => ({
      ...q,
      author: infoOf.get(q.author_id) || null,
      heart_count: heartCount[q.id] || 0,
      comments: commentsByQ[q.id] || [],
    }))

    const { data: subs } = await admin
      .from('submissions')
      .select('*')
      .eq('lesson_id', body.lessonId)
      .order('created_at', { ascending: true })
    const submissions = (subs || []).map((s) => ({ ...s, author: infoOf.get(s.author_id) || null }))

    return json(200, { questions: feed, submissions })
  } catch (e) {
    console.error('[teacher-feed]', e)
    return json(500, { error: '서버 오류가 발생했습니다.' })
  }
}
