import { supabase } from "@/lib/supabase/client";
import type { Member, ReportRow, Service } from "@/lib/utils";

export type ServiceSummary = Service & { present: number; absent: number };

export async function fetchMembers(activeOnly = false) {
  let q = supabase().from("members").select("*").order("full_name").range(0, 4999);
  if (activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Member[];
}

/** Services newest first, with present count and follow-up (absent) count */
export async function fetchServiceSummaries(limit = 52) {
  const { data, error } = await supabase()
    .from("services")
    .select("id, service_date, closed, closed_at, attendance(count), follow_ups(count)")
    .order("service_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  type Row = Service & { attendance: { count: number }[]; follow_ups: { count: number }[] };
  return ((data ?? []) as Row[]).map(({ attendance, follow_ups, ...s }) => ({
    ...s,
    present: attendance[0]?.count ?? 0,
    absent: follow_ups[0]?.count ?? 0,
  })) as ServiceSummary[];
}

export async function fetchReport(from?: string | null, to?: string | null) {
  const { data, error } = await supabase().rpc("member_report", { p_from: from || null, p_to: to || null });
  if (error) throw error;
  return (data ?? []) as ReportRow[];
}
