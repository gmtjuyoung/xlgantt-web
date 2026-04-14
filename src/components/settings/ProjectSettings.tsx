import { useCallback, useRef } from 'react'
import { Upload, Download, Palette, Globe, FileSpreadsheet, CalendarClock, BarChart3, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useProjectStore } from '@/stores/project-store'
import { useTaskStore } from '@/stores/task-store'
import { useUIStore } from '@/stores/ui-store'
import { THEME_PRESETS } from '@/lib/types'
import { importXLGanttFile } from '@/lib/excel-import'
import { exportToExcel } from '@/lib/excel-export'
import { useResourceStore } from '@/stores/resource-store'
import { cn } from '@/lib/utils'
import { DatePicker } from '@/components/ui/date-picker'

export function ProjectSettings() {
  const { currentProject: project, updateProject, setProject, setTheme } = useProjectStore()
  const { tasks, dependencies, setTasks, setDependencies } = useTaskStore()
  const { language, setLanguage, ganttOptions, setGanttOptions, resetGanttOptions } = useUIStore()
  const { companies, members, assignments } = useResourceStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = useCallback(() => {
    if (!project) {
      alert('내보낼 프로젝트가 없습니다.')
      return
    }
    try {
      exportToExcel({ project, tasks, dependencies, companies, members, assignments })
    } catch (err) {
      alert(`엑셀 내보내기 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [project, tasks, dependencies, companies, members, assignments])

  const handleImport = useCallback(async () => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const buffer = await file.arrayBuffer()
        const result = importXLGanttFile(buffer)
        const newProject = {
          id: crypto.randomUUID(),
          name: result.projectName,
          start_date: result.projectStart,
          end_date: result.projectEnd,
          owner_id: 'local',
          theme_id: 0,
          language: 'ko' as const,
          zoom_level: 2 as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        setProject(newProject)
        const tasksWithIds = result.tasks.map((t) => ({
          ...t, id: crypto.randomUUID(), project_id: newProject.id,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }))
        setTasks(tasksWithIds)
        const deps = result.dependencies
          .filter((d) => d.predecessorSortOrder > 0)
          .map((d) => {
            const pred = tasksWithIds.find((t) => t.sort_order === d.predecessorSortOrder)
            const succ = tasksWithIds.find((t) => t.sort_order === d.successorSortOrder)
            if (!pred || !succ) return null
            return {
              id: crypto.randomUUID(), project_id: newProject.id,
              predecessor_id: pred.id, successor_id: succ.id,
              dep_type: d.depType, lag_days: 0, created_at: new Date().toISOString(),
            }
          })
          .filter(Boolean) as Array<{
            id: string; project_id: string; predecessor_id: string; successor_id: string;
            dep_type: 1 | 2 | 3 | 4; lag_days: number; created_at: string;
          }>
        setDependencies(deps)
        alert(`✅ 임포트 완료!\n- 프로젝트: ${result.projectName}\n- 작업 수: ${tasksWithIds.length}\n- 의존관계: ${deps.length}`)
      } catch (err) {
        alert(`❌ 임포트 실패: ${err instanceof Error ? err.message : String(err)}`)
      }
      e.target.value = ''
    },
    [setProject, setTasks, setDependencies]
  )

  return (
    <div className="p-6 max-w-3xl mx-auto overflow-y-auto h-full">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-foreground">프로젝트 설정</h2>
        <p className="text-sm text-muted-foreground mt-0.5">프로젝트 정보 및 환경 설정</p>
      </div>

      {/* Import/Export */}
      <div className="bg-card rounded-xl border border-border/50 p-5 mb-4 shadow-sm">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          데이터 가져오기 / 내보내기
        </h3>
        <div className="flex gap-2">
          <Button onClick={handleImport} variant="outline" size="sm" className="gap-2">
            <Upload className="h-3.5 w-3.5" />
            엑셀 파일 임포트
          </Button>
          <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
            <Download className="h-3.5 w-3.5" />
            엑셀 내보내기
          </Button>
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleFileChange} />
      </div>

      {/* Project Info */}
      {project && (
        <div className="bg-card rounded-xl border border-border/50 p-5 mb-4 shadow-sm">
          <h3 className="text-sm font-semibold mb-3">프로젝트 정보</h3>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">프로젝트명</label>
              <Input value={project.name} onChange={(e) => updateProject({ name: e.target.value })} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">시작일</label>
                <DatePicker value={project.start_date} onChange={(d) => updateProject({ start_date: d })} placeholder="시작일 선택" className="mt-1 h-9" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">완료일</label>
                <DatePicker value={project.end_date} onChange={(d) => updateProject({ end_date: d })} placeholder="완료일 선택" className="mt-1 h-9" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                기준일자 (Status Date)
              </label>
              <div className="flex items-center gap-2 mt-1">
                <DatePicker
                  value={project.status_date || ''}
                  onChange={(d) => updateProject({ status_date: d || undefined })}
                  placeholder="기준일자 선택"
                  className="h-9 flex-1"
                />
                {project.status_date && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={() => updateProject({ status_date: undefined })}
                  >
                    해제
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                진척률 산출 시 기준이 되는 날짜입니다. 미설정 시 오늘 날짜를 사용합니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Theme */}
      <div className="bg-card rounded-xl border border-border/50 p-5 mb-4 shadow-sm">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          색상 테마
        </h3>
        <div className="grid grid-cols-5 gap-3">
          {THEME_PRESETS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTheme(t.id); if (project) updateProject({ theme_id: t.id }) }}
              className={cn(
                "p-3 rounded-xl border-2 transition-all hover:scale-105",
                project?.theme_id === t.id
                  ? 'border-primary shadow-md shadow-primary/20'
                  : 'border-border/50 hover:border-muted-foreground/40'
              )}
            >
              <div className="flex gap-1 mb-1.5">
                {t.colors.slice(0, 5).map((color, i) => (
                  <div key={i} className="h-5 flex-1 rounded" style={{ backgroundColor: color }} />
                ))}
              </div>
              <div className="text-[11px] text-center font-medium">{t.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Gantt Chart Options */}
      <div className="bg-card rounded-xl border border-border/50 p-5 mb-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            간트 차트
          </h3>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1" onClick={resetGanttOptions}>
            <RotateCcw className="h-3 w-3" />
            초기화
          </Button>
        </div>
        <div className="space-y-4">
          {/* Bar Height Slider */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              바 높이: {ganttOptions.barHeight}px
            </label>
            <input
              type="range"
              min={12}
              max={24}
              step={1}
              value={ganttOptions.barHeight}
              onChange={(e) => setGanttOptions({ barHeight: Number(e.target.value) })}
              className="w-full mt-1 accent-primary h-1.5"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>12</span>
              <span>24</span>
            </div>
          </div>

          {/* Show Task Name */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              작업명 표시 위치
            </label>
            <div className="flex gap-2 mt-1">
              {([['right', '바 오른쪽'], ['inside', '바 안쪽'], ['none', '숨김']] as const).map(([value, label]) => (
                <Button
                  key={value}
                  variant={ganttOptions.showTaskName === value ? 'default' : 'outline'}
                  size="sm"
                  className="text-[11px] h-7 px-3"
                  onClick={() => setGanttOptions({ showTaskName: value })}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Toggle Options */}
          <div className="space-y-2">
            {([
              ['showProgress', '바 안에 진척률 표시'],
              ['showDependencies', '의존관계 화살표 표시'],
              ['showNonWorkingDays', '비근무일 밴드 표시'],
              ['showTodayLine', 'Today 라인 표시'],
              ['colorByProgress', '지연 작업 빨간색 표시'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between cursor-pointer group">
                <span className="text-[12px] text-foreground group-hover:text-primary transition-colors">{label}</span>
                <button
                  role="switch"
                  aria-checked={ganttOptions[key]}
                  onClick={() => setGanttOptions({ [key]: !ganttOptions[key] })}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    ganttOptions[key] ? 'bg-primary' : 'bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform",
                      ganttOptions[key] ? 'translate-x-4' : 'translate-x-0'
                    )}
                  />
                </button>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Language */}
      <div className="bg-card rounded-xl border border-border/50 p-5 shadow-sm">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          언어 설정
        </h3>
        <div className="flex gap-2">
          <Button variant={language === 'ko' ? 'default' : 'outline'} size="sm" onClick={() => setLanguage('ko')}>
            한국어
          </Button>
          <Button variant={language === 'en' ? 'default' : 'outline'} size="sm" onClick={() => setLanguage('en')}>
            English
          </Button>
        </div>
      </div>
    </div>
  )
}
