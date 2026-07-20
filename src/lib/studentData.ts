// 학생 화면용 읽기 (anon Supabase). 질문은 익명, 댓글은 실명(비정규화된 이름/아바타).
import { supabase } from './supabase'
import type { Comment, Lesson, Question, Submission } from '../types'

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
  hearted: boolean
  isMine: boolean
  comments: Comment[]
}

export interface LessonFeed {
  questions: QuestionView[]
  mySubmission: Submission | null
}

export async function fetchLessonFeed(lessonId: string, myId: string): Promise<LessonFeed> {
  const { data: qData } = await supabase
    .from('questions')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: false })
  const questions = (qData as Question[]) || []
  const qIds = questions.map((q) => q.id)

  let comments: Comment[] = []
  let hearts: { question_id: string; student_id: string }[] = []
  if (qIds.length) {
    const [{ data: cData }, { data: hData }] = await Promise.all([
      supabase.from('comments').select('*').in('question_id', qIds).order('created_at'),
      supabase.from('hearts').select('question_id, student_id').in('question_id', qIds),
    ])
    comments = (cData as Comment[]) || []
    hearts = (hData as { question_id: string; student_id: string }[]) || []
  }

  const { data: subData } = await supabase
    .from('submissions')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('author_id', myId)
    .maybeSingle()

  const views: QuestionView[] = questions.map((q) => {
    const qHearts = hearts.filter((h) => h.question_id === q.id)
    return {
      question: q,
      heartCount: qHearts.length,
      hearted: qHearts.some((h) => h.student_id === myId),
      isMine: q.author_id === myId,
      comments: comments.filter((c) => c.question_id === q.id),
    }
  })

  return { questions: views, mySubmission: (subData as Submission) || null }
}
