-- ============================================================
-- XLGantt Web - Initial Database Schema
-- Supabase Migration 001
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. profiles (auth.users 확장)
-- ============================================================
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  email       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 자신의 프로필은 읽기/수정 가능
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 새 유저 가입 시 profiles 자동 생성 트리거
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. projects
-- ============================================================
CREATE TABLE projects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  description   TEXT,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  owner_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  theme_id      INT NOT NULL DEFAULT 0 CHECK (theme_id BETWEEN 0 AND 4),
  language      TEXT NOT NULL DEFAULT 'ko' CHECK (language IN ('ko', 'en')),
  zoom_level    INT NOT NULL DEFAULT 2 CHECK (zoom_level IN (1, 2, 3)),
  status_date   DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. project_members (프로젝트 참여자)
-- ============================================================
CREATE TABLE project_members (
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 헬퍼 함수: 현재 유저가 프로젝트 멤버인지 확인
-- ============================================================
CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_project_owner(p_project_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_project_editor(p_project_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'editor')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- projects RLS 정책
-- ============================================================
CREATE POLICY "projects_select_member" ON projects
  FOR SELECT USING (is_project_member(id));

CREATE POLICY "projects_insert_auth" ON projects
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "projects_update_editor" ON projects
  FOR UPDATE USING (is_project_editor(id));

CREATE POLICY "projects_delete_owner" ON projects
  FOR DELETE USING (is_project_owner(id));

-- ============================================================
-- project_members RLS 정책
-- ============================================================
CREATE POLICY "pm_select_member" ON project_members
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "pm_insert_owner" ON project_members
  FOR INSERT WITH CHECK (is_project_owner(project_id));

CREATE POLICY "pm_update_owner" ON project_members
  FOR UPDATE USING (is_project_owner(project_id));

CREATE POLICY "pm_delete_owner" ON project_members
  FOR DELETE USING (is_project_owner(project_id));

-- 프로젝트 생성 시 owner를 project_members에 자동 추가
CREATE OR REPLACE FUNCTION handle_new_project()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_project_created
  AFTER INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION handle_new_project();

-- ============================================================
-- 4. tasks
-- ============================================================
CREATE TABLE tasks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sort_order        INT NOT NULL DEFAULT 0,
  wbs_code          TEXT NOT NULL DEFAULT '',
  wbs_level         INT NOT NULL DEFAULT 1 CHECK (wbs_level BETWEEN 1 AND 10),
  is_group          BOOLEAN NOT NULL DEFAULT FALSE,
  task_name         TEXT NOT NULL DEFAULT '',
  remarks           TEXT,

  -- Planned schedule
  planned_start     DATE,
  planned_end       DATE,

  -- Actual schedule
  actual_start      DATE,
  actual_end        DATE,

  -- Workload (Man/Day)
  total_workload    NUMERIC(10,2),
  planned_workload  NUMERIC(10,2),
  actual_workload   NUMERIC(10,2),

  -- Duration (days)
  total_duration    NUMERIC(10,2),
  planned_duration  NUMERIC(10,2),
  actual_duration   NUMERIC(10,2),

  -- Calendar
  calendar_type     TEXT NOT NULL DEFAULT 'STD' CHECK (calendar_type IN ('STD', 'UD1', 'UD2')),

  -- Resources
  resource_count    INT,

  -- Deliverables
  deliverables      TEXT,

  -- Progress (0-1)
  planned_progress  NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (planned_progress BETWEEN 0 AND 1),
  actual_progress   NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (actual_progress BETWEEN 0 AND 1),

  -- Milestone
  is_milestone      BOOLEAN NOT NULL DEFAULT FALSE,

  -- Hierarchy
  parent_id         UUID REFERENCES tasks(id) ON DELETE SET NULL,
  is_collapsed      BOOLEAN NOT NULL DEFAULT FALSE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select_member" ON tasks
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "tasks_insert_editor" ON tasks
  FOR INSERT WITH CHECK (is_project_editor(project_id));

CREATE POLICY "tasks_update_editor" ON tasks
  FOR UPDATE USING (is_project_editor(project_id));

CREATE POLICY "tasks_delete_editor" ON tasks
  FOR DELETE USING (is_project_editor(project_id));

-- ============================================================
-- 5. dependencies
-- ============================================================
CREATE TABLE dependencies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  predecessor_id  UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  successor_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dep_type        INT NOT NULL DEFAULT 1 CHECK (dep_type IN (1, 2, 3, 4)),
  lag_days        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT dep_no_self CHECK (predecessor_id != successor_id)
);

ALTER TABLE dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deps_select_member" ON dependencies
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "deps_insert_editor" ON dependencies
  FOR INSERT WITH CHECK (is_project_editor(project_id));

CREATE POLICY "deps_update_editor" ON dependencies
  FOR UPDATE USING (is_project_editor(project_id));

CREATE POLICY "deps_delete_editor" ON dependencies
  FOR DELETE USING (is_project_editor(project_id));

-- ============================================================
-- 6. companies
-- ============================================================
CREATE TABLE companies (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  short_name  TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT '#3b82f6',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select_member" ON companies
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "companies_insert_editor" ON companies
  FOR INSERT WITH CHECK (is_project_editor(project_id));

CREATE POLICY "companies_update_editor" ON companies
  FOR UPDATE USING (is_project_editor(project_id));

CREATE POLICY "companies_delete_editor" ON companies
  FOR DELETE USING (is_project_editor(project_id));

-- ============================================================
-- 7. team_members
-- ============================================================
CREATE TABLE team_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT,
  role        TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- team_members는 company를 통해 project에 연결
CREATE POLICY "tm_select_member" ON team_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = team_members.company_id
        AND is_project_member(c.project_id)
    )
  );

CREATE POLICY "tm_insert_editor" ON team_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = team_members.company_id
        AND is_project_editor(c.project_id)
    )
  );

CREATE POLICY "tm_update_editor" ON team_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = team_members.company_id
        AND is_project_editor(c.project_id)
    )
  );

CREATE POLICY "tm_delete_editor" ON team_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = team_members.company_id
        AND is_project_editor(c.project_id)
    )
  );

-- ============================================================
-- 8. task_assignments
-- ============================================================
CREATE TABLE task_assignments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id           UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  member_id         UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  allocation_percent INT NOT NULL DEFAULT 100 CHECK (allocation_percent BETWEEN 1 AND 100),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_task_member UNIQUE (task_id, member_id)
);

ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ta_select_member" ON task_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_assignments.task_id
        AND is_project_member(t.project_id)
    )
  );

CREATE POLICY "ta_insert_editor" ON task_assignments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_assignments.task_id
        AND is_project_editor(t.project_id)
    )
  );

CREATE POLICY "ta_update_editor" ON task_assignments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_assignments.task_id
        AND is_project_editor(t.project_id)
    )
  );

CREATE POLICY "ta_delete_editor" ON task_assignments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_assignments.task_id
        AND is_project_editor(t.project_id)
    )
  );

-- ============================================================
-- 9. task_details (세부항목 / 체크리스트)
-- ============================================================
CREATE TABLE task_details (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sort_order    INT NOT NULL DEFAULT 0,
  title         TEXT NOT NULL DEFAULT '',
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  assignee_ids  UUID[] DEFAULT '{}',
  due_date      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE task_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "td_select_member" ON task_details
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_details.task_id
        AND is_project_member(t.project_id)
    )
  );

CREATE POLICY "td_insert_editor" ON task_details
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_details.task_id
        AND is_project_editor(t.project_id)
    )
  );

CREATE POLICY "td_update_editor" ON task_details
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_details.task_id
        AND is_project_editor(t.project_id)
    )
  );

CREATE POLICY "td_delete_editor" ON task_details
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_details.task_id
        AND is_project_editor(t.project_id)
    )
  );

-- ============================================================
-- 10. calendars (달력 설정)
-- ============================================================
CREATE TABLE calendars (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  calendar_type TEXT NOT NULL DEFAULT 'STD' CHECK (calendar_type IN ('STD', 'UD1', 'UD2')),
  name          TEXT NOT NULL DEFAULT '',
  working_days  INT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_project_calendar UNIQUE (project_id, calendar_type)
);

ALTER TABLE calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_select_member" ON calendars
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "cal_insert_editor" ON calendars
  FOR INSERT WITH CHECK (is_project_editor(project_id));

CREATE POLICY "cal_update_editor" ON calendars
  FOR UPDATE USING (is_project_editor(project_id));

CREATE POLICY "cal_delete_editor" ON calendars
  FOR DELETE USING (is_project_editor(project_id));

-- ============================================================
-- 11. holidays (공휴일 / 예외일)
-- ============================================================
CREATE TABLE holidays (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calendar_id   UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  holiday_date  DATE NOT NULL,
  is_working    BOOLEAN NOT NULL DEFAULT FALSE,
  name          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_calendar_date UNIQUE (calendar_id, holiday_date)
);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hol_select_member" ON holidays
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM calendars c
      WHERE c.id = holidays.calendar_id
        AND is_project_member(c.project_id)
    )
  );

CREATE POLICY "hol_insert_editor" ON holidays
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM calendars c
      WHERE c.id = holidays.calendar_id
        AND is_project_editor(c.project_id)
    )
  );

CREATE POLICY "hol_update_editor" ON holidays
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM calendars c
      WHERE c.id = holidays.calendar_id
        AND is_project_editor(c.project_id)
    )
  );

CREATE POLICY "hol_delete_editor" ON holidays
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM calendars c
      WHERE c.id = holidays.calendar_id
        AND is_project_editor(c.project_id)
    )
  );

-- ============================================================
-- 인덱스
-- ============================================================

-- tasks
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_sort_order ON tasks(project_id, sort_order);
CREATE INDEX idx_tasks_parent_id ON tasks(parent_id);

-- dependencies
CREATE INDEX idx_deps_project_id ON dependencies(project_id);
CREATE INDEX idx_deps_predecessor ON dependencies(predecessor_id);
CREATE INDEX idx_deps_successor ON dependencies(successor_id);

-- task_assignments
CREATE INDEX idx_ta_task_id ON task_assignments(task_id);
CREATE INDEX idx_ta_member_id ON task_assignments(member_id);

-- task_details
CREATE INDEX idx_td_task_id ON task_details(task_id);
CREATE INDEX idx_td_sort_order ON task_details(task_id, sort_order);

-- companies
CREATE INDEX idx_companies_project_id ON companies(project_id);

-- team_members
CREATE INDEX idx_tm_company_id ON team_members(company_id);

-- calendars
CREATE INDEX idx_cal_project_id ON calendars(project_id);

-- holidays
CREATE INDEX idx_hol_calendar_id ON holidays(calendar_id);
CREATE INDEX idx_hol_date ON holidays(calendar_id, holiday_date);

-- ============================================================
-- updated_at 자동 갱신 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON task_details
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON calendars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 프로젝트 멤버가 다른 멤버의 프로필을 볼 수 있도록 추가 정책
-- ============================================================
CREATE POLICY "profiles_select_project_peers" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_members pm1
      JOIN project_members pm2 ON pm1.project_id = pm2.project_id
      WHERE pm1.user_id = auth.uid()
        AND pm2.user_id = profiles.id
    )
  );
