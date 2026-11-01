import * as React from "react";
import { AppFrame } from "@/components/shell/AppFrame";

export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
