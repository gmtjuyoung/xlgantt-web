-- Direction C: progress override support
-- 1) 계획/실적 수동 override 컬럼 추가
-- 2) 기존 planned_progress 수동값은 초기화(A안)
-- 3) planned_progress는 자동 계산 캐시 성격으로 nullable 허용

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS planned_progress_override NUMERIC(5,4) CHECK (planned_progress_override BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS actual_progress_override NUMERIC(5,4) CHECK (actual_progress_override BETWEEN 0 AND 1);

ALTER TABLE tasks
  ALTER COLUMN planned_progress DROP NOT NULL;

UPDATE tasks
SET planned_progress = NULL;

