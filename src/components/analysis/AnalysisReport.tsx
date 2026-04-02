import { useState, useMemo, useCallback, useRef } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useTaskStore } from '@/stores/task-store'
import { useProjectStore } from '@/stores/project-store'
import {
  generateMonthlyProgress,
  generateWeeklyProgress,
  type MonthlyProgress,
  type WeeklyProgress,
} from '@/lib/progress-calc'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Download, Printer, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'

type AnalysisTab = 'monthly' | 'weekly'

// ====================================================================
// CSV Export utility
// ====================================================================
function downloadCSV(filename: string, csvContent: string) {
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function buildMonthlyCSV(data: MonthlyProgress[]): string {
  const header = '기간,계획 작업량,누적 계획,계획률(%),Earned Value,누적 EV,EV률(%),실투입량,누적 실투입,실투입률(%)'
  const rows = data.map((m) =>
    [
      m.monthLabel,
      m.plannedWorkload,
      m.cumulativePlanned,
      (m.plannedRate * 100).toFixed(1),
      m.earnedValue,
      m.cumulativeEV,
      (m.evRate * 100).toFixed(1),
      m.actualWorkload,
      m.cumulativeActual,
      (m.actualRate * 100).toFixed(1),
    ].join(',')
  )
  return [header, ...rows].join('\n')
}

function buildWeeklyCSV(data: WeeklyProgress[]): string {
  const header = '주차,시작일,종료일,계획 작업량,누적 계획,계획률(%),Earned Value,누적 EV,EV률(%)'
  const rows = data.map((w) =>
    [
      w.weekLabel,
      w.startDate,
      w.endDate,
      w.plannedWorkload,
      w.cumulativePlanned,
      (w.plannedRate * 100).toFixed(1),
      w.earnedValue,
      w.cumulativeEV,
      (w.evRate * 100).toFixed(1),
    ].join(',')
  )
  return [header, ...rows].join('\n')
}

// ====================================================================
// Main Component
// ====================================================================
export function AnalysisReport() {
  const tasks = useTaskStore((s) => s.tasks)
  const project = useProjectStore((s) => s.currentProject)
  const printRef = useRef<HTMLDivElement>(null)

  // Tab state
  const [activeTab, setActiveTab] = useState<AnalysisTab>('monthly')

  // Date range filter
  const [filterStart, setFilterStart] = useState<string>('')
  const [filterEnd, setFilterEnd] = useState<string>('')

  // ---- Raw data (full range) ----
  const allMonthlyData = useMemo(() => {
    if (!project) return []
    return generateMonthlyProgress(tasks, project.start_date, project.end_date)
  }, [tasks, project])

  const allWeeklyData = useMemo(() => {
    if (!project) return []
    return generateWeeklyProgress(tasks, project.start_date, project.end_date)
  }, [tasks, project])

  // ---- Filtered data ----
  const monthlyData = useMemo(() => {
    if (!filterStart && !filterEnd) return allMonthlyData
    return allMonthlyData.filter((m) => {
      if (filterStart && m.endDate < filterStart) return false
      if (filterEnd && m.startDate > filterEnd) return false
      return true
    })
  }, [allMonthlyData, filterStart, filterEnd])

  const weeklyData = useMemo(() => {
    if (!filterStart && !filterEnd) return allWeeklyData
    return allWeeklyData.filter((w) => {
      if (filterStart && w.endDate < filterStart) return false
      if (filterEnd && w.startDate > filterEnd) return false
      return true
    })
  }, [allWeeklyData, filterStart, filterEnd])

  // ---- Chart data ----
  const monthlyChartData = useMemo(
    () =>
      monthlyData.map((m) => ({
        name: m.monthLabel,
        '계획 진척률': Math.round(m.plannedRate * 10000) / 100,
        'Earned Value': Math.round(m.evRate * 10000) / 100,
        '실투입률': Math.round(m.actualRate * 10000) / 100,
      })),
    [monthlyData]
  )

  const weeklyChartData = useMemo(
    () =>
      weeklyData.map((w) => ({
        name: w.weekLabel,
        '계획 진척률': Math.round(w.plannedRate * 10000) / 100,
        'Earned Value': Math.round(w.evRate * 10000) / 100,
      })),
    [weeklyData]
  )

  // ---- CSV export ----
  const handleExportCSV = useCallback(() => {
    if (!project) return
    const today = format(new Date(), 'yyyyMMdd')
    const tabLabel = activeTab === 'monthly' ? '월별' : '주별'
    const filename = `${project.name}_분석_${tabLabel}_${today}.csv`
    const csv =
      activeTab === 'monthly'
        ? buildMonthlyCSV(monthlyData)
        : buildWeeklyCSV(weeklyData)
    downloadCSV(filename, csv)
  }, [project, activeTab, monthlyData, weeklyData])

  // ---- Print ----
  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  // ---- Reset filter ----
  const handleResetFilter = useCallback(() => {
    setFilterStart('')
    setFilterEnd('')
  }, [])

  if (!project) return null

  const hasFilter = filterStart || filterEnd

  return (
    <div ref={printRef} className="p-6 max-w-5xl mx-auto overflow-y-auto h-full analysis-report-print">
      {/* Page Header */}
      <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-foreground">분석 리포트</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{project.name} &bull; S-Curve 분석</p>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-2 no-print">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            CSV 내보내기
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            인쇄
          </Button>
        </div>
      </div>

      {/* Date range filter */}
      <div className="mb-4 flex items-center gap-3 flex-wrap no-print">
        <span className="text-sm font-medium text-muted-foreground">기간 필터:</span>
        <DatePicker
          value={filterStart}
          onChange={setFilterStart}
          placeholder="시작일"
          className="h-8 w-[180px] text-sm"
        />
        <span className="text-sm text-muted-foreground">~</span>
        <DatePicker
          value={filterEnd}
          onChange={setFilterEnd}
          placeholder="종료일"
          className="h-8 w-[180px] text-sm"
        />
        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={handleResetFilter}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            전체 기간
          </Button>
        )}
      </div>

      {/* Tabs: Monthly / Weekly */}
      <Tabs defaultValue="monthly" onValueChange={(v) => setActiveTab(v as AnalysisTab)}>
        <TabsList className="mb-4 no-print">
          <TabsTrigger value="monthly">월별</TabsTrigger>
          <TabsTrigger value="weekly">주별</TabsTrigger>
        </TabsList>

        {/* ============ Monthly Tab ============ */}
        <TabsContent value="monthly">
          {/* S-Curve Chart */}
          <div className="bg-card rounded-xl border border-border/50 p-5 mb-6 shadow-sm">
            <h3 className="text-sm font-semibold mb-4">S-Curve &mdash; 월별 진척률 추이</h3>
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={monthlyChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 250)" />
                <XAxis dataKey="name" fontSize={11} tick={{ fill: 'oklch(0.5 0.02 250)' }} />
                <YAxis
                  fontSize={11}
                  tickFormatter={(v: number) => `${v}%`}
                  domain={[0, 'auto']}
                  tick={{ fill: 'oklch(0.5 0.02 250)' }}
                />
                <Tooltip
                  formatter={(value) => `${value}%`}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid oklch(0.91 0.01 250)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="계획 진척률"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={{ fill: '#3b82f6', r: 4, strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="Earned Value"
                  stroke="#22c55e"
                  strokeWidth={2.5}
                  dot={{ fill: '#22c55e', r: 4, strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="실투입률"
                  stroke="#f97316"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ fill: '#f97316', r: 3, strokeWidth: 2, stroke: '#fff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly Progress Table */}
          <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border/40">
              <h3 className="text-sm font-semibold">월별 진척 상세</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-semibold">기간</th>
                    <th className="px-4 py-2.5 text-right font-semibold">계획 작업량</th>
                    <th className="px-4 py-2.5 text-right font-semibold">누적 계획</th>
                    <th className="px-4 py-2.5 text-right font-semibold">계획률</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Earned Value</th>
                    <th className="px-4 py-2.5 text-right font-semibold">누적 EV</th>
                    <th className="px-4 py-2.5 text-right font-semibold">EV률</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((m, index) => (
                    <tr
                      key={m.month}
                      className={cn(
                        'border-b border-border/20 hover:bg-accent/30 transition-colors',
                        index % 2 === 1 && 'bg-muted/10'
                      )}
                    >
                      <td className="px-4 py-2.5 font-medium">{m.monthLabel}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{m.plannedWorkload}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{m.cumulativePlanned}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-medium">
                          {(m.plannedRate * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{m.earnedValue}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{m.cumulativeEV}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-green-50 text-green-700 text-xs font-medium">
                          {(m.evRate * 100).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {monthlyData.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                        선택한 기간에 데이터가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ============ Weekly Tab ============ */}
        <TabsContent value="weekly">
          {/* S-Curve Chart - Weekly */}
          <div className="bg-card rounded-xl border border-border/50 p-5 mb-6 shadow-sm">
            <h3 className="text-sm font-semibold mb-4">S-Curve &mdash; 주별 진척률 추이 (ISO 주차)</h3>
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={weeklyChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 250)" />
                <XAxis
                  dataKey="name"
                  fontSize={11}
                  tick={{ fill: 'oklch(0.5 0.02 250)' }}
                  interval={weeklyChartData.length > 20 ? Math.floor(weeklyChartData.length / 15) : 0}
                />
                <YAxis
                  fontSize={11}
                  tickFormatter={(v: number) => `${v}%`}
                  domain={[0, 'auto']}
                  tick={{ fill: 'oklch(0.5 0.02 250)' }}
                />
                <Tooltip
                  formatter={(value) => `${value}%`}
                  labelFormatter={(label: string) => {
                    const item = weeklyData.find((w) => w.weekLabel === label)
                    return item ? `${label} (${item.startDate} ~ ${item.endDate})` : label
                  }}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid oklch(0.91 0.01 250)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="계획 진척률"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={weeklyChartData.length <= 30 ? { fill: '#3b82f6', r: 3, strokeWidth: 2, stroke: '#fff' } : false}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="Earned Value"
                  stroke="#22c55e"
                  strokeWidth={2.5}
                  dot={weeklyChartData.length <= 30 ? { fill: '#22c55e', r: 3, strokeWidth: 2, stroke: '#fff' } : false}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Weekly Progress Table */}
          <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border/40">
              <h3 className="text-sm font-semibold">주별 진척 상세</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-semibold">주차</th>
                    <th className="px-4 py-2.5 text-left font-semibold">기간</th>
                    <th className="px-4 py-2.5 text-right font-semibold">계획 작업량</th>
                    <th className="px-4 py-2.5 text-right font-semibold">누적 계획</th>
                    <th className="px-4 py-2.5 text-right font-semibold">계획률</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Earned Value</th>
                    <th className="px-4 py-2.5 text-right font-semibold">누적 EV</th>
                    <th className="px-4 py-2.5 text-right font-semibold">EV률</th>
                    <th className="px-4 py-2.5 text-right font-semibold">차이</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyData.map((w, index) => {
                    const gap = w.evRate - w.plannedRate
                    return (
                      <tr
                        key={w.week}
                        className={cn(
                          'border-b border-border/20 hover:bg-accent/30 transition-colors',
                          index % 2 === 1 && 'bg-muted/10'
                        )}
                      >
                        <td className="px-4 py-2.5 font-medium">{w.weekLabel}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {w.startDate} ~ {w.endDate}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">{w.plannedWorkload}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">{w.cumulativePlanned}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-medium">
                            {(w.plannedRate * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">{w.earnedValue}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">{w.cumulativeEV}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-green-50 text-green-700 text-xs font-medium">
                            {(w.evRate * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className={cn(
                              'inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium',
                              gap >= 0
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-700'
                            )}
                          >
                            {gap >= 0 ? '+' : ''}
                            {(gap * 100).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {weeklyData.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-sm">
                        선택한 기간에 데이터가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
