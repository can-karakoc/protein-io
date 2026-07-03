// Self-contained HTML campaign report for a batch of designs. No backend, no external
// assets — the file opens offline in any browser and can be printed to PDF, which keeps
// it aligned with the local-first thesis (nothing leaves the machine to share a result).

import type { BatchClusterResponse } from "./types";

export type CampaignReportRow = {
  rank: number | null;
  filename: string;
  score: number | null;
  chains: number | null;
  residues: number | null;
  contacts: number | null;
  plddt: number | null;
  bsa: number | null;
  iptm: number | null;
  ipae: number | null;
  pbValid: string | null; // "2/2" etc, or null when no ligands / validity not run
  clashes: number | null;
  cluster: number | null;
  status: "OK" | "Error";
  error: string | null;
};

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function num(v: number | null, digits = 0, suffix = ""): string {
  if (v == null) return "<span class='dash'>—</span>";
  return `${v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`;
}

export function buildCampaignReportHtml(opts: {
  rows: CampaignReportRow[];
  cutoff: number;
  cluster: BatchClusterResponse | null;
  scoreFormula: string;
}): string {
  const { rows, cutoff, cluster, scoreFormula } = opts;
  const ok = rows.filter((r) => r.status === "OK").length;
  const failed = rows.length - ok;
  const generated = new Date().toLocaleString();

  const hasIptm = rows.some((r) => r.iptm != null);
  const hasIpae = rows.some((r) => r.ipae != null);
  const hasPb = rows.some((r) => r.pbValid != null);
  const hasCluster = cluster != null && rows.some((r) => r.cluster != null);

  const cols: [string, (r: CampaignReportRow) => string][] = [
    ["Rank", (r) => (r.rank != null ? `#${r.rank}` : "<span class='dash'>—</span>")],
    ["File", (r) => `<span class="mono file">${esc(r.filename)}</span>${r.error ? `<div class="err">${esc(r.error)}</div>` : ""}`],
    ["Score", (r) => (r.score != null ? `<b>${num(r.score, 1)}</b>` : "<span class='dash'>—</span>")],
    ["Chains", (r) => num(r.chains)],
    ["Residues", (r) => num(r.residues)],
    ["Contacts", (r) => num(r.contacts)],
    ["pLDDT", (r) => num(r.plddt, 1)],
    ["Interface BSA", (r) => num(r.bsa, 0, " Å²")],
  ];
  if (hasIptm) cols.push(["ipTM", (r) => num(r.iptm, 2)]);
  if (hasIpae) cols.push(["iPAE", (r) => num(r.ipae, 1, " Å")]);
  if (hasPb) cols.push(["PB-valid", (r) => (r.pbValid ? esc(r.pbValid) : "<span class='dash'>—</span>")]);
  if (hasCluster) cols.push(["Cluster", (r) => (r.cluster != null ? `C${r.cluster}` : "<span class='dash'>—</span>")]);
  cols.push(["Status", (r) => `<span class="pill ${r.status === "OK" ? "ok" : "bad"}">${r.status}</span>`]);

  const thead = cols.map(([h]) => `<th>${esc(h)}</th>`).join("");
  const tbody = rows
    .map((r) => {
      const top = r.rank != null && r.rank <= 3 ? " class='top'" : "";
      return `<tr${top}>${cols.map(([, render]) => `<td>${render(r)}</td>`).join("")}</tr>`;
    })
    .join("");

  const clusterSection =
    hasCluster && cluster
      ? `<section>
      <h2>Structural clusters <span class="sub">by fold · TM-score ≥ ${cluster.tm_threshold.toFixed(2)}</span></h2>
      <p class="note">In-house all-vs-all TM-align. Members within a cluster share a fold; the representative is the largest design.</p>
      <div class="clusters">
        ${cluster.clusters
          .map(
            (c) => `<div class="cluster">
          <div class="cluster-head"><span class="cbadge">C${c.cluster_id}</span> <b>${c.size}</b> design${c.size !== 1 ? "s" : ""} <span class="sub">mean TM ${c.mean_tm.toFixed(2)}</span></div>
          <div class="cluster-rep">Representative: <span class="mono">${esc(c.representative)}</span></div>
          <div class="cluster-members">${c.members.map((m) => `<span class="chip mono">${esc(m)}</span>`).join(" ")}</div>
        </div>`,
          )
          .join("")}
      </div>
      ${cluster.skipped.length ? `<p class="note">Skipped (unparseable): ${cluster.skipped.map((s) => esc(s)).join(", ")}</p>` : ""}
    </section>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Protein I/O — Design Campaign Report</title>
<style>
  :root { --ink:#14140f; --graphite:#5f6360; --line:#e7e5df; --paper:#fbfbf8; --highlight:#1A406A; --green:#2f7d4f; --coral:#b4442f; --amber:#b45309; }
  * { box-sizing: border-box; }
  body { margin:0; background:#fff; color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; line-height:1.5; }
  .wrap { max-width: 1040px; margin: 0 auto; padding: 40px 28px 64px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  header h1 { font-size: 26px; margin: 0 0 4px; letter-spacing:-0.01em; }
  header .meta { color: var(--graphite); font-size: 13px; }
  .chips { display:flex; gap:10px; flex-wrap:wrap; margin: 20px 0 8px; }
  .chip-stat { background:var(--paper); border:1px solid var(--line); border-radius:10px; padding:8px 14px; }
  .chip-stat .k { font-size:11px; text-transform:uppercase; letter-spacing:0.07em; color:var(--graphite); }
  .chip-stat .v { font-size:20px; font-weight:700; font-family:ui-monospace,monospace; }
  section { margin-top: 32px; }
  h2 { font-size: 18px; margin: 0 0 6px; }
  h2 .sub, .sub { font-weight: 400; color: var(--graphite); font-size: 13px; }
  .note { color: var(--graphite); font-size: 13px; margin: 4px 0 12px; }
  table { width:100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align:left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--graphite); background:var(--paper); }
  tr.top td { background: rgba(199,217,236,0.14); }
  td .file { color: var(--ink); }
  td .err { color: var(--coral); font-size: 11px; margin-top: 2px; }
  .dash { color: var(--graphite); opacity: 0.5; }
  .pill { font-size:11px; font-weight:600; padding:2px 8px; border-radius:6px; }
  .pill.ok { color: var(--green); background: rgba(47,125,79,0.12); }
  .pill.bad { color: var(--coral); background: rgba(180,68,47,0.12); }
  .clusters { display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .cluster { border:1px solid var(--line); border-radius:12px; padding:12px 14px; background:var(--paper); }
  .cluster-head { display:flex; align-items:center; gap:8px; }
  .cbadge { background:var(--highlight); color:#fff; border-radius:6px; padding:1px 7px; font-size:12px; font-weight:700; }
  .cluster-rep { font-size:12px; color:var(--graphite); margin:6px 0; }
  .cluster-members { display:flex; flex-wrap:wrap; gap:4px; }
  .chip { font-size:11px; background:#fff; border:1px solid var(--line); border-radius:6px; padding:1px 6px; }
  footer { margin-top: 40px; padding-top: 16px; border-top:1px solid var(--line); color: var(--graphite); font-size: 12px; }
  @media print { .wrap { padding: 0; } tr.top td { background: #f0f4fa; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Design Campaign Report</h1>
    <div class="meta">Protein I/O · generated locally ${esc(generated)} · contact cutoff ${cutoff.toFixed(1)} Å</div>
  </header>

  <div class="chips">
    <div class="chip-stat"><div class="k">Designs</div><div class="v">${rows.length}</div></div>
    <div class="chip-stat"><div class="k">Succeeded</div><div class="v">${ok}</div></div>
    ${failed ? `<div class="chip-stat"><div class="k">Failed</div><div class="v">${failed}</div></div>` : ""}
    ${hasCluster && cluster ? `<div class="chip-stat"><div class="k">Clusters</div><div class="v">${cluster.clusters.length}</div></div>` : ""}
  </div>

  <section>
    <h2>Ranked designs</h2>
    <p class="note">${esc(scoreFormula)}</p>
    <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
  </section>

  ${clusterSection}

  <footer>
    All metrics computed in-house on CPU — no models were run and no data left this machine.
    Geometric estimates (pockets, secondary structure) and confidence-derived scores are review aids, not validated predictions.
  </footer>
</div>
</body>
</html>`;
}

export function downloadCampaignReport(html: string, filename: string): void {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
