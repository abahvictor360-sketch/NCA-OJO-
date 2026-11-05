"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Plus, Send, ShieldCheck, Trash2 } from "lucide-react";
import { PageHeader, useAdmin } from "@/components/Shell";
import { Avatar, Empty, Modal, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { sync } from "@/lib/store";
import { formatDate, inviteLink } from "@/lib/utils";

/** Copy text, also where the clipboard API is missing (older phones, in-app browsers) */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function inviteMessage(email: string) {
  return `You have been added as an admin on NCA Ojo Attendance. Open this link to create your password:\n${inviteLink(email)}`;
}

/** Copy button that briefly says "Copied" */
function CopyButton({ text, label, className = "btn-outline btn-sm" }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } else window.prompt("Copy this link:", text);
      }}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {done ? "Copied" : label}
    </button>
  );
}

type AdminRow = { email: string; full_name: string | null; role: "super_admin" | "admin"; created_at: string };

export default function AdminsPage() {
  const me = useAdmin();
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<AdminRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase().from("admins").select("*").order("created_at");
    if (error) return setError(/fetch/i.test(error.message) ? "You need internet to manage admins." : error.message);
    setRows(data as AdminRow[]);
  };
  useEffect(() => {
    load();
  }, []);

  if (me.role !== "super_admin") return <Empty>Only the super admin can manage admins.</Empty>;

  async function remove(r: AdminRow) {
    const { error } = await supabase().from("admins").delete().eq("email", r.email);
    setRemoving(null);
    if (error) return setError(error.message);
    load();
    sync();
  }

  async function setRole(r: AdminRow, role: AdminRow["role"]) {
    const { error } = await supabase().from("admins").update({ role }).eq("email", r.email);
    if (error) return setError(error.message);
    load();
    sync();
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
            Tap <b className="text-ink">Copy invite</b> next to their name and send it to them. The link opens straight on{" "}
            <b className="text-ink">Create your password</b> with their email filled in.
          </li>
          <li>If asked, they confirm their email from the message Supabase sends, then sign in.</li>
        </ol>
        <div className="mt-3">
          <CopyButton text={inviteLink()} label="Copy general invite link" />
        </div>
      </div>

      <div className="card p-0">
        {!rows ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
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
                          <div className="flex justify-end gap-2">
                            <CopyButton text={inviteLink(r.email)} label="Copy invite" />
                            <button className="btn-outline btn-sm text-brand-red" onClick={() => setRemoving(r)}>
                              <Trash2 className="size-3.5" /> Remove
                            </button>
                          </div>
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
          onAdded={(email) => {
            setAddOpen(false);
            setInvite(email);
            load();
          }}
        />
      )}

      {invite && (
        <Modal title="Admin added" onClose={() => setInvite(null)}>
          <p className="text-sm text-muted">
            Send <b className="text-ink">{invite}</b> this link. It opens the page where they create their password.
          </p>
          <p className="mt-3 break-all rounded-xl bg-canvas px-3 py-2 text-xs">{inviteLink(invite)}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <a
              className="btn-outline btn-md"
              href={`https://wa.me/?text=${encodeURIComponent(inviteMessage(invite))}`}
              target="_blank"
              rel="noreferrer"
            >
              <Send className="size-4" /> WhatsApp
            </a>
            <CopyButton text={inviteLink(invite)} label="Copy link" className="btn-primary btn-md" />
          </div>
        </Modal>
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

function AddAdmin({ onClose, onAdded }: { onClose: () => void; onAdded: (email: string) => void }) {
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
    if (error)
      return setError(
        error.code === "23505" ? "That email is already an admin." : /fetch/i.test(error.message) ? "You need internet to add an admin." : error.message,
      );
    sync();
    onAdded(email.trim().toLowerCase());
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
