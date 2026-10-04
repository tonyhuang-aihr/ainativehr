"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { restoreLocalSandboxAction } from "@/lib/headcount/actions";
import {
  DEMO_SANDBOX_CAPTION,
  dropSandboxPlans,
  mergeRemembered,
  readSandboxPlans,
  sandboxSyncPlan,
  writeSandboxPlans,
} from "@/lib/headcount/sandboxMemory";
import type { ScenarioDefinition } from "@/lib/headcount/scenario";

const pending = new Map<string, Promise<{ restoredIds: string[]; rejectedIds: string[] }>>();

export function SandboxLocalRestore({
  userId,
  scopeKey,
  plans,
}: {
  userId: string;
  scopeKey: string;
  plans: ScenarioDefinition[];
}) {
  const router = useRouter();
  const fingerprint = plans.map((plan) => `${plan.id}:${plan.name}:${plan.structureNote ?? ""}`).join("|");

  useEffect(() => {
    const storage = window.localStorage;
    const stored = readSandboxPlans(storage, userId, scopeKey);
    const { restore, remember } = sandboxSyncPlan(stored, plans);
    if (remember.length) writeSandboxPlans(storage, userId, scopeKey, mergeRemembered(stored, remember));
    if (!restore.length) return;
    const token = `${userId}:${scopeKey}:${restore.map((plan) => plan.id).join(",")}`;
    let task = pending.get(token);
    if (!task) {
      task = restoreLocalSandboxAction(restore).finally(() => pending.delete(token));
      pending.set(token, task);
    }
    let active = true;
    task.then((result) => {
      if (!active) return;
      if (result.rejectedIds.length) dropSandboxPlans(storage, userId, scopeKey, result.rejectedIds);
      if (result.restoredIds.length) router.refresh();
    });
    return () => {
      active = false;
    };
  }, [fingerprint, plans, router, scopeKey, userId]);

  return (
    <p className="mt-1 text-xs text-muted" data-demo-caption="sandbox">
      {DEMO_SANDBOX_CAPTION}
    </p>
  );
}
