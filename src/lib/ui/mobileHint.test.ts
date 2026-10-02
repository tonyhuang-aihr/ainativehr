import { describe, expect, it } from "vitest";
import { MOBILE_EDIT_HINT_KEY, readMobileEditHintDismissed, writeMobileEditHintDismissed } from "@/lib/ui/mobileHint";

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

describe("手机编辑提示", () => {
  it("没有点过「知道了」时还会显示", () => {
    expect(readMobileEditHintDismissed(null)).toBe(false);
    expect(readMobileEditHintDismissed(memoryStorage())).toBe(false);
  });

  it("关掉之后不再出现", () => {
    const storage = memoryStorage();
    writeMobileEditHintDismissed(storage);
    expect(storage.getItem(MOBILE_EDIT_HINT_KEY)).toBe("1");
    expect(readMobileEditHintDismissed(storage)).toBe(true);
  });
});
