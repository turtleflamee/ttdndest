import fs from "fs";
import path from "path";
import OpenAI from "openai";

const PROMPT_SETS_FILE = path.join(process.cwd(), "prompt-sets.json");
const BABY_SET = "baby";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
function getEvalModel() {
  return process.env.BABY_AI_EVAL_MODEL || "gpt-4o-mini";
}

const EVALUATOR_SYSTEM = `You evaluate RPG narration for an audio card game. The narration is READ ALOUD — the listener hears it ONCE and cannot reread. Score each category independently using the FULL range (5=serious problems, 7=good, 8=great, 9=excellent).

=== INTRODUCTION CATEGORIES (score_intro) ===

1. MISSION CLARITY (weight: high)
Does the intro clearly state: (a) where the players are, (b) what the main danger is, (c) what they must do, (d) what happens if they fail?
HARD PENALTY: If enemy or stakes are missing/vague, cap at 5.

2. INFORMATION DELIVERY (weight: high)
Is important info delivered through NPC dialogue, visible events, or discoveries — NOT narrator exposition?
Penalize lines like "The objective is clear", "This village is important because...", "They must act to save..."
Good: An NPC says "The dam is breaking — if we don't fix it by dawn, the valley floods."
Bad: "Their mission was clear: they needed to save the village."

3. INTRO BREVITY (weight: medium)
Is the intro short and focused? Only info needed to begin the mission.
Penalize: decorative weather/smell descriptions, world-building that doesn't matter yet, long environmental passages.

4. STRUCTURE (weight: medium)
Does it follow: P1=setting, P2=why it matters, P3=characters, P4=NPC scene, P5=hook?
5 paragraphs required. Penalize missing paragraphs.

=== ROUND CATEGORIES (scores_rounds — score EACH round) ===

5. ONE OBSTACLE FOCUS (weight: high)
Does the ENTIRE round revolve around ONE primary obstacle? Do ALL actions in the round directly relate to solving or confronting that single obstacle?
HARD PENALTY: If a second unrelated problem is introduced mid-round, cap at 5.
Penalize: rounds that feel like a sequence of unrelated tasks, unclear threats, vague situations.
The round must end when: the obstacle is solved, the obstacle worsens, or the obstacle reveals a new threat for the NEXT round.

6. TURN SEQUENCE (weight: high)
Does the round follow: problem appears → players act on THAT problem → situation changes → new problem/decision?
HARD PENALTY: If the problem is unchanged at the end, cap at 5.

7. FORWARD MOVEMENT (weight: high)
Does the story move forward through new locations, discoveries, enemy escalation, or environmental changes?
HARD PENALTY: Same location as previous turn → cap at 5.
Penalize: repeating the same situation, no progress toward mission.

8. PLAYER IMPACT (weight: high)
Do the players' card choices visibly change the situation?
Each card must have a clear, specific effect on the story.
Penalize: cards acknowledged but having no real consequence.

9. PACING & DANGER CYCLES (weight: medium)
Does tension go up AND down? Are there breathers between encounters?
HARD PENALTY: Nonstop combat with no relief → cap at 5.

10. LANGUAGE CLARITY (weight: medium)
Short sentences? Simple words? One action per sentence? Suitable for spoken narration?

=== OVERALL FEEL ===
The narration should feel like a Dungeon Master presenting a live encounter where players quickly understand: the situation, the threat, the objective, and their possible actions.

Score each category 1–10. Then provide:
A. Category scores with 1-2 sentence explanations
B. Overall score (average)
C. score_intro (1-10) and scores_rounds (array, one per round)
D. top_3_changes_intro and top_3_changes_rounds
E. One-sentence summary

Do NOT rewrite the story. Only evaluate.

At the very end, output:
PARSE: {"overall_score": <1-10>, "score_intro": <1-10>, "scores_rounds": [<r1>, <r2>, ...], "top_3_changes_intro": ["...", ...], "top_3_changes_rounds": ["...", ...], "summary": "..."}
Use empty arrays [] if no changes to suggest.`;

const REVIEW_BOT_SYSTEM = `You revise rules for an audio narration AI.

Focus on these priorities (in order):
1. INTRO: Info must come from NPC dialogue and visible events, NOT narrator exposition. Ban phrases like "The objective is clear" or "They must act to save..."
2. ROUNDS: Each round needs ONE clear obstacle that resolves. Players' cards must visibly change the situation.
3. MOVEMENT: Story must progress to new locations each round. No repeating the same scene.
4. PACING: Tension goes up and down. Breathers between encounters.
5. LANGUAGE: Short sentences, one action per sentence, simple words.

Drop vague rules like "Ensure clarity" or "Make it engaging." Every rule must describe a SPECIFIC, checkable behavior.

Output JSON only: {"intro_rules": [...], "round_rules": [...]}.
Max 12 intro rules, 20 round rules.`;

export interface EvaluatorResult {
  overall_score: number;
  score_intro: number;
  scores_rounds: number[];
  top_3_changes_intro: string[];
  top_3_changes_rounds: string[];
  summary: string;
  raw: string;
}

export interface TrainingResult {
  iteration: number;
  score: EvaluatorResult;
  rulesChanged: boolean;
  story: string;
  timestamp: string;
}

export function parseEvaluatorResponse(
  text: string,
  numRounds: number
): EvaluatorResult {
  const defaults: EvaluatorResult = {
    overall_score: 5,
    score_intro: 5,
    scores_rounds: Array(numRounds).fill(5),
    top_3_changes_intro: [],
    top_3_changes_rounds: [],
    summary: "Could not parse evaluator response.",
    raw: text,
  };

  try {
    const match = text.match(/PARSE:\s*(\{[\s\S]*?\})\s*$/);
    if (!match) return defaults;

    const parsed = JSON.parse(match[1]);
    return {
      overall_score: parsed.overall_score ?? defaults.overall_score,
      score_intro: parsed.score_intro ?? defaults.score_intro,
      scores_rounds: parsed.scores_rounds ?? defaults.scores_rounds,
      top_3_changes_intro:
        parsed.top_3_changes_intro ?? defaults.top_3_changes_intro,
      top_3_changes_rounds:
        parsed.top_3_changes_rounds ?? defaults.top_3_changes_rounds,
      summary: parsed.summary ?? defaults.summary,
      raw: text,
    };
  } catch {
    return defaults;
  }
}

export function loadBabyPromptSet(): Record<string, unknown> | null {
  try {
    const data = JSON.parse(fs.readFileSync(PROMPT_SETS_FILE, "utf-8"));
    return data[BABY_SET] ?? null;
  } catch {
    return null;
  }
}

export function saveBabyPromptSet(data: Record<string, unknown>): void {
  let all: Record<string, unknown> = {};
  try {
    all = JSON.parse(fs.readFileSync(PROMPT_SETS_FILE, "utf-8"));
  } catch {
    // file doesn't exist yet
  }
  all[BABY_SET] = data;
  fs.writeFileSync(PROMPT_SETS_FILE, JSON.stringify(all, null, 2));
}

export async function evaluate(
  storyText: string,
  numRounds: number
): Promise<EvaluatorResult> {
  const response = await getOpenAI().chat.completions.create({
    model: getEvalModel(),
    messages: [
      { role: "system", content: EVALUATOR_SYSTEM },
      { role: "user", content: storyText },
    ],
    temperature: 0.3,
  });

  const text = response.choices[0]?.message?.content ?? "";
  return parseEvaluatorResponse(text, numRounds);
}

export async function generateSampleStory(
  systemInstructions: string,
  turnStyle: string,
  introRules: string,
  numRounds: number = 3
): Promise<string> {
  const parts: string[] = [];

  const introResponse = await getOpenAI().chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "system",
        content: `${systemInstructions}\n\n${introRules}`,
      },
      {
        role: "user",
        content:
          "Turn 0 — OPENING. No player moves yet.\nPlayers: Kael, Lyra.",
      },
    ],
  });

  const introText = introResponse.choices[0]?.message?.content ?? "";
  parts.push(`=== INTRO ===\n${introText}`);

  const sampleCards = [
    [
      { player: "Kael", card: "I charge in headfirst" },
      { player: "Lyra", card: "I search for something useful" },
    ],
    [
      { player: "Kael", card: "I create a distraction" },
      { player: "Lyra", card: "I try to talk my way out" },
    ],
    [
      { player: "Kael", card: "I stand my ground" },
      { player: "Lyra", card: "I look for a hidden path" },
    ],
  ];

  for (let i = 0; i < numRounds; i++) {
    const cards = sampleCards[i % sampleCards.length];
    const turnResponse = await getOpenAI().chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `${systemInstructions}\n\nTURN STYLE CHECKLIST:\n${turnStyle}`,
        },
        {
          role: "user",
          content: `Turn ${i + 1}. Previous story so far:\n${parts.join("\n\n")}\n\nCards played this turn:\n- ${cards[0].player} plays "${cards[0].card}"\n- ${cards[1].player} plays "${cards[1].card}"\n\nNarrate this turn. Output valid JSON with the required keys.`,
        },
      ],
    });

    const turnText = turnResponse.choices[0]?.message?.content ?? "";
    parts.push(`=== TURN ${i + 1} ===\n${turnText}`);
  }

  return parts.join("\n\n");
}

export async function reviseRules(
  currentIntroRules: string[],
  currentRoundRules: string[],
  evaluatorResult: EvaluatorResult
): Promise<{ intro_rules: string[]; round_rules: string[] }> {
  const prompt = `Current intro rules:\n${currentIntroRules.map((r) => `- ${r}`).join("\n")}\n\nCurrent round rules:\n${currentRoundRules.map((r) => `- ${r}`).join("\n")}\n\nEvaluator feedback:\nOverall score: ${evaluatorResult.overall_score}/10\nIntro score: ${evaluatorResult.score_intro}/10\nRound scores: ${evaluatorResult.scores_rounds.join(", ")}\nSuggested intro changes: ${evaluatorResult.top_3_changes_intro.join("; ")}\nSuggested round changes: ${evaluatorResult.top_3_changes_rounds.join("; ")}\nSummary: ${evaluatorResult.summary}\n\nRevise the rules to improve the scores. Keep rules that are working. Fix or replace rules that aren't.`;

  const response = await getOpenAI().chat.completions.create({
    model: getEvalModel(),
    messages: [
      { role: "system", content: REVIEW_BOT_SYSTEM },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
  });

  const text = response.choices[0]?.message?.content ?? "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      intro_rules: (parsed.intro_rules ?? currentIntroRules).slice(0, 12),
      round_rules: (parsed.round_rules ?? currentRoundRules).slice(0, 20),
    };
  } catch {
    return {
      intro_rules: currentIntroRules,
      round_rules: currentRoundRules,
    };
  }
}

export async function runTrainingIteration(): Promise<TrainingResult> {
  const babySet = loadBabyPromptSet() as Record<string, string> | null;
  if (!babySet) throw new Error("Baby prompt set not found in prompt-sets.json");

  const systemInstructions = babySet.systemInstructions ?? "";
  const turnStyle = babySet.turnStyle ?? "";
  const introAudioRules = babySet.introAudioRules ?? "";
  const writingStyle = babySet.writingStyle ?? "";

  const introRulesList = introAudioRules
    .split("\n")
    .map((r: string) => r.replace(/^-\s*/, "").trim())
    .filter(Boolean);
  const roundRulesList = writingStyle
    .split("\n")
    .map((r: string) => r.replace(/^-\s*/, "").trim())
    .filter(Boolean);

  const history = loadTrainingHistory();
  const iteration = history.length + 1;

  const story = await generateSampleStory(
    systemInstructions,
    turnStyle,
    introAudioRules,
    3
  );

  const score = await evaluate(story, 3);

  let rulesChanged = false;

  if (score.overall_score < 9) {
    const revised = await reviseRules(introRulesList, roundRulesList, score);

    const newRoundRules = revised.round_rules.map((r) => `- ${r}`).join("\n");

    // Only revise round rules (writingStyle). NEVER overwrite introAudioRules —
    // the intro format is defined in systemInstructions and must not be
    // contradicted by training-generated rules.
    if (newRoundRules !== writingStyle) {
      babySet.writingStyle = newRoundRules;
      saveBabyPromptSet(babySet);
      rulesChanged = true;
    }
  }

  const result: TrainingResult = {
    iteration,
    score,
    rulesChanged,
    story,
    timestamp: new Date().toISOString(),
  };

  saveTrainingResult(result);

  return result;
}

const TRAINING_HISTORY_FILE = path.join(
  process.cwd(),
  "baby-ai-training-history.json"
);

export function loadTrainingHistory(): TrainingResult[] {
  try {
    return JSON.parse(fs.readFileSync(TRAINING_HISTORY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

export function saveTrainingResult(result: TrainingResult): void {
  const history = loadTrainingHistory();
  history.push(result);
  fs.writeFileSync(TRAINING_HISTORY_FILE, JSON.stringify(history, null, 2));
}
