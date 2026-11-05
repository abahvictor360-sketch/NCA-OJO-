"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader, useAdmin } from "@/components/Shell";
import { Empty, Modal, Spinner, SplitBar } from "@/components/ui";
import { fetchMembers, useTablesVersion } from "@/lib/data";
import { getAll, newId, remove as removeRow, upsert } from "@/lib/store";
import { downloadCSV, formatDate, toISODate, type Member } from "@/lib/utils";

type Kind = "income" | "expense";
type Entry = {
  id: string;
  entry_date: string;
  kind: Kind;
  category: string;
  amount: number;
  member_id: string | null;
  description: string | null;
  recorded_by: string | null;
};

const CATEGORIES: Record<Kind, string[]> = {
  income: ["Tithe", "Offering", "Thanksgiving", "Donation", "Pledge / Seed", "Other income"],
  expense: ["Welfare", "Utilities", "Rent", "Maintenance", "Transport", "Media", "Events", "Other expense"],
};

const COLORS = [
  "var(--color-navy-600)",
  "var(--color-sky)",
  "var(--color-ok)",
  "var(--color-peach)",
  "var(--color-brand-red)",
  "#8b5cf6",
  "#94a3b8",
  "#f59e0b",
];

type Period = "this-month" | "last-month" | "3-months" | "this-year" | "all";

function periodRange(p: Period): [string | null, string | null] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (p === "this-month") return [toISODate(new Date(y, m, 1)), toISODate(new Date(y, m + 1, 0))];
  if (p === "last-month") return [toISODate(new Date(y, m - 1, 1)), toISODate(new Date(y, m, 0))];
  if (p === "3-months") return [toISODate(new Date(y, m - 2, 1)), toISODate(new Date(y, m + 1, 0))];
  if (p === "this-year") return [toISODate(new Date(y, 0, 1)), toISODate(new Date(y, 11, 31))];
  return [null, null];
}

const naira = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(n);

export default function FinancePage() {
  const [period, setPeriod] = useState<Period>("this-month");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [show, setShow] = useState<"all" | Kind>("all");
  const [editing, setEditing] = useState<Partial<Entry> | null>(null);
  const [error] = useState<string | null>(null);

  const load = async () => {
    const [from, to] = periodRange(period);
    const all = await getAll<Entry & { created_at?: string }>("finance_entries");
    setEntries(
      all
        .filter((e) => (!from || e.entry_date >= from) && (!to || e.entry_date <= to))
        .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || (b.created_at ?? "").localeCompare(a.created_at ?? ""))
        .map((e) => ({ ...e, amount: Number(e.amount) })),
    );
  };

  const version = useTablesVersion("finance_entries");
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, version]);

  useEffect(() => {
    fetchMembers().then(setMembers);
  }, []);

  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.full_name])), [members]);

  const totals = useMemo(() => {
    const byCat = { income: new Map<string, number>(), expense: new Map<string, number>() };
    let income = 0;
    let expense = 0;
    for (const e of entries ?? []) {
      if (e.kind === "income") income += e.amount;
      else expense += e.amount;
      byCat[e.kind].set(e.category, (byCat[e.kind].get(e.category) ?? 0) + e.amount);
    }
    const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    return { income, expense, balance: income - expense, incomeCats: sorted(byCat.income), expenseCats: sorted(byCat.expense) };
  }, [entries]);

  const list = (entries ?? []).filter((e) => show === "all" || e.kind === show);

  return (
    <>
      <PageHeader title="Finance" subtitle="Tithe, offering and other income, plus church expenses">
        <select className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          <option value="this-month">This month</option>
          <option value="last-month">Last month</option>
          <option value="3-months">Last 3 months</option>
          <option value="this-year">This year</option>
          <option value="all">All time</option>
        </select>
        <button
          className="btn-outline btn-md"
          disabled={!entries?.length}
          onClick={() =>
            downloadCSV(
              `nca-ojo-finance-${period}-${toISODate(new Date())}.csv`,
              (entries ?? []).map((e) => ({
                date: e.entry_date,
                type: e.kind,
                category: e.category,
                amount: e.amount,
                member: e.member_id ? memberName.get(e.member_id) ?? "" : "",
                description: e.description ?? "",
                recorded_by: e.recorded_by ?? "",
              })),
            )
          }
        >
          <Download className="size-4" /> Export
        </button>
        <button className="btn-outline btn-md" onClick={() => setEditing({ kind: "expense", entry_date: toISODate(new Date()), category: "Welfare" })}>
          <Minus className="size-4" /> Expense
        </button>
        <button className="btn-primary btn-md" onClick={() => setEditing({ kind: "income", entry_date: toISODate(new Date()), category: "Offering" })}>
          <Plus className="size-4" /> Income
        </button>
      </PageHeader>

      {error && <p className="mb-4 rounded-xl bg-brand-red-soft px-4 py-3 text-sm text-brand-red">{error}</p>}

      {!entries ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard title="Total Income" amount={totals.income} cats={totals.incomeCats} highlight={["Tithe", "Offering"]} />
            <SummaryCard title="Total Expenses" amount={totals.expense} cats={totals.expenseCats} />
            <div className="card sm:col-span-2 lg:col-span-1">
              <p className="card-title">Balance</p>
              <p className={`mt-1 break-words text-2xl font-semibold tabular-nums xl:text-3xl ${totals.balance < 0 ? "text-brand-red" : ""}`}>{naira(totals.balance)}</p>
              <div className="mt-5 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Income</span>
                  <span className="font-medium text-ok">{naira(totals.income)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Expenses</span>
                  <span className="font-medium text-brand-red">- {naira(totals.expense)}</span>
                </div>
                <div className="flex justify-between border-t border-line pt-2.5">
                  <span className="text-muted">Entries</span>
                  <span className="font-medium">{entries.length}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-0">
            <div className="flex items-center justify-between border-b border-line p-4">
              <p className="text-sm font-semibold">Entries</p>
              <div className="flex rounded-xl border border-line p-1 text-xs">
                {(["all", "income", "expense"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setShow(k)}
                    className={`rounded-lg px-3 py-1.5 capitalize ${show === k ? "bg-canvas font-medium text-ink" : "text-muted"}`}
                  >
                    {k === "expense" ? "Expenses" : k}
                  </button>
                ))}
              </div>
            </div>
            {list.length === 0 ? (
              <div className="p-4">
                <Empty>No entries for this period. Use Income or Expense to record one.</Empty>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr>
                      <th className="th pl-4">Date</th>
                      <th className="th">Category</th>
                      <th className="th">Details</th>
                      <th className="th text-right">Amount</th>
                      <th className="th pr-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((e) => (
                      <tr key={e.id} className="hover:bg-canvas/60">
                        <td className="td whitespace-nowrap pl-4 text-muted">{formatDate(e.entry_date)}</td>
                        <td className="td whitespace-nowrap">
                          <span className={e.kind === "income" ? "pill-ok" : "pill-bad"}>{e.category}</span>
                        </td>
                        <td className="td max-w-[18rem]">
                          {e.member_id && <p className="truncate font-medium">{memberName.get(e.member_id) ?? "Removed member"}</p>}
                          <p className="truncate text-xs text-muted">{e.description || (e.member_id ? "" : "-")}</p>
                        </td>
                        <td className={`td whitespace-nowrap text-right font-medium ${e.kind === "income" ? "text-ok" : "text-brand-red"}`}>
                          {e.kind === "expense" ? "- " : ""}
                          {naira(e.amount)}
                        </td>
                        <td className="td pr-4 text-right">
                          <button className="btn-outline btn-sm" onClick={() => setEditing(e)}>
                            <Pencil className="size-3.5" /> Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <EntryForm
          entry={editing}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function SummaryCard({ title, amount, cats, highlight = [] }: { title: string; amount: number; cats: [string, number][]; highlight?: string[] }) {
  const shown = [...highlight.map((h) => [h, cats.find(([c]) => c === h)?.[1] ?? 0] as [string, number]), ...cats.filter(([c]) => !highlight.includes(c))];
  return (
    <div className="card">
      <p className="card-title">{title}</p>
      <p className="mt-1 break-words text-2xl font-semibold tabular-nums xl:text-3xl">{naira(amount)}</p>
      <div className="mt-5">
        <SplitBar parts={shown.map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length]! }))} />
      </div>
      <ul className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
        {shown.slice(0, 5).map(([c, v]) => (
          <li key={c} className="flex justify-between gap-3">
            <span className="text-muted">{c}</span>
            <span className="font-medium">{naira(v)}</span>
          </li>
        ))}
        {shown.length === 0 && <li className="text-muted">Nothing recorded yet.</li>}
      </ul>
    </div>
  );
}

function EntryForm({
  entry,
  members,
  onClose,
  onSaved,
}: {
  entry: Partial<Entry>;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<Partial<Entry>>(entry);
  const [amount, setAmount] = useState(entry.amount ? String(entry.amount) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const kind = d.kind ?? "income";
  const me = useAdmin();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(/[,\s₦]/g, ""));
    if (!Number.isFinite(value) || value <= 0) return setError("Enter an amount above 0.");
    setBusy(true);
    const payload = {
      entry_date: d.entry_date,
      kind,
      category: d.category,
      amount: value,
      member_id: d.member_id || null,
      description: d.description?.trim() || null,
    };
    await upsert(
      "finance_entries",
      d.id ? { id: d.id, ...payload } : { id: newId(), ...payload, recorded_by: me.email, created_at: new Date().toISOString() },
    );
    setBusy(false);
    onSaved();
  }

  async function remove() {
    setBusy(true);
    await removeRow("finance_entries", { id: d.id! });
    setBusy(false);
    onSaved();
  }

  return (
    <Modal title={`${d.id ? "Edit" : "Record"} ${kind === "income" ? "income" : "expense"}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="flex rounded-xl border border-line p-1 text-sm">
          {(["income", "expense"] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setD({ ...d, kind: k, category: CATEGORIES[k][0], member_id: k === "expense" ? null : d.member_id })}
              className={`flex-1 rounded-lg px-3 py-1.5 capitalize ${kind === k ? "bg-canvas font-medium text-ink" : "text-muted"}`}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">Date</span>
            <input className="input" type="date" required value={d.entry_date ?? ""} onChange={(e) => setD({ ...d, entry_date: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">Amount (₦)</span>
            <input className="input" inputMode="decimal" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5,000" />
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted">Category</span>
          <select className="input" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })}>
            {CATEGORIES[kind].map((c) => (
              <option key={c}>{c}</option>
            ))}
            {d.category && !CATEGORIES[kind].includes(d.category) && <option>{d.category}</option>}
          </select>
        </label>
        {kind === "income" && (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">Member (optional, e.g. whose tithe)</span>
            <select className="input" value={d.member_id ?? ""} onChange={(e) => setD({ ...d, member_id: e.target.value || null })}>
              <option value="">General / not linked to a member</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted">Description</span>
          <input
            className="input"
            value={d.description ?? ""}
            onChange={(e) => setD({ ...d, description: e.target.value })}
            placeholder={kind === "income" ? "Sunday service offering" : "Generator fuel"}
          />
        </label>
        {error && <p className="text-sm text-brand-red">{error}</p>}
        {confirmDelete ? (
          <div className="rounded-xl bg-brand-red-soft p-3 text-sm">
            <p className="font-medium text-brand-red">Delete this entry for good?</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="btn-outline btn-sm" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
              <button type="button" className="btn-danger btn-sm" disabled={busy} onClick={remove}>
                <Trash2 className="size-3.5" /> Yes, delete
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 pt-2">
            {d.id && (
              <button type="button" className="btn-outline btn-md text-brand-red" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" /> Delete
              </button>
            )}
            <span className="flex-1" />
            <button type="button" className="btn-outline btn-md" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary btn-md" disabled={busy}>
              Save
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
