import { supabase } from "./supabase";
import type { GameState, GMResponse } from "./types";

/**
 * Maps GameState to DB row.
 * 
 * Packs all v2-specific fields into memory_bundle JSONB so we work
 * with any version of the DB schema (no ALTER TABLE needed).
 * Only sends columns guaranteed to exist in the base 001 schema.
 */
function gameToRow(game: GameState) {
  const memoryWithExtras = {
    ...game.memoryBundle,
    _game_complete: game.game_complete ?? false,
    _history: game.history ?? [],
    _game_mode: game.game_mode ?? "short",
    _scenario_id: game.scenario_id ?? null,
    _prompt_set_code: game.prompt_set_code ?? null,
    _input_mode: game.input_mode ?? "phone",
    _plate_id: game.plate_id ?? null,
    _player_count: game.playerCount ?? 2,
    _players: game.players ?? [],
  };

  return {
    id: game.id,
    name: game.name,
    player_count: game.playerCount ?? 2,
    players: game.players ?? [],
    turn_number: game.turnCounter,
    memory_bundle: memoryWithExtras,
    deck_state: game.deck ?? null,
    scene_title: game.scene_title ?? null,
    previous_response_id: game.previous_response_id ?? null,
    game_complete: game.game_complete ?? false,
    game_mode: game.game_mode ?? "short",
    scenario_id: game.scenario_id ?? null,
    prompt_set_code: game.prompt_set_code ?? "default",
    input_mode: game.input_mode ?? "phone",
    plate_id: game.plate_id ?? null,
    replay_requested: game.replayRequested ?? false,
    rules_text: game.rulesText ?? "",
    history: game.history ?? [],
  };
}

function rowToGame(row: Record<string, unknown>): GameState {
  const rawBundle = (row.memory_bundle ?? {}) as Record<string, unknown>;

  // Extract packed fields from memory_bundle (legacy fallback for older data)
  const packedPlayers = (rawBundle._players as GameState["players"]) ?? undefined;
  const packedHistory = (rawBundle._history as GMResponse[]) ?? undefined;

  // Clean bundle — remove underscore-prefixed packed fields
  const memoryBundle = { ...rawBundle };
  for (const key of Object.keys(memoryBundle)) {
    if (key.startsWith("_")) delete memoryBundle[key];
  }

  // Build players array: prefer DB players column, then packed _players
  let players = row.players as GameState["players"];
  if (!players || !Array.isArray(players) || players.length === 0) {
    players = packedPlayers ?? [];
  }

  // History: prefer DB history column, then packed _history
  let history = row.history as GMResponse[];
  if (!history || !Array.isArray(history) || history.length === 0) {
    history = packedHistory ?? [];
  }

  return {
    id: row.id as string,
    name: row.name as string,
    playerCount: (row.player_count as number) ?? players.length ?? 2,
    players,
    turnCounter: (row.turn_number as number) ?? 0,
    memoryBundle: memoryBundle as unknown as GameState["memoryBundle"],
    deck: (row.deck_state as GameState["deck"]) ?? undefined,
    history,
    scene_title: (row.scene_title as string) ?? undefined,
    game_mode: ((row.game_mode as string) ?? (rawBundle._game_mode as string) ?? "short") as GameState["game_mode"],
    scenario_id: (row.scenario_id as string) ?? (rawBundle._scenario_id as string) ?? undefined,
    prompt_set_code: (row.prompt_set_code as string) ?? (rawBundle._prompt_set_code as string) ?? undefined,
    input_mode: ((row.input_mode as string) ?? (rawBundle._input_mode as string) ?? "phone") as GameState["input_mode"],
    plate_id: (row.plate_id as string) ?? (rawBundle._plate_id as string) ?? undefined,
    previous_response_id: (row.previous_response_id as string) ?? null,
    game_complete: (row.game_complete as boolean) ?? (rawBundle._game_complete as boolean) ?? false,
    replayRequested: (row.replay_requested as boolean) ?? false,
    rulesText: (row.rules_text as string) ?? "",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ── Games ──────────────────────────────────────────────

export async function createGame(game: GameState): Promise<GameState> {
  const { data, error } = await supabase
    .from("games")
    .insert(gameToRow(game))
    .select()
    .single();
  if (error) throw error;
  return rowToGame(data);
}

export async function getGame(id: string): Promise<GameState | null> {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return rowToGame(data);
}

export async function updateGame(game: GameState): Promise<void> {
  const { error } = await supabase
    .from("games")
    .update(gameToRow(game))
    .eq("id", game.id);
  if (error) throw error;
}

export async function listGames(): Promise<GameState[]> {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToGame);
}

export async function deleteGame(id: string): Promise<void> {
  const { error } = await supabase.from("games").delete().eq("id", id);
  if (error) throw error;
}

// ── Turns ──────────────────────────────────────────────

export async function saveTurn(
  gameId: string,
  turnNumber: number,
  playerMoves: unknown,
  gmResponse: unknown
): Promise<void> {
  const { error } = await supabase.from("game_turns").insert({
    game_id: gameId,
    turn_number: turnNumber,
    player_moves: playerMoves,
    gm_response: gmResponse,
  });
  if (error) throw error;
}

// ── Player Code Lookup ─────────────────────────────────

export async function getGameByPlayerCode(
  code: string
): Promise<{ game: GameState; playerIndex: number } | null> {
  const { data, error } = await supabase.from("games").select("*");
  if (error) throw error;

  for (const row of data ?? []) {
    const game = rowToGame(row);
    const idx = game.players.findIndex((p) => p.code === code);
    if (idx !== -1) return { game, playerIndex: idx };
  }
  return null;
}

// ── Plates ─────────────────────────────────────────────

export async function getPlate(id: string) {
  const { data, error } = await supabase
    .from("plates")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function getPlateByToken(token: string) {
  const { data, error } = await supabase
    .from("plates")
    .select("*")
    .eq("api_token", token)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function updatePlate(
  id: string,
  updates: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from("plates").update(updates).eq("id", id);
  if (error) throw error;
}

export async function listPlates() {
  const { data, error } = await supabase.from("plates").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function createPlate(name: string) {
  const { data, error } = await supabase
    .from("plates")
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePlate(id: string): Promise<void> {
  const { error } = await supabase.from("plates").delete().eq("id", id);
  if (error) throw error;
}

// ── Physical Cards ─────────────────────────────────────

export async function getPhysicalCards() {
  const { data, error } = await supabase
    .from("physical_cards")
    .select("*")
    .order("card_number", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function updatePhysicalCard(
  cardNumber: number,
  text: string,
  promptHint?: string
): Promise<void> {
  const update: Record<string, unknown> = { text };
  if (promptHint !== undefined) update.prompt_hint = promptHint;
  const { error } = await supabase
    .from("physical_cards")
    .update(update)
    .eq("card_number", cardNumber);
  if (error) throw error;
}

export async function getPhysicalCardByNumber(cardNumber: number) {
  const { data, error } = await supabase
    .from("physical_cards")
    .select("*")
    .eq("card_number", cardNumber)
    .single();
  if (error) throw error;
  return data;
}

// ── Card Mappings ──────────────────────────────────────

export async function getCardMappings() {
  const { data, error } = await supabase
    .from("card_mappings")
    .select("*, physical_cards(*)");
  if (error) throw error;
  return data ?? [];
}

export async function setCardMapping(
  rfidUid: string,
  physicalCardNumber: number
): Promise<void> {
  const { error } = await supabase.from("card_mappings").upsert(
    { rfid_uid: rfidUid, physical_card_number: physicalCardNumber },
    { onConflict: "rfid_uid" }
  );
  if (error) throw error;
}

export async function deleteCardMapping(rfidUid: string): Promise<void> {
  const { error } = await supabase
    .from("card_mappings")
    .delete()
    .eq("rfid_uid", rfidUid);
  if (error) throw error;
}

export async function getPhysicalCardByRfidUid(rfidUid: string) {
  const { data, error } = await supabase
    .from("card_mappings")
    .select("*, physical_cards(*)")
    .eq("rfid_uid", rfidUid)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}
