import type { GMResponse } from "./types";

interface FallbackOpts {
  playerNames: string[];
  sceneTitle?: string;
  turnNumber: number;
}

const TEMPLATES = [
  (names: string[], scene?: string) => {
    const nameList = names.join(" and ");
    const scenePart = scene ? ` The echoes of "${scene}" still linger.` : "";
    return `${nameList} exchange a glance, an unspoken understanding passing between them.${scenePart} The air is thick with possibility. Something stirs in the distance, but for now, the heroes gather their thoughts and steel themselves for what lies ahead.`;
  },
  (names: string[], scene?: string) => {
    const first = names[0] ?? "The party";
    const scenePart = scene ? ` after the events of "${scene}"` : "";
    return `A brief calm settles over the group${scenePart}. ${first} takes a steadying breath while the others scan their surroundings. The path forward is uncertain, but the resolve among them is clear. Whatever comes next, they'll face it together.`;
  },
  (names: string[], scene?: string) => {
    const nameList = names.join(", ");
    const scenePart = scene ? ` The memory of "${scene}" hangs in the air.` : "";
    return `Time seems to slow for a moment as ${nameList} take stock of the situation.${scenePart} Shadows shift at the edge of perception, and the world holds its breath. A new chapter is about to unfold.`;
  },
  (names: string[], scene?: string) => {
    const last = names[names.length - 1] ?? "someone";
    const scenePart = scene ? `, still processing "${scene}"` : "";
    return `The dust settles${scenePart}. ${last} notices something glinting in the periphery — a sign, perhaps, or a trick of the light. The group regroups, their shared determination unbroken. The adventure continues.`;
  },
];

export function generateFallbackNarration(opts: FallbackOpts): GMResponse {
  const { playerNames, sceneTitle, turnNumber } = opts;
  const template = TEMPLATES[turnNumber % TEMPLATES.length];
  const narration = template(playerNames, sceneTitle);

  return {
    turn: turnNumber,
    scene_title: "A Moment of Pause",
    narration,
    dialogue: [],
    consequences: [],
    next_prompt: "What do you do next?",
    memory_patch: {},
    character_updates: [],
    open_threads: [],
  };
}
