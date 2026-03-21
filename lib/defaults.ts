import type { TextCard, DeckState, MemoryBundle } from "./types";

export const HAND_SIZE = 5;

// ---------------------------------------------------------------------------
// Card Decks
// ---------------------------------------------------------------------------

export const ADVENTURE_DECK: TextCard[] = [
  { id: "adv-1", text: "I charge in headfirst" },
  { id: "adv-2", text: "I sneak around the back" },
  { id: "adv-3", text: "I try to talk my way out" },
  { id: "adv-4", text: "I search for something useful" },
  { id: "adv-5", text: "I create a distraction" },
  { id: "adv-6", text: "I set a trap" },
  { id: "adv-7", text: "I call for help" },
  { id: "adv-8", text: "I run for it" },
  { id: "adv-9", text: "I stand my ground" },
  { id: "adv-10", text: "I try to bargain" },
  { id: "adv-11", text: "I look for a hidden path" },
  { id: "adv-12", text: "I investigate the area" },
  { id: "adv-13", text: "I try to intimidate them" },
  { id: "adv-14", text: "I offer to help" },
  { id: "adv-15", text: "I grab the nearest weapon" },
  { id: "adv-16", text: "I try to pick the lock" },
  { id: "adv-17", text: "I climb to higher ground" },
  { id: "adv-18", text: "I hide and wait" },
  { id: "adv-19", text: "I challenge them to a duel" },
  { id: "adv-20", text: "I use the environment to my advantage" },
  { id: "adv-21", text: "I try to calm everyone down" },
  { id: "adv-22", text: "I light a fire" },
  { id: "adv-23", text: "I follow the tracks" },
  { id: "adv-24", text: "I take the high road" },
  { id: "adv-25", text: "I take the low road" },
  { id: "adv-26", text: "I scout ahead" },
  { id: "adv-27", text: "I guard the rear" },
  { id: "adv-28", text: "I check for traps" },
  { id: "adv-29", text: "I read the room" },
  { id: "adv-30", text: "I make camp" },
  { id: "adv-31", text: "I tell a story" },
  { id: "adv-32", text: "I pray for guidance" },
  { id: "adv-33", text: "I do the unexpected" },
  { id: "adv-34", text: "I play dead" },
  { id: "adv-35", text: "I taunt the enemy" },
  { id: "adv-36", text: "I share what I know" },
  { id: "adv-37", text: "I keep a low profile" },
  { id: "adv-38", text: "I take a closer look" },
  { id: "adv-39", text: "I break something" },
  { id: "adv-40", text: "I fix something" },
  { id: "adv-41", text: "I make a deal" },
  { id: "adv-42", text: "I double back" },
  { id: "adv-43", text: "I split up from the group" },
  { id: "adv-44", text: "I rally the team" },
  { id: "adv-45", text: "I sacrifice something valuable" },
  { id: "adv-46", text: "I bluff my way through" },
  { id: "adv-47", text: "I steal something" },
  { id: "adv-48", text: "I give something away" },
  { id: "adv-49", text: "I follow my gut" },
  { id: "adv-50", text: "I wait for the perfect moment" },
];

export const PARTY_DECK: TextCard[] = [
  { id: "party-1", text: "Do the dumbest thing possible" },
  { id: "party-2", text: "I do a sexy dance" },
  { id: "party-3", text: "I start a fight for no reason" },
  { id: "party-4", text: "I eat something suspicious" },
  { id: "party-5", text: "I challenge them to a drinking contest" },
  { id: "party-6", text: "I tell an embarrassing story" },
  { id: "party-7", text: "I flirt with danger" },
  { id: "party-8", text: "I make a terrible pun" },
  { id: "party-9", text: "I blame someone else" },
  { id: "party-10", text: "I panic and scream" },
  { id: "party-11", text: "I pretend I'm someone important" },
  { id: "party-12", text: "I throw something random" },
  { id: "party-13", text: "I try to cook something" },
  { id: "party-14", text: "I dramatically reveal a secret" },
  { id: "party-15", text: "I take a selfie" },
  { id: "party-16", text: "I adopt the stray animal" },
  { id: "party-17", text: "I start singing" },
  { id: "party-18", text: "I give an inspiring speech" },
  { id: "party-19", text: "I make it weird" },
  { id: "party-20", text: "I bet everything on this" },
  { id: "party-21", text: "I pull a prank" },
  { id: "party-22", text: "I fake an injury" },
  { id: "party-23", text: "I start a rumor" },
  { id: "party-24", text: "I do exactly what they told me not to" },
  { id: "party-25", text: "I compliment the villain" },
  { id: "party-26", text: "I monologue about my backstory" },
  { id: "party-27", text: "I offer snacks" },
  { id: "party-28", text: "I ask for directions" },
  { id: "party-29", text: "I demand a rematch" },
  { id: "party-30", text: "I cry strategically" },
  { id: "party-31", text: "I flex dramatically" },
  { id: "party-32", text: "I whisper something suspicious" },
  { id: "party-33", text: "I volunteer as tribute" },
  { id: "party-34", text: "I nap through the danger" },
  { id: "party-35", text: "I try to befriend the monster" },
  { id: "party-36", text: "I invent a new game" },
  { id: "party-37", text: "I dramatically exit" },
  { id: "party-38", text: "I dramatically enter" },
  { id: "party-39", text: "I pick up something shiny" },
  { id: "party-40", text: "I forget something important" },
  { id: "party-41", text: "I tell the truth at the worst time" },
  { id: "party-42", text: "I lie at the worst time" },
  { id: "party-43", text: "I hug it out" },
  { id: "party-44", text: "I throw a party" },
  { id: "party-45", text: "I write a strongly worded letter" },
  { id: "party-46", text: "I plead the fifth" },
  { id: "party-47", text: "I challenge them to rock paper scissors" },
  { id: "party-48", text: "I overthink everything" },
  { id: "party-49", text: "I underthink everything" },
  { id: "party-50", text: "I trust the suspicious one" },
];

export const HORROR_DECK: TextCard[] = [
  { id: "horror-1", text: "I barricade the door" },
  { id: "horror-2", text: "I check if it's still breathing" },
  { id: "horror-3", text: "I run and don't look back" },
  { id: "horror-4", text: "I hide in the darkness" },
  { id: "horror-5", text: "I listen carefully" },
  { id: "horror-6", text: "I hold my breath" },
  { id: "horror-7", text: "I search for a weapon" },
  { id: "horror-8", text: "I check the body" },
  { id: "horror-9", text: "I signal the others" },
  { id: "horror-10", text: "I stay perfectly still" },
  { id: "horror-11", text: "I read the old document" },
  { id: "horror-12", text: "I open the forbidden door" },
  { id: "horror-13", text: "I go toward the noise" },
  { id: "horror-14", text: "I go away from the noise" },
  { id: "horror-15", text: "I light a match" },
  { id: "horror-16", text: "I break the glass" },
  { id: "horror-17", text: "I call out into the darkness" },
  { id: "horror-18", text: "I smash the mirror" },
  { id: "horror-19", text: "I take the stairs" },
  { id: "horror-20", text: "I check the basement" },
  { id: "horror-21", text: "I trust no one" },
  { id: "horror-22", text: "I look behind me" },
  { id: "horror-23", text: "I close my eyes" },
  { id: "horror-24", text: "I cover the wound" },
  { id: "horror-25", text: "I count the survivors" },
  { id: "horror-26", text: "I leave a trail" },
  { id: "horror-27", text: "I destroy the evidence" },
  { id: "horror-28", text: "I pray it works" },
  { id: "horror-29", text: "I make a run for the exit" },
  { id: "horror-30", text: "I crawl through the vent" },
  { id: "horror-31", text: "I share my last supply" },
  { id: "horror-32", text: "I use bait" },
  { id: "horror-33", text: "I set a perimeter" },
  { id: "horror-34", text: "I investigate the stain" },
  { id: "horror-35", text: "I board up the windows" },
  { id: "horror-36", text: "I check the radio" },
  { id: "horror-37", text: "I split the group" },
  { id: "horror-38", text: "I guard the entrance" },
  { id: "horror-39", text: "I search the pockets" },
  { id: "horror-40", text: "I improvise a torch" },
  { id: "horror-41", text: "I mark the wall" },
  { id: "horror-42", text: "I double-check the lock" },
  { id: "horror-43", text: "I sacrifice the flashlight" },
  { id: "horror-44", text: "I follow the blood trail" },
  { id: "horror-45", text: "I take the risky shortcut" },
  { id: "horror-46", text: "I bandage the wound" },
  { id: "horror-47", text: "I make a noise on purpose" },
  { id: "horror-48", text: "I play possum" },
  { id: "horror-49", text: "I scavenge for parts" },
  { id: "horror-50", text: "I seal the room" },
];

export const CYBERPUNK_DECK: TextCard[] = [
  { id: "cyber-1", text: "I hack the system" },
  { id: "cyber-2", text: "I jack into the network" },
  { id: "cyber-3", text: "I bribe the bouncer" },
  { id: "cyber-4", text: "I plant a tracker" },
  { id: "cyber-5", text: "I swap the data chip" },
  { id: "cyber-6", text: "I create a fake identity" },
  { id: "cyber-7", text: "I cause a power outage" },
  { id: "cyber-8", text: "I release the drone" },
  { id: "cyber-9", text: "I access the security feeds" },
  { id: "cyber-10", text: "I call in a favor" },
  { id: "cyber-11", text: "I overclock my implants" },
  { id: "cyber-12", text: "I upload the virus" },
  { id: "cyber-13", text: "I download everything" },
  { id: "cyber-14", text: "I talk to my contact" },
  { id: "cyber-15", text: "I go through the back alley" },
  { id: "cyber-16", text: "I check the dark web" },
  { id: "cyber-17", text: "I forge the documents" },
  { id: "cyber-18", text: "I tail the target" },
  { id: "cyber-19", text: "I case the joint" },
  { id: "cyber-20", text: "I pick the electronic lock" },
  { id: "cyber-21", text: "I scramble the signal" },
  { id: "cyber-22", text: "I deploy the EMP" },
  { id: "cyber-23", text: "I use the hologram" },
  { id: "cyber-24", text: "I set up a dead drop" },
  { id: "cyber-25", text: "I trigger the alarm on purpose" },
  { id: "cyber-26", text: "I negotiate the price" },
  { id: "cyber-27", text: "I double-cross someone" },
  { id: "cyber-28", text: "I sell the intel" },
  { id: "cyber-29", text: "I buy the upgrade" },
  { id: "cyber-30", text: "I hot-wire the vehicle" },
  { id: "cyber-31", text: "I create a distraction with tech" },
  { id: "cyber-32", text: "I scan for threats" },
  { id: "cyber-33", text: "I trace the signal" },
  { id: "cyber-34", text: "I patch into comms" },
  { id: "cyber-35", text: "I run the simulation" },
  { id: "cyber-36", text: "I arm the charges" },
  { id: "cyber-37", text: "I flash the badge" },
  { id: "cyber-38", text: "I slip through the crowd" },
  { id: "cyber-39", text: "I use the service tunnel" },
  { id: "cyber-40", text: "I activate the killswitch" },
  { id: "cyber-41", text: "I broadcast the truth" },
  { id: "cyber-42", text: "I wipe my tracks" },
  { id: "cyber-43", text: "I blend in with the locals" },
  { id: "cyber-44", text: "I steal the prototype" },
  { id: "cyber-45", text: "I reverse-engineer it" },
  { id: "cyber-46", text: "I make the exchange" },
  { id: "cyber-47", text: "I send a coded message" },
  { id: "cyber-48", text: "I cut the feed" },
  { id: "cyber-49", text: "I override the lockdown" },
  { id: "cyber-50", text: "I escape to the rooftops" },
];

// ---------------------------------------------------------------------------
// Deck helpers
// ---------------------------------------------------------------------------

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function createShuffledDeck(
  deckTypeOrCards?: TextCard[] | "adventure" | "party" | "horror" | "cyberpunk",
): DeckState {
  let cards: TextCard[];

  if (Array.isArray(deckTypeOrCards)) {
    cards = deckTypeOrCards;
  } else {
    switch (deckTypeOrCards) {
      case "party":
        cards = PARTY_DECK;
        break;
      case "horror":
        cards = HORROR_DECK;
        break;
      case "cyberpunk":
        cards = CYBERPUNK_DECK;
        break;
      case "adventure":
      default:
        cards = ADVENTURE_DECK;
        break;
    }
  }

  return { remaining: fisherYatesShuffle(cards), discard: [] };
}

export function drawCards(
  deck: DeckState,
  count: number,
): { deck: DeckState; drawn: TextCard[] } {
  let remaining = [...deck.remaining];
  let discard = [...deck.discard];
  const drawn: TextCard[] = [];

  for (let i = 0; i < count; i++) {
    if (remaining.length === 0) {
      if (discard.length === 0) break;
      remaining = fisherYatesShuffle(discard);
      discard = [];
    }
    drawn.push(remaining.pop()!);
  }

  return { deck: { remaining, discard }, drawn };
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export const EMPTY_MEMORY_BUNDLE: MemoryBundle = {
  canon: [],
  beats: [],
  open_threads: [],
  characters: {},
  active_consequences: [],
  known_locations: [],
};

// ---------------------------------------------------------------------------
// Archetypes
// ---------------------------------------------------------------------------

export interface Archetype {
  id: string;
  name: string;
  description: string;
}

export const ARCHETYPES: Archetype[] = [
  {
    id: "warrior",
    name: "Warrior",
    description:
      "A bold fighter who meets challenges head-on with courage and strength.",
  },
  {
    id: "rogue",
    name: "Rogue",
    description:
      "A cunning operator who relies on stealth, speed, and a sharp tongue.",
  },
  {
    id: "scholar",
    name: "Scholar",
    description:
      "A keen mind who solves problems through knowledge, observation, and careful reasoning.",
  },
  {
    id: "healer",
    name: "Healer",
    description:
      "A compassionate soul who supports others, mends wounds, and keeps the group together.",
  },
  {
    id: "trickster",
    name: "Trickster",
    description:
      "A chaotic wildcard who thrives on mischief, deception, and creative problem-solving.",
  },
  {
    id: "noble",
    name: "Noble",
    description:
      "A natural leader who inspires loyalty through charisma, diplomacy, and conviction.",
  },
  {
    id: "outlaw",
    name: "Outlaw",
    description:
      "A rebellious spirit who breaks the rules and fights against authority for their own code of justice.",
  },
  {
    id: "mystic",
    name: "Mystic",
    description:
      "An enigmatic figure attuned to hidden forces, intuition, and the unknown.",
  },
];

// ---------------------------------------------------------------------------
// Default rules
// ---------------------------------------------------------------------------

export const DEFAULT_RULES_TEXT = `## Scenario Seed
Create an original adventure in any genre you like — fantasy, sci-fi, mystery, horror, western, modern-day, historical, or something totally unexpected.

## Tone
- Fun, exciting, and easy to follow
- Consequences matter; teamwork between players is rewarded
- Mix tension with lighter moments

## Constraints
- Avoid graphic violence
- Dialogue should be natural and help tell the story
- Players communicate through text cards, interpret them creatively but fairly`;
