import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/lib/headcount/db/client";
import * as schema from "@/lib/headcount/db/schema";
import { normalizeScenarioDefinition, presetScenarios, type ScenarioDefinition } from "@/lib/headcount/scenario";

const ORDER = ["jz", "jj", "bs", "fa"];

export function serializeDefinition(definition: ScenarioDefinition): string {
  return JSON.stringify(definition);
}

export function parseDefinition(note: string): ScenarioDefinition | null {
  try {
    const value = JSON.parse(note) as ScenarioDefinition;
    if (!value || typeof value.id !== "string" || !value.assumptions || !Array.isArray(value.hires) || !Array.isArray(value.agents)) return null;
    return normalizeScenarioDefinition(value);
  } catch {
    return null;
  }
}

export async function ensureScenarioPresets(db: AppDatabase): Promise<void> {
  await db.delete(schema.scenarios).where(eq(schema.scenarios.id, "later"));
  const rows = await db.select({ id: schema.scenarios.id }).from(schema.scenarios);
  const have = new Set(rows.map((row) => row.id));
  const missing = presetScenarios().filter((item) => !have.has(item.id));
  if (!missing.length) return;
  await db.insert(schema.scenarios).values(
    missing.map((item) => ({
      id: item.id,
      name: item.name,
      source: item.source,
      version: 1,
      note: serializeDefinition(item),
    })),
  );
}

export async function loadScenarioDefinitions(db: AppDatabase): Promise<ScenarioDefinition[]> {
  await ensureScenarioPresets(db);
  const rows = await db.select().from(schema.scenarios);
  return rows
    .map((row) => parseDefinition(row.note))
    .filter((item): item is ScenarioDefinition => Boolean(item))
    .sort((left, right) => {
      const leftIndex = ORDER.indexOf(left.id);
      const rightIndex = ORDER.indexOf(right.id);
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    });
}

export async function saveScenarioDefinition(db: AppDatabase, definition: ScenarioDefinition): Promise<void> {
  await db
    .insert(schema.scenarios)
    .values({
      id: definition.id,
      name: definition.name,
      source: definition.source,
      version: 1,
      note: serializeDefinition(definition),
    })
    .onConflictDoUpdate({
      target: schema.scenarios.id,
      set: { name: definition.name, source: definition.source, note: serializeDefinition(definition) },
    });
}
