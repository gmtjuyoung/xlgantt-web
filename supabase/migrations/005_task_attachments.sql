-- ============================================================
-- 005: task_details에 attachments/comments JSONB 컬럼 추가
--      + Supabase Storage 버킷 생성
-- ============================================================

-- 1. task_details 테이블에 JSONB 컬럼 추가
ALTER TABLE task_details
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS comments    JSONB DEFAULT '[]'::jsonb;

-- 2. Supabase Storage 버킷 생성 (task 첨부파일용)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-attachments',
  'task-attachments',
  true,
  52428800,  -- 50MB
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-7z-compressed'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS 정책: 인증된 사용자만 업로드/다운로드
CREATE POLICY "task_attach_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'task-attachments');

CREATE POLICY "task_attach_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'task-attachments'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "task_attach_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'task-attachments'
    AND auth.role() = 'authenticated'
  );
