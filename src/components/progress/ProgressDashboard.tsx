import { useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import { useResourceStore } from '@/stores/resource-store'
import { useAuthStore } from '@/stores/auth-store'
import { AnalysisReport } from '@/components/analysis/AnalysisReport'
import { WorkloadView } from '@/components/workload/WorkloadView'
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
import { cn } from '@/lib/utils'
import { CalendarClock, TrendingUp, Users, Building2, FolderTree, BarChart3, ListChecks, CalendarDays } from 'lucide-react'

type ProgressTab = 'overview' | 'monthly' | 'weekly' | 'resource' | 'task' | 'daily' | 'company' | 'wbs' | 'analysis' | 'workload'

const TABS: { key: ProgressTab; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: '전체', icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { key: 'monthly', label: '월별', icon: <CalendarClock className="h-3.5 w-3.5" /> },
  { key: 'weekly', label: '주별', icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { key: 'resource', label: '개인별', icon: <Users className="h-3.5 w-3.5" /> },
  { key: 'task', label: '업무별', icon: <ListChecks className="h-3.5 w-3.5" /> },
  { key: 'daily', label: '일자별', icon: <CalendarDays className="h-3.5 w-3.5" /> },
  { key: 'company', label: '회사별', icon: <Building2 className="h-3.5 w-3.5" /> },
  { key: 'wbs', label: 'WBS그룹별', icon: <FolderTree className="h-3.5 w-3.5" /> },
  { key: 'analysis', label: '분석', icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { key: 'workload', label: '작업량', icon: <TrendingUp className="h-3.5 w-3.5" /> },
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-6 pt-5 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">진척 현황</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {project.name} · {project.start_date} ~ {project.end_date}
              {statusDate && <span className="ml-2 text-primary font-medium">기준일: {statusDate}</span>}
            </p>
          </div>
          {myMember && (
            <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-lg border hover:bg-accent/30 transition-colors">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="w-3.5 h-3.5 rounded accent-primary" />
              <span className="text-sm font-medium">내 작업만</span>
            </label>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border/50">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-t-lg transition-colors",
                activeTab === tab.key
                  ? "bg-background text-primary border border-border/50 border-b-background -mb-px"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && <OverviewTab metrics={metrics} />}
        {activeTab === 'monthly' && (
          <MonthlyTab tasks={tasks} projectStart={project.start_date} projectEnd={project.end_date} />
        )}
        {activeTab === 'weekly' && (
          <WeeklyTab tasks={tasks} projectStart={project.start_date} projectEnd={project.end_date} />
        )}
        {activeTab === 'resource' && (
          <ResourceTab
            tasks={tasks} assignments={assignments} members={members}
            companies={companies} statusDate={statusDate}
          />
        )}
        {activeTab === 'task' && (
          <TaskTab
            tasks={tasks}
            assignments={assignments}
            statusDate={statusDate}
          />
        )}
        {activeTab === 'daily' && (
          <DailyTab
            tasks={tasks}
            assignments={assignments}
            projectStart={project.start_date}
            projectEnd={project.end_date}
          />
        )}
        {activeTab === 'company' && (
          <CompanyTab
            tasks={tasks} assignments={assignments} members={members} companies={companies} statusDate={statusDate}
          />
        )}
        {activeTab === 'wbs' && <WBSGroupTab tasks={tasks} statusDate={statusDate} />}
        {activeTab === 'analysis' && <AnalysisReport />}
        {activeTab === 'workload' && <WorkloadView />}
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
    <div className="space-y-4">
      {/* 상단: 진척률 게이지 + SPI + 작업 현황 */}
      <div className="grid grid-cols-3 gap-3">
        {/* 진척률 게이지 */}
        <div className="rounded-xl border bg-card p-4 flex items-center gap-5">
          <RingGauge planned={plannedPct} actual={actualPct} size={100} />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">계획</span>
              <span className="text-sm font-bold text-blue-500">{plannedPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(plannedPct, 100)}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">실적</span>
              <span className="text-sm font-bold text-emerald-500">{actualPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.min(actualPct, 100)}%` }} />
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-border/30">
              <span className="text-xs text-muted-foreground">차이</span>
              <span className={cn("text-sm font-bold", gapPct >= 0 ? 'text-blue-600' : 'text-red-500')}>
                {gapPct >= 0 ? '+' : ''}{gapPct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* 일정 성과지수 */}
        <KpiCard
          label="일정 성과"
          sublabel="실적 / 계획 비율"
          value={metrics.spi.toFixed(2)}
          status={metrics.spi >= 1 ? 'good' : metrics.spi >= 0.9 ? 'warn' : 'bad'}
          desc={metrics.spi >= 1 ? '일정 준수' : '일정 지연'}
        />

        {/* 잔여 작업량 */}
        <div className="rounded-xl border bg-card p-4 flex flex-col justify-between">
          <div className="text-xs font-bold text-foreground/70">잔여 작업량</div>
          <div className="text-3xl font-black tabular-nums text-foreground mt-1">
            {Math.max(0, metrics.totalWorkload - metrics.actualWorkload).toFixed(1)}
            <span className="text-sm font-normal text-muted-foreground ml-1">M/D</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            총 {metrics.totalWorkload.toFixed(1)} - 실적 {metrics.actualWorkload.toFixed(1)}
          </div>
        </div>
      </div>

      {/* 하단: 작업량 3카드 */}
      <div className="grid grid-cols-3 gap-3">
        <MiniCard label="총 작업량" value={`${metrics.totalWorkload.toFixed(1)}`} unit="M/D" icon="📊" />
        <MiniCard label="계획 작업량" value={`${metrics.plannedWorkload.toFixed(1)}`} unit="M/D" icon="📋" />
        <MiniCard label="실적 작업량" value={`${metrics.actualWorkload.toFixed(1)}`} unit="M/D" icon="✅" />
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
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="oklch(0.94 0.005 250)" strokeWidth={10} />
      {/* planned */}
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#93c5fd" strokeWidth={10}
        strokeDasharray={c} strokeDashoffset={pOff} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`} />
      {/* actual */}
      <circle cx={cx} cy={cx} r={r - 14} fill="none" stroke="oklch(0.94 0.005 250)" strokeWidth={8} />
      <circle cx={cx} cy={cx} r={r - 14} fill="none" stroke="#34d399" strokeWidth={8}
        strokeDasharray={Math.PI * 2 * (r - 14)} strokeDashoffset={Math.PI * 2 * (r - 14) - (Math.PI * 2 * (r - 14) * Math.min(actual, 100)) / 100}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`} />
      {/* center text */}
      <text x={cx} y={cx - 4} textAnchor="middle" fontSize={18} fontWeight="800" fill="oklch(0.3 0.02 250)">{actual.toFixed(0)}%</text>
      <text x={cx} y={cx + 12} textAnchor="middle" fontSize={9} fill="oklch(0.55 0.02 250)">실적</text>
    </svg>
  )
}

/* ─── KPI 카드 ─── */
function KpiCard({ label, sublabel, value, status, desc }: {
  label: string; sublabel: string; value: string; status: 'good' | 'warn' | 'bad'; desc: string
}) {
  const colors = {
    good: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-600', dot: 'bg-emerald-400' },
    warn: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-600', dot: 'bg-amber-400' },
    bad: { bg: 'bg-red-50 border-red-200', text: 'text-red-600', dot: 'bg-red-400' },
  }[status]
  return (
    <div className={cn("rounded-xl border p-4 flex flex-col justify-between", colors.bg)}>
      <div>
        <div className="text-xs font-bold text-foreground/70">{label}</div>
        <div className="text-[10px] text-muted-foreground">{sublabel}</div>
      </div>
      <div className={cn("text-3xl font-black tabular-nums mt-2", colors.text)}>{value}</div>
      <div className="flex items-center gap-1.5 mt-1">
        <div className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />
        <span className="text-[10px] font-medium text-muted-foreground">{desc}</span>
      </div>
    </div>
  )
}

/* ─── 미니 카드 ─── */
function MiniCard({ label, value, unit, icon }: { label: string; value: string; unit: string; icon: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 flex items-center gap-3">
      <span className="text-xl">{icon}</span>
      <div>
        <div className="text-[10px] text-muted-foreground font-medium">{label}</div>
        <div className="text-lg font-bold tabular-nums leading-tight">{value} <span className="text-[10px] font-normal text-muted-foreground">{unit}</span></div>
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
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* S-Curve */}
      <Card title="월별 S-Curve (누적 진척률)">
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
      <Card title="월별 작업량 비교">
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
      <Card title="월별 진척 상세">
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
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* S-Curve */}
      <Card title="주별 S-Curve (누적 진척률)">
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
      <Card title={`주별 진척 상세 (${weeklyData.length}주)`}>
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
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Bar chart */}
      <Card title="담당자별 진척률">
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
      <Card title="담당자별 상세">
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
    <div className="space-y-6 max-w-5xl mx-auto">
      <Card title="업무별 계획 vs 실적">
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
    <div className="space-y-6 max-w-5xl mx-auto">
      <Card title="일자별 누적 진척률">
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

      <Card title={`일자별 상세 (${dailyData.length}일)`}>
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
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Bar chart */}
      <Card title="회사별 진척률">
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
      <Card title="회사별 상세">
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
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Grouped bar chart */}
      <Card title="WBS 그룹별 계획 vs 실적">
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
      <Card title="WBS 그룹별 상세">
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
  borderRadius: '8px',
  border: '1px solid oklch(0.91 0.01 250)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  fontSize: '12px',
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border/40">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Badge({ color, children }: { color: 'blue' | 'green' | 'red'; children: React.ReactNode }) {
  const styles = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
  }
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium", styles[color])}>
      {children}
    </span>
  )
}

function ProgressMiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-muted/50 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(value * 100, 100)}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-medium w-10 text-right">{(value * 100).toFixed(1)}%</span>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-60">
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  )
}
