import fs from "fs";
import path from "path";
import type {
  MemoryBundle,
  PlayerMoveV2,
  PlayerSlot,
  StoryBeat,
  ElevenLabsVoice,
  GMResponse,
  ActiveConsequence,
  KnowledgeGraph,
  ScenarioTemplate,
  GameMode,
  PromptOverrides,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Prompt Set Loading
// ---------------------------------------------------------------------------

export function loadOverrides(setCode?: string): PromptOverrides {
  try {
    if (!setCode || setCode === "default") {
      const filePath = path.join(process.cwd(), "custom-prompts.json");
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as PromptOverrides;
    }

    // Normalize set code aliases
    let normalizedCode = setCode;
    if (normalizedCode === "baby-ai") normalizedCode = "baby";

    const filePath = path.join(process.cwd(), "prompt-sets.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as Record<string, PromptOverrides>;
    const result = data[normalizedCode] ?? {};

    if (!result.systemInstructions) {
      console.warn(`[prompt] WARNING: Set "${setCode}" (normalized: "${normalizedCode}") has no systemInstructions — will fall back to generic GM contract`);
    }

    return result;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Built-in GM Contract
// ---------------------------------------------------------------------------

const GM_CONTRACT = `You are the AI Game Master for Things That Do Not Die — a collaborative storytelling card game. Follow these rules absolutely:

ROLE:
- You are a fair referee and a great storyteller.
- Respect player card choices — interpret them creatively and literally in context.
- No numbers, no dice, no stats — everything is told through story.
- Never contradict established story facts.
- Never break the fourth wall.

CARD INTERPRETATION:
- Each player plays ONE text card per turn.
- Interpret each card creatively and literally within the current scene context.
- The card IS the player's action — it defines what they attempt.
- NEVER ignore a player's card. Every card must visibly affect the story.
- If a card seems absurd, lean into the chaos — make it work narratively.
- Cards from different players can interact, conflict, or combine in unexpected ways.

NPC MANAGEMENT:
- New named NPCs get a brief one-line introduction on first appearance.
- Maximum 1 new named NPC per turn.
- Reuse existing NPCs from the character registry before creating new ones.
- Give recurring NPCs consistent voice and mannerisms.

WRITING STYLE:
- Tell the story like a friend recounting something crazy that happened.
- Short sentences. Simple words. Write for the EAR, not the page.
- Every sentence must contain action or new information — no filler.
- BANNED PHRASES: "echoes through", "looming", "palpable tension", "sends shivers", "the weight of", "a sense of", "can't help but", "little did they know", "unbeknownst to", "it was as if", "time seemed to", "the air was thick with"
- Maximum 4 paragraphs per turn.
- No recap of previous turns — always move forward.

WORD COUNT TARGETS:
- Regular turns: 200–300 words
- Intro (turn 0): 250–300 words
- Climax turns: 250–300 words

DIALOGUE RULES:
- Use double quotes for all spoken dialogue.
- Always name the speaker before the quote.
- Keep dialogue lines short — max 2 sentences per line.
- Dialogue should reveal character or advance the plot, never just fill space.

STORY PROGRESSION:
- Every turn must move the story forward. Something must change.
- Never spend 2+ consecutive turns on the same problem or location without progress.
- Vary scene types: action, dialogue, discovery, tension, humor, quiet moments.
- ANTI-LOOPING RULE: If the same crisis has persisted for 3+ turns, resolve it decisively this turn and introduce something new.

NARRATION STRUCTURE (every turn):
1. THE ACTION — Show each player's card happening in the scene. Make each card matter.
2. THE FALLOUT — What happened because of their actions? Show consequences.
3. THE TWIST — Something new and unexpected happens. Raise the stakes or shift direction.
4. THE CLIFFHANGER — End on something urgent and specific. Never end with "What do you do?" — give them something concrete to react to.`;

// ---------------------------------------------------------------------------
// Built-in Output Schema
// ---------------------------------------------------------------------------

const OUTPUT_SCHEMA = `OUTPUT FORMAT — Respond with valid JSON only, no markdown fences:
{
  "turn": <number>,
  "scene_title": "<short evocative title>",
  "narration": "<the full narration text>",
  "dialogue": [{"speaker": "<name>", "line": "<what they say>", "emotion": "<emotion>"}],
  "consequences": [{"type": "immediate|delayed", "domain": "health|time|reputation|supplies|relationships|narrative", "summary": "<what happened>"}],
  "next_prompt": "<internal note for next turn continuity>",
  "memory_patch": {
    "canon_additions": ["<new established facts>"],
    "canon_updates": ["<updated facts>"],
    "beat_progress": ["<story beat progress notes>"],
    "thread_updates": [{"id": "<thread_id>", "status": "opened|resolved", "description": "<details>"}],
    "beats_completed": ["<beat_ids>"],
    "beat_activated": "<next_beat_id or null>"
  },
  "character_updates": [{"name": "<name>", "role": "<role>", "personality": "<personality>", "speaking_style": "<style>", "emotional_baseline": "<baseline>", "current_state": "<state>", "relationships": {"<name>": "<relationship>"}}],
  "open_threads": [{"id": "<id>", "description": "<description>", "urgency": "low|medium|high"}],
  "continuity_notes": ["<notes for future turns>"],
  "location_change": "<new location or null>",
  "game_complete": false,
  "game_ending": "<ending narration if game_complete, else null>"
}`;

// ---------------------------------------------------------------------------
// Memory Block Formatting
// ---------------------------------------------------------------------------

export function formatMemoryBlock(bundle: MemoryBundle): string {
  const sections: string[] = [];

  if (bundle.canon.length) {
    sections.push(
      "## Canon Facts\n" + bundle.canon.map((f) => `- ${f}`).join("\n")
    );
  }

  const charEntries = Object.entries(bundle.characters ?? {});
  if (charEntries.length) {
    const charLines = charEntries.map(([name, c]) => {
      const parts = [`**${name}**`];
      if (c.role) parts.push(`Role: ${c.role}`);
      if (c.personality) parts.push(`Personality: ${c.personality}`);
      if (c.speaking_style) parts.push(`Voice: ${c.speaking_style}`);
      if (c.portrait) parts.push(`Portrait: ${c.portrait}`);
      if (c.current_state) parts.push(`State: ${c.current_state}`);
      if (c.relationships) {
        const rels = Object.entries(c.relationships)
          .map(([k, v]) => `${k}: ${v}`)
          .join("; ");
        parts.push(`Relationships: ${rels}`);
      }
      return parts.join(" | ");
    });
    sections.push("## Character Registry\n" + charLines.join("\n"));
  }

  if (bundle.open_threads.length) {
    const threadLines = bundle.open_threads.map(
      (t) => `- [${t.urgency.toUpperCase()}] ${t.description} (${t.id})`
    );
    sections.push("## Open Threads\n" + threadLines.join("\n"));
  }

  if (bundle.story_beats?.length) {
    const beatLines = bundle.story_beats.map((b) => {
      const marker = b.status === "active" ? ">>> " : "    ";
      return `${marker}[${b.status.toUpperCase()}] ${b.description} (act ${b.act}, ${b.priority})`;
    });
    sections.push("## Story Beats\n" + beatLines.join("\n"));
  }

  if (bundle.active_consequences?.length) {
    const consLines = bundle.active_consequences.map(
      (ac) =>
        `- [${ac.domain}] ${ac.summary} (turns remaining: ${ac.expiry_turn - ac.created_turn})`
    );
    sections.push("## Active Consequences\n" + consLines.join("\n"));
  }

  if (bundle.current_location) {
    sections.push(`## Current Location\n${bundle.current_location}`);
  }

  if (bundle.known_locations?.length) {
    sections.push(
      "## Known Locations\n" +
        bundle.known_locations.map((l) => `- ${l}`).join("\n")
    );
  }

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// History Block Formatting
// ---------------------------------------------------------------------------

export function formatHistoryBlock(
  history: GMResponse[],
  maxTurns: number = 8
): string {
  if (!history?.length) return "";

  const recent = history.slice(-maxTurns);
  const blocks = recent.map((h) => {
    const cardLines =
      h.dialogue
        ?.map((d) => `${d.speaker}: "${d.line}"`)
        .join(", ") || "none";

    return [
      `--- Turn ${h.turn}: ${h.scene_title} ---`,
      `Cards: ${cardLines}`,
      `Narration: ${h.narration}`,
    ].join("\n");
  });

  return blocks.join("\n\n");
}

// ---------------------------------------------------------------------------
// Pacing Helpers
// ---------------------------------------------------------------------------

export function getPacingPhase(
  turnNumber: number,
  gameMode?: GameMode,
  targetLength?: number
): "setup" | "rising_action" | "approaching_climax" | "climax" {
  const target = targetLength ?? getDefaultTargetLength(gameMode);

  if (target <= 0) return "rising_action"; // infinite mode

  const progress = turnNumber / target;
  if (progress < 0.25) return "setup";
  if (progress < 0.6) return "rising_action";
  if (progress < 0.85) return "approaching_climax";
  return "climax";
}

function getDefaultTargetLength(gameMode?: GameMode): number {
  switch (gameMode) {
    case "short":
      return 8;
    case "long":
      return 20;
    case "infinite":
      return 0;
    default:
      return 12;
  }
}

export function formatPacingBlock(opts: {
  turnNumber: number;
  gameMode?: GameMode;
  storyBeats?: StoryBeat[];
  openThreads?: { id: string; description: string; urgency: string }[];
  storySummary?: string;
  targetLength?: number;
}): string {
  const {
    turnNumber,
    gameMode,
    storyBeats,
    openThreads,
    storySummary,
    targetLength,
  } = opts;

  const target = targetLength ?? getDefaultTargetLength(gameMode);
  const phase = getPacingPhase(turnNumber, gameMode, target);
  const sections: string[] = [];

  sections.push(`## Pacing Guidance — Turn ${turnNumber}`);
  sections.push(`Current phase: **${phase.replace(/_/g, " ").toUpperCase()}**`);

  if (gameMode === "infinite") {
    sections.push(
      "Mode: INFINITE — no fixed endpoint. Cycle through arcs naturally. " +
        "Resolve threads and introduce new ones organically. " +
        "Each arc should feel complete before starting the next."
    );
  } else {
    sections.push(
      `Target game length: ${target} turns. Current turn: ${turnNumber}.`
    );
  }

  const activeBeat = storyBeats?.find((b) => b.status === "active");
  if (activeBeat) {
    sections.push(
      `Active story beat: "${activeBeat.description}" (act ${activeBeat.act}, ${activeBeat.priority}). ` +
        "Drive the story toward this beat."
    );
  }

  if (openThreads?.length) {
    const threadList = openThreads
      .map((t) => `"${t.description}" [${t.urgency}]`)
      .join(", ");
    sections.push(`Unresolved threads: ${threadList}`);
  }

  // Escalation rules per phase
  switch (phase) {
    case "setup":
      sections.push(
        "ESCALATION: Setup phase. Cards create RIPPLES — small consequences that plant seeds. " +
          "Introduce characters, establish the world, hint at threats. " +
          "Every action should have a minor but noticeable impact."
      );
      break;
    case "rising_action":
      sections.push(
        "ESCALATION: Rising action. Cards create WAVES — medium consequences that build on setup. " +
          "Complications multiply. Alliances form or break. " +
          "Previously planted seeds should start bearing fruit."
      );
      break;
    case "approaching_climax":
      sections.push(
        "ESCALATION: Approaching climax. Cards create STORMS — major consequences with lasting impact. " +
          "Threads converge. Tension peaks. Start resolving secondary threads. " +
          "Every action should feel high-stakes and consequential."
      );
      break;
    case "climax":
      sections.push(
        "ESCALATION: Climax phase. Cards create STORMS — maximum consequences. " +
          "This is the final stretch. Resolve the main conflict. " +
          "All remaining threads should converge toward resolution."
      );
      break;
  }

  if (target > 0 && turnNumber >= target) {
    sections.push(
      "⚠ PAST TARGET LENGTH — Wrap up NOW. " +
        "Resolve the main conflict THIS turn. Tie off remaining threads. " +
        "If the story can end satisfyingly, set game_complete to true. " +
        "Do NOT introduce new complications or NPCs. Drive to a conclusion."
    );
  } else if (target > 0 && turnNumber >= target - 2) {
    sections.push(
      "APPROACHING END — Begin wrapping up. Converge threads toward a final confrontation or resolution. " +
        "No new major plot threads. Start delivering payoffs."
    );
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// System Instructions Builder
// ---------------------------------------------------------------------------

export function buildSystemInstructions(opts: {
  players: PlayerSlot[];
  scenario?: ScenarioTemplate;
  memoryBundle: MemoryBundle;
  voices?: ElevenLabsVoice[];
  history?: GMResponse[];
  turnNumber: number;
  gameMode?: GameMode;
  promptSetCode?: string;
}): string {
  const {
    players,
    scenario,
    memoryBundle,
    voices,
    history,
    turnNumber,
    gameMode,
    promptSetCode,
  } = opts;

  const overrides = loadOverrides(promptSetCode);

  // ─── Custom prompt set path (Baby AI, Adventure, etc.) ───
  // When a prompt set provides its own systemInstructions, it already
  // contains ALL the rules the AI needs. Pass ONLY the AI's own
  // instructions + learned rules. No generic app-level additions.
  if (overrides.systemInstructions) {
    const blocks: string[] = [];

    if (overrides.writingStyle) {
      blocks.push(overrides.writingStyle);
    }

    blocks.push(overrides.systemInstructions);

    // Only include scenario data if the scenario has real content
    // (not the minimal simple-adventure placeholder)
    if (scenario && scenario.npcs.length > 0) {
      blocks.push(formatScenarioBlock(scenario));
    }

    return blocks.join("\n\n");
  }

  // ─── Default prompt set path (generic GM) ───
  // Build from the built-in GM contract + all the supporting blocks.
  const blocks: string[] = [];

  let contract = GM_CONTRACT;
  if (overrides.gmContract) contract = overrides.gmContract;
  if (overrides.cardInterpretation) {
    contract += `\n\nCARD INTERPRETATION OVERRIDE:\n${overrides.cardInterpretation}`;
  }
  if (overrides.dialogueRules) {
    contract += `\n\nDIALOGUE OVERRIDE:\n${overrides.dialogueRules}`;
  }
  if (overrides.storyProgression) {
    contract += `\n\nSTORY PROGRESSION OVERRIDE:\n${overrides.storyProgression}`;
  }
  if (overrides.narrationStructure) {
    contract += `\n\nNARRATION STRUCTURE OVERRIDE:\n${overrides.narrationStructure}`;
  }
  blocks.push(contract);

  blocks.push(overrides.outputSchema ?? OUTPUT_SCHEMA);

  const playerLines = players
    .filter((p) => p.name)
    .map((p) => {
      const parts = [`- ${p.name}`];
      if (p.archetype) parts.push(`(${p.archetype})`);
      if (p.character) parts.push(`playing as "${p.character}"`);
      return parts.join(" ");
    });
  if (playerLines.length) {
    blocks.push("## Players\n" + playerLines.join("\n"));
  }

  const memBlock = formatMemoryBlock(memoryBundle);
  if (memBlock) {
    blocks.push("## World Memory\n" + memBlock);
  }

  if (history?.length) {
    const histBlock = formatHistoryBlock(history, 8);
    if (histBlock) {
      blocks.push("## Recent History\n" + histBlock);
    }
  }

  if (memoryBundle.story_summary) {
    blocks.push("## Story So Far\n" + memoryBundle.story_summary);
  }

  if (scenario) {
    blocks.push(formatScenarioBlock(scenario));
  }

  const targetLength =
    scenario?.target_game_length ?? getDefaultTargetLength(gameMode);
  blocks.push(
    formatPacingBlock({
      turnNumber,
      gameMode,
      storyBeats: memoryBundle.story_beats,
      openThreads: memoryBundle.open_threads,
      storySummary: memoryBundle.story_summary,
      targetLength,
    })
  );

  if (overrides.writingStyle) {
    blocks.push("## Writing Style\n" + overrides.writingStyle);
  }

  if (voices?.length) {
    const voiceLines = voices.map((v) => `- ${v.name} (${v.voice_id})`);
    blocks.push(
      "## Available Voices\n" +
        voiceLines.join("\n") +
        "\nAssign voice_id to characters when introducing them."
    );
  }

  return blocks.join("\n\n");
}

// ---------------------------------------------------------------------------
// Scenario Block Formatting
// ---------------------------------------------------------------------------

function formatScenarioBlock(scenario: ScenarioTemplate): string {
  const sections: string[] = [];
  sections.push(`## Scenario: ${scenario.name}`);
  sections.push(`World: ${scenario.world}`);

  if (scenario.npcs.length) {
    const npcLines = scenario.npcs.map((npc) => {
      const parts = [`**${npc.name}** — ${npc.role}`];
      parts.push(`Personality: ${npc.personality}`);
      parts.push(`Voice: ${npc.speaking_style}`);
      if (npc.portrait) parts.push(`Portrait: ${npc.portrait}`);
      if (npc.secret) parts.push(`Secret: ${npc.secret}`);
      if (npc.agenda) parts.push(`Agenda: ${npc.agenda}`);
      if (npc.relationships) {
        const rels = Object.entries(npc.relationships)
          .map(([k, v]) => `${k}: ${v}`)
          .join("; ");
        parts.push(`Relationships: ${rels}`);
      }
      return parts.join("\n  ");
    });
    sections.push("### NPCs\n" + npcLines.join("\n\n"));
  }

  if (scenario.factions.length) {
    const factionLines = scenario.factions.map(
      (f) =>
        `**${f.name}**: ${f.description}\n  Agenda: ${f.agenda}` +
        (f.members?.length ? `\n  Members: ${f.members.join(", ")}` : "")
    );
    sections.push("### Factions\n" + factionLines.join("\n\n"));
  }

  if (scenario.relationship_map?.length) {
    const relLines = scenario.relationship_map.map(
      (r) => `- ${r.from} → ${r.to}: ${r.type} — ${r.description}`
    );
    sections.push("### Relationship Map\n" + relLines.join("\n"));
  }

  sections.push(`### Opening Situation\n${scenario.opening_situation}`);

  if (scenario.writing_style) {
    const styleParts = [`### Scenario Writing Style`];
    if (scenario.writing_style.tone) styleParts.push(`Tone: ${scenario.writing_style.tone}`);
    if (scenario.writing_style.instructions) styleParts.push(scenario.writing_style.instructions);
    if (scenario.writing_style.banned_phrases?.length) {
      styleParts.push(`Additional banned phrases: ${scenario.writing_style.banned_phrases.join(", ")}`);
    }
    if (styleParts.length > 1) {
      sections.push(styleParts.join("\n"));
    }
  }

  if (scenario.few_shot_example) {
    sections.push(
      "### Example Narration\n" + scenario.few_shot_example
    );
  }

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Turn Input Builder
// ---------------------------------------------------------------------------

export function buildTurnInput(opts: {
  players: PlayerSlot[];
  moves: PlayerMoveV2[];
  turnNumber: number;
  previousNarration?: string;
  promptSetCode?: string;
}): string {
  const { players, moves, turnNumber, previousNarration, promptSetCode } = opts;
  const overrides = loadOverrides(promptSetCode);

  if (turnNumber === 0) {
    return buildIntroInput(players, overrides);
  }

  const sections: string[] = [];

  if (previousNarration) {
    const trimmed =
      previousNarration.length > 600
        ? previousNarration.slice(0, 600) + "…"
        : previousNarration;
    sections.push(`PREVIOUS (continue — no recap):\n${trimmed}`);
  }

  sections.push(`## Turn ${turnNumber}`);

  // Turn 1 with no moves = first round after intro (auto-generated)
  if (turnNumber === 1 && moves.length === 0) {
    sections.push(
      "No player cards this turn. The players have left the starting location and are now ON THE JOURNEY toward the objective. " +
      "Skip any setup or preparation at the starting location — that is boring. " +
      "Show them already traveling. Then drop them into a REAL obstacle on the road — " +
      "something physical and exciting like: a person blocking their path, a wall they need to climb, " +
      "a broken bridge, a hostile stranger, a locked gate with a guard. " +
      "The obstacle must be FUN and require a creative action to solve. " +
      "End the round with the players STUCK facing this obstacle."
    );
    if (overrides.turnStyle) {
      sections.push(overrides.turnStyle);
    }
    return sections.join("\n\n");
  }

  // Core direction — same energy as Turn 1
  sections.push(
    "The players use their cards to deal with the current obstacle. " +
    "Show the cards WORKING — each card must visibly change the situation. " +
    "Once the obstacle resolves, the players MOVE to a new location. " +
    "Show the journey briefly. Then drop them into a NEW, DIFFERENT obstacle — " +
    "something physical and exciting: a chase, a collapse, a confrontation, a trap, a locked path, a hostile stranger. " +
    "The new obstacle must be FUN and require a creative action to solve. " +
    "End the round with the players STUCK facing this new obstacle."
  );

  sections.push("### Player Cards This Round:");
  for (const move of moves) {
    const player = players.find((p) => p.index === move.playerId);
    const name = player?.name ?? `Player ${move.playerId}`;
    let line = `${name} plays: "${move.cardPlayed}"`;
    if (move.target) line += ` (targeting: ${move.target})`;
    if (move.intent) line += ` [intent: ${move.intent}]`;
    sections.push(line);
  }

  if (overrides.turnStyle) {
    sections.push(overrides.turnStyle);
  }

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Intro Input Builder
// ---------------------------------------------------------------------------

function buildIntroInput(
  players: PlayerSlot[],
  overrides: PromptOverrides
): string {
  const sections: string[] = [];
  const playerNames = players.filter((p) => p.name).map((p) => p.name);
  const nameList = playerNames.join(", ");

  // If the prompt set has systemInstructions (Baby AI / adventure), keep the
  // intro input minimal — the system prompt already contains the 5-paragraph
  // format and all intro rules. Don't add conflicting generic instructions.
  if (overrides.systemInstructions) {
    sections.push(
      `Turn 0 — OPENING. No player moves yet.\nPlayers: ${nameList}.`
    );

    const archetypeLines = players
      .filter((p) => p.archetype)
      .map((p) => `- ${p.name} has chosen the ${p.archetype} archetype.`);
    if (archetypeLines.length) {
      sections.push(archetypeLines.join("\n"));
    }

    // Don't append introAudioRules — the system instructions already
    // contain the full intro format (5 paragraphs, etc.)

    return sections.join("\n\n");
  }

  // Default prompt set — provide full intro instructions
  sections.push("## Turn 0 — Introduction");

  if (overrides.introTemplate) {
    sections.push(overrides.introTemplate);
  }

  const namedPlayers = players.filter((p) => p.name);
  if (namedPlayers.length) {
    const lines = namedPlayers.map((p) => {
      const parts = [p.name];
      if (p.archetype) parts.push(`the ${p.archetype}`);
      if (p.character) parts.push(`(playing as ${p.character})`);
      return parts.join(" ");
    });
    sections.push(
      `The player characters are: ${lines.join(", ")}.\n` +
      "Introduce them into the world with physical descriptions and personality hints."
    );
  }

  sections.push(
    "This is the OPENING of a new game. No player moves have been made yet.\n" +
    "Create a MEMORABLE opening scene. Establish the setting, introduce the players naturally, " +
    "include ONE NPC with a line of dialogue, and end on a compelling hook.\n" +
    "The hook MUST answer: Who is the enemy? What is the objective? What happens if they fail?"
  );

  if (overrides.introAudioRules) {
    sections.push("## Audio Rules for Intro\n" + overrides.introAudioRules);
  }

  return sections.join("\n\n");
}
