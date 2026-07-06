"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  createProjectSource,
  deleteProject,
  deleteProjectSource,
  fetchProject,
  fetchProjectContents,
  fetchProjectSources,
  fetchUnassignedItems,
  setItemProject,
  updateProject,
  type Project,
  type ProjectContents,
  type ProjectItemKind,
  type ProjectSource,
} from "@/lib/api";
import { displayReportTitle } from "@pharmabro/shared";
import { setCached } from "@/lib/cache";
import { Icon } from "@/components/icons";
import { SkeletonRows } from "@/components/Skeleton";
import { useResearchMapData } from "@/lib/research-map-data";
import { ResearchMapView } from "@/components/ResearchMapView";
import { AppModal } from "@/components/AppModal";

const EMPTY: ProjectContents = { chats: [], reports: [], watches: [] };
type Tab = "conversation" | "report" | "watch" | "map" | "sources";

// A project workspace (ChatGPT-Projects style): a "New chat in this project" composer, tabbed contents
// (Chats / Reports / Monitoring) with the inline add-from-unassigned picker + per-item remove, and a
// settings modal to rename / set description + instructions / delete. All reads/writes are RLS-scoped.
export default function ProjectWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = String(params?.id ?? "");
  const [project, setProject] = useState<Project | null>(null);
  const [contents, setContents] = useState<ProjectContents | null>(null);
  const [pool, setPool] = useState<ProjectContents>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("conversation");
  const [openPicker, setOpenPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newChat, setNewChat] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mapActivated, setMapActivated] = useState(false);
  // Lazy: the map's per-item citation fetch only runs once the user opens the Map tab.
  const mapData = useResearchMapData(projectId, mapActivated ? contents : null);
  // Sources tab: `sourcesEnabled === false` means the project_sources table isn't deployed yet
  // (pre-migration) — shown as a quiet note, never a crash. Undefined = not loaded yet.
  const [sources, setSources] = useState<ProjectSource[]>([]);
  const [sourcesEnabled, setSourcesEnabled] = useState<boolean | undefined>(undefined);
  const [sourcesErr, setSourcesErr] = useState<string | null>(null);
  const [addSourcesOpen, setAddSourcesOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c, unassigned] = await Promise.all([
        fetchProject(projectId),
        fetchProjectContents(projectId),
        fetchUnassignedItems(),
      ]);
      setProject(p);
      setContents(c);
      setPool(unassigned);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load this project.");
    }
  }, [projectId]);

  const loadSources = useCallback(async () => {
    try {
      const { enabled, sources: list } = await fetchProjectSources(projectId);
      setSourcesEnabled(enabled);
      setSources(list);
      setSourcesErr(null);
    } catch (e) {
      // A real failure (auth expiry, RLS, network) — NOT the missing-table case, which
      // fetchProjectSources already resolves to `{ enabled: false }` without throwing. Surface it and
      // treat the tab as "enabled" so the UI exits the loading skeleton instead of spinning forever.
      setSourcesEnabled(true);
      setSourcesErr(e instanceof Error ? e.message : "Couldn't load sources.");
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadSources(); }, [loadSources]);

  async function assign(kind: ProjectItemKind, id: string, into: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      await setItemProject(kind, id, into);
      setOpenPicker(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t update the project.");
    } finally {
      setBusy(false);
    }
  }

  // "New chat in {name}": hand the typed question + this project to the Ask page via the in-memory
  // session cache (Task 4 reads it on mount), then navigate. Prefill only — Ask never auto-submits.
  function startChat() {
    const q = newChat.trim();
    if (!q) return;
    setCached("ask-project-prefill", { projectId, question: q });
    router.push("/app/ask");
  }

  const linkFor = (kind: ProjectItemKind, id: string) =>
    kind === "conversation" ? `/app/ask?c=${id}` : kind === "report" ? `/app/reports/${id}` : `/app/monitor/${id}`;

  const projName = project?.name ?? "Project";
  const items: Item[] = contents
    ? tab === "conversation"
      ? contents.chats.map((c) => ({ id: c.id, title: c.title, meta: c.created_at ? shortDate(c.created_at) : undefined }))
      : tab === "report"
      ? contents.reports.map((r) => ({ id: r.id, title: displayReportTitle(r.title), meta: `${r.citation_count} sources` }))
      : contents.watches.map((w) => ({ id: w.id, title: w.title, meta: w.cadence }))
    : [];
  const poolItems: Item[] = tab === "conversation"
    ? pool.chats.map((c) => ({ id: c.id, title: c.title }))
    : tab === "report"
    ? pool.reports.map((r) => ({ id: r.id, title: displayReportTitle(r.title) }))
    : pool.watches.map((w) => ({ id: w.id, title: w.title }));
  // "map" and "sources" aren't ProjectItemKinds (they have no assign/pool item list); the generic item
  // section doesn't render for either tab, so this fallback value is never actually used in that case.
  const kind: ProjectItemKind = tab === "map" || tab === "sources" ? "conversation" : tab;
  const heading = tab === "conversation" ? "Chats" : tab === "report" ? "Reports" : "Monitoring";

  return (
    <div className="research-wrap">
      <div className="research-intro">
        <Link href="/app/projects" className="proj-back">‹ All projects</Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          <h2 className="welcome-title" style={{ margin: 0 }}>{projName}</h2>
          <button type="button" className="proj-add-btn" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)} title="Project settings">
            <Icon name="settings" size={15} />
          </button>
        </div>
        {project?.description ? <p className="welcome-sub">{project.description}</p> : null}
      </div>

      {/* New chat in this project */}
      <div className="watch-add">
        <Icon name="message" size={16} />
        <input
          className="watch-add-input"
          value={newChat}
          onChange={(e) => setNewChat(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") startChat(); }}
          placeholder={`New chat in ${projName}…`}
          aria-label={`New chat in ${projName}`}
        />
        <button type="button" className="mode watch-add-btn" onClick={startChat} disabled={!newChat.trim()}>Start</button>
      </div>

      {err ? <p className="tmpl-note">{err}</p> : null}
      {contents === null && !err ? <SkeletonRows count={3} label="Loading the project…" /> : null}

      {contents ? (
        <>
          {/* Tabs */}
          <div className="chip-row" role="tablist" aria-label="Project contents">
            {(["conversation", "report", "watch"] as Tab[]).map((t) => {
              const label = t === "conversation" ? "Chats" : t === "report" ? "Reports" : "Monitoring";
              const count = t === "conversation" ? contents.chats.length : t === "report" ? contents.reports.length : contents.watches.length;
              return (
                <button key={t} type="button" role="tab" aria-selected={tab === t}
                  className={`chip-action${tab === t ? " active" : ""}`}
                  onClick={() => { setTab(t); setOpenPicker(false); }}>
                  {label} <small>{count}</small>
                </button>
              );
            })}
            <button type="button" role="tab" aria-selected={tab === "map"}
              className={`chip-action${tab === "map" ? " active" : ""}`}
              onClick={() => { setTab("map"); setOpenPicker(false); setMapActivated(true); }}>
              Map
            </button>
            <button type="button" role="tab" aria-selected={tab === "sources"}
              className={`chip-action${tab === "sources" ? " active" : ""}`}
              onClick={() => { setTab("sources"); setOpenPicker(false); }}>
              Sources {sourcesEnabled ? <small>{sources.length}</small> : null}
            </button>
          </div>

          {tab === "sources" ? (
            <ProjectSourcesTab
              projectId={projectId}
              enabled={sourcesEnabled}
              loadErr={sourcesErr}
              sources={sources}
              addOpen={addSourcesOpen}
              onOpenAdd={() => setAddSourcesOpen(true)}
              onCloseAdd={() => setAddSourcesOpen(false)}
              onAdded={() => { setAddSourcesOpen(false); void loadSources(); }}
              onDeleted={() => void loadSources()}
            />
          ) : tab === "map" ? (
            <section className="proj-section">
              <div className="proj-section-head">
                <h3><Icon name="doc" size={14} /> Map</h3>
              </div>
              <ResearchMapView
                map={mapData.map}
                loading={mapData.loading}
                error={mapData.error}
                skipped={mapData.skipped}
                onOpenItem={(kind, id) => router.push(linkFor(kind === "chat" ? "conversation" : kind, id))}
              />
            </section>
          ) : (
          <section className="proj-section">
            <div className="proj-section-head">
              <h3><Icon name={tab === "conversation" ? "message" : tab === "report" ? "doc" : "bell"} size={14} /> {heading} <small>{items.length}</small></h3>
              <button type="button" className="proj-add-btn" onClick={() => setOpenPicker((o) => !o)} disabled={busy}>
                {openPicker ? "Close" : "+ Add"}
              </button>
            </div>

            {openPicker ? (
              <div className="proj-picker">
                {poolItems.length === 0 ? (
                  <p className="proj-empty">Nothing unassigned to add.</p>
                ) : (
                  poolItems.map((it) => (
                    <button key={it.id} type="button" className="proj-pick-row" disabled={busy}
                      onClick={() => assign(kind, it.id, projectId)} title={it.title}>
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
                      onClick={() => assign(kind, it.id, null)} title="Remove from project">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </section>
          )}
        </>
      ) : null}

      {settingsOpen && project ? (
        <ProjectSettings
          project={project}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next) => { setProject(next); setSettingsOpen(false); }}
          onPartialSave={(next) => setProject(next)}
          onDeleted={() => { setSettingsOpen(false); router.push("/app/projects"); }}
        />
      ) : null}
    </div>
  );
}

interface Item { id: string; title: string; meta?: string }

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// A source we can read client-side and store as plain text. Anything else (PDFs, images, docx, …)
// gets an honest "coming soon" instead of a fake/binary upload.
const TEXT_SOURCE_EXT = [".txt", ".md", ".csv"];
const MAX_SOURCE_BYTES = 200 * 1024; // 200KB, matches the task's v1 cap

function formatBytes(n: number | null): string {
  if (n === null) return "";
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

// Sources tab (ChatGPT-Projects "give it more context"): list of this project's sources + an
// "Add sources" modal (drag zone + Upload / Text input / Google Drive-Soon / Slack-Soon tiles).
// Degrades honestly if the project_sources table isn't deployed yet (sourcesEnabled === false).
function ProjectSourcesTab({ projectId, enabled, loadErr, sources, addOpen, onOpenAdd, onCloseAdd, onAdded, onDeleted }: {
  projectId: string;
  enabled: boolean | undefined;
  loadErr: string | null;
  sources: ProjectSource[];
  addOpen: boolean;
  onOpenAdd: () => void;
  onCloseAdd: () => void;
  onAdded: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await deleteProjectSource(id);
      onDeleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't remove this source.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="proj-section">
      <div className="proj-section-head">
        <h3><Icon name="attach" size={14} /> Sources {enabled ? <small>{sources.length}</small> : null}</h3>
        {enabled ? (
          <button type="button" className="proj-add-btn" onClick={onOpenAdd}>+ Add sources</button>
        ) : null}
      </div>

      {err ? <p className="tmpl-note">{err}</p> : null}
      {loadErr ? <p className="tmpl-note">{loadErr}</p> : null}

      {enabled === false ? (
        <p className="proj-empty">Sources isn&rsquo;t enabled on this workspace yet.</p>
      ) : enabled === undefined ? (
        <SkeletonRows count={2} label="Loading sources…" />
      ) : sources.length === 0 ? (
        <div className="proj-sources-empty">
          <p className="proj-empty" style={{ margin: 0 }}>Give PharmaOrb more context for this project.</p>
          <p className="proj-empty" style={{ margin: "2px 0 10px" }}>Upload a short text file or paste notes — every chat in this project can draw on it.</p>
          <button type="button" className="mode" onClick={onOpenAdd}>Add sources</button>
        </div>
      ) : (
        <div className="watch-card-list">
          {sources.map((s) => (
            <div key={s.id} className="watch-card proj-item">
              <span className="proj-item-link" style={{ display: "flex", flex: 1, minWidth: 0, alignItems: "center", gap: 10 }}>
                <Icon name={s.kind === "file" ? "doc" : "attach"} size={16} />
                <span className="watch-card-main">
                  <span className="watch-card-title">{s.name}</span>
                  <span className="watch-card-meta">{s.kind === "file" ? "File" : "Text"} · {formatBytes(s.bytes)} · {shortDate(s.created_at)}</span>
                </span>
              </span>
              <button type="button" className="proj-remove" disabled={busy} onClick={() => void remove(s.id)} title="Delete source">Remove</button>
            </div>
          ))}
        </div>
      )}

      {addOpen ? (
        <AddSourcesModal projectId={projectId} onClose={onCloseAdd} onAdded={onAdded} />
      ) : null}
    </section>
  );
}

// "Add sources" modal: drag zone + 4 source tiles (Upload / Text input / Google Drive-Soon / Slack-Soon),
// matching the ChatGPT Projects modal. Upload v1 only reads plain-text formats client-side (FileReader) —
// anything else gets an honest "coming soon" instead of pretending to ingest it.
function AddSourcesModal({ projectId, onClose, onAdded }: { projectId: string; onClose: () => void; onAdded: () => void }) {
  const [mode, setMode] = useState<"pick" | "text">("pick");
  const [textName, setTextName] = useState("");
  const [textBody, setTextBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function ingestFile(file: File) {
    setErr(null);
    const lower = file.name.toLowerCase();
    if (!TEXT_SOURCE_EXT.some((ext) => lower.endsWith(ext))) {
      setErr("PDF and other formats are coming soon — for now, upload .txt, .md, or .csv.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setErr(`That file is too big (${formatBytes(file.size)}). Keep uploads under 200KB for now.`);
      return;
    }
    setBusy(true);
    try {
      const content = await file.text();
      await createProjectSource({ projectId, kind: "file", name: file.name, content, bytes: file.size });
      onAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add that file.");
    } finally {
      setBusy(false);
    }
  }

  async function saveText() {
    if (busy || !textBody.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await createProjectSource({ projectId, kind: "text", name: textName.trim() || "Pasted text", content: textBody.trim() });
      onAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save this text.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppModal open onClose={onClose} title="Add sources" sub="Upload a small text file or paste notes for this project.">
      {mode === "pick" ? (
        <>
          <label
            className={`proj-source-drop${dragOver ? " drag" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void ingestFile(file);
            }}
          >
            <Icon name="attach" size={20} />
            <span>Drag a file here</span>
            <input
              type="file"
              accept=".txt,.md,.csv,text/plain,text/markdown,text/csv"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void ingestFile(f); }}
            />
          </label>

          {err ? <p className="tmpl-note">{err}</p> : null}
          {busy ? <p className="proj-empty">Adding…</p> : null}

          <div className="proj-source-tiles">
            <label className="proj-source-tile">
              <Icon name="attach" size={18} />
              <span>Upload</span>
              <input
                type="file"
                accept=".txt,.md,.csv,text/plain,text/markdown,text/csv"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void ingestFile(f); }}
              />
            </label>
            <button type="button" className="proj-source-tile" onClick={() => setMode("text")}>
              <Icon name="doc" size={18} />
              <span>Text input</span>
            </button>
            <button type="button" className="proj-source-tile" disabled title="Coming soon">
              <Icon name="folder" size={18} />
              <span>Google Drive <small>Soon</small></span>
            </button>
            <button type="button" className="proj-source-tile" disabled title="Coming soon">
              <Icon name="message" size={18} />
              <span>Slack <small>Soon</small></span>
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="menu-label" htmlFor="src-name">Name</label>
          <input id="src-name" className="watch-add-input" value={textName} maxLength={200}
            onChange={(e) => setTextName(e.target.value)} placeholder="e.g. Study protocol notes" />
          <label className="menu-label" htmlFor="src-body" style={{ marginTop: 10 }}>Text</label>
          <textarea id="src-body" className="watch-add-input" value={textBody} rows={8} maxLength={20000}
            onChange={(e) => setTextBody(e.target.value)} placeholder="Paste the context you want this project to use…" />
          {err ? <p className="tmpl-note">{err}</p> : null}
          <div className="confirm-actions" style={{ marginTop: 12 }}>
            <button type="button" className="confirm-cancel" onClick={() => setMode("pick")} disabled={busy}>Back</button>
            <button type="button" className="mode" onClick={() => void saveText()} disabled={busy || !textBody.trim()}>{busy ? "Saving…" : "Add"}</button>
          </div>
        </>
      )}
    </AppModal>
  );
}

// Settings modal: rename, description, per-project instructions, delete. Instructions persist only once
// the 20260703120000 migration is applied; before then updateProject() reports back instructionsPersisted:
// false and the modal stays open with an honest note instead of closing as if everything saved.
function ProjectSettings({ project, onClose, onSaved, onPartialSave, onDeleted }: {
  project: Project;
  onClose: () => void;
  onSaved: (next: Project) => void;
  onPartialSave: (next: Project) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [instructions, setInstructions] = useState(project.instructions ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (saving || !name.trim()) return;
    setSaving(true);
    setErr(null);
    const trimmedName = name.trim();
    const trimmedDescription = description.trim() || null;
    const trimmedInstructions = instructions.trim() || null;
    const instructionsChanged = trimmedInstructions !== (project.instructions ?? null);
    try {
      const { instructionsPersisted } = await updateProject(project.id, { name: trimmedName, description: trimmedDescription, instructions: trimmedInstructions });
      if (instructionsChanged && !instructionsPersisted) {
        // Migration not applied yet: name/description landed, but instructions did not. Keep the modal
        // open and say so honestly instead of closing as if everything saved. Do NOT propagate the
        // unpersisted instructions to parent state as if they were saved.
        setErr("Saved — but project instructions aren't active yet on your account. They'll start working after the next upgrade.");
        onPartialSave({ ...project, name: trimmedName, description: trimmedDescription });
        setSaving(false);
        return;
      }
      onSaved({ ...project, name: trimmedName, description: trimmedDescription, instructions: trimmedInstructions });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t save.");
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    setSaving(true);
    try {
      await deleteProject(project.id);
      onDeleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t delete this project.");
      setSaving(false);
    }
  }

  return (
    <div className="confirm-overlay" role="presentation" onClick={onClose}>
      <div className="confirm-card" role="dialog" aria-modal="true" aria-label="Project settings" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, textAlign: "left" }}>
        <h3 className="confirm-title">Project settings</h3>
        <label className="menu-label" htmlFor="proj-name">Name</label>
        <input id="proj-name" className="watch-add-input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        <label className="menu-label" htmlFor="proj-desc" style={{ marginTop: 10 }}>Description</label>
        <input id="proj-desc" className="watch-add-input" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder="Optional — what this workspace is for" />
        <label className="menu-label" htmlFor="proj-instr" style={{ marginTop: 10 }}>Instructions</label>
        <textarea id="proj-instr" className="watch-add-input" value={instructions} maxLength={1000} rows={3}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Set context for how PharmaOrb approaches questions in this project" />
        {err ? <p className="tmpl-note">{err}</p> : null}
        <div className="confirm-actions" style={{ marginTop: 14, justifyContent: "space-between" }}>
          <button type="button" className="confirm-del" onClick={() => setConfirmDel(true)} disabled={saving}>Delete project</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="confirm-cancel" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" className="mode" onClick={() => void save()} disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
        {confirmDel ? (
          <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <p className="confirm-body">Delete “{project.name}”? Its chats, reports, and watches are kept — they just leave this project.</p>
            <div className="confirm-actions">
              <button type="button" className="confirm-cancel" onClick={() => setConfirmDel(false)} disabled={saving}>Keep</button>
              <button type="button" className="confirm-del" onClick={() => void del()} disabled={saving}>Delete</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
