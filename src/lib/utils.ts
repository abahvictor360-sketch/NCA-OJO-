export type Member = {
  id: string;
  full_name: string;
  phone: string | null;
  address: string | null;
  email: string | null;
  gender: "male" | "female" | null;
  notes: string | null;
  active: boolean;
  joined_on: string;
};

export type Service = {
  id: string;
  service_date: string;
  closed: boolean;
  closed_at: string | null;
};

export type ReportRow = {
  member_id: string;
  full_name: string;
  phone: string | null;
  active: boolean;
  services_count: number;
  attended: number;
  missed: number;
  current_streak: number;
  last_attended: string | null;
};

/** yyyy-mm-dd in the device's local time zone */
export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today if it is Sunday, otherwise the most recent Sunday */
export function lastSunday(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() - d.getDay());
  return toISODate(d);
}

export function formatDate(iso: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return "Never";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  });
}

/** Nigerian numbers: 0803... becomes 234803... for WhatsApp links */
export function whatsappNumber(phone: string | null) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) digits = "234" + digits.slice(1);
  return digits.length >= 10 ? digits : null;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join(
    "\n",
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
