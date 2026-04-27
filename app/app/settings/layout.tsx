import type { ReactNode } from "react";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <section>
      <nav>{/* TODO: settings nav (profile, bank, security, verification, close) */}</nav>
      <div>{children}</div>
    </section>
  );
}
