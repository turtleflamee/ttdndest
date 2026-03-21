import { readFileSync } from "fs";
import { config } from "dotenv";

config({ path: ".env.local" });

const sql = readFileSync("supabase/migrations/002_add_missing_columns.sql", "utf-8");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Extract project ref from URL: https://xxx.supabase.co -> xxx
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

// Try the Supabase Management API (v1/projects/{ref}/database/query)
// This requires the service role key
const mgmtUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

console.log("Running migration via Supabase Management API...");
console.log(`Project: ${projectRef}`);

const res = await fetch(mgmtUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceKey}`,
  },
  body: JSON.stringify({ query: sql }),
});

if (res.ok) {
  console.log("Migration completed successfully!");
  process.exit(0);
}

// If management API doesn't work, try the PostgREST SQL endpoint
console.log(`Management API returned ${res.status}: ${await res.text()}`);
console.log("\nTrying alternative: individual ALTER statements via PostgREST...");

// Fall back to creating a temporary function and calling it
const createFnSql = `
CREATE OR REPLACE FUNCTION _ttdnd_migrate() RETURNS void AS $func$
BEGIN
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
END;
$func$ LANGUAGE plpgsql;
`;

console.log("\n⚠️  Automatic migration failed.");
console.log("Please run this SQL manually in your Supabase dashboard SQL Editor:");
console.log("─".repeat(60));
console.log(sql);
console.log("─".repeat(60));
console.log("\nSteps:");
console.log("1. Go to: " + supabaseUrl.replace('.supabase.co', '.supabase.com') + "/project/sql");
console.log("2. Paste the SQL above");
console.log("3. Click Run");
console.log("4. Re-run the Playwright tests");
