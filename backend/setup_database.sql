-- ============================================
-- NotaKu schema (Supabase / Postgres)
-- Jalankan di Supabase SQL Editor.
-- ============================================

-- Utility: enum untuk status meeting
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_status') THEN
    CREATE TYPE meeting_status AS ENUM ('planned', 'ongoing', 'finished', 'canceled');
  END IF;
END$$;

-- Utility: trigger untuk updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TABLE: meetings
-- ============================================
CREATE TABLE IF NOT EXISTS meetings (
  meeting_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  status       meeting_status NOT NULL DEFAULT 'planned',
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meetings_user_id_created_at_idx ON meetings(user_id, created_at DESC);

-- RLS
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meetings_select_own" ON meetings;
DROP POLICY IF EXISTS "meetings_insert_own" ON meetings;
DROP POLICY IF EXISTS "meetings_update_own" ON meetings;
DROP POLICY IF EXISTS "meetings_delete_own" ON meetings;

CREATE POLICY "meetings_select_own"
  ON meetings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "meetings_insert_own"
  ON meetings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "meetings_update_own"
  ON meetings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "meetings_delete_own"
  ON meetings FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_meetings_updated_at
BEFORE UPDATE ON meetings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- TABLE: notes (notulensi per meeting)
-- ============================================
CREATE TABLE IF NOT EXISTS notes (
  note_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id       UUID NOT NULL REFERENCES meetings(meeting_id) ON DELETE CASCADE,
  transcript_text  TEXT NOT NULL,
  summary_content  TEXT NOT NULL,
  is_shared        BOOLEAN NOT NULL DEFAULT FALSE,
  share_token      TEXT UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notes_meeting_id_idx ON notes(meeting_id);
CREATE INDEX IF NOT EXISTS notes_share_token_idx ON notes(share_token);

-- RLS: hak akses berdasarkan kepemilikan meeting
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notes_select_own" ON notes;
DROP POLICY IF EXISTS "notes_insert_own" ON notes;
DROP POLICY IF EXISTS "notes_update_own" ON notes;
DROP POLICY IF EXISTS "notes_delete_own" ON notes;

CREATE POLICY "notes_select_own"
  ON notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.meeting_id = notes.meeting_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "notes_insert_own"
  ON notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.meeting_id = meeting_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "notes_update_own"
  ON notes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.meeting_id = notes.meeting_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "notes_delete_own"
  ON notes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.meeting_id = notes.meeting_id
        AND m.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_notes_updated_at
BEFORE UPDATE ON notes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- (Opsional) Data check
-- ============================================
-- SELECT * FROM meetings LIMIT 10;
-- SELECT * FROM notes LIMIT 10;

