"use client";

import { useEffect, useState } from "react";

/** 手机和竖屏平板。桌面（lg 及以上）保持原有并排布局。 */
export function useNarrow(query = "(max-width: 1023px)") {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [query]);
  return narrow;
}
