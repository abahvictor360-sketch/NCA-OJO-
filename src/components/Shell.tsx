"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import {
  BarChart3,
  CloudOff,
  RefreshCw,
  ChevronRight,
  ClipboardCheck,
  LayoutGrid,
  Loader2,
  LogOut,
  Menu,
  PhoneCall,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { clearLocal, getAll, hasLocalData, pendingCount, startSync, sync, useSyncState } from "@/lib/store";
import { initials } from "@/lib/utils";

type Admin = { email: string; name: string; role: "super_admin" | "admin" };
const AdminContext = createContext<Admin>({ email: "", name: "", role: "admin" });
export const useAdmin = () => useContext(AdminContext);

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/attendance", label: "Take Attendance", icon: ClipboardCheck },
  { href: "/follow-ups", label: "Follow-ups", icon: PhoneCall },
  { href: "/members", label: "Members", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/finance", label: "Finance", icon: Wallet },
];
const SUPER_NAV = [{ href: "/admins", label: "Admins", icon: ShieldCheck }];

async function signOut() {
  await withTimeout(sync(), 8_000, undefined);
  if (pendingCount() > 0 && !window.confirm("Some changes have not reached the server yet (no internet). Sign out anyway and lose them?")) return;
  await supabase().auth.signOut({ scope: "local" });
  await clearLocal();
  window.location.href = "/login/";
}

/** Small "Synced / Offline / Saving" badge */
export function SyncBadge({ compact = false }: { compact?: boolean }) {
  const s = useSyncState();
  const label = !s.online
    ? `Offline${s.pending ? ` · ${s.pending} to send` : ""}`
    : s.syncing || s.pending
      ? `Syncing${s.pending ? ` · ${s.pending}` : ""}`
      : "Synced";
  const tone = !s.online ? "pill-bad" : s.syncing || s.pending ? "pill-info" : "pill-ok";
  return (
    <button
      onClick={() => sync()}
      className={tone}
      aria-label={label}
      title={s.lastSync ? `${label} · Last synced ${new Date(s.lastSync).toLocaleString("en-GB")}` : "Not synced yet"}
    >
      {s.online ? <RefreshCw className={`size-3 ${s.syncing ? "animate-spin" : ""}`} /> : <CloudOff className="size-3" />}
      <span className={compact ? "lg:max-xl:sr-only" : ""}>{label}</span>
    </button>
  );
}

/** Resolve with `fallback` if `p` takes longer than `ms` (slow mobile data must not freeze the app) */
function withTimeout<T>(p: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([Promise.resolve(p), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

type AdminRow = { email: string; full_name: string | null; role: Admin["role"] };

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [denied, setDenied] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // getSession reads the saved login on this device, so it also works offline
        const got = await withTimeout(supabase().auth.getSession(), 15_000, null);
        if (!got) {
          setFailure("Could not reach the server. Check your internet connection and try again.");
          return;
        }
        const user = got.data.session?.user;
        if (!user) {
          window.location.href = "/login/";
          return;
        }
        const email = (user.email ?? "").toLowerCase();
        startSync();
        // First visit on this device: wait for the download, but never forever
        if (!(await hasLocalData())) await withTimeout(sync(), 20_000, undefined);

        let row = (await getAll<AdminRow>("admins")).find((a) => a.email.toLowerCase() === email);
        if (!row) {
          // The local copy may be empty because the download failed or is still running: ask the server directly
          const res = await withTimeout(
            supabase().from("admins").select("email, full_name, role").eq("email", email).maybeSingle(),
            15_000,
            null,
          );
          if (!res || (res.error && !res.data)) {
            setFailure(
              res?.error && !/fetch|network|load failed/i.test(res.error.message)
                ? `The server said: ${res.error.message}`
                : "Could not reach the server. Check your internet connection and try again.",
            );
            return;
          }
          row = (res.data as AdminRow | null) ?? undefined;
        }
        if (!row) {
          setDenied(true);
          return;
        }
        setAdmin({ email, name: row.full_name || email.split("@")[0]!, role: row.role });
      } catch (e) {
        console.error("Startup failed", e);
        setFailure(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  if (failure) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="card max-w-sm text-center">
          <h1 className="text-lg font-semibold">Could not open the app</h1>
          <p className="mt-1 text-sm text-muted">{failure}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => window.location.reload()} className="btn-primary btn-md">
              Try again
            </button>
            <button onClick={signOut} className="btn-outline btn-md">
              Sign out
            </button>
          </div>
        </div>
      </main>
    );
  }

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
      <div className="flex items-center gap-3 px-2 pb-5 lg:max-xl:justify-center lg:max-xl:px-0">
        <Image src="/logo.jpg" alt="" width={40} height={40} className="rounded-full" />
        <div className="min-w-0 leading-tight lg:max-xl:hidden">
          <p className="truncate text-sm font-semibold">NCA Ojo</p>
          <p className="truncate text-xs text-muted">Overcomers Parish</p>
        </div>
      </div>
      <div className="px-2 pb-4 lg:max-xl:flex lg:max-xl:justify-center lg:max-xl:px-0">
        <SyncBadge compact />
      </div>
      <div className="border-t border-line pt-5">
        <p className="px-2 pb-2 lg:max-xl:hidden text-[11px] font-medium uppercase tracking-wider text-muted">Main</p>
        <nav className="space-y-1">
          {[...NAV, ...(admin.role === "super_admin" ? SUPER_NAV : [])].map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                aria-label={label}
                className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors lg:max-xl:justify-center lg:max-xl:px-0 lg:max-xl:py-3 ${
                  active ? "bg-canvas font-medium text-ink" : "text-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                {active && <span className="absolute -left-4 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-navy-600" />}
                <Icon className={`size-[18px] ${active ? "text-navy-600" : ""}`} />
                <span className="flex-1 lg:max-xl:hidden">{label}</span>
                {active && <ChevronRight className="size-4 text-muted lg:max-xl:hidden" />}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto space-y-1 border-t border-line pt-4">
        <button
          onClick={signOut}
          title="Sign out"
          aria-label="Sign out"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-canvas hover:text-ink lg:max-xl:justify-center lg:max-xl:px-0 lg:max-xl:py-3"
        >
          <LogOut className="size-[18px]" /> <span className="lg:max-xl:hidden">Sign out</span>
        </button>
        <div className="flex items-center gap-3 px-2 pt-3 lg:max-xl:justify-center lg:max-xl:px-0" title={`${admin.name} · ${admin.email}`}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy-50 text-xs font-semibold text-navy-600">
            {initials(admin.name)}
          </span>
          <div className="min-w-0 leading-tight lg:max-xl:hidden">
            <p className="truncate text-sm font-medium">{admin.name}</p>
            <p className="truncate text-xs text-muted">{admin.email}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <AdminContext.Provider value={admin}>
      <div className="min-h-dvh p-0 xl:p-5">
        <div className="flex min-h-dvh bg-white lg:border-line xl:min-h-[calc(100dvh-2.5rem)] xl:overflow-hidden xl:rounded-3xl xl:border">
          {/* Desktop sidebar */}
          <aside className="sticky top-0 hidden max-h-dvh w-20 shrink-0 overflow-y-auto border-r border-line px-3 py-5 lg:block xl:w-64 xl:p-5">{sidebar}</aside>

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
              <span className="flex-1 text-sm font-semibold">NCA Ojo</span>
              <SyncBadge />
            </header>
            <main className="min-w-0 flex-1 bg-white px-4 py-5 sm:px-6 lg:px-7 lg:py-6">{children}</main>
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
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">{children}</div>}
    </div>
  );
}
