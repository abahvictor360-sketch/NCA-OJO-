"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Lock, LockOpen, Search, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { Avatar, Empty, Modal, Spinner } from "@/components/ui";
import { fetchMembers, useTablesVersion } from "@/lib/data";
import { closeService as closeLocal, reopenService, type Attendance } from "@/lib/logic";
import { getAll, newId, remove, upsert } from "@/lib/store";
import { formatDate, lastSunday, pct, type Member, type Service } from "@/lib/utils";

type Filter = "all" | "present" | "absent";

/** Same id for the same Sunday on every device, so two phones starting offline end up with one service */
function serviceIdFor(date: string) {
  return `00000000-0000-4000-8000-0000${date.replace(/-/g, "")}`;
}

export default function AttendancePage() {
  const router = useRouter();
  const [date, setDate] = useState(lastSunday());
  const [service, setService] = useState<Service | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Changes from other devices arrive through sync and bump this version
  const version = useTablesVersion("services", "attendance", "members");

  const load = useCallback(async () => {
    setError(null);
    const [services, all, att] = await Promise.all([getAll<Service>("services"), fetchMembers(true), getAll<Attendance>("attendance")]);
    const svc = services.find((s) => s.service_date === date) ?? null;
    setMembers(all.filter((m) => m.joined_on <= date));
    setPresent(new Set(svc ? att.filter((r) => r.service_id === svc.id).map((r) => r.member_id) : []));
    setService(svc);
  }, [date]);

  useEffect(() => {
    load();
  }, [load, version]);

  async function startService() {
    setBusy(true);
    const svc: Service = { id: serviceIdFor(date), service_date: date, closed: false, closed_at: null };
    await upsert("services", { ...svc, created_at: new Date().toISOString() }, { onConflict: "service_date", ignoreDuplicates: true });
    setBusy(false);
    setService(svc);
  }

  async function toggle(id: string) {
    if (!service || service.closed) return;
    const was = present.has(id);
    setPresent((s) => {
      const n = new Set(s);
      if (was) n.delete(id);
      else n.add(id);
      return n;
    });
    if (was) await remove("attendance", { service_id: service.id, member_id: id });
    else
      await upsert(
        "attendance",
        { service_id: service.id, member_id: id, marked_at: new Date().toISOString() },
        { ignoreDuplicates: true },
      );
  }

  async function closeService() {
    if (!service) return;
    setBusy(true);
    await closeLocal(service);
    setBusy(false);
    setConfirmClose(false);
    router.push("/follow-ups/");
  }

  async function reopen() {
    if (!service) return;
    await reopenService(service);
    setService({ ...service, closed: false, closed_at: null });
  }

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return members.filter((m) => {
      if (needle && !m.full_name.toLowerCase().includes(needle) && !(m.phone ?? "").includes(needle)) return false;
      if (filter === "present") return present.has(m.id);
      if (filter === "absent") return !present.has(m.id);
      return true;
    });
  }, [members, present, q, filter]);

  const groups = useMemo(() => {
    const g = new Map<string, Member[]>();
    for (const m of visible) {
      const k = /[a-z]/i.test(m.full_name[0] ?? "") ? m.full_name[0]!.toUpperCase() : "#";
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(m);
    }
    return [...g.entries()];
  }, [visible]);

  const count = members.filter((m) => present.has(m.id)).length;
  const total = members.length;

  return (
    <>
      <PageHeader title="Take Attendance" subtitle={formatDate(date, { weekday: "long", month: "long" })}>
        <input type="date" className="input w-auto" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        {service && !service.closed && (
          <button className="btn-primary btn-md" onClick={() => setConfirmClose(true)}>
            <Lock className="size-4" /> Close Service
          </button>
        )}
        {service?.closed && (
          <button className="btn-outline btn-md" onClick={reopen}>
            <LockOpen className="size-4" /> Reopen
          </button>
        )}
      </PageHeader>

      {error && (
        <p className="mb-4 rounded-xl bg-brand-red-soft px-4 py-3 text-sm text-brand-red" onClick={() => setError(null)}>
          {error}
        </p>
      )}

      {service === undefined ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : service === null ? (
        <div className="card mx-auto max-w-md text-center">
          <p className="card-title">No attendance yet for this date</p>
          <p className="mt-1 text-lg font-semibold">{formatDate(date, { weekday: "long", month: "long" })}</p>
          <p className="mt-2 text-sm text-muted">{total} active members will be on the list.</p>
          <button className="btn-primary btn-md mt-5 w-full" onClick={startService} disabled={busy}>
            Start attendance
          </button>
        </div>
      ) : (
        <>
          {/* Counter */}
          <div className="card mb-4 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="card-title">Present</p>
              <p className="mt-1 text-3xl font-semibold">
                {count} <span className="text-base font-normal text-muted">/ {total}</span>
                <span className="pill-info ml-2 align-middle">{pct(count, total)}%</span>
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas">
                <div className="h-full rounded-full bg-navy-600 transition-all" style={{ width: `${pct(count, total)}%` }} />
              </div>
            </div>
            <div className="text-sm sm:w-48 sm:text-right">
              {service.closed ? (
                <span className="pill-muted">
                  <Lock className="size-3" /> Closed
                </span>
              ) : (
                <span className="pill-ok">Open · tap names to mark</span>
              )}
              <p className="mt-2 text-muted">{total - count} not marked</p>
            </div>
          </div>

          {/* Controls */}
          <div className="sticky top-[53px] z-20 -mx-4 mb-3 space-y-3 bg-white px-4 py-2 sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-7 lg:px-7">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input className="input pl-9" placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {!service.closed && (
                <button className="btn-outline btn-md" onClick={() => setAddOpen(true)} title="Add new member">
                  <UserPlus className="size-4" />
                  <span className="hidden sm:inline">New member</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              <div className="flex shrink-0 rounded-xl border border-line p-1 text-xs">
                {(["all", "present", "absent"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    className={`rounded-lg px-3 py-1.5 capitalize ${filter === k ? "bg-canvas font-medium text-ink" : "text-muted"}`}
                  >
                    {k === "absent" ? "Not marked" : k}
                  </button>
                ))}
              </div>
              <div className="flex gap-0.5">
                {groups.map(([letter]) => (
                  <a
                    key={letter}
                    href={`#letter-${letter}`}
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-xs text-muted hover:bg-canvas hover:text-ink"
                  >
                    {letter}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Names */}
          {visible.length === 0 ? (
            <Empty>{total === 0 ? "No active members yet. Add members first." : "No names match."}</Empty>
          ) : (
            <div className="space-y-5">
              {groups.map(([letter, list]) => (
                <section key={letter} id={`letter-${letter}`} className="scroll-mt-40">
                  <p className="mb-2 text-xs font-semibold text-muted">{letter}</p>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((m) => {
                      const on = present.has(m.id);
                      return (
                        <button
                          key={m.id}
                          onClick={() => toggle(m.id)}
                          disabled={service.closed}
                          className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors disabled:cursor-default ${
                            on ? "border-navy-600 bg-navy-50" : "border-line bg-white hover:bg-canvas"
                          }`}
                        >
                          <Avatar name={m.full_name} tone={on ? "navy" : "sky"} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{m.full_name}</span>
                            {m.phone && <span className="block truncate text-xs text-muted">{m.phone}</span>}
                          </span>
                          <span
                            className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${
                              on ? "border-navy-600 bg-navy-600 text-white" : "border-line"
                            }`}
                          >
                            {on && <Check className="size-3.5" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {confirmClose && service && (
        <Modal title="Close this service?" onClose={() => setConfirmClose(false)}>
          <p className="text-sm text-muted">
            {count} present, <b className="text-brand-red">{total - count} absent</b>. A follow-up will be created for each absent member.
            You can reopen later to correct mistakes.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-outline btn-md" onClick={() => setConfirmClose(false)}>
              Cancel
            </button>
            <button className="btn-primary btn-md" onClick={closeService} disabled={busy}>
              Close and create follow-ups
            </button>
          </div>
        </Modal>
      )}

      {addOpen && service && (
        <QuickAdd
          date={date}
          onClose={() => setAddOpen(false)}
          onAdded={async (m) => {
            setAddOpen(false);
            setMembers((list) => [...list, m].sort((a, b) => a.full_name.localeCompare(b.full_name)));
            await toggle(m.id);
          }}
        />
      )}
    </>
  );
}

function QuickAdd({ date, onClose, onAdded }: { date: string; onClose: () => void; onAdded: (m: Member) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Enter a name.");
    const m: Member = {
      id: newId(),
      full_name: name.trim(),
      phone: phone.trim() || null,
      email: null,
      address: null,
      gender: null,
      notes: null,
      active: true,
      joined_on: date,
    };
    await upsert("members", { ...m, created_at: new Date().toISOString() });
    onAdded(m);
  }

  return (
    <Modal title="Add new member and mark present" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <input className="input" placeholder="Full name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="Phone (optional)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        {error && <p className="text-sm text-brand-red">{error}</p>}
        <button className="btn-primary btn-md w-full">Add and mark present</button>
      </form>
    </Modal>
  );
}
