-- ============================================================
-- XLGantt Web - Webhook Enhancements
-- Supabase Migration 003_webhook_subscriptions
-- Adds: description column, webhook_logs table, cleanup function
-- Depends on: 003_api_integration.sql (webhook_subscriptions)
-- ============================================================

-- ============================================================
-- 1. webhook_subscriptions 컬럼 추가
-- ============================================================
ALTER TABLE webhook_subscriptions
  ADD COLUMN IF NOT EXISTS description TEXT;

-- secret 기본값 설정 (기존 레코드에는 영향 없음)
ALTER TABLE webhook_subscriptions
  ALTER COLUMN secret SET DEFAULT encode(gen_random_bytes(32), 'hex');

-- 활성 구독 조회 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_ws_active
  ON webhook_subscriptions(project_id, is_active);

-- ============================================================
-- 2. webhook_logs (웹훅 발행 로그)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id   UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event             TEXT NOT NULL,
  payload           JSONB NOT NULL DEFAULT '{}',
  response_status   INT,
  response_body     TEXT,
  success           BOOLEAN NOT NULL DEFAULT FALSE,
  duration_ms       INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- project owner만 로그 조회 가능
CREATE POLICY "wl_select_owner" ON webhook_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM webhook_subscriptions ws
      WHERE ws.id = webhook_logs.subscription_id
        AND is_project_owner(ws.project_id)
    )
  );

-- service_role로 로그 삽입 허용 (Edge Function에서 사용)
-- RLS bypass는 service_role_key 사용 시 자동 적용

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_wl_subscription_id ON webhook_logs(subscription_id);
CREATE INDEX IF NOT EXISTS idx_wl_created_at ON webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wl_event ON webhook_logs(event);

-- ============================================================
-- 3. 30일 이상 된 로그 자동 삭제 함수 (cron으로 실행)
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_old_webhook_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM webhook_logs
  WHERE created_at < now() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
