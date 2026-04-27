import type { ReactNode } from "react";

// TODO: restrict to allowlisted emails via proxy.ts
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <aside>{/* TODO: admin sidebar nav */}</aside>
      <main>{children}</main>
    </div>
  );
}
