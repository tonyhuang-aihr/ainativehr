import { describe, expect, it } from "vitest";
import { commitUndo, createUndo, redo, undo } from "@/lib/history/undo";

describe("undo", () => {
  it("记录、撤销、重做", () => {
    const action = { id: "a1", label: "修改任务", source: "user" as const, at: "2026-10-01T00:00:00.000Z" };
    let state = createUndo({ value: 1 });
    state = commitUndo(state, { value: 2 }, action);
    expect(state.present.value).toBe(2);
    state = undo(state);
    expect(state.present.value).toBe(1);
    state = redo(state);
    expect(state.present.value).toBe(2);
    state = commitUndo(state, { value: 3 }, { ...action, id: "a2" });
    expect(state.future).toHaveLength(0);
    expect(undo(undo(state)).present.value).toBe(1);
  });
});
