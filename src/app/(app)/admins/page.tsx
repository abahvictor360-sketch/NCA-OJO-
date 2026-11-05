"use client";

import { useEffect, useState } from "react";
import { Copy, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { PageHeader, useAdmin } from "@/components/Shell";
import { Avatar, Empty, Modal, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

type AdminRow = { email: string; full_name: string | null; role: "super_admin" | "admin"; created_at: string };

export default function AdminsPage() {
  const me = useAdmin();
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<AdminRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const { data, error } = await supabase().from("admins").select("*").order("created_at");
    if (error) return setError(error.message);
    setRows(data as AdminRow[]);
  };
  useEffect(() => {
    load();
  }, []);

  if (me.role !== "super_admin") return <Empty>Only the super admin can manage admins.</Empty>;

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";

  async function remove(r: AdminRow) {
    const { error } = await supabase().from("admins").delete().eq("email", r.email);
    setRemoving(null);
    if (error) return setError(error.message);
    load();
  }

  async function setRole(r: AdminRow, role: AdminRow["role"]) {
    const { error } = await supabase().from("admins").update({ role }).eq("email", r.email);
    if (error) return setError(error.message);
    load();
  }

  return (
    <>
      <PageHeader title="Admins" subtitle="People who can sign in and take attendance">
        <button className="btn-primary btn-md" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Add Admin
        </button>
      </PageHeader>

      {error && <p className="mb-4 rounded-xl bg-brand-red-soft px-4 py-3 text-sm text-brand-red">{error}</p>}

      <div className="card mb-4 text-sm">
        <p className="font-medium">How a new admin gets in</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Add their email here.</li>
          <li>
            Send them the login link. They tap <b className="text-ink">First time? Create password</b> and choose a password.
          </li>
          <li>If asked, they confirm their email from the message Supabase sends, then sign in.</li>
        </ol>
        <button
          className="btn-outline btn-sm mt-3"
          onClick={() => {
            navigator.clipboard?.writeText(loginUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Copy className="size-3.5" /> {copied ? "Copied" : "Copy login link"}
        </button>
      </div>

      <div className="card p-0">
        {!rows ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  <th className="th pl-4">Admin</th>
                  <th className="th">Role</th>
                  <th className="th">Added</th>
                  <th className="th pr-4" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const self = r.email === me.email.toLowerCase();
                  return (
                    <tr key={r.email}>
                      <td className="td pl-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={r.full_name || r.email} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {r.full_name || r.email.split("@")[0]} {self && <span className="text-xs text-muted">(you)</span>}
                            </p>
                            <p className="truncate text-xs text-muted">{r.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="td">
                        {self ? (
                          <span className="pill-info">
                            <ShieldCheck className="size-3" /> Super admin
                          </span>
                        ) : (
                          <select
                            className="input w-auto py-1.5 text-xs"
                            value={r.role}
                            onChange={(e) => setRole(r, e.target.value as AdminRow["role"])}
                          >
                            <option value="admin">Admin</option>
                            <option value="super_admin">Super admin</option>
                          </select>
                        )}
                      </td>
                      <td className="td whitespace-nowrap text-muted">{formatDate(r.created_at.slice(0, 10))}</td>
                      <td className="td pr-4 text-right">
                        {!self && (
                          <button className="btn-outline btn-sm text-brand-red" onClick={() => setRemoving(r)}>
                            <Trash2 className="size-3.5" /> Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addOpen && (
        <AddAdmin
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            load();
          }}
        />
      )}

      {removing && (
        <Modal title="Remove admin?" onClose={() => setRemoving(null)}>
          <p className="text-sm text-muted">
            {removing.email} will no longer be able to see or change anything. Attendance they recorded stays.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-outline btn-md" onClick={() => setRemoving(null)}>
              Cancel
            </button>
            <button className="btn-danger btn-md" onClick={() => remove(removing)}>
              Remove
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function AddAdmin({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "super_admin">("admin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase()
      .from("admins")
      .insert({ email: email.trim().toLowerCase(), full_name: name.trim() || null, role });
    setBusy(false);
    if (error) return setError(error.code === "23505" ? "That email is already an admin." : error.message);
    onAdded();
  }

  return (
    <Modal title="Add admin" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted">Email</span>
          <input className="input" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pastor John" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted">Role</span>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as "admin" | "super_admin")}>
            <option value="admin">Admin: attendance, members, follow-ups, reports</option>
            <option value="super_admin">Super admin: all of that, plus managing admins</option>
          </select>
        </label>
        {error && <p className="text-sm text-brand-red">{error}</p>}
        <button className="btn-primary btn-md w-full" disabled={busy}>
          Add admin
        </button>
      </form>
    </Modal>
  );
}
