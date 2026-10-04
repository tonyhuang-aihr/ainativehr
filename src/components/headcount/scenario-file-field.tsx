"use client";

import { useState } from "react";

export function ScenarioFileField() {
  const [name, setName] = useState("");
  return (
    <label className="inline-flex min-h-10 cursor-pointer items-center gap-3">
      <span className="rounded-xl border border-line px-3 py-2">选择方案文件</span>
      <span className="text-muted">{name || "未选择文件"}</span>
      <input
        accept="application/json,.json"
        className="sr-only"
        name="file"
        type="file"
        onChange={(event) => setName(event.target.files?.[0]?.name ?? "")}
      />
    </label>
  );
}
