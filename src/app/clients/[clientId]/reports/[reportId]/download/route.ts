import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";

export async function GET(_request: NextRequest, context: { params: Promise<{ clientId: string; reportId: string }> }) {
  const { clientId, reportId } = await context.params;
  const { db } = await requireClient(clientId);
  const { data: report, error } = await retryIdempotentRequest(async () => db.from("report_snapshots")
    .select("id,client_id,campaign_id,report_month,version,status,calculation_version,dataset,dataset_sha256,executive_summary,next_steps,limitations,created_at,approved_at,approval_note")
    .eq("client_id",clientId).eq("id",reportId).maybeSingle());
  if (error) return NextResponse.json({ error: "Report unavailable" }, { status: 503 });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const fileName = `reddsphere-report-${report.report_month.slice(0,7)}-v${report.version}.json`;
  return new NextResponse(JSON.stringify(report,null,2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
