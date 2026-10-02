"use client";

import { Button } from "@/components/ui";
import { DATA_NOTICE_LEAD, DATA_NOTICE_LLM, DATA_NOTICE_NOW, DATA_NOTICE_TITLE, PROVIDER_TERMS } from "@/lib/data/noticeCopy";
import { writeDataNoticeAccepted } from "@/lib/data/localData";
import Link from "next/link";

export function DataNotice({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-[#101828]/40 p-0 sm:place-items-center sm:p-4" data-testid="data-notice">
      <div className="max-h-[92dvh] w-full overflow-auto rounded-t-2xl bg-white p-5 shadow-card sm:max-w-lg sm:rounded-2xl">
        <h2 className="text-base font-semibold">{DATA_NOTICE_TITLE}</h2>
        <div className="mt-3 space-y-3 text-sm leading-6 text-[#344054]">
          <p>{DATA_NOTICE_LEAD}</p>
          <p>{DATA_NOTICE_LLM}</p>
          <p>{DATA_NOTICE_NOW}</p>
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {PROVIDER_TERMS.map((item) => (
            <li key={item.href}>
              <a className="text-primary underline" href={item.href} target="_blank" rel="noreferrer">
                {item.name}
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Link
            href="/settings/data"
            className="inline-flex min-h-10 items-center px-2 text-sm text-primary"
            onClick={() => {
              writeDataNoticeAccepted(window.localStorage);
              onAccept();
            }}
          >
            查看完整说明
          </Link>
          <Button
            onClick={() => {
              writeDataNoticeAccepted(window.localStorage);
              onAccept();
            }}
          >
            知道了，继续
          </Button>
        </div>
      </div>
    </div>
  );
}
