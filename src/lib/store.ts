"use client";

/**
 * Local-first data layer.
 *
 * Every table is copied into IndexedDB on the device (the "local database").
 * Screens read from the local copy, so the app keeps working without internet.
 * Writes go to the local copy first and are queued; the queue is sent to Supabase
 * as soon as the device is online, then fresh data is pulled back down.
 * Conflicts: last write wins (rows are keyed by id, so two devices rarely clash).
 */

import { openDB, type IDBPDatabase } from "idb";
import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase/client";

export const TABLES = ["members", "services", "attendance", "follow_ups", "finance_entries", "admins"] as const;
export type Table = (typeof TABLES)[number];

const KEYS: Record<Table, string | string[]> = {
  members: "id",
  services: "id",
  attendance: ["service_id", "member_id"],
  follow_ups: "id",
  finance_entries: "id",
  admins: "email",
};

/** Columns Supabase uses to detect an existing row on upsert */
const CONFLICT: Record<Table, string> = {
  members: "id",
  services: "id",
  attendance: "service_id,member_id",
  follow_ups: "id",
  finance_entries: "id",
  admins: "email",
};

type Row = Record<string, unknown>;
type Op =
  | { id?: number; table: Table; kind: "upsert"; rows: Row[]; onConflict: string; ignoreDuplicates?: boolean }
  | { id?: number; table: Table; kind: "delete"; match: Row };

const DB_NAME = "nca-ojo";
let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        for (const t of TABLES) d.createObjectStore(t, { keyPath: KEYS[t] });
        d.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
        d.createObjectStore("meta");
      },
    });
  }
  return dbPromise;
}

/* ---------- change notifications ---------- */

const listeners = new Set<() => void>();
const versions: Record<string, number> = {};
function bump(...tables: Table[]) {
  for (const t of tables) versions[t] = (versions[t] ?? 0) + 1;
  listeners.forEach((l) => l());
}

export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
export function versionOf(t: Table) {
  return versions[t] ?? 0;
}

/* ---------- sync status ---------- */

export type SyncState = { online: boolean; syncing: boolean; pending: number; lastSync: string | null; error: string | null };
let state: SyncState = { online: true, syncing: false, pending: 0, lastSync: null, error: null };
const stateListeners = new Set<() => void>();
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  stateListeners.forEach((l) => l());
}

export function useSyncState() {
  return useSyncExternalStore(
    (cb) => {
      stateListeners.add(cb);
      return () => stateListeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

/* ---------- reads ---------- */

export async function getAll<T = Row>(table: Table): Promise<T[]> {
  return (await (await db()).getAll(table)) as T[];
}

/** React hook: rows of a table from the local database, refreshed on every change */
export function useTable<T = Row>(table: Table): T[] | null {
  const [rows, setRows] = useState<T[] | null>(null);
  const version = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => versions[table] ?? 0,
    () => 0,
  );
  useEffect(() => {
    let live = true;
    getAll<T>(table).then((r) => live && setRows(r));
    return () => {
      live = false;
    };
  }, [table, version]);
  return rows;
}

/* ---------- writes ---------- */

export function newId() {
  return crypto.randomUUID();
}

async function enqueue(op: Op) {
  const d = await db();
  await d.add("queue", op);
  setState({ pending: await d.count("queue") });
  scheduleSync(300);
}

export async function upsert(table: Table, rows: Row | Row[], opts: { ignoreDuplicates?: boolean; onConflict?: string } = {}) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) return;
  const d = await db();
  const tx = d.transaction(table, "readwrite");
  // Send full rows to the server: an upsert needs every required column even when only one changed
  const merged: Row[] = [];
  for (const r of list) {
    const key = (Array.isArray(KEYS[table]) ? (KEYS[table] as string[]).map((k) => r[k]) : r[KEYS[table] as string]) as IDBValidKey;
    const existing = await tx.store.get(key);
    if (existing && opts.ignoreDuplicates) continue;
    const full = { ...(existing ?? {}), ...r };
    merged.push(full);
    await tx.store.put(full);
  }
  await tx.done;
  bump(table);
  for (let i = 0; i < merged.length; i += 500) {
    await enqueue({ table, kind: "upsert", rows: merged.slice(i, i + 500), onConflict: opts.onConflict ?? CONFLICT[table], ignoreDuplicates: opts.ignoreDuplicates });
  }
}

/** Delete rows whose columns equal every value in `match` */
export async function remove(table: Table, match: Row) {
  const d = await db();
  const all = await d.getAll(table);
  const tx = d.transaction(table, "readwrite");
  for (const r of all) {
    if (Object.entries(match).every(([k, v]) => r[k] === v)) {
      const key = Array.isArray(KEYS[table]) ? (KEYS[table] as string[]).map((k) => r[k]) : r[KEYS[table] as string];
      await tx.store.delete(key as IDBValidKey);
    }
  }
  await tx.done;
  bump(table);
  await enqueue({ table, kind: "delete", match });
}

/* ---------- sync ---------- */

let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;

export function scheduleSync(delay = 0) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    sync();
  }, delay);
}

function isNetworkError(e: unknown) {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return /fetch|network|load failed|offline/i.test(msg);
}

async function flushQueue(): Promise<boolean> {
  const d = await db();
  const sb = supabase();
  const ops = (await d.getAll("queue")) as Op[];
  for (const op of ops) {
    let error: { message: string; code?: string } | null = null;
    try {
      if (op.kind === "upsert") {
        ({ error } = await sb.from(op.table).upsert(op.rows, { onConflict: op.onConflict, ignoreDuplicates: op.ignoreDuplicates }));
      } else {
        let q = sb.from(op.table).delete();
        for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v as string);
        ({ error } = await q);
      }
    } catch (e) {
      if (isNetworkError(e)) return false;
      error = { message: String(e) };
    }
    if (error) {
      if (isNetworkError(error)) return false;
      // The server refused this change (e.g. not allowed). Drop it so the queue does not block forever.
      setState({ error: `A change could not be saved: ${error.message}` });
    }
    await d.delete("queue", op.id!);
    setState({ pending: await d.count("queue") });
  }
  return true;
}

/** Download order: the admin list first, because the app needs it to let anyone in */
const PULL_ORDER: Table[] = ["admins", ...TABLES.filter((t) => t !== "admins")];

async function pullAll() {
  const sb = supabase();
  const d = await db();
  const failed: string[] = [];
  for (const t of PULL_ORDER) {
    const rows: Row[] = [];
    let error: { message: string } | null = null;
    for (let from = 0; ; from += 1000) {
      const res = await sb.from(t).select("*").range(from, from + 999);
      if (res.error) {
        error = res.error;
        break;
      }
      rows.push(...(res.data ?? []));
      if (!res.data || res.data.length < 1000) break;
    }
    if (error) {
      if (isNetworkError(error)) throw error;
      // One broken table (e.g. a missing migration) must not stop the others from downloading
      console.error(`Could not download ${t}:`, error.message);
      failed.push(`${t} (${error.message})`);
      continue;
    }
    // Skip replacing a table if new local changes were queued meanwhile
    if ((await d.count("queue")) > 0) return false;
    const tx = d.transaction(t, "readwrite");
    await tx.store.clear();
    for (const r of rows) await tx.store.put(r);
    await tx.done;
    bump(t);
  }
  setState({ error: failed.length ? `Could not download: ${failed.join(", ")}` : null });
  return true;
}

export function sync(): Promise<void> {
  if (running) return running;
  running = (async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setState({ online: false });
      return;
    }
    setState({ syncing: true });
    try {
      const flushed = await flushQueue();
      if (!flushed) {
        setState({ online: false });
        return;
      }
      const pulled = await pullAll();
      const now = new Date().toISOString();
      if (pulled) await (await db()).put("meta", now, "lastSync");
      setState({ online: true, lastSync: pulled ? now : state.lastSync });
      if (!pulled) scheduleSync(500);
    } catch (e) {
      const network = isNetworkError(e);
      setState({ online: !network, error: network ? null : e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) });
    } finally {
      setState({ syncing: false });
      running = null;
    }
  })();
  return running;
}

export function pendingCount() {
  return state.pending;
}

/** Has this device ever downloaded the data? */
export async function hasLocalData() {
  return Boolean(await (await db()).get("meta", "lastSync"));
}

let started = false;
/** Start background sync: on load, when the connection returns, every minute, and on live changes */
export function startSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  db().then(async (d) => setState({ pending: await d.count("queue"), lastSync: ((await d.get("meta", "lastSync")) as string) ?? null }));
  window.addEventListener("online", () => {
    setState({ online: true });
    scheduleSync(0);
  });
  window.addEventListener("offline", () => setState({ online: false }));
  setInterval(() => scheduleSync(0), 60_000);
  const ch = supabase().channel("nca-all");
  for (const t of TABLES) ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => scheduleSync(800));
  ch.subscribe();
  scheduleSync(0);
}

/** Wipe the local copy (used on sign out) */
export async function clearLocal() {
  const d = await db();
  for (const t of [...TABLES, "queue", "meta"] as const) await d.clear(t);
  TABLES.forEach((t) => bump(t));
  setState({ pending: 0, lastSync: null });
}
