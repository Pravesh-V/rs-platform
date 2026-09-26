import { requireClient } from "@/lib/auth";
import { evidence } from "@/lib/data";
import { evidenceCsv } from "@/lib/csv";

export async function GET(request: Request, context: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await context.params;
  const { db, role } = await requireClient(clientId);
  if (!["owner","manager","researcher","writer","reviewer"].includes(role)) return new Response("Forbidden", { status: 403 });
  const dataset = await evidence(db, clientId);
  if (dataset.truncated) return new Response("Export exceeds the current 10,000-record safety cap. Narrow or split the dataset.", { status: 409 });
  const requestedCampaign = new URL(request.url).searchParams.get("campaign");
  const { data: campaigns } = await db.from("campaigns").select("id").eq("client_id",clientId).order("created_at",{ ascending:false });
  const campaignId = campaigns?.some((row) => row.id === requestedCampaign) ? requestedCampaign : campaigns?.[0]?.id;
  const items = campaignId ? dataset.items.filter((item) => item.campaign_id === campaignId) : dataset.items;
  const ids = new Set(items.map((item) => item.id));
  const snapshots = dataset.snapshots.filter((item) => ids.has(item.item_id));
  return new Response("\uFEFF" + evidenceCsv(items,snapshots), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="reddsphere-evidence-${clientId}.csv"`, "Cache-Control": "private, no-store" },
  });
}
