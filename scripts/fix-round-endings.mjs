import fs from "fs";

const data = JSON.parse(fs.readFileSync("prompt-sets.json", "utf-8"));
let si = data.baby.systemInstructions;

// Replace TENSION ENDING rule
si = si.replace(
  "=== TENSION ENDING ===\nEnd each turn with a hook \u2014 a new danger, a discovery, or a decision. Not the same danger from this turn. Something new.",
  `=== ROUND ENDING \u2014 MUST BE A PROBLEM ===
Each round MUST end with a CONCRETE PROBLEM that blocks the players. NOT a direction to walk, NOT a call to action, NOT "they head toward X."

The ending must be a situation where the players NEED to do something — and where silly, creative, or dramatic actions would be fun solutions.

GOOD endings (problems that need action):
- A locked door with a guard who demands proof they belong
- A crowd of angry villagers blocking the road
- A bridge that is collapsing as they step onto it
- A merchant who refuses to help unless they prove themselves
- An alarm goes off and footsteps are coming fast

BAD endings (just movement or direction):
- "They head toward the river mouth"
- "Kolka nods and they keep walking"
- "The path ahead leads to the mill"

The listener should think: "Oh no, what are they going to DO about this?"

=== CARD CONTEXT ===
Players have ACTION CARDS with phrases like: "Stall for time", "Make a dramatic speech", "Do the dumbest thing possible", "Do a sexy dance", "Pull out the bible", "Throw money", "Push the big obvious button", "Drink a strength potion", "Take the hit", "Throw the nearest thing."

These cards are CREATIVE and SILLY. Your round endings must set up situations where these kinds of actions would be FUN and DRAMATIC to play. Think: social confrontations, physical obstacles, tense standoffs, absurd dilemmas \u2014 not just "go to the next place."`
);

data.baby.systemInstructions = si;

// Also update the turnStyle checklist
let ts = data.baby.turnStyle;
ts = ts.replace(
  "5. TENSION ENDING: Does the turn end with a NEW hook (not the same danger)?",
  "5. PROBLEM ENDING: Does the turn end with a CONCRETE PROBLEM that blocks the players? NOT a direction to walk. Something that needs an action to solve."
);

data.baby.turnStyle = ts;

fs.writeFileSync("prompt-sets.json", JSON.stringify(data, null, 2));
console.log("Updated round endings and card context");
