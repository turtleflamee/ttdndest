import { test, expect, APIRequestContext } from "@playwright/test";

const ADMIN_CODE = "1234";
const BASE = "http://localhost:3000";

/** Get an authenticated API context by unlocking first */
async function authedRequest(request: APIRequestContext) {
  const unlockRes = await request.post(`${BASE}/api/unlock`, {
    data: { code: ADMIN_CODE },
  });
  expect(unlockRes.ok()).toBe(true);
  return request;
}

test.describe.serial("TTDND Full Game Flow", () => {
  let gameId: string;
  let player1Code: string;
  let player2Code: string;

  test("1. Unlock API works", async ({ request }) => {
    const res = await request.post(`${BASE}/api/unlock`, {
      data: { code: ADMIN_CODE },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("2. Scenarios API returns templates", async ({ request }) => {
    await authedRequest(request);
    const res = await request.get(`${BASE}/api/scenarios`);
    expect(res.ok()).toBe(true);
    const scenarios = await res.json();
    expect(Array.isArray(scenarios)).toBe(true);
    expect(scenarios.length).toBeGreaterThan(0);
    const names = scenarios.map((s: { name: string }) => s.name);
    console.log(`  Found ${scenarios.length} scenarios: ${names.join(", ")}`);
  });

  test("3. Create a new game", async ({ request }) => {
    await authedRequest(request);
    const res = await request.post(`${BASE}/api/games`, {
      data: {
        name: "Playwright Test Game",
        playerCount: 2,
        playerNames: ["TestHero", "TestRogue"],
        scenarioId: "simple-adventure",
        gameMode: "short",
        deckType: "adventure",
        promptSetCode: "baby",
        inputMode: "phone",
      },
    });
    expect(res.status()).toBe(201);
    const game = await res.json();
    expect(game.id).toBeTruthy();
    expect(game.name).toBe("Playwright Test Game");
    expect(game.players).toHaveLength(2);
    expect(game.players[0].name).toBe("TestHero");
    expect(game.players[1].name).toBe("TestRogue");
    expect(game.players[0].code).toHaveLength(4);
    expect(game.players[0].hand).toHaveLength(5);
    expect(game.turnCounter).toBe(0);
    expect(game.memoryBundle).toBeTruthy();

    gameId = game.id;
    player1Code = game.players[0].code;
    player2Code = game.players[1].code;

    console.log(`  Game ID: ${gameId}`);
    console.log(`  Player 1 code: ${player1Code}`);
    console.log(`  Player 2 code: ${player2Code}`);
    console.log(`  Cards dealt: ${game.players[0].hand.map((c: { text: string }) => c.text).join(" | ")}`);
  });

  test("4. Game appears in list", async ({ request }) => {
    await authedRequest(request);
    const res = await request.get(`${BASE}/api/games`);
    expect(res.ok()).toBe(true);
    const games = await res.json();
    expect(Array.isArray(games)).toBe(true);
    const found = games.find((g: { id: string }) => g.id === gameId);
    expect(found).toBeTruthy();
    expect(found.name).toBe("Playwright Test Game");
  });

  test("5. Player 1 validates with code", async ({ request }) => {
    const res = await request.post(`${BASE}/api/player/validate`, {
      data: { code: player1Code },
    });
    expect(res.ok()).toBe(true);
    const result = await res.json();
    expect(result.gameId).toBe(gameId);
    expect(result.playerIndex).toBe(0);
    expect(result.playerName).toBe("TestHero");
  });

  test("6. Player 2 validates with code", async ({ request }) => {
    const res = await request.post(`${BASE}/api/player/validate`, {
      data: { code: player2Code },
    });
    expect(res.ok()).toBe(true);
    const result = await res.json();
    expect(result.gameId).toBe(gameId);
    expect(result.playerIndex).toBe(1);
    expect(result.playerName).toBe("TestRogue");
  });

  test("7. Invalid code is rejected", async ({ request }) => {
    const res = await request.post(`${BASE}/api/player/validate`, {
      data: { code: "0000" },
    });
    expect(res.status()).toBe(404);
  });

  test("8. Player 1 submits a card", async ({ request }) => {
    await authedRequest(request);
    const gameRes = await request.get(`${BASE}/api/games/${gameId}`);
    const game = await gameRes.json();
    const card = game.players[0].hand[0];

    const res = await request.post(`${BASE}/api/player/submit-card`, {
      data: {
        gameId,
        playerIndex: 0,
        cardId: card.id,
        cardText: card.text,
      },
    });
    expect(res.ok()).toBe(true);
    console.log(`  Player 1 played: "${card.text}"`);

    // Verify it's stored
    const updatedRes = await request.get(`${BASE}/api/games/${gameId}`);
    const updated = await updatedRes.json();
    expect(updated.players[0].pendingCard).toBeTruthy();
    expect(updated.players[0].pendingCard.cardText).toBe(card.text);
  });

  test("9. Player 1 double-submit is rejected", async ({ request }) => {
    await authedRequest(request);
    const gameRes = await request.get(`${BASE}/api/games/${gameId}`);
    const game = await gameRes.json();
    const card = game.players[0].hand[1];

    const res = await request.post(`${BASE}/api/player/submit-card`, {
      data: {
        gameId,
        playerIndex: 0,
        cardId: card.id,
        cardText: card.text,
      },
    });
    expect(res.status()).toBe(409);
  });

  test("10. Player 2 submits a card", async ({ request }) => {
    await authedRequest(request);
    const gameRes = await request.get(`${BASE}/api/games/${gameId}`);
    const game = await gameRes.json();
    const card = game.players[1].hand[0];

    const res = await request.post(`${BASE}/api/player/submit-card`, {
      data: {
        gameId,
        playerIndex: 1,
        cardId: card.id,
        cardText: card.text,
      },
    });
    expect(res.ok()).toBe(true);
    console.log(`  Player 2 played: "${card.text}"`);
  });

  test("11. GM generates narration (OpenAI call)", async ({ request }) => {
    await authedRequest(request);
    console.log("  Calling OpenAI for narration (this takes 10-30 seconds)...");

    const res = await request.post(`${BASE}/api/gm`, {
      data: { gameId },
      timeout: 90_000,
    });

    const body = await res.json();

    if (!res.ok()) {
      console.log("  GM ERROR:", JSON.stringify(body));
    }

    expect(res.ok()).toBe(true);
    expect(body.narration).toBeTruthy();
    expect(typeof body.narration).toBe("string");
    expect(body.narration.length).toBeGreaterThan(30);
    expect(body.scene_title).toBeTruthy();

    console.log("\n  ======= GM NARRATION =======");
    console.log(`  Scene: ${body.scene_title}`);
    console.log(`  Turn: ${body.turn}`);
    console.log(`  Words: ~${body.narration.split(/\s+/).length}`);
    console.log(`  ---`);
    console.log(`  ${body.narration}`);
    console.log("  ============================\n");

    if (body.dialogue?.length) {
      console.log("  Dialogue:");
      for (const d of body.dialogue) {
        console.log(`    ${d.speaker}: "${d.line}"`);
      }
    }
    if (body.consequences?.length) {
      console.log(`  Consequences: ${body.consequences.map((c: { summary: string }) => c.summary).join("; ")}`);
    }
    if (body.location_change) {
      console.log(`  Location changed to: ${body.location_change}`);
    }
  });

  test("12. Game state updated correctly after turn", async ({ request }) => {
    await authedRequest(request);
    const res = await request.get(`${BASE}/api/games/${gameId}`);
    const game = await res.json();

    expect(game.turnCounter).toBe(1);
    expect(game.players[0].pendingCard).toBeFalsy();
    expect(game.players[1].pendingCard).toBeFalsy();
    expect(game.history.length).toBeGreaterThanOrEqual(1);
    expect(game.memoryBundle).toBeTruthy();

    console.log("  === Post-Turn Game State ===");
    console.log(`  Turn: ${game.turnCounter}`);
    console.log(`  History entries: ${game.history.length}`);
    console.log(`  Canon: ${game.memoryBundle.canon?.length ?? 0} facts`);
    console.log(`  Characters: ${Object.keys(game.memoryBundle.characters ?? {}).length}`);
    console.log(`  Open threads: ${game.memoryBundle.open_threads?.length ?? 0}`);
    console.log(`  Location: ${game.memoryBundle.current_location ?? "not set"}`);
    console.log(`  Consequences: ${game.memoryBundle.active_consequences?.length ?? 0}`);
    console.log(`  Scene title: ${game.scene_title ?? "none"}`);
  });

  test("13. Unlock page UI works", async ({ page }) => {
    await page.goto(`${BASE}/unlock`);
    const input = page.locator("input").first();
    await expect(input).toBeVisible();
    await input.fill(ADMIN_CODE);
    await page.locator("button").first().click();
    await page.waitForURL("**/game-library", { timeout: 10_000 });
    await expect(page).toHaveURL(/\/game-library/);
  });

  test("14. Game library page loads and shows game", async ({ page }) => {
    // Unlock
    await page.goto(`${BASE}/unlock`);
    await page.locator("input").first().fill(ADMIN_CODE);
    await page.locator("button").first().click();
    await page.waitForURL("**/game-library", { timeout: 10_000 });

    // Wait for games to load
    await page.waitForTimeout(3_000);
    const body = await page.textContent("body");
    expect(body).not.toContain("TypeError");
    // Should show our test game
    expect(body).toContain("Playwright Test Game");
  });

  test("15. Play page loads and shows narration", async ({ page }) => {
    // Unlock
    await page.goto(`${BASE}/unlock`);
    await page.locator("input").first().fill(ADMIN_CODE);
    await page.locator("button").first().click();
    await page.waitForURL("**/game-library", { timeout: 10_000 });

    // Go to play page
    await page.goto(`${BASE}/play?id=${gameId}`);
    await page.waitForTimeout(5_000);

    const body = await page.textContent("body");
    expect(body).not.toContain("TypeError");
    expect(body).toContain("Playwright Test Game");
  });

  test("16. Player entry page UI works", async ({ page }) => {
    await page.goto(`${BASE}/player-entry`);
    const input = page.locator("input").first();
    await expect(input).toBeVisible();

    // Enter valid code for player 1
    await input.fill(player1Code);
    await page.locator("button").first().click();
    await page.waitForURL("**/player-view", { timeout: 10_000 });
    await expect(page).toHaveURL(/\/player-view/);
  });

  test("17. Cleanup: delete test game", async ({ request }) => {
    await authedRequest(request);
    const res = await request.delete(`${BASE}/api/games/${gameId}`);
    expect(res.ok()).toBe(true);

    const getRes = await request.get(`${BASE}/api/games/${gameId}`);
    expect(getRes.status()).toBe(404);
    console.log("  Test game cleaned up");
  });
});
