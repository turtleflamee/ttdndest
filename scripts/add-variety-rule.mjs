import fs from "fs";

const data = JSON.parse(fs.readFileSync("prompt-sets.json", "utf-8"));
let si = data.baby.systemInstructions;

// Replace the GOOD/BAD example in P1 to encourage variety
si = si.replace(
  'GOOD example: "The town of Millford sits by a river. Three weeks ago the water turned black and the crops started dying." BAD example: "Cold loops of time hiss through fractures in the indexing ring." Keep it simple and clear.',
  'Use VARIED and CREATIVE settings — not just villages and towns. Try: a ship at sea, a hot air balloon, a moving train, a desert caravan, a floating market, a mountain monastery, an underground city, a harbor during a storm. Surprise the players with settings they have not seen before. Keep language simple and clear. GOOD: "The cargo ship Salt Hen is three days from port. Last night something punched a hole in the hull and the pumps are failing." BAD: "Cold loops of time hiss through fractures in the indexing ring."'
);

// Add STORY PACING rule that ties to game length
const anchor = "=== CORE RULES ===";
const pacingRule = `=== STORY PACING — FINISH THE MISSION ===
The game has a set number of rounds. Every round must make REAL progress toward completing the objective. Do NOT stall with random side events or filler encounters.

Rough pacing for an 8-round game:
- Rounds 1-2: Travel toward the objective. Hit obstacles ON THE WAY.
- Rounds 3-5: Get closer. Face the main challenges. Learn something important.
- Rounds 6-7: Reach the final location. Confront the main enemy or problem.
- Round 8: Resolve the mission. Win or lose. The story ends.

Every round should feel like the players are getting CLOSER to the goal. If a round does not move toward the objective, it is wasted. Do not let the story wander.

`;

si = si.replace(anchor, pacingRule + anchor);
data.baby.systemInstructions = si;

fs.writeFileSync("prompt-sets.json", JSON.stringify(data, null, 2));
console.log("Added setting variety and story pacing rules");
