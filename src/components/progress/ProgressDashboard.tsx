import { useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import { useResourceStore } from '@/stores/resource-store'
import { useAuthStore } from '@/stores/auth-store'
import {
  calculateProjectMetrics,
  generateMonthlyProgress,
  generateWeeklyProgress,
  generateDailyProgress,
  calcProgressByResource,
  calcProgressByCompany,
  calcProgressByWBSGroup,
  calcProgressByTask,
} from '@/lib/progress-calc'
import type { ProjectMetrics } from '@/lib/progress-calc'
import type { Task } from '@/lib/types'
import type { Company, TaskAssignment, TeamMember } from '@/lib/resource-types'
import { cn } from '@/lib/utils'
import { TrendingUp, Users, BarChart3, CalendarDays, AlertTriangle } from 'lucide-react'

type ProgressTab = 'overview' | 'timeline' | 'breakdown' | 'insight'

const TABS: { key: ProgressTab; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: '전체', icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { key: 'timeline', label: '일정 추이', icon: <CalendarDays className="h-3.5 w-3.5" /> },
  { key: 'breakdown', label: '개인·업무 분해', icon: <Users className="h-3.5 w-3.5" /> },
  { key: 'insight', label: '분석·작업량', icon: <TrendingUp className="h-3.5 w-3.5" /> },
]

export function ProgressDashboard() {
  const [activeTab, setActiveTab] = useState<ProgressTab>('overview')
  const [onlyMine, setOnlyMine] = useState(false)
  const allTasks = useTaskStore((s) => s.tasks)
  const project = useProjectStore((s) => s.currentProject)
  const { companies, members, assignments } = useResourceStore()
  const currentUser = useAuthStore((s) => s.currentUser)

  // 내 작업만 필터
  const myMember = useMemo(() => {
    if (!currentUser) return null
    return members.find((m) => m.email === currentUser.email) || members.find((m) => m.name === currentUser.name) || null
  }, [currentUser, members])

  const myTaskIds = useMemo(() => {
    if (!myMember) return new Set<string>()
    return new Set(assignments.filter((a) => a.member_id === myMember.id).map((a) => a.task_id))
  }, [myMember, assignments])

  const tasks = useMemo(() => {
    if (!onlyMine || !myMember) return allTasks
    return allTasks.filter((t) => myTaskIds.has(t.id) || t.is_group)
  }, [allTasks, onlyMine, myMember, myTaskIds])

  const statusDate = project?.status_date
  const metrics = useMemo(() => calculateProjectMetrics(tasks, statusDate, assignments), [tasks, statusDate, assignments])

  if (!project) return null

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[linear-gradient(to_bottom,oklch(0.985_0.004_250)_0%,oklch(0.972_0.006_250)_100%)]">
      {/* Header */}
      <div className="flex-none px-5 pt-5 pb-0 md:px-6 xl:px-8">
        <div className="mx-auto w-full max-w-[1520px]">
          <div className="overflow-hidden rounded-[28px] border border-[oklch(0.84_0.014_250)] bg-[oklch(0.992_0.003_250)] shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="grid gap-5 border-b border-[oklch(0.9_0.01_250)] px-6 py-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:px-8">
              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[oklch(0.48_0.02_250)]">Project Control Board</div>
                <div className="max-w-4xl text-[2rem] font-black tracking-[-0.04em] text-[oklch(0.24_0.02_250)] lg:text-[2.65rem]">
                  진척 현황
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[oklch(0.42_0.018_250)]">
                  <span className="font-semibold text-[oklch(0.29_0.02_250)]">{project.name}</span>
                  <span>{project.start_date} ~ {project.end_date}</span>
                  {statusDate && <span className="rounded-full bg-[oklch(0.95_0.01_250)] px-2.5 py-1 text-xs font-medium text-[oklch(0.34_0.02_250)]">기준일 {statusDate}</span>}
                </div>
              </div>

              <div className="grid gap-3 rounded-[22px] border border-[oklch(0.9_0.01_250)] bg-[oklch(0.975_0.005_250)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[oklch(0.48_0.02_250)]">Scope</div>
                <div className="text-sm font-semibold text-[oklch(0.28_0.02_250)]">{onlyMine ? '내 배정 업무 기준' : '프로젝트 전체 기준'}</div>
                {myMember ? (
                  <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-[oklch(0.88_0.012_250)] bg-white px-3 py-2.5 transition-colors hover:bg-[oklch(0.985_0.004_250)]">
                    <div>
                      <div className="text-sm font-semibold text-[oklch(0.28_0.02_250)]">내 작업만 보기</div>
                      <div className="text-xs text-muted-foreground">모든 그룹 화면에 동일 필터 적용</div>
                    </div>
                    <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="h-4 w-4 rounded accent-primary" />
                  </label>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[oklch(0.88_0.012_250)] px-3 py-2.5 text-xs text-muted-foreground">
                    사용자와 담당자 매칭 시 개인 필터를 사용할 수 있습니다.
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 px-4 py-4 lg:px-6">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'inline-flex min-w-[124px] items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold tracking-[-0.02em] transition-all',
                    activeTab === tab.key
                      ? 'border-[oklch(0.79_0.03_250)] bg-[oklch(0.24_0.02_250)] text-white shadow-[0_8px_24px_rgba(15,23,42,0.16)]'
                      : 'border-[oklch(0.89_0.012_250)] bg-white text-[oklch(0.45_0.02_250)] hover:border-[oklch(0.79_0.03_250)] hover:text-[oklch(0.24_0.02_250)]'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-6 px-5 py-6 md:px-6 xl:px-8">
        {activeTab === 'overview' && <OverviewTab metrics={metrics} />}
        {activeTab === 'timeline' && (
          <TimelineTab
            tasks={tasks}
            assignments={assignments}
            projectStart={project.start_date}
            projectEnd={project.end_date}
          />
        )}
        {activeTab === 'breakdown' && (
          <BreakdownTab
            tasks={tasks}
            assignments={assignments}
            members={members}
            companies={companies}
            statusDate={statusDate}
          />
        )}
        {activeTab === 'insight' && <InsightTab tasks={tasks} assignments={assignments} members={members} companies={companies} statusDate={statusDate} />}
        </div>
      </div>
    </div>
  )
}

function TimelineTab({
  tasks,
  assignments,
  projectStart,
  projectEnd,
}: {
  tasks: Task[]
  assignments: TaskAssignment[]
  projectStart: string
  projectEnd: string
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <MonthlyTab tasks={tasks} projectStart={projectStart} projectEnd={projectEnd} />
        <WeeklyTab tasks={tasks} projectStart={projectStart} projectEnd={projectEnd} />
      </div>
      <DailyTab tasks={tasks} assignments={assignments} projectStart={projectStart} projectEnd={projectEnd} />
    </div>
  )
}

function BreakdownTab({
  tasks,
  assignments,
  members,
  companies,
  statusDate,
}: {
  tasks: Task[]
  assignments: TaskAssignment[]
  members: TeamMember[]
  companies: Company[]
  statusDate?: string
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ResourceTab tasks={tasks} assignments={assignments} members={members} companies={companies} statusDate={statusDate} />
        <TaskTab tasks={tasks} assignments={assignments} statusDate={statusDate} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <CompanyTab tasks={tasks} assignments={assignments} members={members} companies={companies} statusDate={statusDate} />
        <WBSGroupTab tasks={tasks} statusDate={statusDate} />
      </div>
    </div>
  )
}

function InsightTab({
  tasks,
  assignments,
  members,
  companies,
  statusDate,
}: {
  tasks: Task[]
  assignments: TaskAssignment[]
  members: TeamMember[]
  companies: Company[]
  statusDate?: string
}) {
  const taskData = useMemo(() => calcProgressByTask(tasks, statusDate, assignments), [tasks, statusDate, assignments])
  const resourceData = useMemo(() => calcProgressByResource(tasks, assignments, members, companies, statusDate), [tasks, assignments, members, companies, statusDate])
  const companyData = useMemo(() => calcProgressByCompany(tasks, assignments, members, companies, statusDate), [tasks, assignments, members, companies, statusDate])
  const plannedTasks = tasks.filter((task) => task.planned_start && task.planned_end)
  const derivedStart = plannedTasks.length > 0
    ? plannedTasks.reduce((min, task) => (task.planned_start! < min ? task.planned_start! : min), plannedTasks[0].planned_start!)
    : undefined
  const derivedEnd = plannedTasks.length > 0
    ? plannedTasks.reduce((max, task) => (task.planned_end! > max ? task.planned_end! : max), plannedTasks[0].planned_end!)
    : undefined
  const dailyData = useMemo(() => {
    if (!derivedStart || !derivedEnd) return []
    return generateDailyProgress(tasks, derivedStart, derivedEnd, assignments)
  }, [tasks, derivedStart, derivedEnd, assignments])

  const latestDaily = dailyData.at(-1)
  const topRisks = [...taskData].sort((a, b) => a.gap - b.gap).slice(0, 5)
  const topContributors = [...resourceData].sort((a, b) => b.earnedValue - a.earnedValue).slice(0, 6)
  const companySummary = [...companyData].sort((a, b) => b.totalWorkload - a.totalWorkload)
  const delayedCount = taskData.filter((task) => task.isDelayed).length
  const avgProgress = taskData.length > 0 ? taskData.reduce((sum, task) => sum + task.progressRate, 0) / taskData.length : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MiniStatCard label="평균 업무 진척률" value={`${(avgProgress * 100).toFixed(1)}%`} tone="blue" />
        <MiniStatCard label="지연 업무 수" value={`${delayedCount}`} tone={delayedCount > 0 ? 'red' : 'green'} />
        <MiniStatCard
          label="상위 기여자 EV"
          value={topContributors.length > 0 ? topContributors[0].earnedValue.toFixed(1) : '0.0'}
          suffix="M/D"
          tone="green"
        />
        <MiniStatCard
          label="현재 누적 실적률"
          value={latestDaily ? `${(latestDaily.evRate * 100).toFixed(1)}%` : '0.0%'}
          tone="blue"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
        <Card title="위험 업무 Top 5">
          {topRisks.length === 0 ? (
            <EmptyState message="위험 업무가 없습니다." />
          ) : (
            <div className="space-y-3">
              {topRisks.map((task) => (
                <div key={task.taskId} className="rounded-lg border border-border/50 bg-muted/15 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">{task.wbsCode}</div>
                      <div className="font-medium">{task.taskName}</div>
                    </div>
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium', task.isDelayed ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700')}>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {task.isDelayed ? '지연' : '주의'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                    <MetricInline label="계획" value={`${(task.plannedRate * 100).toFixed(1)}%`} color="text-blue-600" />
                    <MetricInline label="실적" value={`${(task.progressRate * 100).toFixed(1)}%`} color="text-emerald-600" />
                    <MetricInline label="차이" value={`${task.gap >= 0 ? '+' : ''}${(task.gap * 100).toFixed(1)}%`} color={task.gap >= 0 ? 'text-blue-600' : 'text-red-500'} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="상위 기여자">
          {topContributors.length === 0 ? (
            <EmptyState message="기여자 데이터가 없습니다." />
          ) : (
            <div className="space-y-3">
              {topContributors.map((member) => (
                <div key={member.memberId} className="rounded-lg border border-border/50 bg-card p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{member.memberName}</div>
                      <div className="text-xs text-muted-foreground">{member.companyName}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">{member.earnedValue.toFixed(1)} M/D</div>
                      <div className="text-xs text-muted-foreground">EV</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <ProgressMiniBar value={member.progressRate} color={member.companyColor} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="회사별 작업량 분포">
          {companySummary.length === 0 ? (
            <EmptyState message="회사 데이터가 없습니다." />
          ) : (
            <div className="space-y-3">
              {companySummary.map((company) => (
                <div key={company.companyId} className="grid grid-cols-[minmax(0,1fr)_100px_70px] items-center gap-3 rounded-lg border border-border/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{company.companyName}</div>
                    <div className="text-xs text-muted-foreground">{company.memberCount}명 · {company.assignedTaskCount}건</div>
                  </div>
                  <div className="text-right text-sm font-semibold">{company.totalWorkload.toFixed(1)} M/D</div>
                  <div className="text-right text-sm text-muted-foreground">{(company.progressRate * 100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="일자 기준 누적 스냅샷">
          {dailyData.length === 0 ? (
            <EmptyState message="일자 데이터가 없습니다." />
          ) : (
            <div className="space-y-3">
              {dailyData.slice(-7).map((day) => (
                <div key={day.date} className="grid grid-cols-[92px_minmax(0,1fr)_72px_72px] items-center gap-3 rounded-lg border border-border/40 px-3 py-2.5">
                  <div className="text-xs font-mono text-muted-foreground">{day.dateLabel}</div>
                  <div className="space-y-1">
                    <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-400" style={{ width: `${Math.min(day.plannedRate * 100, 100)}%` }} />
                    </div>
                    <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(day.evRate * 100, 100)}%` }} />
                    </div>
                  </div>
                  <div className="text-right text-xs text-blue-600">{(day.plannedRate * 100).toFixed(0)}%</div>
                  <div className="text-right text-xs text-emerald-600">{(day.evRate * 100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ============================================================
// 전체 (Overview) - 카드 대시보드
// ============================================================
function OverviewTab({ metrics }: { metrics: ProjectMetrics }) {
  const plannedPct = (metrics.plannedRate * 100)
  const actualPct = (metrics.actualRate * 100)
  const gapPct = (metrics.rateGap * 100)

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="overflow-hidden rounded-[26px] border border-[oklch(0.85_0.014_250)] bg-white shadow-[0_20px_40px_rgba(15,23,42,0.06)]">
          <div className="grid gap-5 px-6 py-6 lg:grid-cols-[196px_minmax(0,1fr)] lg:px-7">
            <div className="flex flex-col items-center justify-center rounded-[22px] bg-[oklch(0.972_0.006_250)] p-5">
              <RingGauge planned={plannedPct} actual={actualPct} size={132} />
              <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[oklch(0.48_0.02_250)]">Progress Signal</div>
            </div>

            <div className="flex flex-col justify-between gap-5">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[oklch(0.48_0.02_250)]">Execution Summary</div>
                <div className="mt-2 text-3xl font-black tracking-[-0.05em] text-[oklch(0.22_0.02_250)]">
                  {(actualPct).toFixed(1)}%
                </div>
                <div className="mt-1 text-sm text-[oklch(0.45_0.018_250)]">실적 진척률 기준 현재 프로젝트 실행 상태</div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <SignalMetric label="계획" value={`${plannedPct.toFixed(1)}%`} trackColor="bg-blue-400" width={plannedPct} />
                <SignalMetric label="실적" value={`${actualPct.toFixed(1)}%`} trackColor="bg-emerald-400" width={actualPct} />
                <SignalMetric label="차이" value={`${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(1)}%`} trackColor={gapPct >= 0 ? 'bg-blue-500' : 'bg-red-400'} width={Math.min(Math.abs(gapPct), 100)} />
              </div>

              <div className="grid gap-3 border-t border-[oklch(0.91_0.01_250)] pt-4 md:grid-cols-3">
                <MetricInline label="총 작업량" value={`${metrics.totalWorkload.toFixed(1)} M/D`} color="text-[oklch(0.24_0.02_250)]" />
                <MetricInline label="계획 작업량" value={`${metrics.plannedWorkload.toFixed(1)} M/D`} color="text-blue-700" />
                <MetricInline label="실적 작업량" value={`${metrics.actualWorkload.toFixed(1)} M/D`} color="text-emerald-700" />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-rows-2">
          <KpiCard
            label="일정 성과"
            sublabel="실적 / 계획 비율"
            value={metrics.spi.toFixed(2)}
            status={metrics.spi >= 1 ? 'good' : metrics.spi >= 0.9 ? 'warn' : 'bad'}
            desc={metrics.spi >= 1 ? '일정 준수' : '일정 지연'}
          />
          <KpiCard
            label="잔여 작업량"
            sublabel="총 작업량 - 실적 작업량"
            value={Math.max(0, metrics.totalWorkload - metrics.actualWorkload).toFixed(1)}
            status={Math.max(0, metrics.totalWorkload - metrics.actualWorkload) > 0 ? 'warn' : 'good'}
            desc="남은 투입량 기준"
          />
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <MiniCard label="총 작업량" value={`${metrics.totalWorkload.toFixed(1)}`} unit="M/D" icon="TOT" />
        <MiniCard label="계획 작업량" value={`${metrics.plannedWorkload.toFixed(1)}`} unit="M/D" icon="PLN" />
        <MiniCard label="실적 작업량" value={`${metrics.actualWorkload.toFixed(1)}`} unit="M/D" icon="ACT" />
      </div>
    </div>
  )
}

/* ─── 링 게이지 ─── */
function RingGauge({ planned, actual, size = 100 }: { planned: number; actual: number; size?: number }) {
  const r = (size - 12) / 2
  const c = Math.PI * 2 * r
  const pOff = c - (c * Math.min(planned, 100)) / 100
  const cx = size / 2
  return (
    <svg width={size} height={size} className="flex-shrink-0">
      {/* bg */}
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="oklch(0.93 0.006 250)" strokeWidth={10} />
      {/* planned */}
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="oklch(0.68 0.11 246)" strokeWidth={10}
        strokeDasharray={c} strokeDashoffset={pOff} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`} />
      {/* actual */}
      <circle cx={cx} cy={cx} r={r - 14} fill="none" stroke="oklch(0.93 0.006 250)" strokeWidth={8} />
      <circle cx={cx} cy={cx} r={r - 14} fill="none" stroke="oklch(0.7 0.12 160)" strokeWidth={8}
        strokeDasharray={Math.PI * 2 * (r - 14)} strokeDashoffset={Math.PI * 2 * (r - 14) - (Math.PI * 2 * (r - 14) * Math.min(actual, 100)) / 100}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`} />
      {/* center text */}
      <text x={cx} y={cx - 2} textAnchor="middle" fontSize={20} fontWeight="900" fill="oklch(0.26 0.02 250)">{actual.toFixed(0)}%</text>
      <text x={cx} y={cx + 14} textAnchor="middle" fontSize={9} letterSpacing="0.12em" fill="oklch(0.55 0.02 250)">ACTUAL</text>
    </svg>
  )
}

/* ─── KPI 카드 ─── */
function KpiCard({ label, sublabel, value, status, desc }: {
  label: string; sublabel: string; value: string; status: 'good' | 'warn' | 'bad'; desc: string
}) {
  const colors = {
    good: { bg: 'bg-[oklch(0.975_0.022_160)] border-[oklch(0.86_0.04_160)]', text: 'text-[oklch(0.45_0.11_160)]', dot: 'bg-[oklch(0.64_0.16_160)]' },
    warn: { bg: 'bg-[oklch(0.978_0.02_95)] border-[oklch(0.88_0.05_95)]', text: 'text-[oklch(0.53_0.12_95)]', dot: 'bg-[oklch(0.72_0.15_95)]' },
    bad: { bg: 'bg-[oklch(0.976_0.02_25)] border-[oklch(0.88_0.05_25)]', text: 'text-[oklch(0.52_0.14_25)]', dot: 'bg-[oklch(0.67_0.17_25)]' },
  }[status]
  return (
    <div className={cn("rounded-[24px] border p-5 flex flex-col justify-between min-h-[184px]", colors.bg)}>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/70">{label}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">{sublabel}</div>
      </div>
      <div className={cn("text-4xl font-black tabular-nums tracking-[-0.05em] mt-4", colors.text)}>{value}</div>
      <div className="flex items-center gap-2 mt-4">
        <div className={cn("h-2 w-2 rounded-full", colors.dot)} />
        <span className="text-[11px] font-medium text-muted-foreground">{desc}</span>
      </div>
    </div>
  )
}

/* ─── 미니 카드 ─── */
function MiniCard({ label, value, unit, icon }: { label: string; value: string; unit: string; icon: string }) {
  return (
    <div className="grid min-h-[92px] grid-cols-[56px_minmax(0,1fr)] items-center gap-4 rounded-[22px] border border-[oklch(0.88_0.012_250)] bg-white px-4 py-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[oklch(0.972_0.006_250)] text-xs font-black tracking-[0.14em] text-[oklch(0.36_0.02_250)]">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-black tracking-[-0.04em] text-[oklch(0.22_0.02_250)]">
          {value}
          <span className="ml-1 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground">{unit}</span>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 월별 (Monthly)
// ============================================================
function MonthlyTab({
  tasks, projectStart, projectEnd,
}: {
  tasks: Parameters<typeof generateMonthlyProgress>[0]
  projectStart: string
  projectEnd: string
}) {
  const monthlyData = useMemo(
    () => generateMonthlyProgress(tasks, projectStart, projectEnd),
    [tasks, projectStart, projectEnd]
  )

  const chartData = useMemo(
    () => monthlyData.map((m) => ({
      name: m.monthLabel,
      '계획률': +(m.plannedRate * 100).toFixed(1),
      'EV률': +(m.evRate * 100).toFixed(1),
      '실투입': +(m.actualRate * 100).toFixed(1),
      '월 계획': +m.plannedWorkload.toFixed(1),
      '월 EV': +m.earnedValue.toFixed(1),
    })),
    [monthlyData]
  )

  return (
    <div className="space-y-6 w-full">
      {/* S-Curve */}
      <Card title="월별 S-Curve (누적 진척률)" className="min-h-[420px]">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 250)" />
            <XAxis dataKey="name" fontSize={11} tick={{ fill: 'oklch(0.5 0.02 250)' }} />
            <YAxis fontSize={11} tickFormatter={(v: number) => `${v}%`} tick={{ fill: 'oklch(0.5 0.02 250)' }} />
            <Tooltip formatter={(value) => `${value}%`} contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey="계획률" stroke="#3b82f6" strokeWidth={2.5} dot={{ fill: '#3b82f6', r: 3, strokeWidth: 2, stroke: '#fff' }} />
            <Line type="monotone" dataKey="EV률" stroke="#22c55e" strokeWidth={2.5} dot={{ fill: '#22c55e', r: 3, strokeWidth: 2, stroke: '#fff' }} />
            <Line type="monotone" dataKey="실투입률" stroke="#f97316" strokeWidth={2} strokeDasharray="6 3" dot={{ fill: '#f97316', r: 2.5, strokeWidth: 2, stroke: '#fff' }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Monthly bar chart */}
      <Card title="월별 작업량 비교" className="min-h-[420px]">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 250)" />
            <XAxis dataKey="name" fontSize={11} tick={{ fill: 'oklch(0.5 0.02 250)' }} />
            <YAxis fontSize={11} tick={{ fill: 'oklch(0.5 0.02 250)' }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="월 계획" fill="#93c5fd" radius={[3, 3, 0, 0]} />
            <Bar dataKey="월 EV" fill="#22c55e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Table */}
      <Card title="월별 진척 상세" className="min-h-[420px]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">기간</th>
                <th className="px-3 py-2 text-right font-semibold">계획 작업량</th>
                <th className="px-3 py-2 text-right font-semibold">누적 계획</th>
                <th className="px-3 py-2 text-right font-semibold">계획률</th>
                <th className="px-3 py-2 text-right font-semibold">실적</th>
                <th className="px-3 py-2 text-right font-semibold">누적 실적</th>
                <th className="px-3 py-2 text-right font-semibold">실적률</th>
                <th className="px-3 py-2 text-right font-semibold">차이</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((m, i) => {
                const gap = m.evRate - m.plannedRate
                return (
                  <tr key={m.month} className={cn(
                    "border-b border-border/20 hover:bg-accent/30 transition-colors",
                    i % 2 === 1 && "bg-muted/10"
                  )}>
                    <td className="px-3 py-2 font-medium">{m.monthLabel}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{m.plannedWorkload}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{m.cumulativePlanned}</td>
                    <td className="px-3 py-2 text-right">
                      <Badge color="blue">{(m.plannedRate * 100).toFixed(1)}%</Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{m.earnedValue}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{m.cumulativeEV}</td>
                    <td className="px-3 py-2 text-right">
                      <Badge color="green">{(m.evRate * 100).toFixed(1)}%</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={cn("text-xs font-medium", gap >= 0 ? 'text-blue-600' : 'text-red-500')}>
                        {gap >= 0 ? '+' : ''}{(gap * 100).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ============================================================
// 주별 (Weekly)
// ============================================================
function WeeklyTab({
  tasks, projectStart, projectEnd,
}: {
  tasks: Parameters<typeof generateWeeklyProgress>[0]
  projectStart: string
  projectEnd: string
}) {
  const weeklyData = useMemo(
    () => generateWeeklyProgress(tasks, projectStart, projectEnd),
    [tasks, projectStart, projectEnd]
  )

  const chartData = useMemo(
    () => weeklyData.map((w) => ({
      name: w.weekLabel,
      '계획률': +(w.plannedRate * 100).toFixed(1),
      'EV률': +(w.evRate * 100).toFixed(1),
      '주간 계획': +w.plannedWorkload.toFixed(1),
      '주간 EV': +w.earnedValue.toFixed(1),
    })),
    [weeklyData]
  )

  // Only show latest 26 weeks on chart if too many
  const displayChart = chartData.length > 30 ? chartData.slice(-26) : chartData

  return (
    <div className="space-y-6 w-full">
      {/* S-Curve */}
      <Card title="주별 S-Curve (누적 진척률)" className="min-h-[420px]">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={displayChart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 250)" />
            <XAxis dataKey="name" fontSize={10} tick={{ fill: 'oklch(0.5 0.02 250)' }} interval={Math.max(0, Math.floor(displayChart.length / 12) - 1)} />
            <YAxis fontSize={11} tickFormatter={(v: number) => `${v}%`} tick={{ fill: 'oklch(0.5 0.02 250)' }} />
            <Tooltip formatter={(value) => `${value}%`} contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey="계획률" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="EV률" stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Table */}
      <Card title={`주별 진척 상세 (${weeklyData.length}주)`} className="min-h-[420px]">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">주차</th>
                <th className="px-3 py-2 text-left font-semibold">기간</th>
                <th className="px-3 py-2 text-right font-semibold">주간 계획</th>
                <th className="px-3 py-2 text-right font-semibold">누적 계획</th>
                <th className="px-3 py-2 text-right font-semibold">계획률</th>
                <th className="px-3 py-2 text-right font-semibold">주간 EV</th>
                <th className="px-3 py-2 text-right font-semibold">누적 실적</th>
                <th className="px-3 py-2 text-right font-semibold">실적률</th>
              </tr>
            </thead>
            <tbody>
              {weeklyData.map((w, i) => (
                <tr key={w.week} className={cn(
                  "border-b border-border/20 hover:bg-accent/30 transition-colors",
                  i % 2 === 1 && "bg-muted/10"
                )}>
                  <td className="px-3 py-2 font-medium text-xs">{w.weekLabel}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{w.startDate} ~ {w.endDate}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{w.plannedWorkload}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{w.cumulativePlanned}</td>
                  <td className="px-3 py-2 text-right">
                    <Badge color="blue">{(w.plannedRate * 100).toFixed(1)}%</Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{w.earnedValue}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{w.cumulativeEV}</td>
                  <td className="px-3 py-2 text-right">
                    <Badge color="green">{(w.evRate * 100).toFixed(1)}%</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ============================================================
// 담당자별 (Resource)
// ============================================================
function ResourceTab({
  tasks, assignments, members, companies, statusDate,
}: {
  tasks: Parameters<typeof calcProgressByResource>[0]
  assignments: Parameters<typeof calcProgressByResource>[1]
  members: Parameters<typeof calcProgressByResource>[2]
  companies: Parameters<typeof calcProgressByResource>[3]
  statusDate?: string
}) {
  const resourceData = useMemo(
    () => calcProgressByResource(tasks, assignments, members, companies, statusDate),
    [tasks, assignments, members, companies, statusDate]
  )

  const chartData = useMemo(
    () => resourceData.map((r) => ({
      name: r.memberName,
      '진척률': +(r.progressRate * 100).toFixed(1),
      '작업량': r.totalWorkload,
      color: r.companyColor,
    })),
    [resourceData]
  )

  if (resourceData.length === 0) {
    return <EmptyState message="담당자 배정 데이터가 없습니다. 간트차트에서 작업에 담당자를 배정해주세요." />
  }

  return (
    <div className="space-y-6 w-full">
      {/* Bar chart */}
      <Card title="담당자별 진척률" className="min-h-[304px]">
        <ResponsiveContainer width="100%" height={Math.max(200, resourceData.length * 40 + 60)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 250)" />
            <XAxis type="number" fontSize={11} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} tick={{ fill: 'oklch(0.5 0.02 250)' }} />
            <YAxis type="category" dataKey="name" fontSize={12} tick={{ fill: 'oklch(0.5 0.02 250)' }} width={70} />
            <Tooltip formatter={(value) => `${value}%`} contentStyle={tooltipStyle} />
            <ReferenceLine x={100} stroke="#ddd" />
            <Bar dataKey="진척률" radius={[0, 4, 4, 0]} barSize={24}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Table */}
      <Card title="담당자별 상세" className="min-h-[304px]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">담당자</th>
                <th className="px-3 py-2 text-left font-semibold">회사</th>
                <th className="px-3 py-2 text-left font-semibold">역할</th>
                <th className="px-3 py-2 text-right font-semibold">배정 작업</th>
                <th className="px-3 py-2 text-right font-semibold">작업량 (M/D)</th>
                <th className="px-3 py-2 text-right font-semibold">실적</th>
                <th className="px-3 py-2 text-right font-semibold">진척률</th>
                <th className="px-3 py-2 text-right font-semibold">완료</th>
                <th className="px-3 py-2 text-right font-semibold">지연</th>
              </tr>
            </thead>
            <tbody>
              {resourceData.map((r, i) => (
                <tr key={r.memberId} className={cn(
                  "border-b border-border/20 hover:bg-accent/30 transition-colors",
                  i % 2 === 1 && "bg-muted/10"
                )}>
                  <td className="px-3 py-2 font-medium">{r.memberName}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.companyColor }} />
                      {r.companyName}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.role}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.assignedTaskCount}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.totalWorkload}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.earnedValue}</td>
                  <td className="px-3 py-2 text-right">
                    <ProgressMiniBar value={r.progressRate} color={r.companyColor} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-green-600">{r.completedCount}</td>
                  <td className="px-3 py-2 text-right">
                    {r.delayedCount > 0 ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-xs font-medium">
                        {r.delayedCount}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ============================================================
// 업무별 (Task)
// ============================================================
function TaskTab({
  tasks, assignments, statusDate,
}: {
  tasks: Parameters<typeof calcProgressByTask>[0]
  assignments: Parameters<typeof calcProgressByTask>[2]
  statusDate?: string
}) {
  const taskData = useMemo(
    () => calcProgressByTask(tasks, statusDate, assignments),
    [tasks, statusDate, assignments]
  )

  if (taskData.length === 0) {
    return <EmptyState message="업무별 데이터가 없습니다." />
  }

  return (
    <div className="space-y-6 w-full">
      <Card title="업무별 계획 vs 실적" className="min-h-[304px]">
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">WBS</th>
                <th className="px-3 py-2 text-left font-semibold">업무명</th>
                <th className="px-3 py-2 text-right font-semibold">작업량</th>
                <th className="px-3 py-2 text-right font-semibold">계획률</th>
                <th className="px-3 py-2 text-right font-semibold">실적률</th>
                <th className="px-3 py-2 text-right font-semibold">차이</th>
                <th className="px-3 py-2 text-right font-semibold">상태</th>
              </tr>
            </thead>
            <tbody>
              {taskData.map((t, i) => (
                <tr key={t.taskId} className={cn("border-b border-border/20 hover:bg-accent/30 transition-colors", i % 2 === 1 && "bg-muted/10")}>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{t.wbsCode}</td>
                  <td className="px-3 py-2 font-medium">{t.taskName}</td>
                  <td className="px-3 py-2 text-right font-mono">{t.totalWorkload.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right"><Badge color="blue">{(t.plannedRate * 100).toFixed(1)}%</Badge></td>
                  <td className="px-3 py-2 text-right"><Badge color="green">{(t.progressRate * 100).toFixed(1)}%</Badge></td>
                  <td className="px-3 py-2 text-right">
                    <span className={cn("text-xs font-medium", t.gap >= 0 ? 'text-blue-600' : 'text-red-500')}>
                      {t.gap >= 0 ? '+' : ''}{(t.gap * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {t.isDelayed ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-xs font-medium">지연</span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-xs font-medium">정상</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function MiniStatCard({
  label,
  value,
  suffix,
  tone,
}: {
  label: string
  value: string
  suffix?: string
  tone: 'blue' | 'green' | 'red'
}) {
  const tones = {
    blue: 'border-blue-200/70 bg-blue-50/70 text-blue-700',
    green: 'border-emerald-200/70 bg-emerald-50/70 text-emerald-700',
    red: 'border-red-200/70 bg-red-50/70 text-red-700',
  }

  return (
    <div className={cn('rounded-xl border p-4', tones[tone])}>
      <div className="text-xs font-medium text-foreground/70">{label}</div>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-2xl font-black tracking-tight">{value}</span>
        {suffix && <span className="pb-0.5 text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  )
}

function MetricInline({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md bg-background/80 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-sm font-semibold', color)}>{value}</div>
    </div>
  )
}

function SignalMetric({
  label,
  value,
  trackColor,
  width,
}: {
  label: string
  value: string
  trackColor: string
  width: number
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        <span className="font-semibold text-[oklch(0.26_0.02_250)]">{value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[oklch(0.94_0.005_250)]">
        <div className={cn('h-full rounded-full', trackColor)} style={{ width: `${Math.min(width, 100)}%` }} />
      </div>
    </div>
  )
}

// ============================================================
// 일자별 (Daily)
// ============================================================
function DailyTab({
  tasks, assignments, projectStart, projectEnd,
}: {
  tasks: Parameters<typeof generateDailyProgress>[0]
  assignments: Parameters<typeof generateDailyProgress>[3]
  projectStart: string
  projectEnd: string
}) {
  const dailyData = useMemo(
    () => generateDailyProgress(tasks, projectStart, projectEnd, assignments),
    [tasks, projectStart, projectEnd, assignments]
  )

  const chartData = useMemo(
    () => dailyData.map((d) => ({
      name: d.dateLabel,
      '계획률': +(d.plannedRate * 100).toFixed(1),
      '실적률': +(d.evRate * 100).toFixed(1),
    })),
    [dailyData]
  )

  const displayChart = chartData.length > 40 ? chartData.slice(-40) : chartData

  return (
    <div className="space-y-6 w-full">
      <Card title="일자별 누적 진척률" className="min-h-[404px]">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={displayChart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 250)" />
            <XAxis dataKey="name" fontSize={10} tick={{ fill: 'oklch(0.5 0.02 250)' }} interval={Math.max(0, Math.floor(displayChart.length / 10) - 1)} />
            <YAxis fontSize={11} tickFormatter={(v: number) => `${v}%`} tick={{ fill: 'oklch(0.5 0.02 250)' }} />
            <Tooltip formatter={(value) => `${value}%`} contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey="계획률" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="실적률" stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title={`일자별 상세 (${dailyData.length}일)`} className="min-h-[404px]">
        <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">일자</th>
                <th className="px-3 py-2 text-right font-semibold">일 계획량</th>
                <th className="px-3 py-2 text-right font-semibold">누적 계획률</th>
                <th className="px-3 py-2 text-right font-semibold">일 실적량</th>
                <th className="px-3 py-2 text-right font-semibold">누적 실적률</th>
              </tr>
            </thead>
            <tbody>
              {dailyData.map((d, i) => (
                <tr key={d.date} className={cn("border-b border-border/20 hover:bg-accent/30 transition-colors", i % 2 === 1 && "bg-muted/10")}>
                  <td className="px-3 py-2 font-mono text-xs">{d.date}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{d.plannedWorkload.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right"><Badge color="blue">{(d.plannedRate * 100).toFixed(1)}%</Badge></td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{d.earnedValue.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right"><Badge color="green">{(d.evRate * 100).toFixed(1)}%</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ============================================================
// 회사별 (Company)
// ============================================================
function CompanyTab({
  tasks, assignments, members, companies, statusDate,
}: {
  tasks: Parameters<typeof calcProgressByCompany>[0]
  assignments: Parameters<typeof calcProgressByCompany>[1]
  members: Parameters<typeof calcProgressByCompany>[2]
  companies: Parameters<typeof calcProgressByCompany>[3]
  statusDate?: string
}) {
  const companyData = useMemo(
    () => calcProgressByCompany(tasks, assignments, members, companies, statusDate),
    [tasks, assignments, members, companies, statusDate]
  )

  const chartData = useMemo(
    () => companyData.map((c) => ({
      name: c.companyName,
      '진척률': +(c.progressRate * 100).toFixed(1),
      '작업 수': c.assignedTaskCount,
      color: c.companyColor,
    })),
    [companyData]
  )

  if (companyData.length === 0) {
    return <EmptyState message="회사별 배정 데이터가 없습니다." />
  }

  return (
    <div className="space-y-6 w-full">
      {/* Bar chart */}
      <Card title="회사별 진척률" className="min-h-[304px]">
        <ResponsiveContainer width="100%" height={Math.max(180, companyData.length * 50 + 60)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 90, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 250)" />
            <XAxis type="number" fontSize={11} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} tick={{ fill: 'oklch(0.5 0.02 250)' }} />
            <YAxis type="category" dataKey="name" fontSize={12} tick={{ fill: 'oklch(0.5 0.02 250)' }} width={80} />
            <Tooltip formatter={(value) => `${value}%`} contentStyle={tooltipStyle} />
            <Bar dataKey="진척률" radius={[0, 6, 6, 0]} barSize={30}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Table */}
      <Card title="회사별 상세" className="min-h-[304px]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">회사</th>
                <th className="px-3 py-2 text-right font-semibold">인원</th>
                <th className="px-3 py-2 text-right font-semibold">배정 작업</th>
                <th className="px-3 py-2 text-right font-semibold">작업량 (M/D)</th>
                <th className="px-3 py-2 text-right font-semibold">실적</th>
                <th className="px-3 py-2 text-right font-semibold">진척률</th>
                <th className="px-3 py-2 text-right font-semibold">완료</th>
              </tr>
            </thead>
            <tbody>
              {companyData.map((c, i) => (
                <tr key={c.companyId} className={cn(
                  "border-b border-border/20 hover:bg-accent/30 transition-colors",
                  i % 2 === 1 && "bg-muted/10"
                )}>
                  <td className="px-3 py-2 font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 rounded" style={{ backgroundColor: c.companyColor }} />
                      {c.companyName}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{c.memberCount}</td>
                  <td className="px-3 py-2 text-right font-mono">{c.assignedTaskCount}</td>
                  <td className="px-3 py-2 text-right font-mono">{c.totalWorkload}</td>
                  <td className="px-3 py-2 text-right font-mono">{c.earnedValue}</td>
                  <td className="px-3 py-2 text-right">
                    <ProgressMiniBar value={c.progressRate} color={c.companyColor} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-green-600">{c.completedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ============================================================
// WBS 그룹별
// ============================================================
function WBSGroupTab({ tasks, statusDate }: { tasks: Parameters<typeof calcProgressByWBSGroup>[0]; statusDate?: string }) {
  const wbsData = useMemo(() => calcProgressByWBSGroup(tasks, statusDate), [tasks, statusDate])

  const chartData = useMemo(
    () => wbsData.map((g) => ({
      name: g.groupName,
      '계획률': +(g.plannedRate * 100).toFixed(1),
      '실적률': +(g.progressRate * 100).toFixed(1),
    })),
    [wbsData]
  )

  if (wbsData.length === 0) {
    return <EmptyState message="WBS 그룹 데이터가 없습니다." />
  }

  return (
    <div className="space-y-6 w-full">
      {/* Grouped bar chart */}
      <Card title="WBS 그룹별 계획 vs 실적" className="min-h-[304px]">
        <ResponsiveContainer width="100%" height={Math.max(200, wbsData.length * 50 + 60)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 250)" />
            <XAxis type="number" fontSize={11} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} tick={{ fill: 'oklch(0.5 0.02 250)' }} />
            <YAxis type="category" dataKey="name" fontSize={11} tick={{ fill: 'oklch(0.5 0.02 250)' }} width={90} />
            <Tooltip formatter={(value) => `${value}%`} contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="계획률" fill="#93c5fd" radius={[0, 3, 3, 0]} barSize={14} />
            <Bar dataKey="실적률" fill="#3b82f6" radius={[0, 3, 3, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Table */}
      <Card title="WBS 그룹별 상세" className="min-h-[304px]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">WBS</th>
                <th className="px-3 py-2 text-left font-semibold">그룹명</th>
                <th className="px-3 py-2 text-right font-semibold">하위 작업</th>
                <th className="px-3 py-2 text-right font-semibold">작업량 (M/D)</th>
                <th className="px-3 py-2 text-right font-semibold">계획률</th>
                <th className="px-3 py-2 text-right font-semibold">실적률</th>
                <th className="px-3 py-2 text-right font-semibold">차이</th>
              </tr>
            </thead>
            <tbody>
              {wbsData.map((g, i) => (
                <tr key={g.wbsCode} className={cn(
                  "border-b border-border/20 hover:bg-accent/30 transition-colors",
                  i % 2 === 1 && "bg-muted/10"
                )}>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{g.wbsCode}</td>
                  <td className="px-3 py-2 font-medium">{g.groupName}</td>
                  <td className="px-3 py-2 text-right font-mono">{g.childCount}</td>
                  <td className="px-3 py-2 text-right font-mono">{g.totalWorkload}</td>
                  <td className="px-3 py-2 text-right">
                    <Badge color="blue">{(g.plannedRate * 100).toFixed(1)}%</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Badge color="green">{(g.progressRate * 100).toFixed(1)}%</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={cn("text-xs font-medium", g.gap >= 0 ? 'text-blue-600' : 'text-red-500')}>
                      {g.gap >= 0 ? '+' : ''}{(g.gap * 100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ============================================================
// Shared components
// ============================================================

const tooltipStyle = {
  borderRadius: '16px',
  border: '1px solid oklch(0.89 0.012 250)',
  boxShadow: '0 18px 34px rgba(15,23,42,0.08)',
  fontSize: '12px',
  background: 'oklch(0.995 0.002 250)',
}

function Card({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("overflow-hidden rounded-[24px] border border-[oklch(0.88_0.012_250)] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)]", className)}>
      <div className="border-b border-[oklch(0.91_0.01_250)] bg-[oklch(0.983_0.004_250)] px-5 py-4">
        <h3 className="text-sm font-semibold tracking-[-0.02em] text-[oklch(0.24_0.02_250)]">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Badge({ color, children }: { color: 'blue' | 'green' | 'red'; children: React.ReactNode }) {
  const styles = {
    blue: 'bg-[oklch(0.95_0.03_246)] text-[oklch(0.46_0.12_246)]',
    green: 'bg-[oklch(0.95_0.03_160)] text-[oklch(0.45_0.12_160)]',
    red: 'bg-[oklch(0.96_0.03_25)] text-[oklch(0.5_0.13_25)]',
  }
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold", styles[color])}>
      {children}
    </span>
  )
}

function ProgressMiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 w-20 overflow-hidden rounded-full bg-[oklch(0.94_0.005_250)]">
        <div className="h-full rounded-full" style={{ width: `${Math.min(value * 100, 100)}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 text-right text-xs font-semibold tabular-nums text-muted-foreground">{(value * 100).toFixed(1)}%</span>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-60 items-center justify-center rounded-[20px] border border-dashed border-[oklch(0.86_0.01_250)] bg-[oklch(0.985_0.003_250)]">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
