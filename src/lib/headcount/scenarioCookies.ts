import "server-only";

import { cookies } from "next/headers";
import { packScenarioCookie, unpackScenarioCookie } from "@/lib/headcount/scenarioCookieCodec";
import type { ScenarioDefinition } from "@/lib/headcount/scenario";
import {
  MAX_COOKIE_CHUNKS,
  parseScenarioEnvelope,
  SCENARIO_STATE_COOKIE,
  serializeEnvelope,
  type ScenarioEnvelope,
} from "@/lib/headcount/scenarioState";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function readDemoEnvelope(userId: string, scopeKey: string): Promise<{ found: boolean; scenarios: ScenarioDefinition[] }> {
  const jar = await cookies();
  const first = jar.get(`${SCENARIO_STATE_COOKIE}.0`)?.value;
  if (!first) return { found: false, scenarios: [] };
  const chunks = [first];
  for (let index = 1; index < MAX_COOKIE_CHUNKS; index += 1) {
    const value = jar.get(`${SCENARIO_STATE_COOKIE}.${index}`)?.value;
    if (!value) break;
    chunks.push(value);
  }
  return { found: true, scenarios: parseScenarioEnvelope(unpackScenarioCookie(chunks), userId, scopeKey) };
}

export async function writeDemoEnvelope(envelope: ScenarioEnvelope): Promise<void> {
  const jar = await cookies();
  const chunks = packScenarioCookie(serializeEnvelope(envelope));
  for (let index = 0; index < MAX_COOKIE_CHUNKS; index += 1) {
    const name = `${SCENARIO_STATE_COOKIE}.${index}`;
    if (index < chunks.length) jar.set(name, chunks[index], cookieOptions());
    else jar.delete(name);
  }
}
