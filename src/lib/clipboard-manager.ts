import type { Task } from '@/lib/types'

/**
 * 복사할 작업 데이터 타입
 * ID, 정렬 순서, 생성일시, 의존성은 제외
 */
export type CopiedTaskData = Omit<
  Task,
  'id' | 'sort_order' | 'created_at' | 'updated_at' | 'wbs_code' | 'project_id'
>

/**
 * 클립보드 매니저
 * 복사된 작업을 메모리에 임시 저장하고 관리합니다.
 */
class ClipboardManager {
  private _copied: CopiedTaskData | null = null

  /** 작업을 클립보드에 복사합니다 */
  copy(task: Task): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, sort_order, created_at, updated_at, wbs_code, project_id, ...data } = task
    this._copied = data
    console.log('[ClipboardManager] 작업 복사:', task.task_name, data)
  }

  /** 클립보드에 복사된 작업 데이터를 반환합니다 */
  paste(): CopiedTaskData | null {
    console.log('[ClipboardManager] 작업 붙여넣기 시도:', this._copied?.task_name ?? '없음')
    return this._copied
  }

  /** 클립보드를 비웁니다 */
  clear(): void {
    this._copied = null
    console.log('[ClipboardManager] 클립보드 비움')
  }

  /** 클립보드에 복사된 작업이 있는지 확인합니다 */
  hasCopied(): boolean {
    return this._copied !== null
  }
}

export const clipboardManager = new ClipboardManager()
