// 학생 화면용 읽기 (anon Supabase). 이름 등 개인정보는 담기지 않아 익명성이 유지된다.
import { supabase } from './supabase'
import type { Answer, Lesson, Question, Submission } from '../types'

/** 활성 수업 목록 */
export async function fetchActiveLessons(): Promise<Lesson[]> {
  const { data } = await supabase
    .from('lessons')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })
  return (data as Lesson[]) || []
}

/** 내 누적 새싹 = seed_log 합계 */
export async function fetchMySeeds(studentId: string): Promise<number> {
  const { data } = await supabase.from('seed_log').select('amount').eq('student_id', studentId)
  return (data || []).reduce((sum, r) => sum + (r.amount as number), 0)
}

export interface QuestionView {
  question: Question
  heartCount: number
  hearted: boolean // 내가 하트를 눌렀는지
  isMine: boolean // 내가 쓴 질문인지
  myAnswer: Answer | null // 이 질문에 대한 내 답변
  answers: Answer[] // 모든 답변(익명)
}

export interface LessonFeed {
  questions: QuestionView[]
  mySubmission: Submission | null
}

/** 수업 상세 피드 (질문·답변·하트·내 제출) */
export async function fetchLessonFeed(lessonId: string, myId: string): Promise<LessonFeed> {
  const { data: qData } = await supabase
    .from('questions')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: false })
  const questions = (qData as Question[]) || []
  const qIds = questions.map((q) => q.id)

  let answers: Answer[] = []
  let hearts: { question_id: string; student_id: string }[] = []
  if (qIds.length) {
    const [{ data: aData }, { data: hData }] = await Promise.all([
      supabase.from('answers').select('*').in('question_id', qIds),
      supabase.from('hearts').select('question_id, student_id').in('question_id', qIds),
    ])
    answers = (aData as Answer[]) || []
    hearts = (hData as { question_id: string; student_id: string }[]) || []
  }

  const { data: subData } = await supabase
    .from('submissions')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('author_id', myId)
    .maybeSingle()

  const views: QuestionView[] = questions.map((q) => {
    const qAnswers = answers.filter((a) => a.question_id === q.id)
    const qHearts = hearts.filter((h) => h.question_id === q.id)
    return {
      question: q,
      heartCount: qHearts.length,
      hearted: qHearts.some((h) => h.student_id === myId),
      isMine: q.author_id === myId,
      myAnswer: qAnswers.find((a) => a.author_id === myId) || null,
      answers: qAnswers,
    }
  })

  return { questions: views, mySubmission: (subData as Submission) || null }
}
