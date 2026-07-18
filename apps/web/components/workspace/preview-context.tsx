"use client";

// Dev-preview escape hatch: the /dev-preview/workspace/* harness renders the
// full workspace chrome WITHOUT the auth gate by supplying this context. Real
// (workspace) routes leave it null and read the Supabase session instead.
// Page components must also treat `isPreview` as "no network calls".

import { createContext, useContext } from "react";

export interface WorkspacePreviewValue {
  email: string;
}

const WorkspacePreviewContext = createContext<WorkspacePreviewValue | null>(null);

export function WorkspacePreviewProvider({
  value,
  children,
}: {
  value: WorkspacePreviewValue;
  children: React.ReactNode;
}) {
  return <WorkspacePreviewContext.Provider value={value}>{children}</WorkspacePreviewContext.Provider>;
}

/** Null outside the harness. */
export function useWorkspacePreview(): WorkspacePreviewValue | null {
  return useContext(WorkspacePreviewContext);
}
