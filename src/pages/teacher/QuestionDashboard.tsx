import { useCallback, useEffect, useState } from 'react'
import {
  teacher,
  type TeacherFeedAnswer,
  type TeacherFeedQuestion,
  type TeacherFeedSubmission,
} from '../../lib/teacherApi'
import { STAGE_LABEL, type Lesson } from '../../types'
import { useRealtime } from '../../hooks/useRealtime'

export default function QuestionDashboard() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [lessonId, setLessonId] = useState<string>('')
  const [questions, setQuestions] = useState<TeacherFeedQuestion[]>([])
  const [submissions, setSubmissions] = useState<TeacherFeedSubmission[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    teacher.listLessons().then((ls) => {
      setLessons(ls)
      const active = ls.find((l) => l.active) || ls[0]
      if (active) setLessonId(active.id)
    })
  }, [])

  const loadFeed = useCallback(async () => {
    if (!lessonId) return
    setLoading(true)
    try {
      const res = await teacher.feed(lessonId)
      setQuestions(res.questions)
      setSubmissions(res.submissions)
    } finally {
      setLoading(false)
    }
  }, [lessonId])

  useEffect(() => {
    loadFeed()
  }, [loadFeed])

  // 학생 활동(질문/답변/하트/새싹/과제제출)이 생기면 자동 갱신
  useRealtime(['questions', 'answers', 'hearts', 'seed_log', 'submissions'], loadFeed)

  const lesson = lessons.find((l) => l.id === lessonId)

  return (
    <div className="space-y-4">
      <section className="card">
        <label className="block">
          <span className="block text-sm font-bold text-slate-600 mb-1">수업 선택</span>
          <select className="input" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
            {lessons.length === 0 && <option value="">개설된 수업이 없습니다</option>}
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.active ? '🟢' : '⚪'} {l.period_label ? `[${l.period_label}] ` : ''}
                {l.title} · {STAGE_LABEL[l.stage]}
              </option>
            ))}
          </select>
        </label>
        {lesson && (
          <p className="text-xs text-slate-400 mt-2">
            질문 {questions.length}개 · 과제 제출 {submissions.length}개 · 실시간 반영됨 · 질문 새싹 1개 / 답변 새싹 2개
          </p>
        )}
      </section>

      {submissions.length > 0 && <SubmissionsPanel submissions={submissions} />}

      {loading && questions.length === 0 ? (
        <p className="text-slate-400 text-sm py-8 text-center">불러오는 중…</p>
      ) : questions.length === 0 ? (
        <p className="text-slate-400 text-sm py-8 text-center">아직 등록된 질문이 없습니다.</p>
      ) : (
        questions.map((q) => <QuestionCard key={q.id} q={q} onChanged={loadFeed} />)
      )}
    </div>
  )
}

function SubmissionsPanel({ submissions }: { submissions: TeacherFeedSubmission[] }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="card">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between font-bold text-slate-800">
        <span>📝 과제 답변 제출 ({submissions.length})</span>
        <span className="text-slate-400 text-sm">{open ? '접기' : '펼치기'}</span>
      </button>
      {open && (
        <ul className="mt-3 space-y-2">
          {submissions.map((s) => (
            <li key={s.id} className="bg-slate-50 rounded-lg p-2.5">
              <div className="text-xs text-slate-400 mb-1">
                <span className="font-bold text-slate-600">{s.author?.name || '?'}</span> ({s.author?.student_no})
              </div>
              <p className="text-slate-700 text-sm whitespace-pre-wrap">{s.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function QuestionCard({ q, onChanged }: { q: TeacherFeedQuestion; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)

  async function toggleSeed() {
    setBusy(true)
    try {
      await teacher.grantQuestionSeed(q.id, !q.seed_granted)
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1 flex-wrap">
            <span className="font-bold text-slate-600">
              {q.author?.name || '?'} <span className="font-normal">({q.author?.student_no})</span>
            </span>
            {q.author?.group && <span className="bg-slate-100 px-1.5 rounded">{q.author.group}</span>}
            <span>· ❤️ {q.heart_count}</span>
          </div>
          <p className="text-slate-800 whitespace-pre-wrap">{q.text}</p>
        </div>
        <button
          onClick={toggleSeed}
          disabled={busy}
          title="질문에 새싹 지급"
          className={`shrink-0 touch-target rounded-xl px-3 font-bold text-sm border transition-colors ${
            q.seed_granted
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-emerald-600 border-emerald-300 hover:bg-emerald-50'
          }`}
        >
          🌱 {q.seed_granted ? '지급됨' : '새싹'}
        </button>
      </div>

      {/* 답변 목록 */}
      {q.answers.length > 0 && (
        <div className="mt-3 pl-3 border-l-2 border-slate-100 space-y-2">
          {q.answers.map((a) => (
            <AnswerRow key={a.id} a={a} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  )
}

function AnswerRow({ a, onChanged }: { a: TeacherFeedAnswer; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)

  async function toggleSeed() {
    setBusy(true)
    try {
      await teacher.grantAnswerSeed(a.id, a.status !== 'approved')
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function reject() {
    const feedback = prompt('반려 사유(학생에게 보일 피드백)를 입력하세요.')
    if (feedback == null || !feedback.trim()) return
    setBusy(true)
    try {
      await teacher.rejectAnswer(a.id, feedback.trim())
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-slate-50 rounded-lg p-2.5">
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
        <span className="font-bold text-slate-600">{a.author?.name || '?'}</span>
        <span>({a.author?.student_no})</span>
        {a.status === 'approved' && <span className="text-emerald-600 font-bold">새싹 지급됨</span>}
        {a.status === 'rejected' && <span className="text-red-500 font-bold">반려됨</span>}
      </div>
      <p className="text-slate-700 text-sm whitespace-pre-wrap">{a.text}</p>
      {a.status === 'rejected' && a.teacher_feedback && (
        <p className="text-xs text-red-500 mt-1">↳ 피드백: {a.teacher_feedback}</p>
      )}
      <div className="flex gap-2 mt-2 justify-end">
        <button
          onClick={toggleSeed}
          disabled={busy}
          className={`touch-target rounded-lg px-3 text-sm font-bold border transition-colors ${
            a.status === 'approved'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-emerald-600 border-emerald-300 hover:bg-emerald-50'
          }`}
        >
          🌱🌱 {a.status === 'approved' ? '지급 취소' : '새싹 2개'}
        </button>
        <button onClick={reject} disabled={busy} className="touch-target rounded-lg px-3 text-sm font-bold bg-white text-red-500 border border-red-200 hover:bg-red-50">
          반려
        </button>
      </div>
    </div>
  )
}
