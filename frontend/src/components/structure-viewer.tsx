"use client";

import { useEffect, useRef, useState } from "react";

import type { ContactRecord, ResidueConfidence, ViewerSelection } from "@/lib/types";

type StructureViewerProps = {
  structureText: string;
  structureFormat: "pdb" | "cif";
  selection: ViewerSelection | null;
  residueConfidences: ResidueConfidence[];
  colorMode: "structure" | "plddt";
};

type ViewerLike = {
  clear: () => void;
  addModel: (data: string, format: string) => void;
  setStyle: (selection: object, style: object) => void;
  zoomTo: (selection?: object) => void;
  render: () => void;
};

export function StructureViewer({
  structureText,
  structureFormat,
  selection,
  residueConfidences,
  colorMode,
}: StructureViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<ViewerLike | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderStructure() {
      if (!containerRef.current || !structureText.trim()) {
        return;
      }

      try {
        setViewerError(null);
        if (!isWebGlAvailable()) {
          setViewerError("The 3D viewer needs WebGL, which is unavailable in this browser.");
          return;
        }

        const renderStarted = performance.now();
        const importStarted = performance.now();
        const threeDmol = await import("3dmol");
        const importMs = elapsedMs(importStarted);
        if (cancelled || !containerRef.current) {
          return;
        }

        const viewerCreateStarted = performance.now();
        if (!viewerRef.current) {
          viewerRef.current = threeDmol.createViewer(containerRef.current, {
            backgroundColor: "#ffffff",
          }) as ViewerLike;
        }
        const viewerCreateMs = elapsedMs(viewerCreateStarted);

        const viewer = viewerRef.current;
        const modelStarted = performance.now();
        viewer.clear();
        viewer.addModel(structureText, structureFormat);
        if (colorMode === "plddt" && residueConfidences.length) {
          applyConfidenceStyle(viewer, residueConfidences);
        } else {
          viewer.setStyle({}, { cartoon: { color: "spectrum" } });
        }
        viewer.setStyle({ hetflag: true }, { stick: { radius: 0.22, colorscheme: "greenCarbon" } });
        applySelectionStyle(viewer, selection);
        const zoomSelection = zoomSelectionFor(selection);
        viewer.zoomTo(zoomSelection);
        viewer.render();
        const modelRenderMs = elapsedMs(modelStarted);
        console.info("[protein.io timing] viewer render", {
          total_ms: elapsedMs(renderStarted),
          import_ms: importMs,
          viewer_create_ms: viewerCreateMs,
          model_render_ms: modelRenderMs,
          format: structureFormat,
          characters: structureText.length,
          selection: selection?.label ?? "none",
          color_mode: colorMode,
        });
      } catch (caught) {
        viewerRef.current = null;
        console.error("[protein.io viewer] render failed", caught);
        setViewerError("The 3D viewer needs WebGL, which is unavailable in this browser.");
      }
    }

    renderStructure();

    return () => {
      cancelled = true;
    };
  }, [colorMode, residueConfidences, selection, structureFormat, structureText]);

  if (!structureText.trim()) {
    return (
      <div className="relative flex h-[420px] items-center justify-center overflow-hidden border border-dashed border-slate-300 bg-white text-sm text-slate-500">
        Upload a PDB or mmCIF file to render the structure.
      </div>
    );
  }

  return (
    <div className="relative h-[420px] w-full overflow-hidden border border-slate-200 bg-white">
      <div ref={containerRef} className="absolute inset-0" />
      {viewerError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white px-6 text-center text-sm leading-6 text-slate-600">
          {viewerError}
        </div>
      ) : null}
    </div>
  );
}

function applyConfidenceStyle(viewer: ViewerLike, residueConfidences: ResidueConfidence[]) {
  viewer.setStyle({}, { cartoon: { color: "#d1d5db" } });

  for (const residue of residueConfidences) {
    viewer.setStyle(residueSelection(residue.chain_id, residue.residue_number), {
      cartoon: { color: confidenceColor(residue.category) },
    });
  }
}

function confidenceColor(category: ResidueConfidence["category"]) {
  if (category === "very_high") {
    return "#2563eb";
  }
  if (category === "confident") {
    return "#06b6d4";
  }
  if (category === "low") {
    return "#f59e0b";
  }
  return "#ef4444";
}

function applySelectionStyle(viewer: ViewerLike, selection: ViewerSelection | null) {
  if (!selection) {
    return;
  }

  if (selection.kind === "chain") {
    viewer.setStyle({ chain: selection.chainId }, { cartoon: { color: "#f59e0b", opacity: 0.9 } });
    return;
  }

  if (selection.kind === "ligand") {
    viewer.setStyle(ligandSelection(selection), {
      stick: { radius: 0.34, color: "#f59e0b" },
      sphere: { radius: 0.38, color: "#f59e0b" },
    });
    return;
  }

  applyContactResidueStyle(viewer, selection.contact);
}

function applyContactResidueStyle(viewer: ViewerLike, contact: ContactRecord) {
  const residueA = residueSelection(contact.chain_a, contact.residue_a);
  const residueB = residueSelection(contact.chain_b, contact.residue_b);

  viewer.setStyle(residueA, {
    cartoon: { color: "#0f766e" },
    stick: { radius: 0.24, color: "#0f766e" },
  });
  viewer.setStyle(residueB, {
    cartoon: { color: "#f59e0b" },
    stick: { radius: 0.24, color: "#f59e0b" },
  });
  viewer.setStyle({ ...residueA, atom: contact.atom_a }, { sphere: { radius: 0.42, color: "#0f766e" } });
  viewer.setStyle({ ...residueB, atom: contact.atom_b }, { sphere: { radius: 0.42, color: "#f59e0b" } });
}

function zoomSelectionFor(selection: ViewerSelection | null): object | undefined {
  if (!selection) {
    return undefined;
  }

  if (selection.kind === "chain") {
    return { chain: selection.chainId };
  }

  if (selection.kind === "ligand") {
    return ligandSelection(selection);
  }

  return residueSelection(selection.contact.chain_a, selection.contact.residue_a);
}

function ligandSelection(selection: Extract<ViewerSelection, { kind: "ligand" }>) {
  return {
    chain: selection.chainId,
    resn: selection.residueName,
    resi: selectionResidueNumber(selection.residueNumber),
    hetflag: true,
  };
}

function residueSelection(chainId: string, residueNumber: string) {
  return {
    chain: chainId,
    resi: selectionResidueNumber(residueNumber),
  };
}

function selectionResidueNumber(residueNumber: string) {
  const numericResidue = Number(residueNumber);
  return Number.isFinite(numericResidue) ? numericResidue : residueNumber;
}

function isWebGlAvailable() {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl") || canvas.getContext("webgl2"));
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}
