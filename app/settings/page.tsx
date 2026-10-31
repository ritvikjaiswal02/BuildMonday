import type { Metadata } from "next";
import { NoProduct } from "@/components/settings/NoProduct";
import { ProductSettings } from "@/components/settings/ProductSettings";
import { listProducts } from "@/lib/auth/session";
import { toProductDTO } from "@/lib/db/dto";
import { isUnlimited, limitFor } from "@/lib/plans";
import { loadSettingsContext } from "./_lib/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Product settings" };

export default async function ProductSettingsPage() {
  const { ctx, product, plan, isAdmin } = await loadSettingsContext();
  if (!product) return <NoProduct isAdmin={isAdmin} />;

  const products = await listProducts(ctx.workspace.id);
  const limit = limitFor(plan, "products");
  const canAddProduct = isUnlimited(limit) || products.length < limit;

  return (
    <ProductSettings
      product={toProductDTO(product)}
      plan={plan}
      canEdit={isAdmin}
      canAddProduct={canAddProduct}
      productCount={products.length}
    />
  );
}
