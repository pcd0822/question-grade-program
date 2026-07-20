import { useEffect, useRef, useState } from 'react'
import { teacher } from '../../lib/teacherApi'
import { compressToSquare } from '../../lib/imageCompress'
import Avatar from '../../components/Avatar'
import type { Badge, Lesson, Student } from '../../types'

export default function BadgeManager() {
  const [badges, setBadges] = useState<Badge[]>([])
  const [awarded, setAwarded] = useState<{ student_id: string; badge_id: string }[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [openBadge, setOpenBadge] = useState<string | null>(null)

  // 등록 폼
  const [name, setName] = useState('')
  const [condition, setCondition] = useState('')
  const [lessonId, setLessonId] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    const [b, ss, ls] = await Promise.all([teacher.listBadges(), teacher.listStudents(), teacher.listLessons()])
    setBadges(b.badges)
    setAwarded(b.awarded)
    setStudents(ss)
    setLessons(ls)
  }
  useEffect(() => {
    load()
  }, [])

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImageDataUrl(await compressToSquare(file, 200))
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await teacher.createBadge(name.trim(), condition.trim(), lessonId || null, imageDataUrl)
      setName('')
      setCondition('')
      setLessonId('')
      setImageDataUrl(null)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : '등록 실패')
    } finally {
      setSaving(false)
    }
  }

  async function removeBadge(b: Badge) {
    if (!confirm(`'${b.name}' 배지를 삭제할까요?\n부여된 학생들의 배지도 함께 사라집니다.`)) return
    await teacher.deleteBadge(b.id)
    await load()
  }

  async function toggleAward(badgeId: string, studentId: string, has: boolean) {
    if (has) await teacher.revokeBadge(studentId, badgeId)
    else await teacher.awardBadge(studentId, badgeId)
    await load()
  }

  const holdersOf = (badgeId: string) => new Set(awarded.filter((a) => a.badge_id === badgeId).map((a) => a.student_id))

  return (
    <div className="space-y-5">
      {/* 등록 */}
      <section className="card">
        <h2 className="font-bold text-slate-800 mb-3">배지 등록</h2>
        <form onSubmit={create} className="space-y-2">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => fileRef.current?.click()} className="shrink-0" title="배지 이미지">
              {imageDataUrl ? (
                <img src={imageDataUrl} alt="배지" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center text-2xl">🏅</div>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
            <div className="flex-1 space-y-2">
              <input className="input" placeholder="배지 이름 (예: 행위자 추적가)" value={name} onChange={(e) => setName(e.target.value)} />
              <select className="input" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
                <option value="">수업 연결 안 함(전체)</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>
          </div>
          <textarea className="input py-2" rows={2} placeholder="부여 조건 (예: 숨은 행위자 5개 이상 식별)" value={condition} onChange={(e) => setCondition(e.target.value)} />
          <button type="submit" disabled={saving} className="btn-primary w-full">{saving ? '등록 중…' : '배지 등록'}</button>
        </form>
      </section>

      {/* 목록 + 부여 */}
      <section className="card">
        <h2 className="font-bold text-slate-800 mb-3">배지 목록 · 부여 <span className="text-slate-400 font-normal">({badges.length})</span></h2>
        {badges.length === 0 ? (
          <p className="text-slate-400 text-sm py-4 text-center">아직 등록된 배지가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {badges.map((b) => {
              const holders = holdersOf(b.id)
              const opened = openBadge === b.id
              return (
                <li key={b.id} className="border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    <BadgeImg badge={b} size={44} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800">{b.name}</p>
                      {b.condition && <p className="text-xs text-slate-400">{b.condition}</p>}
                      <p className="text-xs text-emerald-600 mt-0.5">부여됨 {holders.size}명</p>
                    </div>
                    <button onClick={() => setOpenBadge(opened ? null : b.id)} className="btn-secondary text-sm">
                      {opened ? '닫기' : '부여하기'}
                    </button>
                    <button onClick={() => removeBadge(b)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                  </div>

                  {opened && (
                    <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {students.map((s) => {
                        const has = holders.has(s.id)
                        return (
                          <li key={s.id}>
                            <button
                              onClick={() => toggleAward(b.id, s.id, has)}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors ${
                                has ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200 hover:border-emerald-200'
                              }`}
                            >
                              <Avatar name={s.name} src={s.avatar_url} size={28} />
                              <span className="flex-1 text-sm truncate">{s.name} <span className="text-xs text-slate-400">{s.student_no}</span></span>
                              <span className={`text-sm font-bold ${has ? 'text-emerald-600' : 'text-slate-300'}`}>{has ? '✓ 부여됨' : '부여'}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

export function BadgeImg({ badge, size = 40 }: { badge: Badge; size?: number }) {
  if (badge.image_url) {
    return <img src={badge.image_url} alt={badge.name} style={{ width: size, height: size }} className="rounded-xl object-cover border border-slate-200 shrink-0" />
  }
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.5 }} className="rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
      🏅
    </div>
  )
}
