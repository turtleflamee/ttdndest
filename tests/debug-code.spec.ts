import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";

test("Debug: create game, check codes, validate", async ({ request }) => {
  // 1. Unlock
  await request.post(`${BASE}/api/unlock`, { data: { code: "1234" } });

  // 2. Create game
  const createRes = await request.post(`${BASE}/api/games`, {
    data: {
      name: "Debug Code Test",
      playerCount: 2,
      playerNames: ["Alice", "Bob"],
      scenarioId: "simple-adventure",
      gameMode: "short",
      deckType: "adventure",
      promptSetCode: "baby",
      inputMode: "phone",
    },
  });
  console.log("Create status:", createRes.status());
  const game = await createRes.json();

  if (!createRes.ok()) {
    console.log("CREATE FAILED:", JSON.stringify(game, null, 2));
    expect(createRes.ok()).toBe(true);
    return;
  }

  const gameId = game.id;
  const p1Code = game.players[0]?.code;
  const p2Code = game.players[1]?.code;
  console.log("Game ID:", gameId);
  console.log("Player 0 code:", p1Code);
  console.log("Player 1 code:", p2Code);
  console.log("Players:", JSON.stringify(game.players.map((p: { name: string; code: string }) => ({ name: p.name, code: p.code })), null, 2));

  // 3. Fetch game back from DB and check codes survived the round-trip
  const fetchRes = await request.get(`${BASE}/api/games/${gameId}`);
  const fetched = await fetchRes.json();
  console.log("Fetched player codes:", fetched.players?.map((p: { name: string; code: string }) => ({ name: p.name, code: p.code })));

  const fetchedP1Code = fetched.players?.[0]?.code;
  const fetchedP2Code = fetched.players?.[1]?.code;
  console.log("Code round-trip check:");
  console.log("  Created P1 code:", p1Code, "-> Fetched:", fetchedP1Code, "Match:", p1Code === fetchedP1Code);
  console.log("  Created P2 code:", p2Code, "-> Fetched:", fetchedP2Code, "Match:", p2Code === fetchedP2Code);

  // 4. Try validate with the code
  console.log("\nValidating with code:", p1Code);
  const valRes = await request.post(`${BASE}/api/player/validate`, {
    data: { code: p1Code },
  });
  console.log("Validate status:", valRes.status());
  const valBody = await valRes.json();
  console.log("Validate response:", JSON.stringify(valBody, null, 2));

  expect(valRes.ok()).toBe(true);
  expect(valBody.gameId).toBe(gameId);

  // 5. Clean up
  await request.delete(`${BASE}/api/games/${gameId}`);
});
