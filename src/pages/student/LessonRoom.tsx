import { useCallback, useEffect, useState } from 'react'
import { STAGE_LABEL, type Lesson } from '../../types'
import { fetchLessonFeed, type LessonFeed, type QuestionView } from '../../lib/studentData'
import { student } from '../../lib/studentApi'
import { useRealtime } from '../../hooks/useRealtime'

interface Props {
  lesson: Lesson
  myId: string
  onBack: () => void
}

export default function LessonRoom({ lesson, myId, onBack }: Props) {
  const [feed, setFeed] = useState<LessonFeed>({ questions: [], mySubmission: null })

  const load = useCallback(() => {
    fetchLessonFeed(lesson.id, myId).then(setFeed)
  }, [lesson.id, myId])

  useEffect(() => {
    load()
  }, [load])
  useRealtime(['questions', 'answers', 'hearts', 'submissions', 'lessons'], load)

  return (
    <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
      <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800">
        ← 수업 목록
      </button>

      {/* 이번 차시 질문 단계 안내 */}
      <div className="rounded-2xl bg-emerald-600 text-white p-4">
        <p className="text-emerald-100 text-xs font-bold">
          {lesson.period_label ? `${lesson.period_label} · ` : ''}이번 차시 질문 단계
        </p>
        <p className="text-2xl font-black mt-0.5">{STAGE_LABEL[lesson.stage]}</p>
        {lesson.stage_guide && <p className="text-emerald-50 text-sm mt-2 whitespace-pre-wrap">{lesson.stage_guide}</p>}
      </div>

      <h1 className="text-xl font-black text-slate-900">{lesson.title}</h1>

      {/* 제시문 */}
      {lesson.content && <Collapsible title="수업 내용 / 제시문" defaultOpen>{lesson.content}</Collapsible>}

      {/* 과제 + 제출 */}
      {lesson.task && <TaskBox lesson={lesson} feed={feed} onChanged={load} />}

      {/* 질문 만들기 */}
      <NewQuestion lesson={lesson} onChanged={load} />

      {/* 질문 목록 (익명) */}
      <div className="space-y-3">
        <h2 className="font-bold text-slate-700">
          우리 반 질문 <span className="text-slate-400 font-normal">({feed.questions.length})</span>
        </h2>
        {feed.questions.length === 0 ? (
          <p className="text-slate-400 text-sm py-6 text-center card">아직 질문이 없어요. 첫 질문을 만들어보세요!</p>
        ) : (
          feed.questions.map((qv) => <QuestionCard key={qv.question.id} qv={qv} onChanged={load} />)
        )}
      </div>
    </div>
  )
}

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="card">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between font-bold text-slate-800">
        <span>{title}</span>
        <span className="text-slate-400 text-sm">{open ? '접기' : '펼치기'}</span>
      </button>
      {open && <div className="mt-2 text-slate-700 whitespace-pre-wrap leading-relaxed">{children}</div>}
    </section>
  )
}

function TaskBox({ lesson, feed, onChanged }: { lesson: Lesson; feed: LessonFeed; onChanged: () => void }) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const sub = feed.mySubmission

  async function submit() {
    if (!text.trim()) return
    setBusy(true)
    try {
      await student.submitTask(lesson.id, text.trim())
      setEditing(false)
      setText('')
      onChanged()
    } catch (e) {
      alert(e instanceof Error ? e.message : '제출 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2 className="font-bold text-slate-800 mb-1">📝 과제</h2>
      <p className="text-slate-700 whitespace-pre-wrap mb-3">{lesson.task}</p>

      {sub && !editing ? (
        <div className="bg-emerald-50 rounded-lg p-3">
          <p className="text-xs text-emerald-700 font-bold mb-1">내 제출</p>
          <p className="text-slate-700 text-sm whitespace-pre-wrap">{sub.text}</p>
          <button onClick={() => { setText(sub.text); setEditing(true) }} className="text-xs text-emerald-600 mt-2 hover:underline">
            수정
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea className="input py-2" rows={3} placeholder="과제 답변을 작성하세요" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex justify-end gap-2">
            {editing && <button onClick={() => setEditing(false)} className="btn-secondary text-sm">취소</button>}
            <button onClick={submit} disabled={busy} className="btn-primary text-sm">
              {busy ? '제출 중…' : sub ? '수정 제출' : '제출'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function NewQuestion({ lesson, onChanged }: { lesson: Lesson; onChanged: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!text.trim()) return
    setBusy(true)
    try {
      await student.createQuestion(lesson.id, text.trim())
      setText('')
      onChanged()
    } catch (e) {
      alert(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card border-emerald-200">
      <h2 className="font-bold text-slate-800 mb-2">✏️ {STAGE_LABEL[lesson.stage]} 만들기</h2>
      <textarea className="input py-2" rows={2} placeholder={`${STAGE_LABEL[lesson.stage]}을(를) 입력하세요`} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex justify-end mt-2">
        <button onClick={create} disabled={busy} className="btn-primary text-sm">
          {busy ? '등록 중…' : '질문 등록'}
        </button>
      </div>
    </section>
  )
}

function QuestionCard({ qv, onChanged }: { qv: QuestionView; onChanged: () => void }) {
  const { question: q } = qv
  const [busy, setBusy] = useState(false)
  const [answerText, setAnswerText] = useState('')
  const [editing, setEditing] = useState(false)

  async function toggleHeart() {
    if (qv.isMine || busy) return
    setBusy(true)
    try {
      await student.toggleHeart(q.id)
      onChanged()
    } catch (e) {
      alert(e instanceof Error ? e.message : '하트 실패')
    } finally {
      setBusy(false)
    }
  }

  async function sendAnswer() {
    if (!answerText.trim()) return
    setBusy(true)
    try {
      if (qv.myAnswer && editing) {
        await student.updateAnswer(qv.myAnswer.id, answerText.trim())
      } else {
        await student.createAnswer(q.id, answerText.trim())
      }
      setAnswerText('')
      setEditing(false)
      onChanged()
    } catch (e) {
      alert(e instanceof Error ? e.message : '답변 실패')
    } finally {
      setBusy(false)
    }
  }

  const otherAnswers = qv.answers.filter((a) => a.id !== qv.myAnswer?.id)

  return (
    <section className="card">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {qv.isMine && <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">내 질문</span>}
          {qv.isMine && q.seed_granted && <span className="text-xs ml-1">🌱 새싹 받음</span>}
          <p className="text-slate-800 whitespace-pre-wrap mt-1">{q.text}</p>
        </div>
        <button
          onClick={toggleHeart}
          disabled={qv.isMine || busy}
          className={`shrink-0 touch-target rounded-xl px-3 text-sm font-bold border transition-colors ${
            qv.isMine
              ? 'border-slate-200 text-slate-300'
              : qv.hearted
                ? 'bg-rose-500 text-white border-rose-500'
                : 'bg-white text-rose-500 border-rose-200 hover:bg-rose-50'
          }`}
          title={qv.isMine ? '자기 질문에는 하트를 누를 수 없어요' : '좋은 질문에 하트'}
        >
          ❤️ {qv.heartCount}
        </button>
      </div>

      {/* 내 답변 영역 */}
      {!qv.isMine && (
        <div className="mt-3">
          {qv.myAnswer && !editing ? (
            <div className={`rounded-lg p-2.5 ${qv.myAnswer.status === 'rejected' ? 'bg-red-50' : 'bg-slate-50'}`}>
              <p className="text-xs font-bold mb-1 flex items-center gap-2">
                <span className="text-slate-500">내 답변</span>
                {qv.myAnswer.status === 'approved' && <span className="text-emerald-600">🌱 새싹 받음</span>}
                {qv.myAnswer.status === 'rejected' && <span className="text-red-500">반려됨</span>}
              </p>
              <p className="text-slate-700 text-sm whitespace-pre-wrap">{qv.myAnswer.text}</p>
              {qv.myAnswer.status === 'rejected' && (
                <>
                  {qv.myAnswer.teacher_feedback && (
                    <p className="text-xs text-red-500 mt-1">↳ 선생님 피드백: {qv.myAnswer.teacher_feedback}</p>
                  )}
                  <button onClick={() => { setAnswerText(qv.myAnswer!.text); setEditing(true) }} className="text-xs text-emerald-600 mt-2 hover:underline">
                    답변 수정하기
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <textarea className="input py-2" rows={2} placeholder="이 질문에 답변하기" value={answerText} onChange={(e) => setAnswerText(e.target.value)} />
              <div className="flex justify-end gap-2">
                {editing && <button onClick={() => setEditing(false)} className="btn-secondary text-sm">취소</button>}
                <button onClick={sendAnswer} disabled={busy} className="btn-primary text-sm">
                  {editing ? '수정 제출' : '답변 등록'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 다른 답변들 (익명) */}
      {otherAnswers.length > 0 && (
        <div className="mt-3 pl-3 border-l-2 border-slate-100 space-y-1.5">
          <p className="text-xs text-slate-400">다른 친구들의 답변 {otherAnswers.length}개</p>
          {otherAnswers.map((a) => (
            <p key={a.id} className="text-sm text-slate-600 whitespace-pre-wrap">· {a.text}</p>
          ))}
        </div>
      )}
    </section>
  )
}
