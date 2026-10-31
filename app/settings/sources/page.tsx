import type { Metadata } from "next";
import { NoProduct } from "@/components/settings/NoProduct";
import { SourcesManager } from "@/components/settings/SourcesManager";
import { toSourceDTO } from "@/lib/db/dto";
import { listProductSources } from "@/app/api/sources/_lib/service";
import { loadSettingsContext } from "../_lib/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sources" };

export default async function SourcesSettingsPage() {
  const { ctx, product, plan, isAdmin } = await loadSettingsContext();
  if (!product) return <NoProduct isAdmin={isAdmin} />;
  const rows = await listProductSources(ctx.workspace.id, product.id);
  return (
    <SourcesManager
      productId={product.id}
      productName={product.name}
      sources={rows.map(toSourceDTO)}
      plan={plan}
      canEdit={isAdmin}
    />
  );
}
