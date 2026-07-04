"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createProject, fetchProjects, type Project } from "@/lib/api";
import { Icon } from "@/components/icons";
import { SkeletonRows } from "@/components/Skeleton";
import { getCached, setCached } from "@/lib/cache";

// Projects: workspaces that group a user's chats + reports + watches. Manus-style card grid — the same
// visual language as the Library page (hairline-bordered cards on --radius corners, hover = opacity 0.8).
// This lists the user's projects and creates new ones; /app/projects/[id] is the workspace where its
// contents live and items are added.

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(() => getCached<Project[]>("projects-list") ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchProjects()
      .then((p) => { if (alive) { setProjects(p); setCached("projects-list", p); } })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not load your projects."); });
    return () => { alive = false; };
  }, []);

  async function create() {
    const n = name.trim();
    if (!n || creating) return;
    setCreating(true);
    try {
      const p = await createProject(n);
      if (p) {
        setName("");
        const next = [p, ...(projects ?? [])];
        setProjects(next);
        setCached("projects-list", next);
      } else {
        setErr("Couldn’t create the project — try again.");
      }
    } finally {
      setCreating(false);
    }
  }

  // Manus-style inline create control: a folder-glyph filled input + Create button, reused in both the
  // header and the empty state so the affordance is identical wherever it appears.
  const createControl = (
    <div className="proj-create">
      <Icon name="folder" size={15} />
      <input
        className="proj-create-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void create(); }}
        placeholder="Name a new project — e.g. “GLP-1 research”"
        aria-label="New project name"
        disabled={creating}
      />
      <button type="button" className="mode proj-create-btn" onClick={() => void create()} disabled={creating || !name.trim()}>
        <Icon name="plus" size={14} /> {creating ? "Creating…" : "New project"}
      </button>
    </div>
  );

  const hasProjects = (projects?.length ?? 0) > 0;

  return (
    <div className="lib-wrap">
      <header className="proj-head">
        <div className="proj-head-text">
          <h2 className="lib-title">Projects</h2>
          <p className="proj-sub">Group related chats, Deep Research reports, and monitoring watches into one workspace.</p>
        </div>
        {createControl}
      </header>

      {err ? <p className="tmpl-note">{err}</p> : null}
      {projects === null && !err ? <SkeletonRows count={3} label="Loading your projects…" /> : null}

      {projects && !hasProjects ? (
        <div className="lib-empty">
          <Icon name="folder" size={30} />
          <p className="lib-empty-title">No projects yet</p>
          <p className="lib-empty-sub">Create one to group your research — chats, reports, and monitoring watches all live together in a workspace.</p>
          <div className="proj-empty-create">{createControl}</div>
        </div>
      ) : null}

      {projects && hasProjects ? (
        <div className="lib-grid">
          {projects.map((p) => (
            <div key={p.id} className="lib-card">
              <Link href={`/app/projects/${p.id}`} className="lib-card-link" title={p.name}>
                <span className="lib-card-icon"><Icon name="folder" size={18} /></span>
                <span className="lib-card-title">{p.name}</span>
                {p.description ? <span className="proj-card-desc">{p.description}</span> : null}
                {p.created_at ? (
                  <span className="lib-card-meta"><span>Created {shortDate(p.created_at)}</span></span>
                ) : null}
              </Link>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
