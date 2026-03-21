import fs from "fs";

const data = JSON.parse(fs.readFileSync("prompt-sets.json", "utf-8"));
let si = data.baby.systemInstructions;

// Make the intro word count LOUDER and clearer
si = si.replace(
  "=== WORD LIMITS ===\nIntro (Turn 0): 200-300 words. 5 paragraphs.\nEach turn: 150-250 words. Use the space to tell a good story.",
  "=== WORD LIMITS ===\nIntro (Turn 0): MUST be 250-300 words. 5 full paragraphs. Each paragraph should be 3-5 sentences. Do NOT write a short intro.\nEach turn (Turn 1+): 150-250 words."
);

// Move the learned rules AFTER a clear separator so they don't bleed into intro
// The learned rules are about turns, not the intro
data.baby.writingStyle = "LEARNED RULES FOR TURNS (Turn 1+ only — do NOT apply these to the intro):\n" + 
  data.baby.writingStyle.replace("LEARNED RULES (from training — follow these):\n", "");

data.baby.systemInstructions = si;
fs.writeFileSync("prompt-sets.json", JSON.stringify(data, null, 2));
console.log("Fixed word count emphasis and learned rules scoping");
