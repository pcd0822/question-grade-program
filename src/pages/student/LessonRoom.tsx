import { useCallback, useEffect, useRef, useState } from 'react'
import { STAGE_LABEL, type Comment, type Lesson, type LessonFile, type StudentSession } from '../../types'
import { fetchLessonFeed, fetchLessonFiles, type LessonFeed, type QuestionView } from '../../lib/studentData'
import { formatBytes } from '../../lib/files'
import { student } from '../../lib/studentApi'
import { useRealtime } from '../../hooks/useRealtime'
import Avatar from '../../components/Avatar'
import { HeartIcon, CommentIcon } from '../../components/icons'

interface Props {
  lesson: Lesson
  me: StudentSession
}

// 수업 목록으로 돌아가는 버튼은 AppShell 상단 바에 있다(StudentDashboard 참고).
export default function LessonRoom({ lesson, me }: Props) {
  const [feed, setFeed] = useState<LessonFeed>({ questions: [], mySubmission: null })
  const [lessonFiles, setLessonFiles] = useState<LessonFile[]>([])
  const [showComposer, setShowComposer] = useState(false)
  const composerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    fetchLessonFeed(lesson.id, me.id, me.qid).then(setFeed)
    fetchLessonFiles(lesson.id).then(setLessonFiles)
  }, [lesson.id, me.id, me.qid])

  useEffect(() => {
    load()
  }, [load])
  useRealtime(['questions', 'comments', 'hearts', 'submissions', 'lessons', 'lesson_files'], load)

  // 하단 버튼을 누르면 작성칸이 열리고 그 위치로 부드럽게 스크롤된다
  function openComposer() {
    setShowComposer(true)
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  return (
    <div className="pb-24 space-y-4">
      {/* 차시 단계 배너 */}
      <div className="rounded-2xl bg-emerald-600 text-white p-4">
        <p className="text-emerald-100 text-xs font-bold">
          {lesson.period_label ? `${lesson.period_label} · ` : ''}이번 차시 질문 단계
        </p>
        <p className="text-2xl font-black mt-0.5">{STAGE_LABEL[lesson.stage]}</p>
        {lesson.stage_guide && <p className="text-emerald-50 text-sm mt-2 whitespace-pre-wrap">{lesson.stage_guide}</p>}
      </div>

      <h1 className="text-xl font-black text-slate-900">{lesson.title}</h1>

      {lesson.content && <Collapsible title="수업 내용 / 제시문" defaultOpen>{lesson.content}</Collapsible>}
      {lessonFiles.length > 0 && <LessonFiles files={lessonFiles} />}
      {lesson.task && <TaskBox lesson={lesson} feed={feed} onChanged={load} />}

      {/* 질문 작성칸 (하단 버튼으로 연다) */}
      <div ref={composerRef}>
        {showComposer && (
          <NewQuestion
            lesson={lesson}
            onDone={() => { setShowComposer(false); load() }}
            onCancel={() => setShowComposer(false)}
          />
        )}
      </div>

      {/* 질문 카드뷰 목록 */}
      <div className="space-y-3">
        <h2 className="font-bold text-slate-700">
          우리 반 질문 <span className="text-slate-400 font-normal">({feed.questions.length})</span>
        </h2>
        {feed.questions.length === 0 ? (
          <p className="text-slate-400 text-sm py-6 text-center card">아직 질문이 없어요. 첫 질문을 만들어보세요!</p>
        ) : (
          feed.questions.map((qv) => <QuestionCard key={qv.question.id} qv={qv} me={me} onChanged={load} />)
        )}
      </div>

      {/* 하단 고정: 새 질문 만들기 (이 버튼 하나만 둔다) */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-white via-white to-transparent pointer-events-none z-20">
        <div className="max-w-3xl mx-auto pointer-events-auto">
          <button onClick={openComposer} className="w-full btn-primary text-base py-3.5 shadow-lg">
            ✏️ 새 질문 만들기
          </button>
        </div>
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

function LessonFiles({ files }: { files: LessonFile[] }) {
  return (
    <section className="card">
      <h2 className="font-bold text-slate-800 mb-2">📎 수업 자료</h2>
      <ul className="space-y-2">
        {files.map((f) => (
          <li key={f.id}>
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              download={f.name}
              className="flex items-center gap-2 bg-slate-50 hover:bg-emerald-50 rounded-lg px-3 py-2.5 transition-colors"
            >
              <span className="text-lg shrink-0">📄</span>
              <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-700">{f.name}</span>
              <span className="text-xs text-slate-400 shrink-0">{formatBytes(f.size)}</span>
              <span className="text-emerald-600 text-sm font-bold shrink-0">받기 ↓</span>
            </a>
          </li>
        ))}
      </ul>
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
        <div className={`rounded-lg p-3 ${sub.status === 'rejected' ? 'bg-red-50' : 'bg-emerald-50'}`}>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-xs text-emerald-700 font-bold">내 제출</p>
            {sub.status === 'approved' && <span className="text-xs text-emerald-600 font-bold">🌱 새싹 받음(승인)</span>}
            {sub.status === 'rejected' && <span className="text-xs text-red-500 font-bold">반려됨</span>}
          </div>
          <p className="text-slate-700 text-sm whitespace-pre-wrap">{sub.text}</p>
          {sub.status === 'rejected' && sub.teacher_feedback && (
            <p className="text-xs text-red-500 mt-1.5">↳ 선생님 피드백: {sub.teacher_feedback}</p>
          )}
          <button onClick={() => { setText(sub.text); setEditing(true) }} className="text-xs text-emerald-600 mt-2 hover:underline">
            {sub.status === 'rejected' ? '수정해서 다시 제출' : '수정'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea className="input py-2" rows={3} placeholder="과제 답변을 작성하세요" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex justify-end gap-2">
            {editing && <button onClick={() => setEditing(false)} className="btn-secondary text-sm">취소</button>}
            <button onClick={submit} disabled={busy} className="btn-primary text-sm">{busy ? '제출 중…' : sub ? '수정 제출' : '제출'}</button>
          </div>
        </div>
      )}
    </section>
  )
}

function NewQuestion({ lesson, onDone, onCancel }: { lesson: Lesson; onDone: () => void; onCancel: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  async function create() {
    if (!text.trim()) return
    setBusy(true)
    try {
      await student.createQuestion(lesson.id, text.trim())
      onDone()
    } catch (e) {
      alert(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card border-emerald-200">
      <h2 className="font-bold text-slate-800 mb-2">✏️ {STAGE_LABEL[lesson.stage]} 만들기</h2>
      <textarea className="input py-2" rows={3} placeholder={`${STAGE_LABEL[lesson.stage]}을(를) 입력하세요 (익명으로 등록돼요)`} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onCancel} className="btn-secondary text-sm">취소</button>
        <button onClick={create} disabled={busy} className="btn-primary text-sm">{busy ? '등록 중…' : '질문 등록'}</button>
      </div>
    </section>
  )
}

function QuestionCard({ qv, me, onChanged }: { qv: QuestionView; me: StudentSession; onChanged: () => void }) {
  const { question: q } = qv
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [commentText, setCommentText] = useState('')

  async function toggleHeart(e: React.MouseEvent) {
    e.stopPropagation()
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

  async function addComment() {
    if (!commentText.trim()) return
    setBusy(true)
    try {
      await student.createComment(q.id, commentText.trim())
      setCommentText('')
      onChanged()
    } catch (e) {
      alert(e instanceof Error ? e.message : '댓글 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`card q-card ${open ? 'q-card-open' : ''}`}>
      {/* 카드뷰 (접힘 상태) */}
      <button onClick={() => setOpen((v) => !v)} className="w-full text-left">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">익명</span>
          {qv.isMine && <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">내 질문</span>}
          {qv.isMine && q.seed_granted && <span className="text-xs">🌱 새싹 받음</span>}
        </div>
        <p className="text-slate-800 whitespace-pre-wrap">{q.text}</p>
      </button>

      {/* 액션바 (하트 · 댓글 수) */}
      <div className="flex items-center gap-5 mt-3 text-sm">
        <button
          onClick={toggleHeart}
          disabled={qv.isMine}
          className={`flex items-center gap-1.5 font-bold ${
            qv.isMine ? 'text-slate-300' : qv.hearted ? 'text-rose-500' : 'text-slate-500 hover:text-rose-500'
          }`}
          title={qv.isMine ? '자기 질문에는 하트를 누를 수 없어요' : '좋은 질문에 하트'}
        >
          <HeartIcon size={20} filled={qv.hearted} /> {qv.heartCount}
        </button>
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 font-bold text-slate-500 hover:text-slate-800">
          <CommentIcon size={20} /> {qv.comments.length}
        </button>
      </div>

      {/* 펼침: 댓글 */}
      {open && (
        <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
          {qv.comments.length === 0 && <p className="text-xs text-slate-400 text-center py-1">첫 댓글을 남겨보세요.</p>}
          {qv.comments.map((c) => (
            <CommentRow key={c.id} c={c} mine={c.student_id === me.id} onChanged={onChanged} />
          ))}

          {/* 댓글 입력 (실명) */}
          <div className="flex items-center gap-2 pt-1">
            <Avatar name={me.name} src={me.avatar_url} size={32} />
            <input
              className="input flex-1"
              placeholder="댓글 달기…(실명)"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addComment()}
            />
            <button onClick={addComment} disabled={busy} className="btn-primary text-sm">등록</button>
          </div>
        </div>
      )}
    </section>
  )
}

function CommentRow({ c, mine, onChanged }: { c: Comment; mine: boolean; onChanged: () => void }) {
  const isTeacher = c.author_type === 'teacher'
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(c.text)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!text.trim()) return
    setBusy(true)
    try {
      await student.updateComment(c.id, text.trim())
      setEditing(false)
      onChanged()
    } finally {
      setBusy(false)
    }
  }
  async function del() {
    if (!confirm('댓글을 삭제할까요?')) return
    await student.deleteComment(c.id)
    onChanged()
  }

  return (
    <div className={`flex gap-2 rounded-lg p-2 ${isTeacher ? 'bg-emerald-50' : 'bg-slate-50'}`}>
      <Avatar name={c.author_name} src={c.author_avatar_url} teacher={isTeacher} size={32} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs mb-0.5">
          <span className="font-bold text-slate-700">{c.author_name}</span>
          {isTeacher && <span className="text-emerald-600 font-bold">선생님</span>}
          {c.status === 'approved' && <span className="text-emerald-600 font-bold">🌱 새싹 받음</span>}
          {c.status === 'rejected' && <span className="text-red-500 font-bold">반려됨</span>}
        </div>
        {editing ? (
          <div className="space-y-1">
            <textarea className="input py-1.5" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(false)} className="text-xs text-slate-400">취소</button>
              <button onClick={save} disabled={busy} className="text-xs text-emerald-600 font-bold">저장</button>
            </div>
          </div>
        ) : (
          <p className="text-slate-700 text-sm whitespace-pre-wrap">{c.text}</p>
        )}
        {c.status === 'rejected' && c.teacher_feedback && !editing && (
          <p className="text-xs text-red-500 mt-1">↳ 선생님 피드백: {c.teacher_feedback}</p>
        )}
        {mine && !editing && (
          <div className="flex gap-2 mt-1">
            <button onClick={() => { setText(c.text); setEditing(true) }} className="text-xs text-slate-400 hover:text-slate-600">수정</button>
            <button onClick={del} className="text-xs text-red-400 hover:text-red-600">삭제</button>
          </div>
        )}
      </div>
    </div>
  )
}
