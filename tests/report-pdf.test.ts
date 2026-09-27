import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { renderReportPdf, type ReportPdfData } from "../src/lib/report-pdf";

const report: ReportPdfData = {
  clientName: "Example Analytics",
  campaignName: "Autumn community pilot",
  reportMonth: "2026-09-01",
  version: 2,
  approvedAt: "2026-09-27T08:30:00Z",
  approvalNote: "Checked the saved observations and limitations against the source notes.",
  executiveSummary: "The same tracked item increased from 100 to 140 recorded lifetime views. This is an observed counter change, not unique reach or a causal claim.",
  nextSteps: "Continue monitoring the same item and record any changes in campaign coverage.",
  limitations: "Only manual Reddit observations are included. GA4, search, and AI-provider data were unavailable for this version.",
  datasetSha256: "a".repeat(64),
  dataset: {
    calculation_version: "reddit-lifetime-v1",
    campaign_version: 1,
    timezone: "Asia/Kolkata",
    baseline_dates: ["2026-08-01", "2026-08-31"],
    comparison_dates: ["2026-09-01", "2026-09-26"],
    baseline: { observations: 1, items: 1, measured_items: 1, latest_lifetime_views: 100 },
    comparison: { observations: 2, items: 2, measured_items: 1, latest_lifetime_views: 140 },
    matched: { items: 1, baseline_views: 100, comparison_views: 140, change: 40 },
    evidence_snapshot_ids: ["one", "two", "three"],
    campaign_event_ids: [],
    coverage_note: "The PDF and JSON use the same frozen dataset. One item has unknown views.",
  },
};

describe("approved report PDF", () => {
  it("produces a readable PDF from the frozen snapshot and paginates long notes", async () => {
    const font = await readFile(join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf"));
    const bytes = await renderReportPdf({ ...report, executiveSummary: `${report.executiveSummary} `.repeat(35) }, font);
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThan(1);
    expect(parsed.getTitle()).toContain("Example Analytics");
    if (process.env.RENDER_PDF_QA === "1") {
      await mkdir(join(process.cwd(), "tmp", "pdfs"), { recursive: true });
      await writeFile(join(process.cwd(), "tmp", "pdfs", "report-qa.pdf"), bytes);
    }
  });
});
