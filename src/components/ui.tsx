"use client";

import { ArrowDownRight, ArrowUpRight, Loader2, X } from "lucide-react";
import { useEffect } from "react";

export function Delta({ value, suffix = "%", invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  if (!Number.isFinite(value) || value === 0) return <span className="pill-muted">0{suffix}</span>;
  const good = invert ? value < 0 : value > 0;
  return (
    <span className={good ? "pill-ok" : "pill-bad"}>
      {value > 0 ? "+" : ""}
      {value}
      {suffix}
    </span>
  );
}

export function Trend({ value, invert = false }: { value: number; invert?: boolean }) {
  const good = invert ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${good ? "text-ok" : "text-brand-red"}`}>
      <Icon className="size-3.5" />
      {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}

/** Small responsive line chart. Values are plotted left to right. */
export function LineChart({
  values,
  labels,
  color = "var(--color-navy-600)",
  height = 120,
  fill = true,
}: {
  values: number[];
  labels?: string[];
  color?: string;
  height?: number;
  fill?: boolean;
}) {
  const w = 300;
  const h = height;
  const pad = 6;
  if (values.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl bg-canvas text-xs text-muted" style={{ height }}>
        No closed services yet
      </div>
    );
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [pad + i * step, h - pad - ((v - min) / span) * (h - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts.at(-1)![0]},${h} L${pts[0]![0]},${h} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={w} y1={h * f} y2={h * f} stroke="var(--color-line)" strokeDasharray="3 4" />
        ))}
        {fill && <path d={area} fill={color} opacity={0.08} />}
        <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {pts.length === 1 && <circle cx={pts[0]![0]} cy={pts[0]![1]} r={4} fill={color} />}
      </svg>
      {labels && labels.length > 0 && (
        <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wide text-muted">
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function SplitBar({ parts }: { parts: { value: number; color: string; label: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 gap-1 overflow-hidden">
        {parts.map((p) => (
          <div key={p.label} className="rounded-full" style={{ width: `${(p.value / total) * 100}%`, background: p.color, minWidth: p.value ? 6 : 0 }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`size-5 animate-spin text-navy-600 ${className}`} />;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-canvas px-4 py-8 text-center text-sm text-muted">{children}</div>;
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Avatar({ name, tone = "navy" }: { name: string; tone?: "navy" | "red" | "sky" }) {
  const cls =
    tone === "red" ? "bg-brand-red-soft text-brand-red" : tone === "sky" ? "bg-sky-soft text-sky" : "bg-navy-50 text-navy-600";
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${cls}`}>{letters}</span>;
}
