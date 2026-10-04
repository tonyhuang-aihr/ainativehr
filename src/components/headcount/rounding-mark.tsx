export function RoundingMark({ note }: { note: string }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button type="button" className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] leading-none text-muted" aria-label={note} title={note}>
        ⓘ
      </button>
      <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden w-64 -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-left text-xs font-normal leading-5 text-white group-hover:block group-focus-within:block">
        {note}
      </span>
    </span>
  );
}
