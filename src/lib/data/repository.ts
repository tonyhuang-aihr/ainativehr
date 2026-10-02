import { WORKSPACE_KEY } from "@/lib/data/localData";
import type { Workspace } from "@/lib/model/types";

/** 花名册和方案只写在这台浏览器的 localStorage，不发到服务端。 */
export interface WorkspaceRepository {
  load(): Promise<Workspace | null>;
  save(workspace: Workspace): Promise<void>;
  clear(): Promise<void>;
}

const KEY = WORKSPACE_KEY;

export function createLocalRepository(storage: Storage | null): WorkspaceRepository {
  return {
    async load() {
      if (!storage) return null;
      const raw = storage.getItem(KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Workspace;
        if (parsed?.version !== 1 || !Array.isArray(parsed.scenarios)) return null;
        return { ...parsed, collab: parsed.collab ?? null, decisions: parsed.decisions ?? [] };
      } catch {
        return null;
      }
    },
    async save(workspace) {
      storage?.setItem(KEY, JSON.stringify(workspace));
    },
    async clear() {
      storage?.removeItem(KEY);
    },
  };
}

export function createMemoryRepository(initial: Workspace | null = null): WorkspaceRepository {
  let current = initial;
  return {
    async load() {
      return current;
    },
    async save(workspace) {
      current = workspace;
    },
    async clear() {
      current = null;
    },
  };
}
