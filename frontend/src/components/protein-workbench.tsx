"use client";

import { AlertCircle, Atom, Download, FileUp, Loader2, Play, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

import { StructureViewer } from "@/components/structure-viewer";
import { buildApiUrl } from "@/lib/api";
import { contactsToCsv } from "@/lib/csv";
import type { AnalysisResponse, ContactRecord } from "@/lib/types";

const EXAMPLE_FILE = "/sample.pdb";
const TIMING_HEADER = "X-ProteinIO-Timing";

export function ProteinWorkbench() {
  const [fileName, setFileName] = useState<string>("");
  const [pdbText, setPdbText] = useState("");
  const [cutoff, setCutoff] = useState(4.0);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const hasStructure = pdbText.trim().length > 0;
  const contacts = useMemo(() => analysis?.contacts ?? [], [analysis]);
  const filteredContactPreview = useMemo(() => contacts.slice(0, 80), [contacts]);

  async function handleFile(file: File) {
    const timingStarted = performance.now();
    setError(null);
    setAnalysis(null);
    setFileName(file.name);
    const text = await file.text();
    setPdbText(text);
    logTiming("file upload read", timingStarted, {
      fileName: file.name,
      bytes: file.size,
      characters: text.length,
    });
  }

  async function loadExample() {
    const timingStarted = performance.now();
    setError(null);
    setAnalysis(null);
    const fetchStarted = performance.now();
    const response = await fetch(EXAMPLE_FILE);
    const fetchMs = elapsedMs(fetchStarted);
    const textStarted = performance.now();
    const text = await response.text();
    const textMs = elapsedMs(textStarted);
    setFileName("sample.pdb");
    setPdbText(text);
    logTiming("sample load", timingStarted, {
      fetch_ms: fetchMs,
      response_text_ms: textMs,
      bytes: text.length,
    });
  }

  async function analyzeStructure() {
    if (!hasStructure) {
      setError("Upload or load a PDB file before analysis.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const timingStarted = performance.now();
      const formStarted = performance.now();
      const formData = new FormData();
      formData.append("file", new File([pdbText], fileName || "uploaded.pdb", { type: "chemical/x-pdb" }));
      formData.append("cutoff_angstrom", String(cutoff));
      const form_ms = elapsedMs(formStarted);

      const requestStarted = performance.now();
      const response = await fetch(buildApiUrl("/api/analyze"), {
        method: "POST",
        body: formData,
      });
      const request_ms = elapsedMs(requestStarted);

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? `Analysis failed with status ${response.status}.`);
      }

      const parseStarted = performance.now();
      const nextAnalysis = (await response.json()) as AnalysisResponse;
      const response_json_ms = elapsedMs(parseStarted);
      setAnalysis(nextAnalysis);
      logTiming("analysis request", timingStarted, {
        form_ms,
        request_ms,
        response_json_ms,
        backend: response.headers.get(TIMING_HEADER) ?? "not exposed",
        atoms: nextAnalysis.summary.atom_count,
        residues: nextAnalysis.summary.residue_count,
        contacts: nextAnalysis.summary.contact_count,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function reset() {
    setFileName("");
    setPdbText("");
    setAnalysis(null);
    setError(null);
    setCutoff(4.0);
  }

  function exportCsv() {
    if (!contacts.length) {
      return;
    }

    const csv = contactsToCsv(contacts);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName.replace(/\.[^.]+$/, "") || "contacts"}-contacts.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-700">
              <Atom className="h-4 w-4" />
              Protein Interaction Explorer
            </div>
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
              Structure upload and contact analysis
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Upload a PDB file, inspect the structure, calculate residue and ligand contacts, and export the
              interaction table.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadExample}
              className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
            >
              <FileUp className="h-4 w-4" />
              Load sample
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="flex flex-col gap-4">
            <div className="border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-950">Input</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                PDB files contain atom coordinates used for visualization and distance-based contact detection.
              </p>

              <label className="mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center border border-dashed border-slate-300 bg-slate-50 px-4 text-center hover:bg-slate-100">
                <FileUp className="mb-2 h-5 w-5 text-slate-500" />
                <span className="text-sm font-medium text-slate-800">Choose PDB file</span>
                <span className="mt-1 text-xs text-slate-500">Plain text .pdb upload</span>
                <input
                  type="file"
                  accept=".pdb,chemical/x-pdb,text/plain"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleFile(file);
                    }
                  }}
                />
              </label>

              <div className="mt-4 grid gap-3">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="cutoff">
                  Distance cutoff
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="cutoff"
                    type="number"
                    min="1"
                    max="12"
                    step="0.1"
                    value={cutoff}
                    onChange={(event) => setCutoff(Number(event.target.value))}
                    className="h-10 w-24 border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-600"
                  />
                  <span className="text-sm text-slate-600">angstroms</span>
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  Atom pairs within this distance are candidates for contacts.
                </p>
              </div>

              <button
                type="button"
                onClick={analyzeStructure}
                disabled={!hasStructure || isLoading}
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 bg-cyan-700 px-4 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Analyze structure
              </button>

              {fileName ? (
                <div className="mt-4 border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Loaded file</p>
                  <p className="mt-1 break-words font-mono text-sm text-slate-800">{fileName}</p>
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              </div>
            ) : null}

            {analysis?.warnings.length ? (
              <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Analysis warnings</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {analysis.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>

          <section className="grid gap-4">
            <StructureViewer pdbText={pdbText} />
            <SummaryCards analysis={analysis} />
          </section>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <DataTable
            title="Chains"
            helper="Protein residue and atom counts grouped by chain."
            emptyText="Run analysis to show chains."
            headers={["Chain", "Residues", "Atoms"]}
            rows={(analysis?.chains ?? []).map((chain) => [chain.id, chain.residue_count, chain.atom_count])}
          />

          <DataTable
            title="Ligands"
            helper="Non-water hetero residues detected in the PDB file."
            emptyText="No ligand rows yet."
            headers={["Name", "Chain", "Residue", "Atoms"]}
            rows={(analysis?.ligands ?? []).map((ligand) => [
              ligand.name,
              ligand.chain_id,
              ligand.residue_number,
              ligand.atom_count,
            ])}
          />
        </section>

        <section className="border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Contacts</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Closest atom pair per residue-residue or protein-ligand contact.
              </p>
            </div>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!contacts.length}
              className="inline-flex h-10 items-center justify-center gap-2 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
          <ContactTable contacts={filteredContactPreview} totalCount={contacts.length} />
        </section>
      </div>
    </main>
  );
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function logTiming(label: string, startedAt: number, details: Record<string, number | string>) {
  console.info(`[protein.io timing] ${label}`, {
    total_ms: elapsedMs(startedAt),
    ...details,
  });
}

function SummaryCards({ analysis }: { analysis: AnalysisResponse | null }) {
  const summary = analysis?.summary;
  const items = [
    ["Atoms", summary?.atom_count ?? 0, "Coordinate records parsed from the PDB."],
    ["Protein residues", summary?.residue_count ?? 0, "Amino acid residues counted across chains."],
    ["Chains", summary?.chain_count ?? 0, "Distinct protein chains in the structure."],
    ["Ligands", summary?.ligand_count ?? 0, "Non-water hetero residues detected."],
    ["Contacts", summary?.contact_count ?? 0, "Residue and ligand contacts under cutoff."],
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map(([label, value, helper]) => (
        <div key={label} className="border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-950">{value}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>
        </div>
      ))}
    </div>
  );
}

function DataTable({
  title,
  helper,
  emptyText,
  headers,
  rows,
}: {
  title: string;
  helper: string;
  emptyText: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {headers.map((header) => (
                  <th key={header} className="px-4 py-3 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, rowIndex) => (
                <tr key={`${title}-${rowIndex}`} className="text-slate-800">
                  {row.map((cell, cellIndex) => (
                    <td key={`${title}-${rowIndex}-${cellIndex}`} className="px-4 py-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-4 text-sm text-slate-500">{emptyText}</p>
      )}
    </div>
  );
}

function ContactTable({ contacts, totalCount }: { contacts: ContactRecord[]; totalCount: number }) {
  if (!contacts.length) {
    return <p className="p-4 text-sm text-slate-500">Run analysis to populate contacts.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Residue A</th>
            <th className="px-4 py-3 font-medium">Atom A</th>
            <th className="px-4 py-3 font-medium">Residue B</th>
            <th className="px-4 py-3 font-medium">Atom B</th>
            <th className="px-4 py-3 font-medium">Distance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {contacts.map((contact, index) => (
            <tr key={`${contact.contact_type}-${contact.chain_a}-${contact.residue_a}-${contact.chain_b}-${contact.residue_b}-${index}`}>
              <td className="px-4 py-3 text-slate-700">{contact.contact_type}</td>
              <td className="px-4 py-3 font-mono text-slate-900">
                {contact.chain_a}:{contact.residue_name_a}{contact.residue_a}
              </td>
              <td className="px-4 py-3 font-mono text-slate-700">{contact.atom_a}</td>
              <td className="px-4 py-3 font-mono text-slate-900">
                {contact.chain_b}:{contact.residue_name_b}{contact.residue_b}
              </td>
              <td className="px-4 py-3 font-mono text-slate-700">{contact.atom_b}</td>
              <td className="px-4 py-3 font-mono text-slate-700">{contact.distance_angstrom.toFixed(3)} A</td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalCount > contacts.length ? (
        <p className="border-t border-slate-200 p-3 text-xs text-slate-500">
          Showing first {contacts.length} of {totalCount} contacts. CSV export includes all rows.
        </p>
      ) : null}
    </div>
  );
}
