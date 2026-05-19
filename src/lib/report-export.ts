import * as XLSX from "@e965/xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ExportSection = {
  title: string;
  rows: Array<{ number: number; name: string; amount: number }>;
  total: number;
};

export type ExportReport = {
  title: string;
  period: string;
  sections: ExportSection[];
  footer?: { label: string; amount: number };
};

const fmt = (n: number) =>
  new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function exportReportToExcel(report: ExportReport) {
  const aoa: (string | number)[][] = [];
  aoa.push([report.title]);
  aoa.push([`Period: ${report.period}`]);
  aoa.push([]);
  for (const sec of report.sections) {
    aoa.push([sec.title]);
    aoa.push(["Konto", "Namn", "Belopp"]);
    for (const r of sec.rows) aoa.push([r.number, r.name, Number(r.amount.toFixed(2))]);
    aoa.push(["", `Summa ${sec.title.toLowerCase()}`, Number(sec.total.toFixed(2))]);
    aoa.push([]);
  }
  if (report.footer) aoa.push([report.footer.label, "", Number(report.footer.amount.toFixed(2))]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 10 }, { wch: 42 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, report.title.slice(0, 31));
  XLSX.writeFile(wb, `${slug(report.title)}-${report.period}.xlsx`);
}

export function exportReportToPdf(report: ExportReport) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(report.title, 40, 40);
  doc.setFontSize(10);
  doc.text(`Period: ${report.period}`, 40, 58);

  let cursorY = 80;
  for (const sec of report.sections) {
    autoTable(doc, {
      startY: cursorY,
      head: [[sec.title, "", ""]],
      body: [
        ...sec.rows.map((r) => [String(r.number), r.name, fmt(r.amount)]),
        [{ content: `Summa ${sec.title.toLowerCase()}`, colSpan: 2, styles: { fontStyle: "bold" } }, { content: fmt(sec.total), styles: { fontStyle: "bold" } }],
      ],
      columnStyles: { 0: { cellWidth: 60 }, 2: { halign: "right", cellWidth: 90 } },
      headStyles: { fillColor: [40, 40, 40] },
      styles: { fontSize: 9 },
      margin: { left: 40, right: 40 },
    });
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  }

  if (report.footer) {
    autoTable(doc, {
      startY: cursorY,
      body: [[{ content: report.footer.label, styles: { fontStyle: "bold" } }, { content: fmt(report.footer.amount), styles: { fontStyle: "bold", halign: "right" } }]],
      columnStyles: { 1: { cellWidth: 120, halign: "right" } },
      margin: { left: 40, right: 40 },
    });
  }

  doc.save(`${slug(report.title)}-${report.period}.pdf`);
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
