"use client";

import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { Avatar, Empty, Modal, Spinner } from "@/components/ui";
import { fetchMembers, useTablesVersion } from "@/lib/data";
import { getAll, newId, remove as removeRow, upsert } from "@/lib/store";
import { downloadCSV, formatDate, toISODate, type Member } from "@/lib/utils";

type Draft = Omit<Member, "id"> & { id?: string };
const EMPTY: Draft = { full_name: "", phone: "", address: "", email: "", gender: null, notes: "", active: true, joined_on: toISODate(new Date()) };

export default function MembersPage() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"active" | "inactive" | "all">("active");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const version = useTablesVersion("members");
  const load = () => fetchMembers().then(setMembers);
  useEffect(() => {
    load();
  }, [version]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (members ?? []).filter(
      (m) =>
        (show === "all" || (show === "active" ? m.active : !m.active)) &&
        (!needle || m.full_name.toLowerCase().includes(needle) || (m.phone ?? "").includes(needle) || (m.address ?? "").toLowerCase().includes(needle) || (m.email ?? "").toLowerCase().includes(needle)),
    );
  }, [members, q, show]);

  if (!members)
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );

  return (
    <>
      <PageHeader title="Members" subtitle={`${members.filter((m) => m.active).length} active · ${members.length} total`}>
        <button
          className="btn-outline btn-md"
          onClick={() =>
            downloadCSV(
              "nca-ojo-members.csv",
              members.map((m) => ({
                full_name: m.full_name,
                phone: m.phone ?? "",
                address: m.address ?? "",
                email: m.email ?? "",
                gender: m.gender ?? "",
                joined_on: m.joined_on,
                active: m.active ? "yes" : "no",
                notes: m.notes ?? "",
              })),
            )
          }
        >
          <Download className="size-4" /> Export
        </button>
        <button className="btn-outline btn-md" onClick={() => setImportOpen(true)}>
          <Upload className="size-4" /> Import CSV
        </button>
        <button className="btn-primary btn-md" onClick={() => setDraft({ ...EMPTY })}>
          <Plus className="size-4" /> Add Member
        </button>
      </PageHeader>

      <div className="card p-0">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Search name, phone, email or address" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex rounded-xl border border-line p-1 text-xs">
            {(["active", "inactive", "all"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setShow(k)}
                className={`rounded-lg px-3 py-1.5 capitalize ${show === k ? "bg-canvas font-medium text-ink" : "text-muted"}`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {list.length === 0 ? (
          <div className="p-4">
            <Empty>{members.length === 0 ? "No members yet. Add one or import a CSV." : "No match."}</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr>
                  <th className="th pl-4">Name</th>
                  <th className="th">Phone / Email</th>
                  <th className="th">Address</th>
                  <th className="th">Joined</th>
                  <th className="th">Status</th>
                  <th className="th pr-4" />
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id} className="hover:bg-canvas/60">
                    <td className="td pl-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.full_name} tone={m.gender === "female" ? "red" : "navy"} />
                        <span className="whitespace-nowrap font-medium">{m.full_name}</span>
                      </div>
                    </td>
                    <td className="td whitespace-nowrap text-muted">
                      {m.phone || "-"}
                      {m.email && <span className="block text-xs">{m.email}</span>}
                    </td>
                    <td className="td max-w-[16rem] truncate text-muted" title={m.address ?? ""}>{m.address || "-"}</td>
                    <td className="td whitespace-nowrap text-muted">{m.joined_on <= "2000-01-01" ? "Existing" : formatDate(m.joined_on)}</td>
                    <td className="td">{m.active ? <span className="pill-ok">Active</span> : <span className="pill-muted">Inactive</span>}</td>
                    <td className="td pr-4 text-right">
                      <button className="btn-outline btn-sm" onClick={() => setDraft({ ...m })}>
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

      {draft && (
        <MemberForm
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            load();
          }}
        />
      )}
      {importOpen && (
        <ImportDialog
          existing={members}
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false);
            load();
          }}
        />
      )}
    </>
  );
}

function MemberForm({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      full_name: d.full_name.trim(),
      phone: d.phone?.trim() || null,
      address: d.address?.trim() || null,
      email: d.email?.trim().toLowerCase() || null,
      gender: d.gender || null,
      notes: d.notes?.trim() || null,
      active: d.active,
      joined_on: d.joined_on,
    };
    await upsert("members", d.id ? { id: d.id, ...payload } : { id: newId(), ...payload, created_at: new Date().toISOString() });
    setBusy(false);
    onSaved();
  }

  async function remove() {
    if (!d.id) return;
    setBusy(true);
    // Remove this member's attendance and follow-ups on this device too (the server does the same)
    for (const t of ["attendance", "follow_ups"] as const) {
      const rows = await getAll<{ member_id: string }>(t);
      if (rows.some((r) => r.member_id === d.id)) await removeRow(t, { member_id: d.id });
    }
    await removeRow("members", { id: d.id });
    setBusy(false);
    onSaved();
  }

  return (
    <Modal title={d.id ? "Edit member" : "Add member"} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Full name">
          <input className="input" required value={d.full_name} onChange={(e) => setD({ ...d, full_name: e.target.value })} autoFocus />
        </Field>
        <Field label="Phone">
          <input className="input" type="tel" value={d.phone ?? ""} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="0803 000 0000" />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={d.email ?? ""} onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="name@example.com" />
        </Field>
        <Field label="Address">
          <input className="input" value={d.address ?? ""} onChange={(e) => setD({ ...d, address: e.target.value })} placeholder="No 13 Mission Street, Onireke, Ojo" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gender">
            <select className="input" value={d.gender ?? ""} onChange={(e) => setD({ ...d, gender: (e.target.value || null) as Draft["gender"] })}>
              <option value="">Not set</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
          <Field label="Joined on">
            <input className="input" type="date" required value={d.joined_on} onChange={(e) => setD({ ...d, joined_on: e.target.value })} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className="input min-h-20" value={d.notes ?? ""} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} className="size-4 accent-navy-600" />
          Active member (shows on attendance list)
        </label>
        {error && <p className="text-sm text-brand-red">{error}</p>}
        {confirmDelete ? (
          <div className="rounded-xl bg-brand-red-soft p-3 text-sm">
            <p className="font-medium text-brand-red">Delete {d.full_name} for good?</p>
            <p className="mt-1 text-muted">
              Their attendance history and follow-ups are deleted too, and reports change. To keep the history, untick
              &quot;Active member&quot; and save.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="btn-outline btn-sm" onClick={() => setConfirmDelete(false)}>
                Keep member
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

type ParsedRow = { full_name: string; phone: string | null; address: string | null; email: string | null; gender: "male" | "female" | null; joined_on: string };

function ImportDialog({ existing, onClose, onDone }: { existing: Member[]; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parse(file: File) {
    setError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (res) => {
        const names = new Set(existing.map((m) => m.full_name.trim().toLowerCase()));
        const out: ParsedRow[] = [];
        let skip = 0;
        for (const r of res.data) {
          const name = (r.full_name || r.name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "").trim();
          if (!name || names.has(name.toLowerCase())) {
            skip++;
            continue;
          }
          names.add(name.toLowerCase());
          const g = (r.gender || r.sex || "").trim().toLowerCase();
          const joined = (r.joined_on || r.joined || "").trim();
          out.push({
            full_name: name,
            phone: (r.phone || r.phone_number || r.mobile || "").trim() || null,
            address: (r.address || "").trim() || null,
            email: (r.email || r.email_address || "").trim().toLowerCase() || null,
            gender: g.startsWith("m") ? "male" : g.startsWith("f") ? "female" : null,
            joined_on: /^\d{4}-\d{2}-\d{2}$/.test(joined) ? joined : "2000-01-01",
          });
        }
        setRows(out);
        setSkipped(skip);
      },
      error: (err) => setError(err.message),
    });
  }

  async function run() {
    if (!rows?.length) return;
    setBusy(true);
    for (let i = 0; i < rows.length; i += 200) {
      const now = new Date().toISOString();
      await upsert(
        "members",
        rows.slice(i, i + 200).map((r) => ({ id: newId(), active: true, notes: null, created_at: now, ...r })),
      );
      const error = null as { message: string } | null;
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
    }
    onDone();
  }

  return (
    <Modal title="Import members from CSV" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          The first row must be headers. Needed: <code className="rounded bg-canvas px-1">full_name</code> (or{" "}
          <code className="rounded bg-canvas px-1">name</code>). Optional: <code className="rounded bg-canvas px-1">phone</code>, <code className="rounded bg-canvas px-1">address</code>, <code className="rounded bg-canvas px-1">email</code>,{" "}
          <code className="rounded bg-canvas px-1">gender</code>, <code className="rounded bg-canvas px-1">joined_on</code> (YYYY-MM-DD).
          Names already on the list are skipped.
        </p>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && parse(e.target.files[0])} />
        <button className="btn-outline btn-md w-full" onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" /> Choose CSV file
        </button>
        {rows && (
          <div className="rounded-xl bg-canvas p-3">
            <p>
              <b>{rows.length}</b> new members ready{skipped ? `, ${skipped} skipped (blank or duplicate)` : ""}.
            </p>
            <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-muted">
              {rows.slice(0, 50).map((r, i) => (
                <li key={i}>
                  {r.full_name}
                  {r.phone ? ` · ${r.phone}` : ""}
                </li>
              ))}
              {rows.length > 50 && <li>and {rows.length - 50} more</li>}
            </ul>
          </div>
        )}
        {error && <p className="text-brand-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-outline btn-md" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary btn-md" disabled={!rows?.length || busy} onClick={run}>
            {busy ? "Importing..." : `Import ${rows?.length ?? 0}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
