import { useCallback, useEffect, useState } from 'react'
import { teacher, type GroupsOverview } from '../../lib/teacherApi'
import type { Student } from '../../types'
import { useRealtime } from '../../hooks/useRealtime'
import Avatar from '../../components/Avatar'
import { downloadCsv, formatDateTime, todayStamp } from '../../lib/csv'

const EMPTY: GroupsOverview = { students: [], groups: [], stats: { classTotal: 0, groupAvg: 0, studentAvg: 0 } }

export default function GroupManager() {
  const [data, setData] = useState<GroupsOverview>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await teacher.groupsOverview())
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])
  useRealtime(['seed_log', 'students', 'groups'], load)

  const rankedGroups = [...data.groups].sort((a, b) => b.cumulative_seeds - a.cumulative_seeds)

  return (
    <div className="space-y-5">
      {/* 새싹 통계 */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="학급 전체" value={data.stats.classTotal} />
        <StatCard label="모둠 평균" value={data.stats.groupAvg} />
        <StatCard label="1인 평균" value={data.stats.studentAvg} />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <GroupsSection data={data} rankedGroups={rankedGroups} onChanged={load} />
      <StudentsSection data={data} onChanged={load} loading={loading} />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-3 text-center">
      <p className="text-emerald-100 text-xs font-bold">{label}</p>
      <p className="text-2xl font-black mt-0.5">🌱 {value}</p>
    </div>
  )
}

function GroupsSection({
  data,
  rankedGroups,
  onChanged,
}: {
  data: GroupsOverview
  rankedGroups: GroupsOverview['groups']
  onChanged: () => void
}) {
  const [newName, setNewName] = useState('')

  async function create() {
    if (!newName.trim()) return
    await teacher.createGroup(newName.trim())
    setNewName('')
    onChanged()
  }
  async function rename(id: string, cur: string) {
    const name = prompt('모둠 이름 변경', cur)
    if (name == null || !name.trim()) return
    await teacher.renameGroup(id, name.trim())
    onChanged()
  }
  async function remove(id: string, name: string) {
    if (!confirm(`'${name}' 모둠을 삭제할까요?\n소속 학생은 미배정 상태가 됩니다.`)) return
    await teacher.deleteGroup(id)
    onChanged()
  }

  const rankOf = new Map(rankedGroups.map((g, i) => [g.id, i + 1]))
  const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `${r}위`)

  return (
    <section className="card">
      <h2 className="font-bold text-slate-800 mb-3">모둠 · 랭킹</h2>
      <div className="flex gap-2 mb-3">
        <input className="input flex-1" placeholder="새 모둠 이름" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
        <button onClick={create} className="btn-primary">모둠 추가</button>
      </div>

      {data.groups.length === 0 ? (
        <p className="text-slate-400 text-sm py-3 text-center">모둠을 추가하고 아래에서 학생을 배정하세요.</p>
      ) : (
        <ul className="space-y-2">
          {data.groups.map((g) => (
            <li key={g.id} className="border border-slate-200 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{medal(rankOf.get(g.id) || 0)}</span>
                <span className="font-bold text-slate-800 flex-1">{g.name}</span>
                <span className="text-emerald-600 font-black">🌱 {g.cumulative_seeds}</span>
              </div>
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                {g.members.length === 0 ? (
                  <span className="text-xs text-slate-400">아직 배정된 학생이 없습니다</span>
                ) : (
                  g.members.map((m) => (
                    <span key={m.id} title={`${m.name} · 🌱${m.cumulative_seeds}`}>
                      <Avatar name={m.name} src={m.avatar_url} size={28} />
                    </span>
                  ))
                )}
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs text-slate-400">보유 새싹(지갑) 🌱 {g.wallet} · {g.members.length}명</span>
                <div className="flex gap-2">
                  <button onClick={() => rename(g.id, g.name)} className="text-xs text-sky-600">이름변경</button>
                  <button onClick={() => remove(g.id, g.name)} className="text-xs text-red-400">삭제</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function StudentsSection({
  data,
  onChanged,
  loading,
}: {
  data: GroupsOverview
  onChanged: () => void
  loading: boolean
}) {
  const [studentNo, setStudentNo] = useState('')
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!studentNo.trim() || !name.trim()) return
    setAdding(true)
    setError('')
    try {
      await teacher.addStudent(studentNo.trim(), name.trim())
      setStudentNo('')
      setName('')
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setAdding(false)
    }
  }
  async function regenerate(s: Student) {
    if (!confirm(`${s.name}(${s.student_no}) 코드를 재발급할까요? 기존 코드는 사용 불가해집니다.`)) return
    await teacher.regenerateCode(s.id)
    onChanged()
  }
  async function remove(s: Student) {
    if (!confirm(`${s.name}(${s.student_no}) 학생을 삭제할까요?\n질문·댓글·새싹 기록도 함께 삭제됩니다. 되돌릴 수 없습니다.`)) return
    await teacher.deleteStudent(s.id)
    onChanged()
  }
  async function assign(s: Student, groupId: string) {
    await teacher.assign(s.id, groupId || null)
    onChanged()
  }
  const [reporting, setReporting] = useState(false)

  function exportCsv() {
    downloadCsv(`학생명단_코드_새싹_${todayStamp()}.csv`, [
      ['학번', '이름', '코드', '모둠', '누적새싹'],
      ...data.students.map((s) => [
        s.student_no,
        s.name,
        s.code,
        data.groups.find((g) => g.id === s.group_id)?.name || '',
        s.cumulative_seeds,
      ]),
    ])
  }

  // 형성평가 증빙: 학생별로 언제·무엇으로 새싹을 받았는지 한 줄씩
  async function exportSeedReport() {
    setReporting(true)
    setError('')
    try {
      const rows = await teacher.seedReport()
      if (!rows.length) {
        alert('아직 지급된 새싹 내역이 없습니다.')
        return
      }
      downloadCsv(`새싹내역_${todayStamp()}.csv`, [
        ['학번', '이름', '모둠', '일시', '수업', '획득 경로', '새싹', '지급 주체', '근거 내용'],
        ...rows.map((r) => [
          r.student_no,
          r.name,
          r.group_name,
          formatDateTime(r.created_at),
          r.lesson_title,
          r.source_label,
          r.amount,
          r.granted_by === 'system' ? '자동' : '교사',
          r.ref_excerpt,
        ]),
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : '내역 불러오기 실패')
    } finally {
      setReporting(false)
    }
  }

  return (
    <section className="card">
      <h2 className="font-bold text-slate-800 mb-3">학생 등록</h2>
      <form onSubmit={add} className="flex flex-col sm:flex-row gap-2 mb-4">
        <input className="input sm:w-36" inputMode="numeric" placeholder="학번" value={studentNo} onChange={(e) => setStudentNo(e.target.value)} />
        <input className="input flex-1" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={adding} className="btn-primary">{adding ? '등록 중…' : '등록'}</button>
      </form>
      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h3 className="font-bold text-slate-700 text-sm">명단 ({data.students.length})</h3>
        <div className="flex gap-2">
          <button onClick={exportCsv} disabled={!data.students.length} className="btn-secondary text-sm">명단 CSV</button>
          <button onClick={exportSeedReport} disabled={reporting} className="btn-secondary text-sm" title="학생별로 언제·무엇으로 새싹을 받았는지 전체 내역">
            {reporting ? '만드는 중…' : '새싹 내역 CSV'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm py-6 text-center">불러오는 중…</p>
      ) : data.students.length === 0 ? (
        <p className="text-slate-400 text-sm py-6 text-center">아직 등록된 학생이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-200">
                <th className="text-left font-bold px-2 py-2">학생</th>
                <th className="text-left font-bold px-2 py-2">코드</th>
                <th className="text-left font-bold px-2 py-2">모둠</th>
                <th className="text-right font-bold px-2 py-2 whitespace-nowrap">새싹</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <Avatar name={s.name} src={s.avatar_url} size={32} />
                      <div className="leading-tight">
                        <p className="font-medium text-slate-800">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.student_no}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <span className="font-mono font-bold tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg whitespace-nowrap">
                      {s.code}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className="text-xs border border-slate-200 rounded-lg px-1.5 py-1.5 bg-white max-w-[110px]"
                      value={s.group_id || ''}
                      onChange={(e) => assign(s, e.target.value)}
                    >
                      <option value="">미배정</option>
                      {data.groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2 text-right font-bold text-slate-700 whitespace-nowrap">🌱 {s.cumulative_seeds}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">
                    <button onClick={() => regenerate(s)} className="text-xs text-slate-400 hover:text-slate-600 mr-2">재발급</button>
                    <button onClick={() => remove(s)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
