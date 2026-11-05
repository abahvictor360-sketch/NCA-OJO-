"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import {
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  LayoutGrid,
  Loader2,
  LogOut,
  Menu,
  PhoneCall,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { initials } from "@/lib/utils";

type Admin = { email: string; name: string };
const AdminContext = createContext<Admin>({ email: "", name: "" });
export const useAdmin = () => useContext(AdminContext);

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/attendance", label: "Take Attendance", icon: ClipboardCheck },
  { href: "/follow-ups", label: "Follow-ups", icon: PhoneCall },
  { href: "/members", label: "Members", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

async function signOut() {
  await supabase().auth.signOut();
  window.location.href = "/login";
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [denied, setDenied] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data } = await sb.auth.getUser();
      if (!data.user) {
        window.location.href = "/login";
        return;
      }
      const email = data.user.email ?? "";
      const { data: row } = await sb.from("admins").select("full_name").eq("email", email).maybeSingle();
      if (!row) {
        setDenied(true);
        return;
      }
      setAdmin({ email, name: row.full_name || email.split("@")[0]! });
    })();
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  if (denied) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="card max-w-sm text-center">
          <h1 className="text-lg font-semibold">No access</h1>
          <p className="mt-1 text-sm text-muted">
            This account is not on the admin list. Ask the pastor to add your email.
          </p>
          <button onClick={signOut} className="btn-outline btn-md mt-4">
            Sign out
          </button>
        </div>
      </main>
    );
  }

  if (!admin) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-navy-600" />
      </main>
    );
  }

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-2 pb-5">
        <Image src="/logo.jpg" alt="" width={40} height={40} className="rounded-full" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">NCA Ojo</p>
          <p className="truncate text-xs text-muted">Overcomers Parish</p>
        </div>
      </div>
      <div className="border-t border-line pt-5">
        <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Main</p>
        <nav className="space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  active ? "bg-canvas font-medium text-ink" : "text-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                {active && <span className="absolute -left-4 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-navy-600" />}
                <Icon className={`size-[18px] ${active ? "text-navy-600" : ""}`} />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="size-4 text-muted" />}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto space-y-1 border-t border-line pt-4">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-canvas hover:text-ink"
        >
          <LogOut className="size-[18px]" /> Sign out
        </button>
        <div className="flex items-center gap-3 px-2 pt-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy-50 text-xs font-semibold text-navy-600">
            {initials(admin.name)}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium">{admin.name}</p>
            <p className="truncate text-xs text-muted">{admin.email}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <AdminContext.Provider value={admin}>
      <div className="min-h-dvh p-0 lg:p-5">
        <div className="flex min-h-dvh overflow-hidden bg-white lg:min-h-[calc(100dvh-2.5rem)] lg:rounded-3xl lg:border lg:border-line">
          {/* Desktop sidebar */}
          <aside className="hidden w-64 shrink-0 border-r border-line p-5 lg:block">{sidebar}</aside>

          {/* Mobile drawer */}
          {open && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
              <aside className="absolute inset-y-0 left-0 w-72 bg-white p-5 shadow-xl">
                <button onClick={() => setOpen(false)} className="absolute right-4 top-5 text-muted" aria-label="Close menu">
                  <X className="size-5" />
                </button>
                {sidebar}
              </aside>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Mobile top bar */}
            <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white px-4 py-3 lg:hidden">
              <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-ink">
                <Menu className="size-5" />
              </button>
              <Image src="/logo.jpg" alt="" width={28} height={28} className="rounded-full" />
              <span className="text-sm font-semibold">NCA Ojo Attendance</span>
            </header>
            <main className="flex-1 bg-white px-4 py-5 sm:px-6 lg:px-7 lg:py-6">{children}</main>
          </div>
        </div>
      </div>
    </AdminContext.Provider>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
