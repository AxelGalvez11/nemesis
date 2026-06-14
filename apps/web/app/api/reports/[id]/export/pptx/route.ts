import type { CitationStyle, ResearchReport } from "@pharmabro/shared";
import { json, userClient, verifyBearer } from "@/lib/server";
import { reportToPptx } from "@/lib/export/pptx";

export const runtime = "nodejs";
export const maxDuration = 60;

function styleOf(req: Request, report: ResearchReport): CitationStyle {
  const q = new URL(req.url).searchParams.get("style");
  if (q === "ama" || q === "vancouver") return q;
  return report.citation_style ?? "vancouver";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await verifyBearer(req);
  if (!user) return json({ error: "authentication required" }, 401);
  const { id } = await ctx.params;

  const { data, error } = await userClient(req)
    .from("saved_reports")
    .select("payload,title")
    .eq("id", id)
    .eq("kind", "deep_research")
    .maybeSingle();
  if (error) return json({ error: "report read failed" }, 500);
  if (!data?.payload) return json({ error: "report not found" }, 404);

  const report = data.payload as unknown as ResearchReport;
  const buffer = await reportToPptx(report, styleOf(req, report));
  const filename = safeFilename((data.title as string) ?? "evidence-report", "pptx");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function safeFilename(title: string, ext: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "report";
  return `${base}.${ext}`;
}
