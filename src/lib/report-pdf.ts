import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";

type Period = { observations: number; items: number; measured_items: number; latest_lifetime_views: number | null };
export type ReportPdfData = {
  clientName: string;
  campaignName: string;
  reportMonth: string;
  version: number;
  approvedAt: string;
  approvalNote: string;
  executiveSummary: string;
  nextSteps: string;
  limitations: string;
  datasetSha256: string;
  dataset: {
    calculation_version: string;
    campaign_version: number;
    timezone: string;
    baseline_dates: [string, string];
    comparison_dates: [string, string];
    baseline: Period;
    comparison: Period;
    matched: { items: number; baseline_views: number | null; comparison_views: number | null; change: number | null };
    evidence_snapshot_ids: string[];
    campaign_event_ids: string[];
    coverage_note: string;
  };
};

const ink = rgb(0.08, 0.12, 0.18);
const muted = rgb(0.38, 0.42, 0.48);
const red = rgb(0.69, 0.12, 0.17);
const pale = rgb(0.97, 0.95, 0.94);
const width = 595.28;
const height = 841.89;
const left = 48;
const right = width - left;
const contentWidth = right - left;
const bottom = 68;

function clean(value: string): string {
  return value.normalize("NFC").replace(/[^\P{C}\n\t]/gu, " ").replace(/\t/g, "    ");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of clean(text).split(/\r?\n/)) {
    if (!paragraph.trim()) { lines.push(""); continue; }
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const character of word) {
        const next = `${line}${character}`;
        if (line && font.widthOfTextAtSize(next, size) > maxWidth) { lines.push(line); line = character; }
        else line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

const displayNumber = (value: number | null) => value === null ? "Unknown" : new Intl.NumberFormat("en").format(value);

export async function renderReportPdf(report: ReportPdfData, fontBytes: Uint8Array): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(fontBytes, { subset: true });
  document.setTitle(`${report.clientName} - ${report.reportMonth.slice(0, 7)} evidence report`);
  document.setAuthor("ReddSphere");
  document.setSubject("Approved internal campaign evidence snapshot");
  let page!: PDFPage;
  let y!: number;

  function newPage() {
    page = document.addPage([width, height]);
    page.drawRectangle({ x: 0, y: height - 12, width, height: 12, color: red });
    page.drawRectangle({ x: left, y: height - 53, width: 30, height: 30, color: red });
    page.drawText("R", { x: left + 8, y: height - 46, size: 16, font, color: rgb(1, 1, 1) });
    page.drawText("ReddSphere", { x: left + 40, y: height - 47, size: 14, font, color: ink });
    page.drawText("APPROVED INTERNAL REPORT", { x: right - 171, y: height - 45, size: 7.5, font, color: red });
    page.drawLine({ start: { x: left, y: height - 67 }, end: { x: right, y: height - 67 }, thickness: 0.6, color: rgb(0.82, 0.83, 0.84) });
    y = height - 94;
  }
  function ensure(space: number) { if (y - space < bottom) newPage(); }
  function line(text: string, size = 10, color = ink, gap = 15) {
    const lines = wrap(text, font, size, contentWidth);
    for (const value of lines) {
      ensure(gap);
      if (value) page.drawText(value, { x: left, y, size, font, color });
      y -= gap;
    }
  }
  function section(title: string, body: string) {
    ensure(55);
    y -= 13;
    line(title.toUpperCase(), 9, red, 15);
    y -= 2;
    line(body, 10, ink, 15);
  }
  newPage();
  line(report.clientName, 23, ink, 29);
  line(`${report.campaignName} | ${report.reportMonth.slice(0, 7)} | Version ${report.version}`, 10, muted, 18);
  line(`Approved ${new Date(report.approvedAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`, 9, muted, 16);
  y -= 14;
  ensure(116);
  page.drawRectangle({ x: left, y: y - 110, width: contentWidth, height: 110, color: pale });
  const columns = [left + 14, left + 183, left + 350];
  const metrics = [
    { title: "BASELINE VIEWS", value: displayNumber(report.dataset.baseline.latest_lifetime_views), detail: `${report.dataset.baseline.measured_items}/${report.dataset.baseline.items} measured items` },
    { title: "COMPARISON VIEWS", value: displayNumber(report.dataset.comparison.latest_lifetime_views), detail: `${report.dataset.comparison.measured_items}/${report.dataset.comparison.items} measured items` },
    { title: "MATCHED CHANGE", value: report.dataset.matched.change === null ? "Unknown" : `${report.dataset.matched.change >= 0 ? "+" : ""}${displayNumber(report.dataset.matched.change)}`, detail: `${report.dataset.matched.items} matched items` },
  ];
  metrics.forEach((metric, index) => {
    page.drawText(metric.title, { x: columns[index], y: y - 25, size: 8, font, color: red });
    let valueSize = 22;
    while (valueSize > 11 && font.widthOfTextAtSize(metric.value, valueSize) > 150) valueSize -= 1;
    page.drawText(metric.value, { x: columns[index], y: y - 62, size: valueSize, font, color: ink });
    page.drawText(metric.detail, { x: columns[index], y: y - 86, size: 8.5, font, color: muted });
  });
  y -= 122;
  line(`Baseline: ${report.dataset.baseline_dates.join(" to ")} | Comparison: ${report.dataset.comparison_dates.join(" to ")} | ${report.dataset.timezone}`, 9, muted, 14);
  line(report.dataset.coverage_note, 8.5, muted, 13);
  section("Executive summary", report.executiveSummary);
  section("Recommended next steps", report.nextSteps);
  section("Material limitations", report.limitations);
  section("Approval record", report.approvalNote);
  section("Evidence and reproducibility", `${report.dataset.evidence_snapshot_ids.length} observation IDs and ${report.dataset.campaign_event_ids.length} intervention IDs are frozen in the matching evidence JSON. Calculation ${report.dataset.calculation_version}, campaign definition version ${report.dataset.campaign_version}. The PDF displays that saved dataset and does not recalculate current records.`);
  section("Dataset SHA-256", report.datasetSha256);

  const pages = document.getPages();
  pages.forEach((current, index) => {
    current.drawLine({ start: { x: left, y: 53 }, end: { x: right, y: 53 }, thickness: 0.5, color: rgb(0.82, 0.83, 0.84) });
    current.drawText("Internal evidence snapshot - not proof of causation or unique reach", { x: left, y: 37, size: 7.5, font, color: muted });
    const count = `${index + 1} / ${pages.length}`;
    current.drawText(count, { x: right - font.widthOfTextAtSize(count, 7.5), y: 37, size: 7.5, font, color: muted });
  });
  return document.save();
}
