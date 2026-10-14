import { COLLAB_VIEW_KEY } from "@/lib/collab/viewPreference";
import { MOBILE_EDIT_HINT_KEY } from "@/lib/ui/mobileHint";

export const WORKSPACE_KEY = "ainativehr.workspace.v1";
export const DATA_NOTICE_KEY = "ainativehr.dataNotice.v1";

/** 本沙盘写在这台浏览器里的键。清空时按前缀再扫一遍，避免漏掉后来加的键。 */
export const LOCAL_DATA_KEYS = [WORKSPACE_KEY, COLLAB_VIEW_KEY, MOBILE_EDIT_HINT_KEY, DATA_NOTICE_KEY];

export function readDataNoticeAccepted(storage: Storage | null): boolean {
  if (!storage) return false;
  return storage.getItem(DATA_NOTICE_KEY) === "1";
}

export function writeDataNoticeAccepted(storage: Storage | null): void {
  storage?.setItem(DATA_NOTICE_KEY, "1");
}

export function clearLocalBrowserData(storage: Storage | null): void {
  if (!storage) return;
  const related: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && key.startsWith("ainativehr.")) related.push(key);
  }
  for (const key of new Set([...LOCAL_DATA_KEYS, ...related])) storage.removeItem(key);
}
