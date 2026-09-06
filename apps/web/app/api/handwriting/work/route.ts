// Reading one page of a learner's own written or drawn work, structurally.
//
// A SIBLING of /api/handwriting/analyze — same auth, same upload check, same vision plumbing — and
// a separate route rather than a mode flag on that one, because the two answer different questions
// and therefore return different shapes. `analyze` answers *"what text is on this page"*, for
// dropping into the composer. This answers *"what working is on this page, in what order, ending
// where"*, for judging. A single route returning a union of the two would make every caller branch
// on a field to find out what it got back.
//
// 🔴 THIS ROUTE NEVER RETURNS A VERDICT, A MARK, OR A CORRECTION. Its whole job is to hand back
// what `readWrittenWork` observed. Whether any of it is right is decided by the same Nemesis
// evaluator that already judges typed and spoken answers, after the learner has had the chance to
// fix anything the reading got wrong — see lib/learn/written-response.ts.
import { NextResponse } from "next/server";

import { checkImageUpload } from "@/lib/handwriting/upload";
import { readWrittenWork } from "@/lib/handwriting/written-work";
import { consumeRateLimit } from "@/lib/rate-limit";
import { adminClient, verifyBearer } from "@/lib/server";
import { visionConfigured } from "@/lib/vision/read";

export const runtime = "nodejs";
export const maxDuration = 60;

// One user, one day, this many vision reads. A backstop behind sign-in so one account cannot run a
// paid model in a loop. Counted in Postgres (lib/rate-limit.ts), fails open on a database blip.
const DAILY_LIMIT = 60;
const DAY_SECONDS = 24 * 60 * 60;
const DAILY_LIMIT_REFUSAL = {
  error: { code: "daily_limit", message: "You've reached today's limit for this. It resets tomorrow." },
};

export async function POST(req: Request) {
  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 });

  if (!visionConfigured()) {
    return NextResponse.json(
      { error: "Reading images isn't switched on for this workspace yet." },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Couldn't read that upload. Try again." }, { status: 400 });
  }

  const upload = checkImageUpload(form.get("file"));
  if (!upload.ok) return NextResponse.json({ error: upload.error }, { status: upload.status });

  const rate = await consumeRateLimit("vision:handwriting", user.id, DAILY_LIMIT, DAY_SECONDS);
  if (!rate.allowed) return NextResponse.json(DAILY_LIMIT_REFUSAL, { status: 429 });

  const bytes = new Uint8Array(await upload.file.arrayBuffer());
  const work = await readWrittenWork(bytes, upload.mime, {
    spend: { admin: adminClient(), scope: { operation: "written-work" }, userId: user.id },
  });
  // 🔴 null IS AN INFRASTRUCTURE FAILURE, NOT AN ABSTENTION, and the two must not collapse into
  // one response. A provider outage means we never got a reading and the learner should try again;
  // an abstention means we got one and it says the page could not be made out, which is a 200 with
  // `work.abstained === true` and a reason worth showing them.
  if (!work) {
    return NextResponse.json({ error: "Couldn't read that page. Try again." }, { status: 502 });
  }

  return NextResponse.json({ work });
}
