import { useEffect, useRef, useState } from 'react'
import { teacher } from '../../lib/teacherApi'
import { MAX_FILE_BYTES, formatBytes, readFileAsDataUrl } from '../../lib/files'
import { STAGE_LABEL, type Lesson, type LessonFile, type QuestionStage } from '../../types'

const STAGES: QuestionStage[] = ['factual', 'divergent', 'meta', 'creative']

const emptyForm = {
  id: undefined as string | undefined,
  title: '',
  period_label: '',
  content: '',
  task: '',
  stage: 'factual' as QuestionStage,
  stage_guide: '',
  heart_bonus_cap: 3,
  active: true,
}

export default function LessonManager() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // 수업 자료: 이미 올라간 파일 + 아직 안 올린(선택만 한) 파일
  const [files, setFiles] = useState<LessonFile[]>([])
  const [pending, setPending] = useState<File[]>([])

  async function load() {
    setLoading(true)
    try {
      setLessons(await teacher.listLessons())
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  function resetForm() {
    setForm({ ...emptyForm })
    setFiles([])
    setPending([])
  }

  async function edit(l: Lesson) {
    setForm({
      id: l.id,
      title: l.title,
      period_label: l.period_label || '',
      content: l.content,
      task: l.task,
      stage: l.stage,
      stage_guide: l.stage_guide || '',
      heart_bonus_cap: l.heart_bonus_cap,
      active: l.active,
    })
    setPending([])
    setFiles([])
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // 이 수업에 이미 올라간 자료를 불러온다
    try {
      setFiles(await teacher.listLessonFiles(l.id))
    } catch {
      /* 013 미적용 등 — 무시 */
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('수업 제목을 입력하세요.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const lesson = await teacher.saveLesson(form)
      // 선택만 해 뒀던 새 파일들을 이제 업로드한다(수업 id 가 생긴 뒤에야 가능)
      for (const f of pending) {
        const dataUrl = await readFileAsDataUrl(f)
        await teacher.addLessonFile(lesson.id, f.name, dataUrl)
      }
      resetForm()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  async function toggle(l: Lesson) {
    await teacher.toggleActive(l.id, !l.active)
    await load()
  }

  async function remove(l: Lesson) {
    if (!confirm(`'${l.title}' 수업을 삭제할까요?\n이 수업의 질문·답변·하트·새싹·자료가 모두 삭제됩니다. 되돌릴 수 없습니다.`)) return
    await teacher.deleteLesson(l.id)
    if (form.id === l.id) resetForm()
    await load()
  }

  // 파일 선택 → 크기 검증 후 대기 목록에 추가(저장 시 업로드)
  function pickFiles(list: FileList | null) {
    if (!list) return
    const chosen: File[] = []
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE_BYTES) {
        setError(`'${f.name}'이(가) 너무 큽니다(4MB 이하).`)
        continue
      }
      chosen.push(f)
    }
    if (chosen.length) setPending((p) => [...p, ...chosen])
  }

  // 이미 올라간 파일 즉시 삭제
  async function deleteFile(f: LessonFile) {
    if (!confirm(`'${f.name}' 파일을 삭제할까요?`)) return
    try {
      await teacher.deleteLessonFile(f.id)
      setFiles((fs) => fs.filter((x) => x.id !== f.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  return (
    <div className="space-y-5">
      {/* 개설/수정 폼 */}
      <section className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800">{form.id ? '수업 수정' : '새 수업 개설'}</h2>
          {form.id && (
            <button onClick={resetForm} className="text-sm text-slate-400 hover:text-slate-600">
              + 새 수업
            </button>
          )}
        </div>
        <form onSubmit={save} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input className="input flex-1" placeholder="수업 제목" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input className="input sm:w-32" placeholder="차시 (예: 1차시)" value={form.period_label} onChange={(e) => setForm({ ...form, period_label: e.target.value })} />
          </div>

          <label className="block">
            <span className="block text-sm font-bold text-slate-600 mb-1">질문 단계</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STAGES.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setForm({ ...form, stage: s })}
                  className={`touch-target rounded-xl text-sm font-bold border transition-colors ${
                    form.stage === s ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-300'
                  }`}
                >
                  {STAGE_LABEL[s]}
                </button>
              ))}
            </div>
          </label>

          <Textarea label="이번 차시 안내문 (신호어 등)" value={form.stage_guide} onChange={(v) => setForm({ ...form, stage_guide: v })} rows={2} placeholder="예: '누가/무엇을/언제' 같은 신호어를 활용해 사실을 확인하는 질문을 만들어요." />
          <Textarea label="수업 내용 / 제시문" value={form.content} onChange={(v) => setForm({ ...form, content: v })} rows={5} placeholder="학생에게 보여줄 제시문·학습 자료" />
          <Textarea label="과제 설명" value={form.task} onChange={(v) => setForm({ ...form, task: v })} rows={2} placeholder="학생이 답변을 제출할 과제" />

          <FileSection
            files={files}
            pending={pending}
            onPick={pickFiles}
            onRemovePending={(i) => setPending((p) => p.filter((_, idx) => idx !== i))}
            onDeleteFile={deleteFile}
          />

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              하트 보너스 상한
              <input type="number" min={0} max={20} className="input w-20 text-center" value={form.heart_bonus_cap} onChange={(e) => setForm({ ...form, heart_bonus_cap: +e.target.value })} />
              <span className="text-slate-400">개</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-5 h-5" />
              활성화(학생에게 보임)
            </label>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? '저장 중…' : form.id ? '수정 저장' : '수업 개설'}
          </button>
        </form>
      </section>

      {/* 수업 목록 */}
      <section className="card">
        <h2 className="font-bold text-slate-800 mb-3">
          수업 목록 <span className="text-slate-400 font-normal">({lessons.length})</span>
        </h2>
        {loading ? (
          <p className="text-slate-400 text-sm py-6 text-center">불러오는 중…</p>
        ) : lessons.length === 0 ? (
          <p className="text-slate-400 text-sm py-6 text-center">아직 개설한 수업이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {lessons.map((l) => (
              <li key={l.id} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${l.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                        {l.active ? '활성' : '비활성'}
                      </span>
                      {l.period_label && <span className="text-xs text-slate-400">{l.period_label}</span>}
                      <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">{STAGE_LABEL[l.stage]}</span>
                    </div>
                    <p className="font-bold text-slate-800 mt-1 truncate">{l.title}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-2 justify-end">
                  <button onClick={() => toggle(l)} className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1">
                    {l.active ? '비활성화' : '활성화'}
                  </button>
                  <button onClick={() => edit(l)} className="text-xs text-sky-600 hover:text-sky-800 px-2 py-1">수정</button>
                  <button onClick={() => remove(l)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1">삭제</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function FileSection({
  files,
  pending,
  onPick,
  onRemovePending,
  onDeleteFile,
}: {
  files: LessonFile[]
  pending: File[]
  onPick: (list: FileList | null) => void
  onRemovePending: (index: number) => void
  onDeleteFile: (f: LessonFile) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const empty = files.length === 0 && pending.length === 0
  return (
    <div className="block">
      <span className="block text-sm font-bold text-slate-600 mb-1">
        수업 자료 <span className="font-normal text-slate-400">(학생이 내려받아 볼 수 있어요 · 파일당 4MB 이하)</span>
      </span>
      <div className="rounded-xl border border-dashed border-slate-300 p-3 space-y-2">
        {empty && <p className="text-xs text-slate-400 text-center py-1">아직 첨부한 파일이 없어요.</p>}

        {/* 이미 올라간 파일 */}
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
            <span className="text-lg">📎</span>
            <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{f.name}</span>
            <span className="text-xs text-slate-400 shrink-0">{formatBytes(f.size)}</span>
            <button
              type="button"
              onClick={() => onDeleteFile(f)}
              className="text-xs text-red-400 hover:text-red-600 shrink-0"
            >
              삭제
            </button>
          </div>
        ))}

        {/* 저장 시 업로드될 새 파일 */}
        {pending.map((f, i) => (
          <div key={`${f.name}-${i}`} className="flex items-center gap-2 bg-emerald-50 rounded-lg px-3 py-2">
            <span className="text-lg">🆕</span>
            <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{f.name}</span>
            <span className="text-xs text-slate-400 shrink-0">{formatBytes(f.size)}</span>
            <button
              type="button"
              onClick={() => onRemovePending(i)}
              className="text-xs text-slate-400 hover:text-slate-600 shrink-0"
            >
              빼기
            </button>
          </div>
        ))}

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onPick(e.target.files)
            e.target.value = ''
          }}
        />
        <button type="button" onClick={() => inputRef.current?.click()} className="btn-secondary text-sm w-full">
          + 파일 추가
        </button>
        {pending.length > 0 && (
          <p className="text-xs text-emerald-600 text-center">새 파일은 아래 &lsquo;저장&rsquo; 시 함께 업로드됩니다.</p>
        )}
      </div>
    </div>
  )
}

function Textarea({
  label,
  value,
  onChange,
  rows,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows: number
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="block text-sm font-bold text-slate-600 mb-1">{label}</span>
      <textarea
        className="input py-3 leading-relaxed"
        style={{ minHeight: 'auto' }}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
