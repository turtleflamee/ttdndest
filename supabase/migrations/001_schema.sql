-- TTDND v2 — Single clean migration
-- Games: uses JSONB players array instead of individual player columns

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  player_count INTEGER NOT NULL DEFAULT 2,
  players JSONB NOT NULL DEFAULT '[]'::jsonb,
  turn_number INTEGER NOT NULL DEFAULT 0,
  memory_bundle JSONB NOT NULL DEFAULT '{}'::jsonb,
  deck_state JSONB,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  scene_title TEXT,
  game_mode TEXT NOT NULL DEFAULT 'short',
  scenario_id TEXT,
  prompt_set_code TEXT DEFAULT 'default',
  input_mode TEXT NOT NULL DEFAULT 'phone',
  plate_id TEXT,
  previous_response_id TEXT,
  game_complete BOOLEAN NOT NULL DEFAULT FALSE,
  replay_requested BOOLEAN NOT NULL DEFAULT FALSE,
  rules_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_turns (
  id BIGSERIAL PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  player_moves JSONB NOT NULL DEFAULT '[]'::jsonb,
  gm_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  api_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  active_game_id TEXT REFERENCES games(id) ON DELETE SET NULL,
  reader_count INTEGER NOT NULL DEFAULT 1,
  last_test_scan JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS physical_cards (
  card_number INTEGER PRIMARY KEY,
  text TEXT NOT NULL DEFAULT '',
  prompt_hint TEXT
);

CREATE TABLE IF NOT EXISTS card_mappings (
  rfid_uid TEXT PRIMARY KEY,
  physical_card_number INTEGER REFERENCES physical_cards(card_number) ON DELETE CASCADE
);

-- Seed 50 physical card slots
INSERT INTO physical_cards (card_number, text)
SELECT n, '' FROM generate_series(1, 50) AS n
ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_game_turns_game_id ON game_turns(game_id);
CREATE INDEX IF NOT EXISTS idx_games_updated_at ON games(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_plates_api_token ON plates(api_token);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_games_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS (permissive for service role)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE plates ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on games" ON games FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on game_turns" ON game_turns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on plates" ON plates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on physical_cards" ON physical_cards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on card_mappings" ON card_mappings FOR ALL USING (true) WITH CHECK (true);
