import type {
  MemoryBundle,
  GMResponse,
  ActiveConsequence,
  CharacterRecord,
} from "./types";

export function applyMemoryPatch(
  bundle: MemoryBundle,
  response: GMResponse,
  turnNumber: number
): MemoryBundle {
  const out: MemoryBundle = JSON.parse(JSON.stringify(bundle));
  const patch = response.memory_patch;

  // Canon additions
  if (patch.canon_additions?.length) {
    out.canon.push(...patch.canon_additions);
  }

  // Canon updates — replace matching entries by prefix before the first ":"
  if (patch.canon_updates?.length) {
    for (const update of patch.canon_updates) {
      const key = update.split(":")[0]?.trim();
      const idx = out.canon.findIndex((c) => c.split(":")[0]?.trim() === key);
      if (idx !== -1) {
        out.canon[idx] = update;
      } else {
        out.canon.push(update);
      }
    }
  }

  // Thread updates
  if (patch.thread_updates?.length) {
    for (const tu of patch.thread_updates) {
      if (tu.status === "opened") {
        const exists = out.open_threads.some((t) => t.id === tu.id);
        if (!exists) {
          out.open_threads.push({
            id: tu.id,
            description: tu.description ?? "",
            urgency: "medium",
          });
        }
      } else if (tu.status === "resolved") {
        out.open_threads = out.open_threads.filter((t) => t.id !== tu.id);
      }
    }
  }

  // Story beats
  if (out.story_beats) {
    if (patch.beat_activated) {
      const beat = out.story_beats.find((b) => b.id === patch.beat_activated);
      if (beat) beat.status = "active";
    }
    if (patch.beats_completed?.length) {
      for (const id of patch.beats_completed) {
        const beat = out.story_beats.find((b) => b.id === id);
        if (beat) beat.status = "completed";
      }
    }
    if (patch.beat_progress?.length) {
      out.beats.push(...patch.beat_progress);
    }
  }

  // Character updates — merge but preserve existing voice_id
  if (response.character_updates?.length) {
    if (!out.characters) out.characters = {};
    for (const cu of response.character_updates) {
      const existing = out.characters[cu.name];
      if (existing) {
        const preservedVoiceId = existing.voice_id;
        out.characters[cu.name] = { ...existing, ...cu };
        if (preservedVoiceId) {
          out.characters[cu.name].voice_id = preservedVoiceId;
        }
      } else {
        out.characters[cu.name] = { ...cu };
      }
    }
  }

  // Location change
  if (response.location_change) {
    out.current_location = response.location_change;
    if (!out.known_locations) out.known_locations = [];
    if (!out.known_locations.includes(response.location_change)) {
      out.known_locations.push(response.location_change);
    }
  }

  // Delayed consequences
  if (!out.active_consequences) out.active_consequences = [];
  for (const c of response.consequences) {
    if (c.type === "delayed") {
      out.active_consequences.push({
        ...c,
        created_turn: turnNumber,
        expiry_turn: turnNumber + 5,
      });
    }
  }

  // Expire old consequences
  out.active_consequences = out.active_consequences.filter(
    (ac) => turnNumber <= ac.expiry_turn
  );

  // Continuity notes
  if (response.continuity_notes?.length) {
    out.last_continuity_notes = response.continuity_notes;
  }

  return out;
}

export function pruneExpiredConsequences(
  bundle: MemoryBundle,
  turnNumber: number
): MemoryBundle {
  const out: MemoryBundle = JSON.parse(JSON.stringify(bundle));
  out.active_consequences = (out.active_consequences ?? []).filter(
    (ac) => turnNumber <= ac.expiry_turn
  );
  return out;
}
