/** 画布协作线默认关闭。记住用户上一次的开关。 */
export const COLLAB_VIEW_KEY = "ainativehr.collabView.v1";

export function readCollabView(storage: Storage | null): boolean {
  if (!storage) return false;
  const raw = storage.getItem(COLLAB_VIEW_KEY);
  if (raw == null || raw === "") return false;
  return raw === "1" || raw === "true";
}

export function writeCollabView(storage: Storage | null, visible: boolean): void {
  storage?.setItem(COLLAB_VIEW_KEY, visible ? "1" : "0");
}
