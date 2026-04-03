-- ============================================================
-- XLGantt Web - API Integration Tables
-- Supabase Migration 003
-- api_keys, activity_logs, webhook_subscriptions
-- ============================================================

-- ============================================================
-- 1. api_keys (API 키 관리)
-- ============================================================
CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  key_hash    TEXT NOT NULL UNIQUE,
  permissions TEXT[] NOT NULL DEFAULT '{read}',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  last_used   TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_select_own" ON api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "api_keys_insert_own" ON api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "api_keys_update_own" ON api_keys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "api_keys_delete_own" ON api_keys
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 2. activity_logs (활동 로그)
-- ============================================================
CREATE TABLE activity_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  details     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_logs_select_member" ON activity_logs
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "activity_logs_insert_member" ON activity_logs
  FOR INSERT WITH CHECK (is_project_member(project_id));

CREATE INDEX idx_activity_logs_project_id ON activity_logs(project_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(project_id, created_at DESC);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);

-- ============================================================
-- 3. webhook_subscriptions (웹훅 구독)
-- ============================================================
CREATE TABLE webhook_subscriptions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  secret      TEXT NOT NULL,
  events      TEXT[] NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhooks_select_own" ON webhook_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "webhooks_insert_own" ON webhook_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "webhooks_update_own" ON webhook_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "webhooks_delete_own" ON webhook_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_webhooks_user_id ON webhook_subscriptions(user_id);
CREATE INDEX idx_webhooks_project_id ON webhook_subscriptions(project_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
