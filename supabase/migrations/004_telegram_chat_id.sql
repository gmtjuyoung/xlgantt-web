-- ============================================================
-- XLGantt Web - profiles 테이블에 텔레그램 chat_id 컬럼 추가
-- Supabase Migration 004
-- ============================================================

-- telegram_chat_id: 텔레그램 봇 연동 시 사용자의 chat ID
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

-- 인덱스: telegram_chat_id로 빠른 조회
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_chat_id
  ON profiles(telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

-- team_members에도 telegram_chat_id 추가 (프로필과 별개로 팀 멤버 직접 연동)
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_tm_telegram_chat_id
  ON team_members(telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;
