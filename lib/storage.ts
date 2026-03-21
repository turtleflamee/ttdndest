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
  // Pack ALL game state into memory_bundle JSONB so it works with any
  // DB schema version. The base schema only guarantees: id, name,
  // turn_number, memory_bundle, deck_state, scene_title,
  // previous_response_id, rules_text.
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
    _replay_requested: game.replayRequested ?? false,
  };

  return {
    id: game.id,
    name: game.name,
    turn_number: game.turnCounter,
    memory_bundle: memoryWithExtras,
    deck_state: game.deck ?? null,
    scene_title: game.scene_title ?? null,
    previous_response_id: game.previous_response_id ?? null,
    rules_text: game.rulesText ?? "",
  };
}

function rowToGame(row: Record<string, unknown>): GameState {
  const rawBundle = (row.memory_bundle ?? {}) as Record<string, unknown>;

  // All game state is packed into memory_bundle JSONB with _ prefix.
  // DB columns are optional — they may or may not exist depending on schema version.
  const packedPlayers = (rawBundle._players as GameState["players"]) ?? undefined;
  const packedHistory = (rawBundle._history as GMResponse[]) ?? undefined;

  // Clean bundle — remove underscore-prefixed packed fields
  const memoryBundle = { ...rawBundle };
  for (const key of Object.keys(memoryBundle)) {
    if (key.startsWith("_")) delete memoryBundle[key];
  }

  // Players: packed _players is authoritative (always written by gameToRow)
  const players = packedPlayers ?? [];

  // History: packed _history is authoritative
  const history = packedHistory ?? [];

  return {
    id: row.id as string,
    name: row.name as string,
    playerCount: (rawBundle._player_count as number) ?? players.length ?? 2,
    players,
    turnCounter: (row.turn_number as number) ?? 0,
    memoryBundle: memoryBundle as unknown as GameState["memoryBundle"],
    deck: (row.deck_state as GameState["deck"]) ?? undefined,
    history,
    scene_title: (row.scene_title as string) ?? undefined,
    game_mode: ((rawBundle._game_mode as string) ?? "short") as GameState["game_mode"],
    scenario_id: (rawBundle._scenario_id as string) ?? undefined,
    prompt_set_code: (rawBundle._prompt_set_code as string) ?? undefined,
    input_mode: ((rawBundle._input_mode as string) ?? "phone") as GameState["input_mode"],
    plate_id: (rawBundle._plate_id as string) ?? undefined,
    previous_response_id: (row.previous_response_id as string) ?? null,
    game_complete: (rawBundle._game_complete as boolean) ?? false,
    replayRequested: (rawBundle._replay_requested as boolean) ?? false,
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
