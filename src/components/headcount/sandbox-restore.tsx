"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { adoptDemoStateAction } from "@/lib/headcount/actions";
import { DEMO_SANDBOX_CAPTION, readSandboxPlans } from "@/lib/headcount/sandboxMemory";
import { readScenarioState, writeScenarioState } from "@/lib/headcount/scenarioState";
import type { ScenarioDefinition } from "@/lib/headcount/scenario";

const pending = new Map<string, Promise<{ restoredIds: string[]; rejectedIds: string[] }>>();

export function SandboxLocalRestore({
  userId,
  scopeKey,
  plans,
  authoritative,
}: {
  userId: string;
  scopeKey: string;
  plans: ScenarioDefinition[];
  authoritative: boolean;
}) {
  const router = useRouter();
  const fingerprint = plans.map((plan) => `${plan.id}:${plan.name}:${plan.compared ? 1 : 0}:${plan.hires.length}:${plan.agents.length}:${plan.cuts.length}`).join("|");

  useEffect(() => {
    const storage = window.localStorage;
    const stored = readScenarioState(storage, userId, scopeKey);
    const legacy = stored === null ? readSandboxPlans(storage, userId, scopeKey) : [];
    const local = stored ?? legacy;
    if (authoritative || local.length === 0) {
      writeScenarioState(storage, userId, scopeKey, plans);
      return;
    }
    const token = `${userId}:${scopeKey}:${local.map((plan) => plan.id).join(",")}`;
    let task = pending.get(token);
    if (!task) {
      task = adoptDemoStateAction(local).finally(() => pending.delete(token));
      pending.set(token, task);
    }
    let active = true;
    task.then((result) => {
      if (!active) return;
      if (result.restoredIds.length) router.refresh();
      else writeScenarioState(storage, userId, scopeKey, []);
    });
    return () => {
      active = false;
    };
  }, [authoritative, fingerprint, plans, router, scopeKey, userId]);

  return (
    <p className="mt-1 text-xs text-muted" data-demo-caption="sandbox">
      {DEMO_SANDBOX_CAPTION}
    </p>
  );
}
