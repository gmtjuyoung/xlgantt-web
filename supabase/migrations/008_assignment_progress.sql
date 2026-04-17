-- 008: task_assignments 인원별 진척률 컬럼 추가
ALTER TABLE task_assignments
  ADD COLUMN IF NOT EXISTS progress_percent INT NOT NULL DEFAULT 0
  CHECK (progress_percent BETWEEN 0 AND 100);

