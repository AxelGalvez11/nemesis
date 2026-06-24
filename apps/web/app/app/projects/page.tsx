"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createProject, fetchProjects, type Project } from "@/lib/api";
import { Orb } from "@/components/Orb";
import { Icon } from "@/components/icons";
import { SkeletonRows } from "@/components/Skeleton";
import { getCached, setCached } from "@/lib/cache";

// Projects: workspaces that group a user's chats + reports + watches. This lists the user's projects
// and creates new ones; /app/projects/[id] is the workspace where its contents live and items are added.
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

  return (
    <div className="research-wrap">
      <div className="research-intro">
        <Orb size={52} />
        <h2 className="welcome-title">Projects</h2>
        <p className="welcome-sub">
          Group related chats, Deep Research reports, and monitoring watches into one workspace.
        </p>
      </div>

      <div className="watch-add">
        <Icon name="folder" size={16} />
        <input
          className="watch-add-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void create(); }}
          placeholder="Name a new project — e.g. “GLP-1 research”"
          aria-label="New project name"
          disabled={creating}
        />
        <button type="button" className="mode watch-add-btn" onClick={() => void create()} disabled={creating || !name.trim()}>
          {creating ? "Creating…" : "Create"}
        </button>
      </div>

      {err ? <p className="tmpl-note">{err}</p> : null}
      {projects === null && !err ? <SkeletonRows count={3} label="Loading your projects…" /> : null}

      {projects && projects.length === 0 ? (
        <p className="welcome-sub">No projects yet. Name one above to start a workspace.</p>
      ) : null}

      {projects && projects.length > 0 ? (
        <div className="research-history">
          <div className="watch-card-list">
            {projects.map((p) => (
              <Link key={p.id} href={`/app/projects/${p.id}`} className="watch-card" title={p.name}>
                <span className="watch-card-dot active" aria-hidden />
                <span className="watch-card-main">
                  <span className="watch-card-title">{p.name}</span>
                  {p.description ? <span className="watch-card-meta">{p.description}</span> : null}
                </span>
                <span className="watch-card-chev" aria-hidden>›</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
