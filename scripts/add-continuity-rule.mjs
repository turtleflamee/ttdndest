import fs from "fs";

const data = JSON.parse(fs.readFileSync("prompt-sets.json", "utf-8"));
let si = data.baby.systemInstructions;

// Add GOAL CONTINUITY RULE after the LOCATION LOCK rule
const anchor = "=== LOCATION LOCK ===";
const newRule = `=== GOAL CONTINUITY RULE ===
After the introduction establishes a mission, direction, or clue, the first round MUST clearly follow that lead. The characters' first actions should directly pursue the objective from the introduction.

If the characters move in a different direction than the one implied by the introduction, the narration MUST explain why.

The first round should either:
- Follow the path suggested by the introduction, OR
- Include a short explanation for why the characters choose another route.

BAD continuity: The mayor points to a boat in the harbor, but the characters walk toward a cliff path with no explanation.
GOOD continuity: The mayor points to the boat. The characters inspect it and discover the current is blocked upstream.

This keeps the story logically connected. Sudden unexplained changes in direction confuse listeners.

`;

si = si.replace(anchor, newRule + anchor);
data.baby.systemInstructions = si;

fs.writeFileSync("prompt-sets.json", JSON.stringify(data, null, 2));
console.log("Added GOAL CONTINUITY RULE");
