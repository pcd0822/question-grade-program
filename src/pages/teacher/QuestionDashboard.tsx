import { useCallback, useEffect, useState } from 'react'
import {
  teacher,
  type TeacherFeedQuestion,
  type TeacherFeedSubmission,
} from '../../lib/teacherApi'
import { STAGE_LABEL, type Comment, type Lesson } from '../../types'
import { useRealtime } from '../../hooks/useRealtime'
import Avatar from '../../components/Avatar'
import { seedBurstAt } from '../../lib/confetti'

export default function QuestionDashboard() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [lessonId, setLessonId] = useState('')
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
  useRealtime(['questions', 'comments', 'hearts', 'seed_log', 'submissions'], loadFeed)

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
        <p className="text-xs text-slate-400 mt-2">
          질문 {questions.length}개 · 과제 제출 {submissions.length}개 · 실시간 · 질문 새싹 1 / 댓글 새싹 2
        </p>
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
            <li key={s.id} className="bg-slate-50 rounded-lg p-2.5 flex gap-2">
              <Avatar name={s.author?.name || '?'} src={s.author?.avatar_url} size={32} />
              <div className="min-w-0">
                <div className="text-xs text-slate-400">
                  <span className="font-bold text-slate-600">{s.author?.name || '?'}</span> ({s.author?.student_no})
                </div>
                <p className="text-slate-700 text-sm whitespace-pre-wrap">{s.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function QuestionCard({ q, onChanged }: { q: TeacherFeedQuestion; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [commentText, setCommentText] = useState('')

  async function toggleSeed(e: React.MouseEvent) {
    setBusy(true)
    try {
      if (!q.seed_granted) seedBurstAt(e)
      await teacher.grantQuestionSeed(q.id, !q.seed_granted)
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function addComment() {
    if (!commentText.trim()) return
    setBusy(true)
    try {
      await teacher.addComment(q.id, commentText.trim())
      setCommentText('')
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      {/* 헤더 */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1 flex-wrap">
            <span className="bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">익명</span>
            <span className="font-bold text-slate-600">
              {q.author?.name || '?'} <span className="font-normal">({q.author?.student_no})</span>
            </span>
            {q.author?.group && <span className="bg-slate-100 px-1.5 rounded">{q.author.group}</span>}
          </div>
          <p className="text-slate-800 whitespace-pre-wrap">{q.text}</p>
          <div className="flex items-center gap-4 text-sm text-slate-400 mt-2">
            <span>❤️ {q.heart_count}</span>
            <span>💬 {q.comments.length}</span>
          </div>
        </div>
        <button
          onClick={toggleSeed}
          disabled={busy}
          className={`shrink-0 touch-target rounded-xl px-3 font-bold text-sm border transition-colors ${
            q.seed_granted
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-emerald-600 border-emerald-300 hover:bg-emerald-50'
          }`}
        >
          🌱 {q.seed_granted ? '지급됨' : '새싹'}
        </button>
      </div>

      {/* 댓글 */}
      <div className="mt-3 pl-1 border-t border-slate-100 pt-3 space-y-2">
        {q.comments.map((c) => (
          <TeacherCommentRow key={c.id} c={c} onChanged={onChanged} />
        ))}

        {/* 교사 댓글 입력 */}
        <div className="flex items-center gap-2 pt-1">
          <Avatar name="선생님" teacher size={32} />
          <input
            className="input flex-1"
            placeholder="선생님 댓글(피드백) 입력…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addComment()}
          />
          <button onClick={addComment} disabled={busy} className="btn-primary text-sm">
            등록
          </button>
        </div>
      </div>
    </section>
  )
}

function TeacherCommentRow({ c, onChanged }: { c: Comment; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const isTeacher = c.author_type === 'teacher'

  async function toggleSeed(e: React.MouseEvent) {
    setBusy(true)
    try {
      if (c.status !== 'approved') seedBurstAt(e)
      await teacher.grantCommentSeed(c.id, c.status !== 'approved')
      await onChanged()
    } finally {
      setBusy(false)
    }
  }
  async function reject() {
    const fb = prompt('반려 사유(학생에게 보일 피드백)를 입력하세요.')
    if (fb == null || !fb.trim()) return
    setBusy(true)
    try {
      await teacher.rejectComment(c.id, fb.trim())
      await onChanged()
    } finally {
      setBusy(false)
    }
  }
  async function del() {
    if (!confirm('이 교사 댓글을 삭제할까요?')) return
    await teacher.deleteComment(c.id)
    await onChanged()
  }

  return (
    <div className={`flex gap-2 rounded-lg p-2 ${isTeacher ? 'bg-emerald-50' : 'bg-slate-50'}`}>
      <Avatar name={c.author_name} src={c.author_avatar_url} teacher={isTeacher} size={32} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs mb-0.5">
          <span className="font-bold text-slate-700">{c.author_name}</span>
          {isTeacher && <span className="text-emerald-600 font-bold">선생님</span>}
          {c.status === 'approved' && <span className="text-emerald-600 font-bold">🌱 새싹 지급됨</span>}
          {c.status === 'rejected' && <span className="text-red-500 font-bold">반려됨</span>}
        </div>
        <p className="text-slate-700 text-sm whitespace-pre-wrap">{c.text}</p>
        {c.status === 'rejected' && c.teacher_feedback && (
          <p className="text-xs text-red-500 mt-1">↳ 피드백: {c.teacher_feedback}</p>
        )}
        {!isTeacher && (
          <div className="flex gap-2 mt-1.5">
            <button
              onClick={toggleSeed}
              disabled={busy}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold border ${
                c.status === 'approved'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-emerald-600 border-emerald-300 hover:bg-emerald-50'
              }`}
            >
              🌱🌱 {c.status === 'approved' ? '지급 취소' : '새싹 2개'}
            </button>
            <button onClick={reject} disabled={busy} className="rounded-lg px-2.5 py-1 text-xs font-bold bg-white text-red-500 border border-red-200 hover:bg-red-50">
              반려
            </button>
          </div>
        )}
        {isTeacher && (
          <button onClick={del} className="text-xs text-slate-400 hover:text-red-500 mt-1">삭제</button>
        )}
      </div>
    </div>
  )
}
