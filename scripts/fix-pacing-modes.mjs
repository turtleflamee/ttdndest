import fs from "fs";

const data = JSON.parse(fs.readFileSync("prompt-sets.json", "utf-8"));
let si = data.baby.systemInstructions;

si = si.replace(
  `=== STORY PACING \u2014 FINISH THE MISSION ===
The game has a set number of rounds. Every round must make REAL progress toward completing the objective. Do NOT stall with random side events or filler encounters.

Rough pacing for an 8-round game:
- Rounds 1-2: Travel toward the objective. Hit obstacles ON THE WAY.
- Rounds 3-5: Get closer. Face the main challenges. Learn something important.
- Rounds 6-7: Reach the final location. Confront the main enemy or problem.
- Round 8: Resolve the mission. Win or lose. The story ends.

Every round should feel like the players are getting CLOSER to the goal. If a round does not move toward the objective, it is wasted. Do not let the story wander.`,

  `=== STORY PACING \u2014 FINISH THE MISSION ===
The game has a set number of rounds. Every round must make REAL progress toward completing the objective. Do NOT stall with random side events or filler encounters. The story MUST complete within the game length.

Pace the story to fit the game length:

SHORT GAME (6-8 rounds):
- Rounds 1-2: Travel toward the objective. Hit obstacles on the way.
- Rounds 3-5: Face the main challenges. Learn something important.
- Rounds 6-7: Confront the main enemy or problem.
- Final round: Resolve the mission. Win or lose. Story ends.

LONG GAME (12-16 rounds):
- Rounds 1-3: Travel and explore. Build the world. Meet allies and enemies.
- Rounds 4-7: Side adventures and discoveries along the way. Room for surprises and detours.
- Rounds 8-12: Main challenges escalate. Stakes get higher.
- Rounds 13-15: Confront the main enemy.
- Final round: Resolve the mission.

INFINITE GAME (no fixed end):
- Play in ARCS of 6-10 rounds each. Each arc has its own objective.
- When one arc resolves, a new one begins naturally.
- The world and characters grow over time.

Adapt pacing to the game length. Shorter games move fast. Longer games can breathe and explore. Every round should still feel like progress — no wasted turns.`
);

data.baby.systemInstructions = si;
fs.writeFileSync("prompt-sets.json", JSON.stringify(data, null, 2));
console.log("Updated pacing rules for all game lengths");
