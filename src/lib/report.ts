"use client";

/**
 * Detailed church report: attendance, follow-ups and finance for a period.
 * Built from the local database, so it also works offline. Exports to Excel, Word and PDF.
 * The export libraries are loaded only when a report is downloaded.
 */

import { getAll } from "@/lib/store";
import { memberReport, serviceSummaries, type Attendance, type FollowUp } from "@/lib/logic";
import { formatDate, pct, type Member, type Service } from "@/lib/utils";

type FinanceEntry = {
  id: string;
  entry_date: string;
  kind: "income" | "expense";
  category: string;
  amount: number;
  member_id: string | null;
  description: string | null;
  recorded_by: string | null;
};

export type ReportFormat = "xlsx" | "docx" | "pdf";

const CHURCH = "New Creation Assembly Ojo";
const PARISH = "Overcomers Parish";
const NAVY = "2E3175";

const naira = (n: number) => "NGN " + n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Table = { title: string; head: string[]; rows: (string | number)[][]; note?: string };

export async function buildReport(from: string | null, to: string | null) {
  const [members, services, att, fus, fin] = await Promise.all([
    getAll<Member>("members"),
    getAll<Service>("services"),
    getAll<Attendance>("attendance"),
    getAll<FollowUp>("follow_ups"),
    getAll<FinanceEntry>("finance_entries"),
  ]);
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  const name = new Map(members.map((m) => [m.id, m]));
  const svcDate = new Map(services.map((s) => [s.id, s.service_date]));

  const closed = serviceSummaries(services, att, fus)
    .filter((s) => s.closed && inRange(s.service_date))
    .reverse();
  const report = memberReport(members, services, att, from, to)
    .filter((r) => r.active)
    .sort((a, b) => b.missed - a.missed || a.full_name.localeCompare(b.full_name));
  const followUps = fus
    .filter((f) => inRange(svcDate.get(f.service_id) ?? ""))
    .sort((a, b) => (svcDate.get(b.service_id) ?? "").localeCompare(svcDate.get(a.service_id) ?? ""));
  const money = fin.map((e) => ({ ...e, amount: Number(e.amount) })).filter((e) => inRange(e.entry_date));
  money.sort((a, b) => a.entry_date.localeCompare(b.entry_date));

  const income = money.filter((e) => e.kind === "income").reduce((s, e) => s + e.amount, 0);
  const expense = money.filter((e) => e.kind === "expense").reduce((s, e) => s + e.amount, 0);
  const byCat = new Map<string, { kind: string; total: number; count: number }>();
  for (const e of money) {
    const k = `${e.kind}|${e.category}`;
    const c = byCat.get(k) ?? { kind: e.kind, total: 0, count: 0 };
    c.total += e.amount;
    c.count += 1;
    byCat.set(k, c);
  }
  const avgRate = closed.length ? Math.round(closed.reduce((s, x) => s + pct(x.present, x.present + x.absent), 0) / closed.length) : 0;
  const avgPresent = closed.length ? Math.round(closed.reduce((s, x) => s + x.present, 0) / closed.length) : 0;
  const period =
    from || to ? `${from ? formatDate(from) : "Start"} to ${to ? formatDate(to) : "today"}` : "All time";

  const summary: [string, string][] = [
    ["Period", period],
    ["Generated", new Date().toLocaleString("en-GB")],
    ["Active members", String(members.filter((m) => m.active).length)],
    ["Services recorded", String(closed.length)],
    ["Average attendance", `${avgPresent} people (${avgRate}%)`],
    ["Members who never missed", String(report.filter((r) => r.services_count > 0 && r.missed === 0).length)],
    ["Missed 3 or more Sundays in a row", String(report.filter((r) => r.current_streak >= 3).length)],
    ["Follow-ups (open / done)", `${followUps.filter((f) => !f.done).length} / ${followUps.filter((f) => f.done).length}`],
    ["Total income", naira(income)],
    ["Total expenses", naira(expense)],
    ["Balance", naira(income - expense)],
  ];

  const tables: Table[] = [
    {
      title: "Services",
      head: ["Date", "Present", "Absent", "Attendance rate"],
      rows: [...closed].reverse().map((s) => [formatDate(s.service_date, { weekday: "short" }), s.present, s.absent, `${pct(s.present, s.present + s.absent)}%`]),
    },
    {
      title: "Member attendance",
      head: ["Name", "Phone", "Attended", "Missed", "Missed in a row", "Last attended", "Rate"],
      rows: report.map((r) => [
        r.full_name,
        r.phone ?? "",
        `${r.attended} / ${r.services_count}`,
        r.missed,
        r.current_streak,
        r.last_attended ? formatDate(r.last_attended) : "Never",
        `${pct(r.attended, r.services_count)}%`,
      ]),
    },
    {
      title: "Follow-ups",
      head: ["Missed service", "Member", "Phone", "Status", "Note", "Done by"],
      rows: followUps.map((f) => [
        formatDate(svcDate.get(f.service_id) ?? null),
        name.get(f.member_id)?.full_name ?? "Removed member",
        name.get(f.member_id)?.phone ?? "",
        f.done ? "Done" : "Open",
        f.note ?? "",
        f.done_by ?? "",
      ]),
    },
    {
      title: "Finance by category",
      head: ["Type", "Category", "Entries", "Total"],
      rows: [...byCat.entries()]
        .sort((a, b) => a[1].kind.localeCompare(b[1].kind) * -1 || b[1].total - a[1].total)
        .map(([k, v]) => [v.kind === "income" ? "Income" : "Expense", k.split("|")[1]!, v.count, naira(v.total)]),
    },
    {
      title: "Finance entries",
      head: ["Date", "Type", "Category", "Member / details", "Amount"],
      rows: money.map((e) => [
        formatDate(e.entry_date),
        e.kind === "income" ? "Income" : "Expense",
        e.category,
        [e.member_id ? name.get(e.member_id)?.full_name : null, e.description].filter(Boolean).join(" - "),
        (e.kind === "expense" ? "-" : "") + naira(e.amount),
      ]),
    },
  ];

  // Excel only: one column per Sunday, P or A per member
  const register: Table = {
    title: "Attendance register",
    head: ["Name", ...closed.map((s) => formatDate(s.service_date, { year: "2-digit" }))],
    rows: members
      .filter((m) => m.active)
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .map((m) => {
        const mine = new Set(att.filter((a) => a.member_id === m.id).map((a) => a.service_id));
        return [m.full_name, ...closed.map((s) => (s.service_date < m.joined_on ? "-" : mine.has(s.id) ? "P" : "A"))];
      }),
    note: "P = present, A = absent, - = not yet a member",
  };

  return { period, summary, tables, register };
}

/** Church logo as bytes, for embedding in the files (works offline: it ships with the app) */
async function logoBytes(): Promise<Uint8Array | null> {
  try {
    const res = await fetch("/logo.jpg");
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

function fileName(ext: string) {
  return `NCA-Ojo-Report-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportReport(format: ReportFormat, from: string | null, to: string | null) {
  const r = await buildReport(from, to);
  if (format === "xlsx") return toExcel(r);
  if (format === "docx") return toWord(r);
  return toPdf(r);
}

type Built = Awaited<ReturnType<typeof buildReport>>;

async function toExcel(r: Built) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "NCA Ojo Attendance";

  const sum = wb.addWorksheet("Summary");
  const logo = await logoBytes();
  if (logo) {
    const id = wb.addImage({ buffer: logo.buffer as ArrayBuffer, extension: "jpeg" });
    sum.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 72, height: 72 } });
    for (let i = 0; i < 5; i++) sum.addRow([]);
  }
  sum.addRow([`${CHURCH}, ${PARISH}`]).font = { bold: true, size: 14 };
  sum.addRow([`Church report · ${r.period}`]).font = { size: 12, color: { argb: "FF6B7080" } };
  sum.addRow([]);
  for (const [k, v] of r.summary) sum.addRow([k, v]).getCell(1).font = { bold: true };
  sum.getColumn(1).width = 34;
  sum.getColumn(2).width = 40;

  for (const t of [...r.tables, r.register]) {
    const ws = wb.addWorksheet(t.title.slice(0, 31), { views: [{ state: "frozen", ySplit: 1, xSplit: t === r.register ? 1 : 0 }] });
    const head = ws.addRow(t.head);
    head.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + NAVY } };
    });
    for (const row of t.rows) {
      const added = ws.addRow(row);
      if (t === r.register)
        added.eachCell((c, i) => {
          if (i > 1 && c.value === "A") c.font = { color: { argb: "FFE8343A" }, bold: true };
          if (i > 1 && c.value === "P") c.font = { color: { argb: "FF16A34A" } };
          if (i > 1) c.alignment = { horizontal: "center" };
        });
    }
    if (t.note) ws.addRow([]).getCell(1).value = t.note;
    ws.columns.forEach((col, i) => {
      let w = String(t.head[i] ?? "").length;
      for (const row of t.rows) w = Math.max(w, String(row[i] ?? "").length);
      col.width = Math.min(Math.max(w + 2, t === r.register && i > 0 ? 9 : 10), 48);
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  save(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName("xlsx"));
}

async function toWord(r: Built) {
  const d = await import("docx");
  const cell = (text: string, header = false) =>
    new d.TableCell({
      children: [new d.Paragraph({ children: [new d.TextRun({ text, bold: header, color: header ? "FFFFFF" : undefined, size: 18 })] })],
      shading: header ? { type: d.ShadingType.CLEAR, color: "auto", fill: NAVY } : undefined,
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
    });
  const table = (t: Table) =>
    new d.Table({
      width: { size: 100, type: d.WidthType.PERCENTAGE },
      rows: [
        new d.TableRow({ tableHeader: true, children: t.head.map((h) => cell(h, true)) }),
        ...t.rows.map((row) => new d.TableRow({ children: row.map((v) => cell(String(v))) })),
      ],
    });

  const logo = await logoBytes();
  const children: (InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>)[] = [
    ...(logo
      ? [new d.Paragraph({ children: [new d.ImageRun({ type: "jpg", data: logo, transformation: { width: 80, height: 80 } })] })]
      : []),
    new d.Paragraph({ heading: d.HeadingLevel.TITLE, children: [new d.TextRun({ text: CHURCH, color: NAVY })] }),
    new d.Paragraph({ children: [new d.TextRun({ text: `${PARISH} · Church report · ${r.period}`, color: "6B7080" })] }),
    new d.Paragraph({ text: "Summary", heading: d.HeadingLevel.HEADING_1 }),
    new d.Table({
      width: { size: 100, type: d.WidthType.PERCENTAGE },
      rows: r.summary.map(([k, v]) => new d.TableRow({ children: [cell(k, false), cell(v)] })),
    }),
  ];
  for (const t of r.tables) {
    children.push(new d.Paragraph({ text: t.title, heading: d.HeadingLevel.HEADING_1, spacing: { before: 300 } }));
    children.push(t.rows.length ? table(t) : new d.Paragraph({ text: "Nothing recorded in this period." }));
  }
  const doc = new d.Document({
    creator: "NCA Ojo Attendance",
    title: `${CHURCH} report`,
    sections: [{ properties: { page: { size: { orientation: d.PageOrientation.LANDSCAPE } } }, children }],
  });
  save(await d.Packer.toBlob(doc), fileName("docx"));
}

async function toPdf(r: Built) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const navy: [number, number, number] = [46, 49, 117];

  const logo = await logoBytes();
  const textX = logo ? 104 : 40;
  if (logo) pdf.addImage(logo, "JPEG", 40, 28, 54, 54);
  pdf.setFontSize(18);
  pdf.setTextColor(...navy);
  pdf.text(CHURCH, textX, 52);
  pdf.setFontSize(11);
  pdf.setTextColor(107, 112, 128);
  pdf.text(`${PARISH} · Church report · ${r.period}`, textX, 70);

  autoTable(pdf, {
    startY: 98,
    head: [["Summary", ""]],
    body: r.summary,
    theme: "grid",
    headStyles: { fillColor: navy },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 220 } },
    styles: { fontSize: 9 },
  });

  for (const t of r.tables) {
    const y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 28;
    const startY = y > 520 ? (pdf.addPage(), 50) : y;
    pdf.setFontSize(13);
    pdf.setTextColor(...navy);
    pdf.text(t.title, 40, startY - 8);
    autoTable(pdf, {
      startY,
      head: [t.head],
      body: t.rows.length ? t.rows.map((row) => row.map(String)) : [["Nothing recorded in this period."]],
      theme: "striped",
      headStyles: { fillColor: navy },
      styles: { fontSize: 8.5 },
    });
  }

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(`Page ${i} of ${pages} · Generated ${new Date().toLocaleString("en-GB")}`, 40, pdf.internal.pageSize.getHeight() - 20);
  }
  pdf.save(fileName("pdf"));
}
