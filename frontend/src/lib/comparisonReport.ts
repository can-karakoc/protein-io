import type { ContactDifference, StructureComparisonResponse } from "./types";

// ── Brand tokens (match design system) ───────────────────────────────────────
const INK      = [26,  26,  24]  as const;
const GRAPHITE = [107, 114, 128] as const;
const NAVY     = [26,  64,  106] as const;
const CORAL    = [192,  83,  58] as const;
const GREEN    = [45,  122,  79] as const;
const PAPER    = [245, 245, 240] as const;
const LAV_BG   = [237, 237, 248] as const;
const GREEN_BG = [232, 245, 238] as const;
const CORAL_BG = [253, 240, 236] as const;
const LINE     = [229, 229, 224] as const;

function tmLabel(score: number): { text: string; color: readonly [number, number, number] } {
  if (score >= 0.7) return { text: "Highly similar",    color: GREEN };
  if (score >= 0.5) return { text: "Similar fold",      color: NAVY };
  if (score >= 0.3) return { text: "Partial similarity", color: GRAPHITE };
  return              { text: "Low similarity",          color: GRAPHITE };
}

// ── PDF builder ───────────────────────────────────────────────────────────────

export async function downloadComparisonReportPdf(
  comparison: StructureComparisonResponse,
  labelA: string,
  labelB: string,
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 40;
  const CONTENT = W - MARGIN * 2;
  let y = MARGIN;

  // ── helpers ──────────────────────────────────────────────────────────────
  function rgb(c: readonly [number, number, number]) {
    doc.setTextColor(c[0], c[1], c[2]);
  }
  function fill(c: readonly [number, number, number]) {
    doc.setFillColor(c[0], c[1], c[2]);
  }
  function draw(c: readonly [number, number, number]) {
    doc.setDrawColor(c[0], c[1], c[2]);
  }

  function sectionHeader(title: string) {
    y += 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    rgb(GRAPHITE);
    doc.text(title.toUpperCase(), MARGIN, y);
    y += 4;
    draw(LINE);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, MARGIN + CONTENT, y);
    y += 10;
  }

  function statCard(
    x: number, cardY: number, w: number, h: number,
    bg: readonly [number, number, number],
    label: string,
    value: string,
    sub?: string,
    subColor: readonly [number, number, number] = GRAPHITE,
  ) {
    fill(bg); draw(bg);
    doc.roundedRect(x, cardY, w, h, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    rgb(GRAPHITE);
    doc.text(label.toUpperCase(), x + 10, cardY + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    rgb(INK);
    doc.text(value, x + 10, cardY + 32);
    if (sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      rgb(subColor);
      doc.text(sub, x + 10, cardY + 46);
    }
  }

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  rgb(NAVY);
  doc.text("Structure Comparison Report", MARGIN, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  rgb(GRAPHITE);
  doc.text(`A: ${labelA}   ·   B: ${labelB}   ·   ${new Date().toLocaleString()}`, MARGIN, y);
  y += 6;
  draw(LINE);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, MARGIN + CONTENT, y);

  // ── TM-align ─────────────────────────────────────────────────────────────
  const { tm_align, delta, contacts } = comparison;
  if (tm_align) {
    sectionHeader("Structural Alignment (TM-align)");
    const tmScore = Math.max(tm_align.tm_score_query, tm_align.tm_score_target);
    const sim = tmLabel(tmScore);
    const CARD_H = 60;
    const GAP = 8;
    const cw = (CONTENT - GAP * 3) / 4;

    statCard(MARGIN,              y, cw, CARD_H, LAV_BG, "TM-Score",      tmScore.toFixed(3), sim.text, sim.color);
    statCard(MARGIN + (cw+GAP),   y, cw, CARD_H, LAV_BG, "RMSD",          `${tm_align.rmsd.toFixed(2)} Å`, "aligned residues");
    statCard(MARGIN + (cw+GAP)*2, y, cw, CARD_H, LAV_BG, "Query length",  `${tm_align.query_length}`, "residues (A)");
    statCard(MARGIN + (cw+GAP)*3, y, cw, CARD_H, LAV_BG, "Target length", `${tm_align.target_length}`, "residues (B)");

    y += CARD_H + 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    rgb(GRAPHITE);
    doc.text(
      `TM_Q ${tm_align.tm_score_query.toFixed(3)}  ·  TM_T ${tm_align.tm_score_target.toFixed(3)}`,
      MARGIN, y,
    );
    y += 4;
  }

  // ── Delta ─────────────────────────────────────────────────────────────────
  sectionHeader("Structure Delta (B − A)");
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Metric", "Delta (B − A)"]],
    body: [
      ["Residues", delta.residue_count_delta],
      ["Chains",   delta.chain_count_delta],
      ["Ligands",  delta.ligand_count_delta],
      ["Contacts", delta.contact_count_delta],
      ["Atoms",    delta.atom_count_delta],
    ].map(([label, val]) => [
      label,
      (val as number) > 0 ? `+${(val as number).toLocaleString()}` : (val as number).toLocaleString(),
    ]),
    columnStyles: {
      0: { cellWidth: 120 },
      1: { halign: "right", font: "courier", fontStyle: "normal" },
    },
    headStyles: { fillColor: [245, 245, 240], textColor: [107, 114, 128], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 9, textColor: [26, 26, 24] },
    alternateRowStyles: { fillColor: [249, 249, 246] },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 1) {
        const v = parseFloat((data.cell.raw as string).replace(/[^0-9.-]/g, ""));
        if (v > 0) data.cell.styles.textColor = [45, 122, 79] as unknown as string;
        else if (v < 0) data.cell.styles.textColor = [192, 83, 58] as unknown as string;
      }
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // ── Contact comparison summary ────────────────────────────────────────────
  sectionHeader("Contact Comparison");
  const CARD_H2 = 52;
  const GAP2 = 8;
  const cw2 = (CONTENT - GAP2 * 2) / 3;
  statCard(MARGIN,               y, cw2, CARD_H2, PAPER,    "Shared",          contacts.shared_contact_count.toLocaleString());
  statCard(MARGIN + (cw2+GAP2),  y, cw2, CARD_H2, GREEN_BG, "Gained (B only)", contacts.gained_contact_count.toLocaleString());
  statCard(MARGIN + (cw2+GAP2)*2,y, cw2, CARD_H2, CORAL_BG, "Lost (A only)",   contacts.lost_contact_count.toLocaleString());
  y += CARD_H2 + 12;

  function contactTable(title: string, rows: ContactDifference[], cap = 150) {
    if (rows.length === 0) return;
    sectionHeader(title);
    const shown = rows.slice(0, cap);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Contact", "Type", "Dist A / B"]],
      body: shown.map((r) => [
        r.label,
        r.contact_type,
        [
          r.distance_a_angstrom != null ? r.distance_a_angstrom.toFixed(2) : "—",
          r.distance_b_angstrom != null ? r.distance_b_angstrom.toFixed(2) : "—",
        ].join(" / ") + " Å",
      ]),
      columnStyles: {
        0: { font: "courier", fontStyle: "normal" },
        2: { halign: "right", font: "courier", fontStyle: "normal" },
      },
      headStyles: { fillColor: [245, 245, 240], textColor: [107, 114, 128], fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 8.5, textColor: [26, 26, 24] },
      alternateRowStyles: { fillColor: [249, 249, 246] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    if (rows.length > cap) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      rgb(GRAPHITE);
      doc.text(`Showing first ${cap} of ${rows.length} contacts.`, MARGIN, y);
      y += 10;
    }
  }

  contactTable("Shared Contacts", contacts.shared_contacts);
  contactTable("Gained Contacts (present in B, absent in A)", contacts.gained_contacts);
  contactTable("Lost Contacts (present in A, absent in B)", contacts.lost_contacts);

  // ── Footer on every page ──────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    draw(LINE);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, pageH - 28, MARGIN + CONTENT, pageH - 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    rgb(GRAPHITE);
    doc.text("Generated by Protein I/O", MARGIN, pageH - 16);
    doc.text(`Page ${i} of ${pageCount}`, MARGIN + CONTENT, pageH - 16, { align: "right" });
  }

  const filename = `comparison-${labelA}-vs-${labelB}.pdf`.replace(/[^a-zA-Z0-9._-]/g, "_");
  doc.save(filename);
}
