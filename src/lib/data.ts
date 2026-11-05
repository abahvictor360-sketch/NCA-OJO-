"use client";

/** Read helpers. All reads come from the local database on this device (see store.ts). */

import { useSyncExternalStore } from "react";
import { getAll, subscribe, versionOf, type Table } from "@/lib/store";
import { memberReport, serviceSummaries, type Attendance, type FollowUp, type ServiceSummary } from "@/lib/logic";
import type { Member, Service } from "@/lib/utils";

export type { ServiceSummary };

export async function fetchMembers(activeOnly = false) {
  const all = (await getAll<Member>("members")).sort((a, b) => a.full_name.localeCompare(b.full_name));
  return activeOnly ? all.filter((m) => m.active) : all;
}

/** Services newest first, with present count and follow-up (absent) count */
export async function fetchServiceSummaries(limit = 52) {
  const [s, a, f] = await Promise.all([getAll<Service>("services"), getAll<Attendance>("attendance"), getAll<FollowUp>("follow_ups")]);
  return serviceSummaries(s, a, f).slice(0, limit);
}

export async function fetchReport(from?: string | null, to?: string | null) {
  const [m, s, a] = await Promise.all([getAll<Member>("members"), getAll<Service>("services"), getAll<Attendance>("attendance")]);
  return memberReport(m, s, a, from, to);
}

/** Re-render when any of these local tables change (use it in an effect's dependency list) */
export function useTablesVersion(...tables: Table[]) {
  return useSyncExternalStore(
    subscribe,
    () => tables.map((t) => versionOf(t)).join("."),
    () => "0",
  );
}
