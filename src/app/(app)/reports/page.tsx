"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Loader2, Search } from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { Empty, LineChart, Spinner } from "@/components/ui";
import { fetchReport, fetchServiceSummaries, useTablesVersion, type ServiceSummary } from "@/lib/data";
import { downloadCSV, formatDate, pct, toISODate, type ReportRow } from "@/lib/utils";
import type { ReportFormat } from "@/lib/report";

type Range = "4" | "12" | "52" | "all";
type Sort = "missed" | "streak" | "name";

function rangeStart(r: Range) {
  if (r === "all") return null;
  const d = new Date();
  d.setDate(d.getDate() - Number(r) * 7);
  return toISODate(d);
}

export default function ReportsPage() {
  const [range, setRange] = useState<Range>("12");
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [sort, setSort] = useState<Sort>("missed");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const version = useTablesVersion("members", "services", "attendance", "follow_ups");
  useEffect(() => {
    const from = rangeStart(range);
    Promise.all([fetchReport(from), fetchServiceSummaries(range === "all" ? 520 : Number(range) + 1)])
      .then(([r, s]) => {
        setRows(r.filter((x) => x.active));
        setServices(s.filter((x) => x.closed && (!from || x.service_date >= from)));
      })
      .catch((e) => setError(e.message));
  }, [range, version]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = (rows ?? []).filter((r) => !needle || r.full_name.toLowerCase().includes(needle));
    out.sort((a, b) =>
      sort === "name"
        ? a.full_name.localeCompare(b.full_name)
        : sort === "streak"
          ? b.current_streak - a.current_streak || b.missed - a.missed
          : b.missed - a.missed || b.current_streak - a.current_streak,
    );
    return out;
  }, [rows, q, sort]);

  const chron = [...services].reverse();
  const avg = services.length ? Math.round(services.reduce((s, x) => s + pct(x.present, x.present + x.absent), 0) / services.length) : 0;
  const perfect = (rows ?? []).filter((r) => r.services_count > 0 && r.missed === 0).length;

  return (
    <>
      <PageHeader title="Reports" subtitle="Who missed, how many times, and how many Sundays in a row">
        <select className="input w-auto" value={range} onChange={(e) => setRange(e.target.value as Range)}>
          <option value="4">Last 4 weeks</option>
          <option value="12">Last 12 weeks</option>
          <option value="52">Last year</option>
          <option value="all">All time</option>
        </select>
        <button
          className="btn-outline btn-md"
          disabled={!rows?.length}
          onClick={() =>
            downloadCSV(
              `nca-ojo-attendance-report-${toISODate(new Date())}.csv`,
              list.map((r) => ({
                name: r.full_name,
                phone: r.phone ?? "",
                services: r.services_count,
                attended: r.attended,
                missed: r.missed,
                missed_in_a_row: r.current_streak,
                last_attended: r.last_attended ?? "",
              })),
            )
          }
        >
          <Download className="size-4" /> Export CSV
        </button>
        <ReportMenu from={rangeStart(range)} />
      </PageHeader>

      {error && <p className="mb-4 rounded-xl bg-brand-red-soft px-4 py-3 text-sm text-brand-red">{error}</p>}

      {!rows ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="card">
              <p className="card-title">Average Attendance</p>
              <p className="mt-1 text-3xl font-semibold">{avg}%</p>
              <div className="mt-4">
                <LineChart values={chron.map((s) => pct(s.present, s.present + s.absent))} color="var(--color-sky)" height={70} />
              </div>
            </div>
            <div className="card">
              <p className="card-title">Services in Range</p>
              <p className="mt-1 text-3xl font-semibold">{services.length}</p>
              <p className="mt-4 text-sm text-muted">Only closed services count toward misses.</p>
            </div>
            <div className="card">
              <p className="card-title">Never Missed</p>
              <p className="mt-1 text-3xl font-semibold">{perfect}</p>
              <p className="mt-4 text-sm text-muted">Members present at every service in range.</p>
            </div>
          </div>

          <div className="card p-0">
            <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm font-semibold">Members</p>
              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input className="input pl-9" placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <select className="input sm:w-44" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="missed">Most missed</option>
                <option value="streak">Most in a row</option>
                <option value="name">Name A-Z</option>
              </select>
            </div>
            {list.length === 0 ? (
              <div className="p-4">
                <Empty>No data yet.</Empty>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px]">
                  <thead>
                    <tr>
                      <th className="th pl-4">Name</th>
                      <th className="th text-right">Attended</th>
                      <th className="th text-right">Missed</th>
                      <th className="th text-right">In a row</th>
                      <th className="th pr-4">Last attended</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.member_id} className="hover:bg-canvas/60">
                        <td className="td pl-4">
                          <p className="font-medium">{r.full_name}</p>
                          <p className="text-xs text-muted">{r.phone || ""}</p>
                        </td>
                        <td className="td text-right">
                          {r.attended}
                          <span className="text-muted"> / {r.services_count}</span>
                        </td>
                        <td className="td text-right">{r.missed > 0 ? <span className="pill-bad">{r.missed}</span> : <span className="pill-ok">0</span>}</td>
                        <td className="td text-right">
                          {r.current_streak > 0 ? (
                            <span className={r.current_streak >= 3 ? "pill-bad" : "pill-muted"}>{r.current_streak}</span>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td className="td pr-4 text-muted">{formatDate(r.last_attended)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card p-0">
            <p className="border-b border-line p-4 text-sm font-semibold">Services</p>
            {services.length === 0 ? (
              <div className="p-4">
                <Empty>No closed services in this range.</Empty>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px]">
                  <thead>
                    <tr>
                      <th className="th pl-4">Date</th>
                      <th className="th text-right">Present</th>
                      <th className="th text-right">Absent</th>
                      <th className="th pr-4 text-right">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.id}>
                        <td className="td pl-4">{formatDate(s.service_date, { weekday: "short" })}</td>
                        <td className="td text-right">{s.present}</td>
                        <td className="td text-right text-brand-red">{s.absent}</td>
                        <td className="td pr-4 text-right">{pct(s.present, s.present + s.absent)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Full church report (attendance, follow-ups, finance) as Excel, Word or PDF */
function ReportMenu({ from }: { from: string | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(f: ReportFormat) {
    setBusy(f);
    setError(null);
    try {
      const { exportReport } = await import("@/lib/report");
      await exportReport(f, from, null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the report");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative">
      <button className="btn-primary btn-md" onClick={() => setOpen((o) => !o)}>
        <FileText className="size-4" /> Full Report
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-line bg-white p-1 shadow-lg">
          {(
            [
              ["xlsx", "Excel (.xlsx)", "All sheets + attendance register"],
              ["docx", "Word (.docx)", "Editable document"],
              ["pdf", "PDF (.pdf)", "Ready to print or share"],
            ] as const
          ).map(([f, label, hint]) => (
            <button
              key={f}
              disabled={busy !== null}
              onClick={() => run(f)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-canvas disabled:opacity-60"
            >
              {busy === f ? <Loader2 className="size-4 animate-spin text-navy-600" /> : <Download className="size-4 text-muted" />}
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </button>
          ))}
          {error && <p className="px-3 py-2 text-xs text-brand-red">{error}</p>}
          <p className="border-t border-line px-3 py-2 text-[11px] text-muted">Covers the period selected on this page.</p>
        </div>
      )}
    </div>
  );
}
