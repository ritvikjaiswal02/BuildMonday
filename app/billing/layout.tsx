import { AppFrame } from "@/components/shell/AppFrame";

export const dynamic = "force-dynamic";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
