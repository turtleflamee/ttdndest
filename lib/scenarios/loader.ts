import fs from "fs";
import path from "path";
import type { ScenarioTemplate } from "@/lib/types";

const TEMPLATES_DIR = path.join(process.cwd(), "lib", "scenarios", "templates");

let cachedScenarios: ScenarioTemplate[] | null = null;

export function loadAllScenarios(): ScenarioTemplate[] {
  if (cachedScenarios) return cachedScenarios;

  const files = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".json"));
  const scenarios: ScenarioTemplate[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(TEMPLATES_DIR, file), "utf-8");
      const data = JSON.parse(raw) as ScenarioTemplate;
      if (data.id && data.name) {
        scenarios.push(data);
      }
    } catch {
      console.warn(`[scenarios] Failed to load ${file}`);
    }
  }

  cachedScenarios = scenarios;
  return scenarios;
}

export function loadScenario(id: string): ScenarioTemplate | null {
  const all = loadAllScenarios();
  return all.find((s) => s.id === id) ?? null;
}

export function listScenarioSummaries(): { id: string; name: string; description: string }[] {
  return loadAllScenarios().map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
  }));
}
