export interface TextCard {
  id: string;
  text: string;
  promptHint?: string;
}

export interface DeckState {
  remaining: TextCard[];
  discard: TextCard[];
}

export interface PendingCard {
  cardId: string;
  cardText: string;
  target?: string;
  intent?: string;
}

export interface PlayerSlot {
  index: number;
  name: string;
  character?: string;
  code?: string;
  hand?: TextCard[];
  pendingCard?: PendingCard;
  archetype?: string;
}

export interface PlayerMoveV2 {
  playerId: number;
  cardPlayed: string;
  cardId: string;
  target?: string;
  intent?: string;
  promptHint?: string;
}

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
}

export interface DialogueLine {
  speaker: string;
  line: string;
  emotion: string;
}

export interface Consequence {
  type: "immediate" | "delayed";
  domain:
    | "health"
    | "time"
    | "reputation"
    | "supplies"
    | "relationships"
    | "narrative";
  summary: string;
  details?: string;
}

export interface ActiveConsequence extends Consequence {
  created_turn: number;
  expiry_turn: number;
  source_event?: string;
}

export interface MemoryPatch {
  canon_additions?: string[];
  canon_updates?: string[];
  beat_progress?: string[];
  timeline_notes?: string[];
  thread_updates?: {
    id: string;
    status: "opened" | "resolved";
    description?: string;
  }[];
  beats_completed?: string[];
  beat_activated?: string;
}

export interface CharacterRecord {
  name: string;
  role?: string;
  personality?: string;
  speaking_style?: string;
  emotional_baseline?: string;
  current_state?: string;
  relationships?: Record<string, string>;
  voice_id?: string;
  portrait?: string;
  archetype?: string;
  agenda?: string;
}

export interface OpenThread {
  id: string;
  description: string;
  urgency: "low" | "medium" | "high";
}

export interface StoryBeat {
  id: string;
  description: string;
  act: 1 | 2 | 3;
  priority: "required" | "optional" | "bonus";
  status: "upcoming" | "active" | "completed" | "skipped";
  trigger?: string;
}

export interface KnowledgeGraphEntity {
  id: string;
  name: string;
  type: "character" | "location" | "item" | "faction" | "event";
  attributes: Record<string, string>;
}

export interface KnowledgeGraphEdge {
  from: string;
  to: string;
  type: string;
  description?: string;
  since_turn?: number;
}

export interface KnowledgeGraph {
  entities: KnowledgeGraphEntity[];
  edges: KnowledgeGraphEdge[];
  last_updated_turn: number;
}

export interface ScenarioLocation {
  name: string;
  description: string;
  connected_to?: string[];
  npcs_present?: string[];
}

export interface ScenarioNPC {
  name: string;
  role: string;
  portrait: string;
  personality: string;
  speaking_style: string;
  secret?: string;
  agenda?: string;
  relationships?: Record<string, string>;
}

export interface ScenarioFaction {
  name: string;
  description: string;
  agenda: string;
  members?: string[];
}

export interface ScenarioRelationship {
  from: string;
  to: string;
  type: string;
  description: string;
}

export interface WritingStyleConfig {
  tone: string;
  instructions: string;
  banned_phrases?: string[];
  max_sentence_length?: number;
}

export interface TargetAudience {
  age_range: string;
  genre: string;
  tone: string;
  themes: string[];
  ideal_setting?: string;
  content_warnings?: string[];
  vibe?: string;
}

export interface EvaluationCriteria {
  primary_goal: string;
  tone_requirement: string;
  realism_requirement?: string;
  character_expectation: string;
  audio_priority: string;
  success_question: string;
  strict_genre_enforcement?: boolean;
}

export interface ScenarioTemplate {
  id: string;
  name: string;
  description: string;
  world: string;
  locations: ScenarioLocation[];
  npcs: ScenarioNPC[];
  factions: ScenarioFaction[];
  opening_situation: string;
  story_arc: StoryBeat[];
  writing_style: WritingStyleConfig;
  few_shot_example?: string;
  target_game_length?: number;
  relationship_map?: ScenarioRelationship[];
  target_audience?: TargetAudience;
  evaluation_criteria?: EvaluationCriteria;
}

export type GameMode = "short" | "long" | "infinite";

export interface GMResponse {
  turn: number;
  scene_title: string;
  narration: string;
  dialogue?: DialogueLine[];
  consequences: Consequence[];
  next_prompt: string;
  memory_patch: MemoryPatch;
  character_updates: CharacterRecord[];
  open_threads: OpenThread[];
  continuity_notes?: string[];
  previous_response_id?: string;
  location_change?: string;
  game_complete?: boolean;
  game_ending?: string;
}

export interface MemoryBundle {
  canon: string[];
  beats: string[];
  open_threads: OpenThread[];
  characters: Record<string, CharacterRecord>;
  last_continuity_notes?: string[];
  story_beats?: StoryBeat[];
  story_summary?: string;
  active_consequences?: ActiveConsequence[];
  current_location?: string;
  known_locations?: string[];
  knowledge_graph?: KnowledgeGraph;
}

export interface GameState {
  id: string;
  name: string;
  players: PlayerSlot[];
  playerCount: number;
  createdAt: string;
  updatedAt: string;
  turnCounter: number;
  previous_response_id: string | null;
  rulesText: string;
  deck?: DeckState;
  memoryBundle: MemoryBundle;
  history?: GMResponse[];
  lastPlayerMoves?: PlayerMoveV2[];
  scene_title?: string;
  game_mode?: GameMode;
  scenario_id?: string;
  prompt_set_code?: string;
  replayRequested?: boolean;
  input_mode?: "phone" | "plate";
  plate_id?: string;
  game_complete?: boolean;
}

export interface PromptOverrides {
  gmContract?: string;
  cardInterpretation?: string;
  writingStyle?: string;
  dialogueRules?: string;
  storyProgression?: string;
  narrationStructure?: string;
  outputSchema?: string;
  introTemplate?: string;
  introAudioRules?: string;
  systemInstructions?: string;
  turnStyle?: string;
}
