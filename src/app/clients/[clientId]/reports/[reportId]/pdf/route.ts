import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireClient } from "@/lib/auth";
import { retryIdempotentRequest } from "@/lib/idempotent-insert";
import { renderReportPdf, type ReportPdfData } from "@/lib/report-pdf";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ clientId: string; reportId: string }> }) {
  const { clientId, reportId } = await context.params;
  if (!z.uuid().safeParse(clientId).success || !z.uuid().safeParse(reportId).success) {
    return NextResponse.json({ error: "Invalid report link" }, { status: 400 });
  }
  const { db, client } = await requireClient(clientId);
  const { data: report, error } = await retryIdempotentRequest(async () => db.from("report_snapshots")
    .select("id,campaign_id,report_month,version,status,dataset,dataset_sha256,executive_summary,next_steps,limitations,approved_at,approval_note")
    .eq("client_id", clientId).eq("id", reportId).maybeSingle());
  if (error) return NextResponse.json({ error: "Report unavailable" }, { status: 503 });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (report.status !== "approved" || !report.approved_at || !report.approval_note) {
    return NextResponse.json({ error: "Only approved reports can be downloaded as PDF" }, { status: 409 });
  }
  const { data: campaign, error: campaignError } = await retryIdempotentRequest(async () => db.from("campaigns")
    .select("name").eq("client_id", clientId).eq("id", report.campaign_id).maybeSingle());
  if (campaignError) return NextResponse.json({ error: "Campaign unavailable" }, { status: 503 });
  const pdfInput: ReportPdfData = {
    clientName: client.name,
    campaignName: campaign?.name ?? "Campaign",
    reportMonth: report.report_month,
    version: report.version,
    approvedAt: report.approved_at,
    approvalNote: report.approval_note,
    executiveSummary: report.executive_summary,
    nextSteps: report.next_steps,
    limitations: report.limitations,
    datasetSha256: report.dataset_sha256,
    dataset: report.dataset as ReportPdfData["dataset"],
  };
  try {
    const font = await readFile(join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf"));
    const bytes = await renderReportPdf(pdfInput, font);
    const fileName = `reddsphere-report-${report.report_month.slice(0, 7)}-v${report.version}.pdf`;
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (cause) {
    console.error("Approved report PDF generation failed", cause);
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }
}
