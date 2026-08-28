// 展間五個獨立頁面的「我要估車」頁——公開表單，不用登入就能送出，讓有
// 意賣車／換車的顧客主動留下聯絡方式，車行後台鈴鐺會即時收到通知（見
// trade-in-actions.ts）。表單本體（TradeInForm）用 useActionState，是
// 唯一需要 client 互動的部分，這個頁面本身維持 Server Component。
import { createClient } from "@/lib/supabase/server";
import { loadShowroomTenant } from "@/lib/supabase/public-tenant";
import { ShowroomEmptyState } from "../_components/showroom-empty-state";
import { ShowroomShell } from "../_components/showroom-shell";
import { TradeInForm } from "../_components/trade-in-form";

export default async function InventoryTradeInPage({
  searchParams,
}: PageProps<"/inventory/trade-in">) {
  const { tenant: tenantIdParam } = await searchParams;
  const supabase = await createClient();
  const { tenant, emptyMessage } = await loadShowroomTenant(supabase, tenantIdParam);

  if (!tenant) {
    return <ShowroomEmptyState message={emptyMessage!} />;
  }

  return (
    <ShowroomShell tenant={tenant} tenantId={tenant.id} active="tradeIn">
      <TradeInForm tenantId={tenant.id} />
    </ShowroomShell>
  );
}
