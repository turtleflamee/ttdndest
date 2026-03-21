-- Add columns that the v2 rebuild expects but the original schema doesn't have.
-- All use IF NOT EXISTS or safe defaults to be idempotent.

DO $$
BEGIN
  -- games table additions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='game_complete') THEN
    ALTER TABLE games ADD COLUMN game_complete BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='replay_requested') THEN
    ALTER TABLE games ADD COLUMN replay_requested BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='history') THEN
    ALTER TABLE games ADD COLUMN history JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='player_count') THEN
    ALTER TABLE games ADD COLUMN player_count INTEGER NOT NULL DEFAULT 2;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='players') THEN
    ALTER TABLE games ADD COLUMN players JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='game_mode') THEN
    ALTER TABLE games ADD COLUMN game_mode TEXT NOT NULL DEFAULT 'short';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='input_mode') THEN
    ALTER TABLE games ADD COLUMN input_mode TEXT NOT NULL DEFAULT 'phone';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='plate_id') THEN
    ALTER TABLE games ADD COLUMN plate_id TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='prompt_set_code') THEN
    ALTER TABLE games ADD COLUMN prompt_set_code TEXT DEFAULT 'default';
  END IF;

  -- plates table (create if not exists)
  CREATE TABLE IF NOT EXISTS plates (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    api_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    active_game_id TEXT,
    reader_count INTEGER NOT NULL DEFAULT 1,
    last_test_scan JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- physical_cards table (create if not exists)
  CREATE TABLE IF NOT EXISTS physical_cards (
    card_number INTEGER PRIMARY KEY,
    text TEXT NOT NULL DEFAULT '',
    prompt_hint TEXT
  );

  -- card_mappings table (create if not exists)
  CREATE TABLE IF NOT EXISTS card_mappings (
    rfid_uid TEXT PRIMARY KEY,
    physical_card_number INTEGER REFERENCES physical_cards(card_number) ON DELETE CASCADE
  );
END
$$;

-- Seed 50 physical card slots if they don't exist
INSERT INTO physical_cards (card_number, text)
SELECT n, '' FROM generate_series(1, 50) AS n
ON CONFLICT DO NOTHING;

-- Indexes (safe with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_plates_api_token ON plates(api_token);
