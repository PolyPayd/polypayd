import type { ReactNode } from "react";

// TODO: gate with Clerk auth check
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <aside>{/* TODO: app sidebar nav */}</aside>
      <main>{children}</main>
    </div>
  );
}
