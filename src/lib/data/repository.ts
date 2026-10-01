import type { Workspace } from "@/lib/model/types";

/** 持久化隔在这层后面。本期是浏览器本地存储，以后可以换成 SQLite 或内部服务。 */
export interface WorkspaceRepository {
  load(): Promise<Workspace | null>;
  save(workspace: Workspace): Promise<void>;
  clear(): Promise<void>;
}

const KEY = "ainativehr.workspace.v1";

export function createLocalRepository(storage: Storage | null): WorkspaceRepository {
  return {
    async load() {
      if (!storage) return null;
      const raw = storage.getItem(KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Workspace;
        if (parsed?.version !== 1 || !Array.isArray(parsed.scenarios)) return null;
        return { ...parsed, collab: parsed.collab ?? null };
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
