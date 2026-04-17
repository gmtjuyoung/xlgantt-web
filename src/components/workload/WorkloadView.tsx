import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import { useResourceStore } from '@/stores/resource-store'
import { useCalendarStore } from '@/stores/calendar-store'
import { countWorkingDays } from '@/lib/calendar-calc'
import { cn } from '@/lib/utils'
import { format, eachMonthOfInterval, eachWeekOfInterval, startOfWeek, endOfWeek, startOfMonth, endOfMonth, getISOWeek } from 'date-fns'
import { AlertTriangle } from 'lucide-react'
import type { Task } from '@/lib/types'
import type { TeamMember, Company, TaskAssignment } from '@/lib/resource-types'

type TimeBucket = 'monthly' | 'weekly'
type WorkloadBasis = 'planned' | 'earned' | 'remaining'

// ============================================================
// Workload calculation engine
// ============================================================

interface CrosstabCell {
  memberId: string
  memberName: string
  companyColor: string
  bucketKey: string
  workload: number
}

function buildCrosstab(
  tasks: Task[],
  assignments: TaskAssignment[],
  members: TeamMember[],
  companies: Company[],
  projectStart: string,
  projectEnd: string,
  timeBucket: TimeBucket,
  basis: WorkloadBasis
) {
  const start = new Date(projectStart)
  const end = new Date(projectEnd)

  // Generate time buckets
  const buckets: { key: string; label: string; start: Date; end: Date }[] = []

  if (timeBucket === 'monthly') {
    const months = eachMonthOfInterval({ start, end })
    for (const m of months) {
      buckets.push({
        key: format(m, 'yyyy-MM'),
        label: format(m, 'M월'),
        start: startOfMonth(m),
        end: endOfMonth(m),
      })
    }
  } else {
    const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 })
    for (const w of weeks) {
      const wNum = getISOWeek(w)
      buckets.push({
        key: `W${String(wNum).padStart(2, '0')}`,
        label: `W${wNum}`,
        start: startOfWeek(w, { weekStartsOn: 1 }),
        end: endOfWeek(w, { weekStartsOn: 1 }),
      })
    }
  }

  // Build cells: for each member × bucket, calculate selected workload basis
  const cells: CrosstabCell[] = []
  const leafTasks = tasks.filter((t) => !t.is_group)
  const assignmentMap = new Map<string, TaskAssignment[]>()
  for (const a of assignments) {
    if (!assignmentMap.has(a.task_id)) assignmentMap.set(a.task_id, [])
    assignmentMap.get(a.task_id)!.push(a)
  }

  for (const member of members) {
    const company = companies.find((c) => c.id === member.company_id)
    const memberAssigns = assignments.filter((a) => a.member_id === member.id)
    if (memberAssigns.length === 0) continue

    for (const bucket of buckets) {
      let totalWorkload = 0

      for (const assign of memberAssigns) {
        const task = leafTasks.find((t) => t.id === assign.task_id)
        if (!task || !task.planned_start || !task.planned_end || !task.total_workload) continue

        const taskStart = new Date(task.planned_start)
        const taskEnd = new Date(task.planned_end)

        // Check overlap with bucket
        if (taskStart > bucket.end || taskEnd < bucket.start) continue

        const overlapStart = taskStart > bucket.start ? taskStart : bucket.start
        const overlapEnd = taskEnd < bucket.end ? taskEnd : bucket.end
        const taskDuration = Math.max(1, (taskEnd.getTime() - taskStart.getTime()) / 86400000)
        const overlapDuration = (overlapEnd.getTime() - overlapStart.getTime()) / 86400000 + 1
        const ratio = overlapDuration / taskDuration
        const allocationRatio = assign.allocation_percent / 100
        const plannedChunk = task.total_workload * ratio * allocationRatio

        const taskAssigns = assignmentMap.get(task.id) || []
        const hasMeaningfulAssignmentProgress = taskAssigns.some((a) => (a.progress_percent || 0) > 0)
        const memberProgress = hasMeaningfulAssignmentProgress
          ? Math.max(0, Math.min(100, assign.progress_percent || 0)) / 100
          : Math.max(0, Math.min(1, task.actual_progress || 0))
        const earnedChunk = plannedChunk * memberProgress
        const remainingChunk = Math.max(0, plannedChunk - earnedChunk)

        if (basis === 'planned') totalWorkload += plannedChunk
        else if (basis === 'earned') totalWorkload += earnedChunk
        else totalWorkload += remainingChunk
      }

      if (totalWorkload > 0) {
        cells.push({
          memberId: member.id,
          memberName: member.name,
          companyColor: company?.color || '#888',
          bucketKey: bucket.key,
          workload: Math.round(totalWorkload * 100) / 100,
        })
      }
    }
  }

  return { buckets, cells }
}

// ============================================================
// Overallocation info per member x bucket
// ============================================================

interface OverallocationInfo {
  memberId: string
  memberName: string
  bucketKey: string
  workload: number
  capacity: number
}

function computeOverallocations(
  cells: CrosstabCell[],
  buckets: { key: string; start: Date; end: Date }[],
  members: TeamMember[],
  timeBucket: TimeBucket,
  workingDaysPerWeek: number[],
  holidaySet: Set<string>,
  defaultCapacity: number,
): OverallocationInfo[] {
  const result: OverallocationInfo[] = []

  const memberIds = new Set(cells.map((c) => c.memberId))

  for (const memberId of memberIds) {
    const member = members.find((m) => m.id === memberId)
    if (!member) continue

    for (const bucket of buckets) {
      const cell = cells.find((c) => c.memberId === memberId && c.bucketKey === bucket.key)
      const workload = cell?.workload || 0
      if (workload <= 0) continue

      let capacity: number
      if (timeBucket === 'monthly') {
        // Use calendar store to compute actual working days in this month
        const days = countWorkingDays(bucket.start, bucket.end, workingDaysPerWeek, holidaySet)
        capacity = days > 0 ? days : defaultCapacity
      } else {
        // Weekly: count working days in this week
        const days = countWorkingDays(bucket.start, bucket.end, workingDaysPerWeek, holidaySet)
        capacity = days > 0 ? days : 5
      }

      if (workload > capacity) {
        result.push({
          memberId,
          memberName: member.name,
          bucketKey: bucket.key,
          workload,
          capacity,
        })
      }
    }
  }

  return result
}

// ============================================================
// Component
// ============================================================

export function WorkloadView() {
  const tasks = useTaskStore((s) => s.tasks)
  const project = useProjectStore((s) => s.currentProject)
  const { companies, members, assignments } = useResourceStore()
  const [timeBucket, setTimeBucket] = useState<TimeBucket>('monthly')
  const [basis, setBasis] = useState<WorkloadBasis>('planned')

  // Calendar data for capacity calculation
  const getWorkingDaysFor = useCalendarStore((s) => s.getWorkingDaysFor)
  const getHolidaySet = useCalendarStore((s) => s.getHolidaySet)
  const workingDays = getWorkingDaysFor('STD')
  const holidaySet = getHolidaySet('STD')

  const DEFAULT_MONTHLY_CAPACITY = 22 // M/D per month baseline

  const { buckets, cells } = useMemo(() => {
    if (!project) return { buckets: [], cells: [] }
    return buildCrosstab(tasks, assignments, members, companies, project.start_date, project.end_date, timeBucket, basis)
  }, [tasks, assignments, members, companies, project, timeBucket, basis])

  // Get unique members who have assignments
  const activeMembers = useMemo(() => {
    const memberIds = new Set(cells.map((c) => c.memberId))
    return members.filter((m) => memberIds.has(m.id)).map((m) => ({
      ...m,
      color: companies.find((c) => c.id === m.company_id)?.color || '#888',
    }))
  }, [cells, members, companies])

  // Overallocation detection
  const overallocations = useMemo(() => {
    if (buckets.length === 0 || cells.length === 0) return []
    return computeOverallocations(cells, buckets, members, timeBucket, workingDays, holidaySet, DEFAULT_MONTHLY_CAPACITY)
  }, [cells, buckets, members, timeBucket, workingDays, holidaySet])

  const overallocatedMembers = useMemo(() => {
    const ids = new Set(overallocations.map((o) => o.memberId))
    return ids.size
  }, [overallocations])

  // Quick lookup: is (memberId, bucketKey) overallocated?
  const overallocationMap = useMemo(() => {
    const map = new Map<string, OverallocationInfo>()
    for (const o of overallocations) {
      map.set(`${o.memberId}__${o.bucketKey}`, o)
    }
    return map
  }, [overallocations])

  // Bucket capacity lookup for reference line
  const bucketCapacities = useMemo(() => {
    const caps: Record<string, number> = {}
    for (const bucket of buckets) {
      if (timeBucket === 'monthly') {
        const days = countWorkingDays(bucket.start, bucket.end, workingDays, holidaySet)
        caps[bucket.key] = days > 0 ? days : DEFAULT_MONTHLY_CAPACITY
      } else {
        const days = countWorkingDays(bucket.start, bucket.end, workingDays, holidaySet)
        caps[bucket.key] = days > 0 ? days : 5
      }
    }
    return caps
  }, [buckets, timeBucket, workingDays, holidaySet])

  // Stacked histogram data for chart
  const histogramData = useMemo(() => {
    return buckets.map((bucket) => {
      const row: Record<string, number | string> = { name: bucket.label }
      let total = 0
      for (const member of activeMembers) {
        const cell = cells.find((c) => c.memberId === member.id && c.bucketKey === bucket.key)
        const val = cell?.workload || 0
        row[member.name] = val
        total += val
      }
      row['_total'] = total
      return row
    })
  }, [buckets, cells, activeMembers])

  // Crosstab table: member rows × bucket columns
  const crosstabRows = useMemo(() => {
    return activeMembers.map((member) => {
      const row: Record<string, number> = {}
      let total = 0
      for (const bucket of buckets) {
        const cell = cells.find((c) => c.memberId === member.id && c.bucketKey === bucket.key)
        const val = cell?.workload || 0
        row[bucket.key] = val
        total += val
      }
      return { member, bucketValues: row, total: Math.round(total * 100) / 100 }
    })
  }, [activeMembers, buckets, cells])

  // Bucket totals
  const bucketTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const bucket of buckets) {
      totals[bucket.key] = cells
        .filter((c) => c.bucketKey === bucket.key)
        .reduce((sum, c) => sum + c.workload, 0)
    }
    return totals
  }, [buckets, cells])

  if (!project) return null

  const hasData = activeMembers.length > 0

  // Average capacity across all buckets for chart reference line
  const avgCapacity = buckets.length > 0
    ? Math.round(Object.values(bucketCapacities).reduce((s, v) => s + v, 0) / buckets.length)
    : DEFAULT_MONTHLY_CAPACITY

  return (
    <div className="p-6 max-w-full mx-auto overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">작업량 현황</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{project.name} - 리소스별 {basis === 'planned' ? '계획' : basis === 'earned' ? '실적' : '잔여'} 작업량 배분</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 기간 전환 토글 */}
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5">
            <button
              onClick={() => setTimeBucket('monthly')}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                timeBucket === 'monthly' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              월별
            </button>
            <button
              onClick={() => setTimeBucket('weekly')}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                timeBucket === 'weekly' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              주별
            </button>
          </div>

          {/* 기준 전환 토글 */}
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5">
            <button
              onClick={() => setBasis('planned')}
              className={cn("px-3 py-1 text-xs font-medium rounded-md transition-colors", basis === 'planned' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              계획
            </button>
            <button
              onClick={() => setBasis('earned')}
              className={cn("px-3 py-1 text-xs font-medium rounded-md transition-colors", basis === 'earned' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              실적
            </button>
            <button
              onClick={() => setBasis('remaining')}
              className={cn("px-3 py-1 text-xs font-medium rounded-md transition-colors", basis === 'remaining' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              잔여
            </button>
          </div>
        </div>
      </div>

      {/* Overallocation warning banner */}
      {overallocatedMembers > 0 && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">
            {overallocatedMembers}명의 담당자가 과배정되었습니다
          </span>
          <span className="text-xs text-red-500 dark:text-red-500 ml-1">
            (용량 초과 셀 {overallocations.length}건)
          </span>
        </div>
      )}

      {!hasData ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">담당자가 배정된 작업이 없습니다.</p>
          <p className="text-xs mt-1">작업 상세 편집 &rarr; 담당자 탭에서 배정해주세요.</p>
        </div>
      ) : (
        <>
          {/* Stacked Histogram */}
          <div className="bg-card rounded-xl border border-border/50 p-5 mb-6 shadow-sm">
            <h3 className="text-sm font-semibold mb-4">리소스별 {basis === 'planned' ? '계획' : basis === 'earned' ? '실적' : '잔여'} 작업량 히스토그램 (M/D)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={histogramData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 250)" />
                <XAxis dataKey="name" fontSize={10} tick={{ fill: 'oklch(0.5 0.02 250)' }} />
                <YAxis fontSize={11} tick={{ fill: 'oklch(0.5 0.02 250)' }} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid oklch(0.91 0.01 250)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '11px' }}
                  formatter={(value, name) => [`${Number(value).toFixed(1)} M/D`, name]}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                {/* Capacity reference line (per person average) */}
                {activeMembers.length > 0 && (
                  <ReferenceLine
                    y={avgCapacity * activeMembers.length}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={{ value: `용량 ${avgCapacity * activeMembers.length} M/D`, position: 'right', fontSize: 10, fill: '#ef4444' }}
                  />
                )}
                {activeMembers.map((member) => (
                  <Bar key={member.id} dataKey={member.name} stackId="a" fill={member.color} radius={[0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Crosstab Table */}
          <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
              <h3 className="text-sm font-semibold">리소스 x 기간 크로스탭</h3>
              <span className="text-xs text-muted-foreground">{timeBucket === 'monthly' ? '월별' : '주별'} · {basis === 'planned' ? '계획' : basis === 'earned' ? '실적' : '잔여'} 기준 · 단위: M/D</span>
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-muted/30 z-10 min-w-[120px]">담당자</th>
                    {buckets.map((b) => (
                      <th key={b.key} className="text-right px-2 py-2 font-semibold min-w-[60px]">
                        <div>{b.label}</div>
                        <div className="text-[9px] font-normal text-muted-foreground/60">{bucketCapacities[b.key]}d</div>
                      </th>
                    ))}
                    <th className="text-right px-3 py-2 font-semibold bg-muted/50 min-w-[70px]">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {crosstabRows.map((row, i) => (
                    <tr key={row.member.id} className={cn("border-t border-border/20 hover:bg-accent/20", i % 2 === 1 && "bg-muted/10")}>
                      <td className="px-3 py-1.5 font-medium sticky left-0 bg-card z-10 flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-white font-bold flex-shrink-0"
                          style={{ backgroundColor: row.member.color }}>
                          {row.member.name.charAt(0)}
                        </div>
                        {row.member.name}
                      </td>
                      {buckets.map((b) => {
                        const val = row.bucketValues[b.key] || 0
                        const overInfo = overallocationMap.get(`${row.member.id}__${b.key}`)
                        const isOverload = !!overInfo
                        return (
                          <td
                            key={b.key}
                            className={cn(
                              "text-right px-2 py-1.5 font-mono relative",
                              val > 0 ? 'text-foreground' : 'text-muted-foreground/30',
                              isOverload && 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-semibold'
                            )}
                            title={isOverload ? `과배정: ${val.toFixed(1)} / ${overInfo.capacity} M/D` : undefined}
                          >
                            <span className="flex items-center justify-end gap-0.5">
                              {isOverload && (
                                <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
                              )}
                              {val > 0 ? val.toFixed(1) : '\u2014'}
                            </span>
                          </td>
                        )
                      })}
                      <td className="text-right px-3 py-1.5 font-mono font-semibold bg-muted/20">{row.total.toFixed(1)}</td>
                    </tr>
                  ))}
                  {/* Capacity row */}
                  <tr className="border-t border-border/30 bg-blue-50/30 dark:bg-blue-950/10 text-blue-600 dark:text-blue-400 text-[10px]">
                    <td className="px-3 py-1 sticky left-0 bg-blue-50/30 dark:bg-blue-950/10 z-10 font-medium">용량 (1인)</td>
                    {buckets.map((b) => (
                      <td key={b.key} className="text-right px-2 py-1 font-mono">
                        {bucketCapacities[b.key]}
                      </td>
                    ))}
                    <td className="text-right px-3 py-1 font-mono bg-muted/20">
                      {Object.values(bucketCapacities).reduce((s, v) => s + v, 0)}
                    </td>
                  </tr>
                  {/* Totals row */}
                  <tr className="border-t-2 border-border/50 bg-muted/30 font-semibold">
                    <td className="px-3 py-2 sticky left-0 bg-muted/30 z-10">합계</td>
                    {buckets.map((b) => {
                      const total = bucketTotals[b.key] || 0
                      const cap = bucketCapacities[b.key] * activeMembers.length
                      const isOverload = total > cap
                      return (
                        <td key={b.key} className={cn(
                          "text-right px-2 py-2 font-mono",
                          isOverload && 'text-red-600 dark:text-red-400'
                        )}>
                          {total > 0 ? total.toFixed(1) : '\u2014'}
                        </td>
                      )
                    })}
                    <td className="text-right px-3 py-2 font-mono bg-muted/40">
                      {crosstabRows.reduce((s, r) => s + r.total, 0).toFixed(1)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
