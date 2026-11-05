"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, MessageCircle, Phone, Search } from "lucide-react";
import { PageHeader, useAdmin } from "@/components/Shell";
import { Avatar, Empty, Spinner } from "@/components/ui";
import { fetchReport } from "@/lib/data";
import { supabase } from "@/lib/supabase/client";
import { formatDate, whatsappNumber, type ReportRow } from "@/lib/utils";

type FollowUp = {
  id: string;
  done: boolean;
  note: string | null;
  done_by: string | null;
  done_at: string | null;
  member_id: string;
  members: { full_name: string; phone: string | null } | null;
  services: { service_date: string } | null;
};

export default function FollowUpsPage() {
  const admin = useAdmin();
  const [items, setItems] = useState<FollowUp[] | null>(null);
  const [stats, setStats] = useState<Map<string, ReportRow>>(new Map());
  const [show, setShow] = useState<"open" | "done">("open");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(null);
    (async () => {
      const [{ data, error }, report] = await Promise.all([
        supabase()
          .from("follow_ups")
          .select("id, done, note, done_by, done_at, member_id, members(full_name, phone), services(service_date)")
          .eq("done", show === "done")
          .order("created_at", { ascending: false })
          .range(0, 1999),
        fetchReport(),
      ]);
      if (error) return setError(error.message);
      setItems((data ?? []) as unknown as FollowUp[]);
      setStats(new Map(report.map((r) => [r.member_id, r])));
    })();
  }, [show]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const g = new Map<string, FollowUp[]>();
    for (const f of items ?? []) {
      if (needle && !(f.members?.full_name ?? "").toLowerCase().includes(needle)) continue;
      const k = f.services?.service_date ?? "";
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(f);
    }
    for (const list of g.values()) list.sort((a, b) => (a.members?.full_name ?? "").localeCompare(b.members?.full_name ?? ""));
    return [...g.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [items, q]);

  async function update(f: FollowUp, patch: Partial<FollowUp>) {
    const full = {
      ...patch,
      ...(patch.done !== undefined
        ? { done_by: patch.done ? admin.email : null, done_at: patch.done ? new Date().toISOString() : null }
        : {}),
    };
    setItems((list) => (list ?? []).map((x) => (x.id === f.id ? { ...x, ...full } : x)));
    const { error } = await supabase().from("follow_ups").update(full).eq("id", f.id);
    if (error) setError(error.message);
  }

  const openCount = items?.filter((f) => !f.done).length ?? 0;

  return (
    <>
      <PageHeader
        title="Follow-ups"
        subtitle="Everyone who missed a closed service. Call or message, add a note, then mark done."
      >
        <div className="flex rounded-xl border border-line p-1 text-xs">
          {(["open", "done"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setShow(k)}
              className={`rounded-lg px-3 py-1.5 capitalize ${show === k ? "bg-canvas font-medium text-ink" : "text-muted"}`}
            >
              {k}
            </button>
          ))}
        </div>
      </PageHeader>

      {error && <p className="mb-4 rounded-xl bg-brand-red-soft px-4 py-3 text-sm text-brand-red">{error}</p>}

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input className="input pl-9" placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!items ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : groups.length === 0 ? (
        <Empty>{show === "open" ? "No open follow-ups. Everyone has been contacted." : "Nothing marked done yet."}</Empty>
      ) : (
        <div className="space-y-6">
          {show === "open" && <p className="text-sm text-muted">{openCount} people to contact</p>}
          {groups.map(([date, list]) => (
            <section key={date} className="card p-0">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="text-sm font-semibold">Missed {formatDate(date, { weekday: "short" })}</p>
                <span className="pill-bad">{list.length}</span>
              </div>
              <ul>
                {list.map((f) => (
                  <FollowUpItem key={f.id} f={f} stat={stats.get(f.member_id)} onUpdate={(p) => update(f, p)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function FollowUpItem({ f, stat, onUpdate }: { f: FollowUp; stat?: ReportRow; onUpdate: (p: Partial<FollowUp>) => void }) {
  const [note, setNote] = useState(f.note ?? "");
  const wa = whatsappNumber(f.members?.phone ?? null);
  const name = f.members?.full_name ?? "Unknown";

  return (
    <li className="flex flex-col gap-3 border-t border-line px-4 py-3 first:border-t-0 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={name} tone="red" />
        <div className="min-w-0">
          <p className={`truncate text-sm font-medium ${f.done ? "text-muted line-through" : ""}`}>{name}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span>{f.members?.phone || "No phone"}</span>
            {stat && stat.current_streak > 1 && <span className="pill-bad">{stat.current_streak} in a row</span>}
            {stat && <span>{stat.missed} missed in total</span>}
          </p>
        </div>
      </div>
      <input
        className="input md:w-64"
        placeholder="Note (e.g. travelled, sick)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (f.note ?? "") && onUpdate({ note: note || null })}
      />
      <div className="flex items-center gap-2">
        {f.members?.phone && (
          <a href={`tel:${f.members.phone}`} className="btn-outline btn-sm" title="Call">
            <Phone className="size-3.5" /> Call
          </a>
        )}
        {wa && (
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="btn-outline btn-sm" title="WhatsApp">
            <MessageCircle className="size-3.5" /> WhatsApp
          </a>
        )}
        <button
          onClick={() => onUpdate({ done: !f.done })}
          className={f.done ? "btn-outline btn-sm" : "btn-primary btn-sm"}
        >
          <Check className="size-3.5" /> {f.done ? "Undo" : "Done"}
        </button>
      </div>
    </li>
  );
}
