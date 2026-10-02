export const MOBILE_EDIT_HINT_KEY = "ainativehr.mobileEditHint.v1";

export function readMobileEditHintDismissed(storage: Storage | null): boolean {
  if (!storage) return false;
  return storage.getItem(MOBILE_EDIT_HINT_KEY) === "1";
}

export function writeMobileEditHintDismissed(storage: Storage | null): void {
  storage?.setItem(MOBILE_EDIT_HINT_KEY, "1");
}
