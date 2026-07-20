// 교사 질문 대시보드용 데이터: 특정 수업의 질문+답변을 작성자(학번·이름·모둠)와 함께 반환.
// 학생 이름은 anon 에 노출되지 않으므로 교사는 이 함수(service_role)로만 조회한다.
import { admin, json, parseBody, requireTeacher } from '../lib/admin.js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  const body = parseBody(event)
  if (!requireTeacher(body.teacherCode)) return json(401, { error: '교사 인증 실패' })
  if (!body.lessonId) return json(400, { error: 'lessonId 누락' })

  try {
    // 학생 이름 맵
    const { data: students } = await admin
      .from('students')
      .select('id, student_no, name, group_id, groups(name)')
    const nameOf = new Map(
      (students || []).map((s) => [
        s.id,
        { student_no: s.student_no, name: s.name, group: s.groups?.name || null },
      ]),
    )

    const { data: questions } = await admin
      .from('questions')
      .select('*')
      .eq('lesson_id', body.lessonId)
      .order('created_at', { ascending: true })

    const qIds = (questions || []).map((q) => q.id)

    const { data: answers } = qIds.length
      ? await admin.from('answers').select('*').in('question_id', qIds).order('created_at')
      : { data: [] }

    // 질문별 하트 수
    const { data: hearts } = qIds.length
      ? await admin.from('hearts').select('question_id').in('question_id', qIds)
      : { data: [] }
    const heartCount = {}
    for (const h of hearts || []) heartCount[h.question_id] = (heartCount[h.question_id] || 0) + 1

    const answersByQ = {}
    for (const a of answers || []) {
      ;(answersByQ[a.question_id] ||= []).push({ ...a, author: nameOf.get(a.author_id) || null })
    }

    const feed = (questions || []).map((q) => ({
      ...q,
      author: nameOf.get(q.author_id) || null,
      heart_count: heartCount[q.id] || 0,
      answers: answersByQ[q.id] || [],
    }))

    // 과제 답변 제출 목록
    const { data: subs } = await admin
      .from('submissions')
      .select('*')
      .eq('lesson_id', body.lessonId)
      .order('created_at', { ascending: true })
    const submissions = (subs || []).map((s) => ({ ...s, author: nameOf.get(s.author_id) || null }))

    return json(200, { questions: feed, submissions })
  } catch (e) {
    console.error('[teacher-feed]', e)
    return json(500, { error: '서버 오류가 발생했습니다.' })
  }
}
