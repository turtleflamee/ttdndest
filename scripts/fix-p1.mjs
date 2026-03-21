import fs from "fs";

const data = JSON.parse(fs.readFileSync("prompt-sets.json", "utf-8"));
let si = data.baby.systemInstructions;

// Replace P1
si = si.replace(
  "P1 \u2014 THE SITUATION: What is happening RIGHT NOW in this place? Not scenery \u2014 the problem that already exists. Something is wrong, broken, or about to go bad. The listener should immediately know why they are here and what is at stake. No decorative descriptions.",
  'P1 \u2014 THE WORLD AND ITS PROBLEM: Name the place. Say what kind of place it is in ONE simple sentence. Then say what is going wrong. Use simple everyday language a 12-year-old would understand. NO invented words, NO complex fantasy concepts, NO poetic language. GOOD example: "The town of Millford sits by a river. Three weeks ago the water turned black and the crops started dying." BAD example: "Cold loops of time hiss through fractures in the indexing ring." Keep it simple and clear.'
);

// Replace P2
si = si.replace(
  "P2 \u2014 CONTEXT: Why this place and this problem matter. One or two sentences. Connect it to something the players care about.",
  "P2 \u2014 WHY IT MATTERS: Who is hurt by this problem and why the players should care. One or two simple sentences."
);

// Strengthen tone rule
si = si.replace(
  "=== TONE ===\nLike a DM telling a story at the table. Direct, clear, energetic. The players always know what is happening and what they must do next.",
  "=== TONE ===\nLike a DM telling a story to friends at the table. Use words a 12-year-old knows. If a sentence needs rereading to make sense, it is too complicated. The listener hears this ONCE and cannot go back. Every sentence must be instantly clear on first listen. Direct, clear, energetic."
);

data.baby.systemInstructions = si;
fs.writeFileSync("prompt-sets.json", JSON.stringify(data, null, 2));
console.log("Done. Updated P1, P2, and tone.");
