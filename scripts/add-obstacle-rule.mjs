import fs from "fs";

const data = JSON.parse(fs.readFileSync("prompt-sets.json", "utf-8"));
let si = data.baby.systemInstructions;

// Add the ONE OBSTACLE rule after SINGLE PROBLEM RULE
const anchor = "=== RESOLUTION RULE ===";
const newRule = `=== ONE OBSTACLE PER ROUND ===
Each round must revolve around ONE primary obstacle. All actions in the round should directly relate to solving or confronting that obstacle. Do not introduce a second, unrelated problem within the same round. If a new problem appears, it becomes the focus of the NEXT round, not this one.

During a round: characters may investigate, react, or improvise — but every action must connect to the same central challenge.

A round ends when: the obstacle is solved, the obstacle worsens, or the obstacle reveals a new threat that becomes the next round's problem.

This keeps the scene focused and the story easy to follow for listeners hearing it once.

`;

si = si.replace(anchor, newRule + anchor);
data.baby.systemInstructions = si;

// Also add to turnStyle checklist
let ts = data.baby.turnStyle;
ts += "\n10. ONE OBSTACLE: Does the entire round focus on a single problem? No unrelated side-problems?";
data.baby.turnStyle = ts;

fs.writeFileSync("prompt-sets.json", JSON.stringify(data, null, 2));
console.log("Added ONE OBSTACLE rule to systemInstructions and turnStyle");
