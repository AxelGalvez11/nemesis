"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  fetchProjectContents,
  fetchProjects,
  fetchUnassignedItems,
  type Project,
  type ProjectContents,
  type ProjectItemKind,
  setItemProject,
} from "@/lib/api";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";
import { SkeletonRows } from "@/components/Skeleton";

const EMPTY: ProjectContents = { chats: [], reports: [], watches: [] };

// A project workspace: its chats + reports + watches, with an inline picker to add any of the user's
// unassigned items into the project, and a remove on each. All reads/writes are RLS-scoped.
export default function ProjectWorkspacePage() {
  const params = useParams();
  const projectId = String(params?.id ?? "");
  const [project, setProject] = useState<Project | null>(null);
  const [contents, setContents] = useState<ProjectContents | null>(null);
  const [pool, setPool] = useState<ProjectContents>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<ProjectItemKind | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, projects, unassigned] = await Promise.all([
        fetchProjectContents(projectId),
        fetchProjects(),
        fetchUnassignedItems(),
      ]);
      setContents(c);
      setPool(unassigned);
      setProject(projects.find((p) => p.id === projectId) ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load this project.");
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function assign(kind: ProjectItemKind, id: string, into: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      await setItemProject(kind, id, into);
      setOpenPicker(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t update the project.");
    } finally {
      setBusy(false);
    }
  }

  const linkFor = (kind: ProjectItemKind, id: string) =>
    kind === "conversation" ? `/app/ask?c=${id}` : kind === "report" ? `/app/reports/${id}` : `/app/monitor/${id}`;

  return (
    <div className="research-wrap">
      <div className="research-intro">
        <Orb size={48} />
        <Link href="/app/projects" className="proj-back">‹ All projects</Link>
        <h2 className="welcome-title">{project?.name ?? "Project"}</h2>
      </div>

      {err ? <p className="tmpl-note">{err}</p> : null}
      {contents === null && !err ? <SkeletonRows count={3} label="Loading the project…" /> : null}

      {contents ? (
        <>
          <Section
            kind="conversation" projectId={projectId} heading="Chats" icon="message"
            items={contents.chats.map((c) => ({ id: c.id, title: c.title }))}
            poolItems={pool.chats.map((c) => ({ id: c.id, title: c.title }))}
            open={openPicker === "conversation"} setOpen={(o) => setOpenPicker(o ? "conversation" : null)}
            onAssign={assign} linkFor={linkFor} busy={busy}
          />
          <Section
            kind="report" projectId={projectId} heading="Reports" icon="doc"
            items={contents.reports.map((r) => ({ id: r.id, title: r.title, meta: `${r.citation_count} sources` }))}
            poolItems={pool.reports.map((r) => ({ id: r.id, title: r.title }))}
            open={openPicker === "report"} setOpen={(o) => setOpenPicker(o ? "report" : null)}
            onAssign={assign} linkFor={linkFor} busy={busy}
          />
          <Section
            kind="watch" projectId={projectId} heading="Monitoring" icon="bell"
            items={contents.watches.map((w) => ({ id: w.id, title: w.title, meta: w.cadence }))}
            poolItems={pool.watches.map((w) => ({ id: w.id, title: w.title }))}
            open={openPicker === "watch"} setOpen={(o) => setOpenPicker(o ? "watch" : null)}
            onAssign={assign} linkFor={linkFor} busy={busy}
          />
        </>
      ) : null}
    </div>
  );
}

interface Item { id: string; title: string; meta?: string }

function Section({
  kind, projectId, heading, icon, items, poolItems, open, setOpen, onAssign, linkFor, busy,
}: {
  kind: ProjectItemKind;
  projectId: string;
  heading: string;
  icon: string;
  items: Item[];
  poolItems: Item[];
  open: boolean;
  setOpen: (o: boolean) => void;
  onAssign: (kind: ProjectItemKind, id: string, into: string | null) => void;
  linkFor: (kind: ProjectItemKind, id: string) => string;
  busy: boolean;
}) {
  return (
    <section className="proj-section">
      <div className="proj-section-head">
        <h3><Icon name={icon} size={14} /> {heading} <small>{items.length}</small></h3>
        <button type="button" className="proj-add-btn" onClick={() => setOpen(!open)} disabled={busy}>
          {open ? "Close" : "+ Add"}
        </button>
      </div>

      {open ? (
        <div className="proj-picker">
          {poolItems.length === 0 ? (
            <p className="proj-empty">Nothing unassigned to add.</p>
          ) : (
            poolItems.map((it) => (
              <button key={it.id} type="button" className="proj-pick-row" disabled={busy}
                onClick={() => onAssign(kind, it.id, projectId)} title={it.title}>
                <span className="proj-pick-title">{it.title}</span>
                <span className="proj-pick-add">Add</span>
              </button>
            ))
          )}
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="proj-empty">No {heading.toLowerCase()} in this project yet.</p>
      ) : (
        <div className="watch-card-list">
          {items.map((it) => (
            <div key={it.id} className="watch-card proj-item">
              <Link href={linkFor(kind, it.id)} className="proj-item-link" title={it.title}>
                <span className="watch-card-main">
                  <span className="watch-card-title">{it.title}</span>
                  {it.meta ? <span className="watch-card-meta">{it.meta}</span> : null}
                </span>
              </Link>
              <button type="button" className="proj-remove" disabled={busy}
                onClick={() => onAssign(kind, it.id, null)} title="Remove from project">Remove</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
