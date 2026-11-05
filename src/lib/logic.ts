"use client";

/** Attendance rules, computed on the device so they work offline. Mirrors the SQL functions in supabase/migrations. */

import { getAll, newId, remove, upsert } from "@/lib/store";
import type { Member, ReportRow, Service } from "@/lib/utils";

export type Attendance = { service_id: string; member_id: string; marked_by?: string | null; marked_at?: string };
export type FollowUp = {
  id: string;
  service_id: string;
  member_id: string;
  done: boolean;
  note: string | null;
  done_by: string | null;
  done_at: string | null;
  created_at: string;
};
export type ServiceSummary = Service & { present: number; absent: number };

/** Lock a service and create a follow-up for every active member who was not marked present */
export async function closeService(service: Service) {
  const [members, att, fus] = await Promise.all([
    getAll<Member>("members"),
    getAll<Attendance>("attendance"),
    getAll<FollowUp>("follow_ups"),
  ]);
  const present = new Set(att.filter((a) => a.service_id === service.id).map((a) => a.member_id));
  const existing = new Map(fus.filter((f) => f.service_id === service.id).map((f) => [f.member_id, f]));
  const now = new Date().toISOString();

  const toCreate = members
    .filter((m) => m.active && m.joined_on <= service.service_date && !present.has(m.id) && !existing.has(m.id))
    .map((m) => ({ id: newId(), service_id: service.id, member_id: m.id, done: false, note: null, done_by: null, done_at: null, created_at: now }));
  await upsert("follow_ups", toCreate, { onConflict: "service_id,member_id", ignoreDuplicates: true });

  // Members marked present after a reopen should not keep an open follow-up
  for (const f of existing.values()) {
    if (present.has(f.member_id) && !f.done) await remove("follow_ups", { id: f.id });
  }

  await upsert("services", { ...service, closed: true, closed_at: now });
  return toCreate.length + [...existing.values()].filter((f) => !present.has(f.member_id)).length;
}

export async function reopenService(service: Service) {
  await upsert("services", { ...service, closed: false, closed_at: null });
}

export function serviceSummaries(services: Service[], att: Attendance[], fus: FollowUp[]): ServiceSummary[] {
  const p = new Map<string, number>();
  const a = new Map<string, number>();
  for (const x of att) p.set(x.service_id, (p.get(x.service_id) ?? 0) + 1);
  for (const x of fus) a.set(x.service_id, (a.get(x.service_id) ?? 0) + 1);
  return [...services]
    .sort((x, y) => y.service_date.localeCompare(x.service_date))
    .map((s) => ({ ...s, present: p.get(s.id) ?? 0, absent: a.get(s.id) ?? 0 }));
}

/** Per member: services counted, attended, missed, missed in a row, last attended */
export function memberReport(
  members: Member[],
  services: Service[],
  att: Attendance[],
  from?: string | null,
  to?: string | null,
): ReportRow[] {
  const closed = services.filter((s) => s.closed);
  const dateOf = new Map(services.map((s) => [s.id, s.service_date]));
  const inRange = closed.filter((s) => (!from || s.service_date >= from) && (!to || s.service_date <= to));
  const inRangeIds = new Set(inRange.map((s) => s.id));

  const attendedByMember = new Map<string, Set<string>>();
  for (const a of att) {
    if (!attendedByMember.has(a.member_id)) attendedByMember.set(a.member_id, new Set());
    attendedByMember.get(a.member_id)!.add(a.service_id);
  }

  return members.map((m) => {
    const mine = attendedByMember.get(m.id) ?? new Set<string>();
    const counted = inRange.filter((s) => s.service_date >= m.joined_on);
    const attended = [...mine].filter((id) => inRangeIds.has(id)).length;
    let last: string | null = null;
    for (const id of mine) {
      const d = dateOf.get(id);
      if (d && (!last || d > last)) last = d;
    }
    const streak = closed.filter((s) => s.service_date >= m.joined_on && s.service_date > (last ?? "1900-01-01")).length;
    return {
      member_id: m.id,
      full_name: m.full_name,
      phone: m.phone,
      active: m.active,
      services_count: counted.length,
      attended,
      missed: Math.max(counted.length - attended, 0),
      current_streak: streak,
      last_attended: last,
    };
  });
}
