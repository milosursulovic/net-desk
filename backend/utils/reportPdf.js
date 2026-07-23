import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";

// pdfkit's built-in Standard-14 fonts (Helvetica etc.) only support
// WinAnsiEncoding (cp1252), which is missing č/ć/đ (present: š/ž only) -
// srpska latinica silently renders as garbage without a real embedded
// Unicode font. DejaVu Sans has full Latin Extended-A coverage and a
// license that permits embedding/redistribution.
const FONT_REGULAR = fileURLToPath(
  import.meta.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf"),
);
const FONT_BOLD = fileURLToPath(
  import.meta.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"),
);

const METRIC_LABEL = { disk: "Disk", cpu: "CPU", ram: "RAM" };

function fmtDate(d) {
  return new Date(d).toLocaleString("sr-RS");
}

function write(doc, text) {
  doc.text(text);
}

function heading(doc, text) {
  doc.moveDown(0.8);
  doc.font("Bold").fontSize(13).fillColor("#1e293b");
  write(doc, text);
  doc.moveDown(0.2);
  doc.font("Regular").fontSize(10).fillColor("#111111");
}

function bulletOrEmpty(doc, items, emptyText, toLine) {
  if (!items?.length) {
    doc.fillColor("#64748b");
    write(doc, emptyText);
    doc.fillColor("#111111");
    return;
  }
  for (const item of items) write(doc, `•  ${toLine(item)}`);
}

/**
 * Builds a formatted PDF from an already-loaded daily report and streams it
 * directly to the response - no intermediate file, no rasterized HTML
 * (unlike a browser print-to-PDF, this is real vector text: small, crisp,
 * selectable). Layout is hand-built to mirror ReportsView.vue's sections
 * rather than reusing the frontend template.
 */
export function sendReportPdf(res, report) {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  doc.registerFont("Regular", FONT_REGULAR);
  doc.registerFont("Bold", FONT_BOLD);
  doc.font("Regular");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="netdesk-izvestaj-${report.id}.pdf"`,
  );
  doc.pipe(res);

  const content = report.content || {};
  const fleet = content.fleet || {};
  const trends = content.trends || {};
  const since = content.sinceLastReport || {};

  doc.font("Bold").fontSize(18).fillColor("#1e293b");
  write(doc, "NetDesk — Dnevni izveštaj");
  doc.font("Regular").fontSize(10).fillColor("#64748b");
  write(doc, `Period: ${fmtDate(report.periodStart)} — ${fmtDate(report.periodEnd)}`);
  doc.fillColor("#111111");

  heading(doc, "Pregled flote");
  write(doc, `Agenata ukupno: ${fleet.totalAgents ?? 0}`);
  write(
    doc,
    `Online: ${fleet.onlineAgents ?? 0}   Neaktivno: ${fleet.staleAgents ?? 0}   ` +
      `Offline: ${fleet.offlineAgents ?? 0}   Nepoznato: ${fleet.unknownAgents ?? 0}`,
  );
  write(
    doc,
    `IP unosa ukupno: ${fleet.totalIpEntries ?? 0} (${fleet.offlineIpEntries ?? 0} offline)`,
  );

  const alerts = content.alerts || [];
  heading(doc, `Aktivna upozorenja (${alerts.length})`);
  bulletOrEmpty(doc, alerts, "Nema aktivnih upozorenja.", (a) => `[${a.level}] ${a.message}`);

  const trendSections = [
    ["Trend punjenja diska", trends.diskFillProjections],
    ["Trend CPU opterećenja", trends.cpuLoadProjections],
    ["Trend RAM opterećenja", trends.ramLoadProjections],
  ];
  for (const [label, items] of trendSections) {
    if (!items?.length) continue;
    heading(doc, label);
    bulletOrEmpty(doc, items, "", (t) => {
      return (
        `${t.hostname || "—"} — trenutno ${t.currentPct.toFixed(1)}%, ` +
        `raste ~${t.slopePctPerDay.toFixed(2)}%/dan, stiže do 90% za ~${t.daysUntilThreshold} dana`
      );
    });
  }

  if (trends.anomalies?.length) {
    heading(doc, "Anomalije");
    bulletOrEmpty(doc, trends.anomalies, "", (a) => {
      return (
        `${a.hostname || "—"} — ${METRIC_LABEL[a.metric] || a.metric}: ` +
        `${a.currentValue.toFixed(1)}% (uobičajeno ~${a.baselineMean.toFixed(1)}%, ` +
        `odstupanje ${a.zScore.toFixed(1)}σ)`
      );
    });
  }

  heading(doc, `Novi agenti (${since.newAgentsCount ?? 0})`);
  bulletOrEmpty(
    doc,
    since.newAgents,
    "Nema novih agenata u ovom periodu.",
    (a) => `${a.hostname || "—"} (${fmtDate(a.enrolledAt)})`,
  );

  heading(doc, `Nove IP adrese (${since.newIpEntriesCount ?? 0})`);
  bulletOrEmpty(
    doc,
    since.newIpEntries,
    "Nema novih unosa u ovom periodu.",
    (e) => `${e.ip} — ${e.computerName || "—"} (${fmtDate(e.createdAt)})`,
  );

  heading(doc, `Novi štampači (${since.newPrintersCount ?? 0})`);
  bulletOrEmpty(
    doc,
    since.newPrinters,
    "Nema novih štampača u ovom periodu.",
    (p) => `${p.name || "—"} (${p.ip || "—"})`,
  );

  heading(doc, `Neuspešne komande (${since.failedJobsCount ?? 0})`);
  bulletOrEmpty(
    doc,
    since.failedJobs,
    "Nema neuspešnih komandi u ovom periodu.",
    (j) => `${j.hostname || "—"} — ${j.commandType} (${fmtDate(j.completedAt)})`,
  );

  heading(doc, `Neuspešna ažuriranja (${since.failedUpdatesCount ?? 0})`);
  bulletOrEmpty(
    doc,
    since.failedUpdates,
    "Nema neuspešnih ažuriranja u ovom periodu.",
    (u) => `${u.hostname || "—"} — ${u.fromVersion} → ${u.toVersion} (${u.reason || "—"})`,
  );

  heading(doc, "Status promene");
  write(
    doc,
    `${since.statusTransitions?.wentOffline ?? 0} otišlo offline / ` +
      `${since.statusTransitions?.cameOnline ?? 0} vratilo se online`,
  );

  doc.end();
}
