"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";

type Org = { id: string; name: string; role: string };

type Props = {
  currentOrgId: string;
  currentOrgName: string;
  orgs: Org[];
};

export function OrgSwitcher({ currentOrgId, currentOrgName, orgs }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        <span>{currentOrgName}</span>
        <span className="text-neutral-500">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-xl">
          {orgs.map((org) => (
            <Link
              key={org.id}
              href={`/app/orgs/${org.id}/wallet`}
              onClick={() => setOpen(false)}
              className={`block px-3 py-2 text-sm hover:bg-neutral-800 ${org.id === currentOrgId ? "bg-neutral-800/50 font-medium text-white" : "text-neutral-300"}`}
            >
              {org.name}
              {org.id === currentOrgId && " (current)"}
            </Link>
          ))}
          <Link
            href="/app/orgs/new"
            onClick={() => setOpen(false)}
            className="mt-1 block border-t border-neutral-800 px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            + Create organisation
          </Link>
        </div>
      )}
    </div>
  );
}
