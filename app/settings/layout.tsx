import { AppFrame } from "@/components/shell/AppFrame";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame>
      <div className="space-y-6 lg:space-y-8">
        <PageHeader title="Settings" description="Your product, the sources we check, who hears about problems and where issues go." />
        <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <SettingsNav />
          </aside>
          <div className="min-w-0 max-w-[760px] space-y-6">{children}</div>
        </div>
      </div>
    </AppFrame>
  );
}
