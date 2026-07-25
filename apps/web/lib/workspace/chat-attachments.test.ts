import assert from "node:assert/strict";
import test from "node:test";

import { groupChatAttachments } from "./chat-attachments";

function attachment(name: string, path = ""): File {
  return {
    lastModified: 1,
    name,
    type: "text/plain",
    webkitRelativePath: path,
  } as File;
}

test("folder selections render as one attachment group", () => {
  const files = [
    attachment("week-1.md", "Cardiology/week-1.md"),
    attachment("week-2.md", "Cardiology/notes/week-2.md"),
    attachment("outline.pdf"),
  ];

  const groups = groupChatAttachments(files);

  assert.deepEqual(groups.map(({ kind, label, files: children }) => ({ kind, label, count: children.length })), [
    { kind: "folder", label: "Cardiology", count: 2 },
    { kind: "file", label: "outline.pdf", count: 1 },
  ]);
});

test("different selected folders remain separate", () => {
  const groups = groupChatAttachments([
    attachment("a.md", "Cardiology/a.md"),
    attachment("b.md", "Neurology/b.md"),
  ]);

  assert.deepEqual(groups.map(({ key, label }) => ({ key, label })), [
    { key: "folder:Cardiology", label: "Cardiology" },
    { key: "folder:Neurology", label: "Neurology" },
  ]);
});
