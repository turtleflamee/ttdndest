import fs from "fs";

const data = JSON.parse(fs.readFileSync("prompt-sets.json", "utf-8"));
let si = data.baby.systemInstructions;

const anchor = "=== RESOLUTION RULE ===";
const newRule = `=== OBSTACLE COMMITMENT RULE ===
When a character, obstacle, or threat is introduced in a round, it MUST stay relevant until the round's problem is resolved. Do NOT introduce things that disappear or solve themselves without player action.

If a character blocks the players, the players must: confront them, negotiate with them, outmaneuver them, or suffer a consequence. The obstacle drives the tension until the scene moves on.

BAD: A guard blocks the path but slips and falls before the players do anything.
GOOD: A guard blocks the path and forces the players to bargain, threaten, or find another way past.

Every introduced element must contribute to the round's central challenge. Nothing appears and vanishes without impact.

`;

si = si.replace(anchor, newRule + anchor);
data.baby.systemInstructions = si;

fs.writeFileSync("prompt-sets.json", JSON.stringify(data, null, 2));
console.log("Added OBSTACLE COMMITMENT RULE");
