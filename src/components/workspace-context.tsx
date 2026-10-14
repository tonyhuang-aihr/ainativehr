"use client";

import { createLocalRepository, type WorkspaceRepository } from "@/lib/data/repository";
import { fetchAiStatus, type AiStatus } from "@/lib/ai/provider";
import { commitUndo, createUndo, redo as redoUndo, undo as undoState, type UndoState } from "@/lib/history/undo";
import { uid } from "@/lib/format";
import type { ViewerRole, Workspace } from "@/lib/model/types";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Store = {
  ready: boolean;
  workspace: Workspace | null;
  ai: AiStatus;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  commit: (next: Workspace, label: string, source?: "user" | "ai") => void;
  replaceWorkspace: (next: Workspace) => void;
  clearWorkspace: () => void;
  setViewerRole: (role: ViewerRole) => void;
  touch: (recipe: (workspace: Workspace) => Workspace) => void;
};

const Ctx = createContext<Store | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const repository = useMemo<WorkspaceRepository>(() => createLocalRepository(typeof window === "undefined" ? null : window.localStorage), []);
  const [stack, setStack] = useState<UndoState<Workspace | null>>(createUndo(null));
  const [ready, setReady] = useState(false);
  const [ai, setAi] = useState<AiStatus>({ mode: "offline", model: null });

  useEffect(() => {
    let cancelled = false;
    repository.load().then((loaded) => {
      if (cancelled) return;
      setStack(createUndo(loaded));
      setReady(true);
    });
    fetchAiStatus().then((status) => {
      if (!cancelled) setAi(status);
    });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      setStack((current) => (event.shiftKey ? redoUndo(current) : undoState(current)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (stack.present) repository.save(stack.present);
  }, [ready, repository, stack.present]);

  const store: Store = {
    ready,
    workspace: stack.present,
    ai,
    canUndo: stack.past.length > 0,
    canRedo: stack.future.length > 0,
    undo: () => setStack((current) => undoState(current)),
    redo: () => setStack((current) => redoUndo(current)),
    commit: (next, label, source = "user") => {
      const withAudit: Workspace = {
        ...next,
        audit: [
          { id: uid("audit"), at: new Date().toISOString(), source, label },
          ...next.audit,
        ].slice(0, 200),
      };
      setStack((current) =>
        commitUndo(current, withAudit, {
          id: uid("act"),
          label,
          source,
          at: new Date().toISOString(),
        }),
      );
    },
    replaceWorkspace: (next) => setStack(createUndo(next)),
    clearWorkspace: () => {
      repository.clear();
      setStack(createUndo(null));
    },
    setViewerRole: (role) => {
      setStack((current) => {
        if (!current.present) return current;
        return {
          ...current,
          present: {
            ...current.present,
            settings: { ...current.present.settings, viewerRole: role },
          },
        };
      });
    },
    touch: (recipe) => {
      setStack((current) => {
        if (!current.present) return current;
        return { ...current, present: recipe(current.present) };
      });
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useWorkspace(): Store {
  const value = useContext(Ctx);
  if (!value) throw new Error("WorkspaceProvider 缺失");
  return value;
}
