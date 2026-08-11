// Turn the parts of an interrupted recording back into one file.
//
// This is the second half of the durability feature. `recording-durable-capture.ts` writes parts
// to storage WHILE the lecture is happening, so that closing the tab cannot erase what already
// landed; this route is what makes those parts reachable again afterwards. Without it the bytes
// are safe and unreachable, which from the student's side is indistinguishable from lost.
//
// 🔴 IT DOES EXACTLY ONE THING: join the parts and write the result. It deliberately does NOT
// create the job, the artifact or the Library note. The client posts the assembled path to
// /api/recordings/jobs afterwards — the same route a normal finish uses — so a recovered
// recording travels the identical, already-proven pipeline rather than a parallel one that can
// drift away from it.
//
// 🔴 IT NEVER TOUCHES THE MICROPHONE, and nothing here can start a recording. Recovering audio
// that was already captured and reopening a capture are different operations, and conflating
// them would mean a student who came back to a crashed tab found themselves live on air.

import { NextRequest } from "next/server";

import { adminClient, json, verifyBearer } from "@/lib/server";
import { supabaseUrl, serviceRoleKey } from "@/lib/env";
import { RECORDING_MAX_BYTES } from "@/lib/workspace/recording-capture";
import { isOwnedPath } from "@/lib/workspace/recording-manifest";

export const runtime = "nodejs";

const BUCKET = "recordings";

/** A ceiling on how many objects one recovery will fetch. Three hours at the 20-second part
 *  cadence is 540 parts; this leaves room above that without letting a malformed request ask
 *  the server to make ten thousand storage reads. */
const MAX_PARTS = 1_200;

interface PartInput {
  index: number;
  path: string;
}

/** The parts named by the client, cleaned up and put in playing order.
 *
 *  🔴 THE ORDER COMES FROM THE INDEX, NOT FROM THE ARRAY. A client that listed its parts in the
 *  wrong order would otherwise produce a file that plays and is scrambled, which is the failure
 *  mode nobody traces back to an upload. */
function readParts(raw: unknown): PartInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_PARTS) return null;
  const parts: PartInput[] = [];
  for (const entry of raw) {
    const index = Math.round(Number((entry as { index?: unknown })?.index));
    const path = typeof (entry as { path?: unknown })?.path === "string" ? (entry as { path: string }).path : "";
    if (!Number.isFinite(index) || index < 0 || !path) return null;
    parts.push({ index, path });
  }
  return parts.sort((a, b) => a.index - b.index);
}

export async function POST(req: NextRequest) {
  const auth = await verifyBearer(req);
  if (!auth) return json({ error: "Sign in to recover this recording." }, 401);
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Recording processing is not configured yet." }, 503);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const targetPath = typeof body.targetPath === "string" ? body.targetPath.trim() : "";
  const contentType = typeof body.contentType === "string" ? body.contentType.trim() : "audio/webm";
  const parts = readParts(body.parts);

  if (!parts) return json({ error: "That recovery request is not valid." }, 400);

  // 🔴 The same ownership rule the bucket's RLS enforces, applied here because this route reads
  // with the service role and therefore bypasses that RLS. A path from the request body is never
  // trusted: without this check, naming someone else's object would hand back their audio.
  if (!isOwnedPath(targetPath, auth.id) || parts.some((part) => !isOwnedPath(part.path, auth.id))) {
    return json({ error: "That recording does not belong to this account." }, 403);
  }

  // 🔴 Part 0 carries the container header — WebM's EBML header, MP4's moov box. Without it the
  // joined bytes are undecodable, and assembling them anyway would produce a file that uploads
  // cleanly, transcribes to nothing, and reads to the student as "Nemesis lost my lecture" with
  // no error anywhere to explain it.
  if (parts[0]!.index !== 0) {
    return json({ error: "The beginning of that recording was never saved, so it cannot be rebuilt." }, 422);
  }

  const admin = adminClient();
  const chunks: Buffer[] = [];
  let total = 0;
  const missing: number[] = [];

  for (const part of parts) {
    const { data, error } = await admin.storage.from(BUCKET).download(part.path);
    if (error || !data) {
      // A part that is gone is a gap, not a failure: the audio either side of it still plays,
      // and the decoder resynchronises at the next cluster. Recorded so the response can say so.
      missing.push(part.index);
      continue;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    total += buffer.byteLength;
    if (total > RECORDING_MAX_BYTES) {
      return json({ error: "That recording is too long to rebuild in one piece." }, 413);
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return json({ error: "None of that recording could be found." }, 404);
  if (missing.includes(0)) {
    return json({ error: "The beginning of that recording was never saved, so it cannot be rebuilt." }, 422);
  }

  const assembled = Buffer.concat(chunks);
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(targetPath, assembled, { contentType, upsert: true });
  if (uploadError) return json({ error: "That recording could not be rebuilt. Try again in a moment." }, 502);

  return json({
    bytes: assembled.byteLength,
    // Named so the caller can tell the student the recording has a skip in it rather than
    // letting them discover it in a transcript three days later.
    missingParts: missing,
    parts: chunks.length,
    storagePath: targetPath,
  });
}

/** Forget the parts of a recording the student threw away.
 *
 *  Separate from the assemble path on purpose: discarding is the one operation here that
 *  destroys audio, and it should never be reachable as a side effect of trying to recover. */
export async function DELETE(req: NextRequest) {
  const auth = await verifyBearer(req);
  if (!auth) return json({ error: "Sign in first." }, 401);
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Not configured." }, 503);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const parts = readParts(body.parts);
  if (!parts) return json({ error: "That request is not valid." }, 400);
  if (parts.some((part) => !isOwnedPath(part.path, auth.id))) {
    return json({ error: "That recording does not belong to this account." }, 403);
  }

  await adminClient().storage.from(BUCKET).remove(parts.map((part) => part.path));
  return json({ removed: parts.length });
}
