"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClipboardCheck, PhoneCall } from "lucide-react";
import { PageHeader, useAdmin } from "@/components/Shell";
import { Avatar, Delta, Empty, LineChart, Spinner, SplitBar, Trend } from "@/components/ui";
import { fetchMembers, fetchReport, fetchServiceSummaries, useTablesVersion, type ServiceSummary } from "@/lib/data";
import type { FollowUp } from "@/lib/logic";
import { getAll } from "@/lib/store";
import { formatDate, pct, type Member, type ReportRow } from "@/lib/utils";

type FollowUpRow = { id: string; done: boolean; members: { full_name: string } | null; services: { service_date: string } | null };

export default function OverviewPage() {
  const admin = useAdmin();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [report, setReport] = useState<ReportRow[]>([]);
  const [openFollowUps, setOpenFollowUps] = useState<FollowUpRow[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const version = useTablesVersion("members", "services", "attendance", "follow_ups");

  useEffect(() => {
    (async () => {
      try {
        const [m, s, r, fus, allServices] = await Promise.all([
          fetchMembers(),
          fetchServiceSummaries(12),
          fetchReport(),
          getAll<FollowUp>("follow_ups"),
          fetchServiceSummaries(100000),
        ]);
        const name = new Map(m.map((x) => [x.id, x.full_name]));
        const date = new Map(allServices.map((x) => [x.id, x.service_date]));
        setMembers(m);
        setServices(s);
        setReport(r);
        setOpenFollowUps(
          fus
            .filter((f) => !f.done)
            .sort((x, y) => (date.get(y.service_id) ?? "").localeCompare(date.get(x.service_id) ?? ""))
            .map((f) => ({
              id: f.id,
              done: f.done,
              members: { full_name: name.get(f.member_id) ?? "Removed member" },
              services: { service_date: date.get(f.service_id) ?? "" },
            })),
        );
        setDoneCount(fus.filter((f) => f.done).length);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load data");
      }
    })();
  }, [version]);

  if (error) return <Empty>{error}</Empty>;
  if (!members)
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );

  const active = members.filter((m) => m.active);
  const male = active.filter((m) => m.gender === "male").length;
  const female = active.filter((m) => m.gender === "female").length;
  const closed = services.filter((s) => s.closed);
  const last = closed[0];
  const prev = closed[1];
  const chron = [...closed].reverse();
  const lastRate = last ? pct(last.present, last.present + last.absent) : 0;
  const prevRate = prev ? pct(prev.present, prev.present + prev.absent) : lastRate;
  const streaks = report.filter((r) => r.active && r.current_streak > 0).sort((a, b) => b.current_streak - a.current_streak);
  const atRisk = streaks.filter((r) => r.current_streak >= 3).length;
  const firstName = admin.name.split(" ")[0];

  return (
    <>
      <PageHeader title={`Welcome, ${firstName}`} subtitle="New Creation Assembly Ojo · Overcomers Parish">
        <Link href="/follow-ups/" className="btn-outline btn-md">
          <PhoneCall className="size-4" /> Follow-ups
        </Link>
        <Link href="/attendance/" className="btn-primary btn-md">
          <ClipboardCheck className="size-4" /> Take Attendance
        </Link>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Last service */}
        <section className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="card-title">Last Service</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-3xl font-semibold">{last?.present ?? 0}</span>
                <Delta value={last && prev ? last.present - prev.present : 0} suffix="" />
              </div>
              <p className="mt-0.5 text-xs text-muted">{last ? formatDate(last.service_date, { weekday: "short" }) : "No closed service yet"}</p>
            </div>
            <Link href="/reports/" className="btn-outline btn-sm">Report</Link>
          </div>
          <div className="mt-5">
            <LineChart values={chron.map((s) => s.present)} labels={chron.length > 1 ? [formatDate(chron[0]!.service_date, { year: undefined }), formatDate(chron.at(-1)!.service_date, { year: undefined })] : undefined} />
          </div>
          <div className="mt-4 space-y-2.5 border-t border-line pt-4 text-sm">
            <Row label="Present" value={last?.present ?? 0} trend={last && prev ? last.present - prev.present : 0} />
            <Row label="Absent" value={last?.absent ?? 0} trend={last && prev ? last.absent - prev.absent : 0} invert />
          </div>
        </section>

        {/* Members */}
        <section className="card flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <p className="card-title">Active Members</p>
              <p className="mt-1 text-3xl font-semibold">{active.length}</p>
            </div>
            <Link href="/members/" className="btn-outline btn-sm">Manage</Link>
          </div>
          <div className="mt-5 grid flex-1 grid-cols-3 divide-x divide-line border-t border-line pt-4">
            <Stat label="Male" value={male} total={active.length} color="var(--color-navy-600)" />
            <Stat label="Female" value={female} total={active.length} color="var(--color-brand-red)" />
            <Stat label="Not set" value={active.length - male - female} total={active.length} color="var(--color-sky)" />
          </div>
          <p className="mt-4 text-xs text-muted">{members.length - active.length} inactive members are hidden from attendance.</p>
        </section>

        {/* Attendance rate */}
        <section className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="card-title">Attendance Rate</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-3xl font-semibold">{lastRate}%</span>
                <Delta value={lastRate - prevRate} />
              </div>
            </div>
            <Link href="/reports/" className="btn-outline btn-sm">Details</Link>
          </div>
          <div className="mt-5 space-y-2.5 text-sm">
            <Row label="Services recorded" value={closed.length} />
            <Row label="Average present" value={closed.length ? Math.round(closed.reduce((s, x) => s + x.present, 0) / closed.length) : 0} />
            <Row label="Missed 3+ in a row" value={atRisk} />
          </div>
          <div className="mt-4">
            <LineChart values={chron.map((s) => pct(s.present, s.present + s.absent))} color="var(--color-sky)" height={90} />
          </div>
        </section>

        {/* Follow-ups */}
        <section className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="card-title">Open Follow-ups</p>
              <p className="mt-1 text-3xl font-semibold">{openFollowUps.length}</p>
            </div>
            <Link href="/follow-ups/" className="btn-outline btn-sm">Details</Link>
          </div>
          <div className="mt-5">
            <SplitBar
              parts={[
                { value: openFollowUps.length, color: "var(--color-brand-red)", label: `Open ${openFollowUps.length}` },
                { value: doneCount, color: "var(--color-ok)", label: `Done ${doneCount}` },
              ]}
            />
          </div>
          <ul className="mt-4 space-y-3 border-t border-line pt-4">
            {openFollowUps.slice(0, 4).map((f) => (
              <li key={f.id} className="flex items-center gap-3 text-sm">
                <Avatar name={f.members?.full_name ?? "?"} tone="red" />
                <span className="flex-1 truncate">{f.members?.full_name}</span>
                <span className="text-xs text-muted">{formatDate(f.services?.service_date ?? null, { year: undefined })}</span>
              </li>
            ))}
            {openFollowUps.length === 0 && <li className="text-sm text-muted">Nobody to call. All caught up.</li>}
          </ul>
        </section>

        {/* Missed in a row */}
        <section className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="card-title">Missed in a Row</p>
              <p className="mt-1 text-3xl font-semibold">{streaks.length}</p>
            </div>
            <Link href="/reports/" className="btn-outline btn-sm">View all</Link>
          </div>
          <table className="mt-4 w-full">
            <thead>
              <tr>
                <th className="th pl-0">Member</th>
                <th className="th text-right">In a row</th>
                <th className="th pr-0 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {streaks.slice(0, 5).map((r) => (
                <tr key={r.member_id}>
                  <td className="td pl-0">
                    <span className="block max-w-[11rem] truncate">{r.full_name}</span>
                  </td>
                  <td className="td text-right">
                    <span className={r.current_streak >= 3 ? "pill-bad" : "pill-muted"}>{r.current_streak}</span>
                  </td>
                  <td className="td pr-0 text-right text-muted">{r.missed}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {streaks.length === 0 && <p className="mt-2 text-sm text-muted">Everyone came to the last service.</p>}
        </section>

        {/* Recent services */}
        <section className="card">
          <div className="flex items-start justify-between">
            <p className="card-title">Recent Services</p>
            <Link href="/attendance/" className="btn-outline btn-sm">Open</Link>
          </div>
          <ul className="mt-4 space-y-3">
            {services.slice(0, 6).map((s) => {
              const rate = pct(s.present, s.present + s.absent);
              return (
                <li key={s.id} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-muted">{formatDate(s.service_date, { year: undefined })}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-navy-600" style={{ width: s.closed ? `${rate}%` : "0%" }} />
                  </div>
                  <span className="w-16 shrink-0 text-right">
                    {s.closed ? `${s.present} · ${rate}%` : <span className="pill-info">Open</span>}
                  </span>
                </li>
              );
            })}
            {services.length === 0 && <li className="text-sm text-muted">No services yet. Start with Take Attendance.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}

function Row({ label, value, trend, invert }: { label: string; value: number; trend?: number; invert?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-3">
        <span className="font-medium">{value}</span>
        {trend !== undefined && <span className="w-12 text-right"><Trend value={trend} invert={invert} /></span>}
      </span>
    </div>
  );
}

function Stat({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  return (
    <div className="flex flex-col px-3 first:pl-0 last:pr-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="mt-1 text-xl font-semibold">{pct(value, total)}%</span>
      <span className="mt-auto pt-6 text-xs text-muted">{value} people</span>
      <span className="mt-2 h-1.5 rounded-full" style={{ background: color }} />
    </div>
  );
}
