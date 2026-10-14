"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function InfoMark({ note }: { note: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 256;
      const height = tipRef.current?.offsetHeight ?? 72;
      const margin = 8;
      let left = rect.left + rect.width / 2 - width / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      let top = rect.bottom + 6;
      if (top + height > window.innerHeight - margin) top = Math.max(margin, rect.top - height - 6);
      setBox({ top, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, note]);

  return (
    <span className="ml-1 inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] leading-none text-muted"
        aria-label={note}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ⓘ
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <span
              ref={tipRef}
              role="tooltip"
              className="pointer-events-none w-64 rounded-lg bg-ink px-2 py-1 text-left text-xs font-normal leading-5 text-white"
              style={{ position: "fixed", top: box.top, left: box.left, zIndex: 80 }}
            >
              {note}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
