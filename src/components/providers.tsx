"use client";

import { WorkspaceProvider } from "@/components/workspace-context";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}
