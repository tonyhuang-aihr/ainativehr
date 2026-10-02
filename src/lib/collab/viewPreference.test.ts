import { describe, expect, it } from "vitest";
import { COLLAB_VIEW_KEY, readCollabView, writeCollabView } from "@/lib/collab/viewPreference";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("协作视图开关", () => {
  it("没有记录时默认关闭，不画部门协作线", () => {
    expect(readCollabView(null)).toBe(false);
    expect(readCollabView(memoryStorage())).toBe(false);
  });

  it("记住上一次的选择", () => {
    const storage = memoryStorage();
    writeCollabView(storage, true);
    expect(storage.getItem(COLLAB_VIEW_KEY)).toBe("1");
    expect(readCollabView(storage)).toBe(true);
    writeCollabView(storage, false);
    expect(readCollabView(storage)).toBe(false);
  });
});
