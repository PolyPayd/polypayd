"use client";

import { useMemo, useState } from "react";
import {
  formatAuditEventDataRaw,
  formatAuditEventSummary,
  formatAuditEventTitle,
  resolveAuditActorLabel,
} from "@/lib/batchAuditActivity";
import type { ClerkRecipientProfile } from "@/lib/recipientDisplay";

const PREVIEW_COUNT = 2;

export type BatchAuditEventRow = {
  id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  created_at: string | null;
  actor_user_id: string | null;
};

type Props = {
  events: BatchAuditEventRow[];
  viewerUserId: string | null;
  actorProfiles: Record<string, ClerkRecipientProfile>;
};

export function BatchActivityExpandable({ events, viewerUserId, actorProfiles }: Props) {
  const [expanded, setExpanded] = useState(false);

  const profileMap = useMemo(
    () => new Map<string, ClerkRecipientProfile>(Object.entries(actorProfiles)),
    [actorProfiles]
  );

  const visibleEvents = useMemo(
    () => (expanded ? events : events.slice(0, PREVIEW_COUNT)),
    [expanded, events]
  );

  const canToggle = events.length > PREVIEW_COUNT;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="w-44 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                When
              </th>
              <th className="min-w-[200px] px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                What happened
              </th>
              <th className="w-48 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                Who
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {visibleEvents.map((e) => {
              const summary = formatAuditEventSummary(e.event_type, e.event_data);
              const actorLabel = resolveAuditActorLabel(e.actor_user_id, viewerUserId, profileMap);
              const payloadKeys = Object.keys(e.event_data ?? {});
              const rawPayload = formatAuditEventDataRaw(e.event_data);
              return (
                <tr key={e.id} className="align-top transition-colors hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-4 py-4 text-[#6B7280]">
                    {e.created_at ? (
                      <>
                        <div className="text-sm text-[#F9FAFB]">
                          {new Date(e.created_at).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}
                        </div>
                        <div className="mt-0.5 text-xs text-[#6B7280]">
                          {new Date(e.created_at).toLocaleTimeString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-semibold leading-snug text-[#F9FAFB]">
                      {formatAuditEventTitle(e.event_type)}
                    </div>
                    {summary ? (
                      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[#9CA3AF]">{summary}</p>
                    ) : null}
                    {payloadKeys.length > 0 && (
                      <details className="group mt-3">
                        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-[#6B7280] select-none hover:text-[#9CA3AF]">
                          <span className="inline-block text-[#6B7280] transition-transform group-open:rotate-90">
                            ▸
                          </span>
                          Technical details
                        </summary>
                        <pre className="mt-2 max-w-2xl overflow-x-auto rounded-lg bg-[#0B0F14]/80 p-3 font-mono text-[11px] leading-relaxed text-[#6B7280]">
                          {rawPayload}
                        </pre>
                      </details>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm leading-snug text-[#9CA3AF]">{actorLabel}</td>
                </tr>
              );
            })}

            {!events.length && (
              <tr>
                <td className="px-4 py-12 text-center text-[#6B7280]" colSpan={3}>
                  <p className="text-sm font-medium text-[#9CA3AF]">No activity yet</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#6B7280]">
                    Actions such as funding, claims, and approvals will appear here.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canToggle ? (
        <div className="border-t border-white/[0.04] px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-sm font-medium text-[#3B82F6] transition-colors hover:text-[#60A5FA]"
          >
            {expanded ? "See less" : "See more"}
          </button>
        </div>
      ) : null}
    </>
  );
}
