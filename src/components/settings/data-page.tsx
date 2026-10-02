"use client";

import { Shell } from "@/components/shell";
import { Button } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { clearLocalBrowserData } from "@/lib/data/localData";
import { DATA_NOTICE_LEAD, DATA_NOTICE_LLM, DATA_NOTICE_NOW, DATA_PAGE_EXTRA, PROVIDER_TERMS } from "@/lib/data/noticeCopy";
import { useState } from "react";

export function DataSettingsPage() {
  const { clearWorkspace } = useWorkspace();
  const [done, setDone] = useState(false);

  function wipe() {
    const ok = window.confirm("清空后，这台浏览器里的花名册、方案和决策轨迹都会删掉，而且不能撤销。确定清空？");
    if (!ok) return;
    clearLocalBrowserData(window.localStorage);
    clearWorkspace();
    setDone(true);
  }

  return (
    <Shell crumb="数据说明">
      <div data-testid="data-explanation" className="mx-auto w-full max-w-2xl p-4 lg:p-6">
        <h1 className="text-xl font-semibold">数据说明</h1>
        <div className="mt-4 space-y-3 text-sm leading-6 text-[#344054]">
          <p>{DATA_NOTICE_LEAD}</p>
          <p>{DATA_NOTICE_LLM}</p>
          <p>{DATA_NOTICE_NOW}</p>
          {DATA_PAGE_EXTRA.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <ul className="mt-4 space-y-1 text-sm">
          {PROVIDER_TERMS.map((item) => (
            <li key={item.href}>
              <a className="text-primary underline" href={item.href} target="_blank" rel="noreferrer">
                {item.name}
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-6 rounded-2xl border border-[#FECACA] bg-white p-4">
          <div className="text-sm font-semibold">一键清空本地数据</div>
          <p className="mt-1 text-xs leading-5 text-muted">只清这台浏览器。服务器上的清除还没做，因为现在没有服务器在存这些数据。</p>
          <Button variant="danger" className="mt-3" onClick={wipe}>
            一键清空
          </Button>
          {done && <p className="mt-2 text-sm text-[#B91C1C]">已清空。说明会重新出现一次。</p>}
        </div>
      </div>
    </Shell>
  );
}
