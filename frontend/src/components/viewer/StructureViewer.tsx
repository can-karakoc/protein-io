"use client";

import { useEffect, useRef, useState } from "react";

import type { ContactRecord, ResidueConfidence, ViewerSelection } from "@/lib/types";
import type { Viewer as MolstarViewer } from "molstar/lib/apps/viewer/app";
import type { BuiltInTrajectoryFormat } from "molstar/lib/mol-plugin-state/formats/trajectory";
import type { Expression } from "molstar/lib/mol-script/language/expression";
import type { MolScriptBuilder } from "molstar/lib/mol-script/language/builder";

type StructureViewerProps = {
  structureText: string;
  structureFormat: "pdb" | "cif";
  selection: ViewerSelection | null;
  residueConfidences: ResidueConfidence[];
  colorMode: "structure" | "plddt";
};

type SelectionExpression = (queryBuilder: typeof MolScriptBuilder) => Expression;

export function StructureViewer({
  structureText,
  structureFormat,
  selection,
  residueConfidences,
  colorMode,
}: StructureViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<MolstarViewer | null>(null);
  const loadedStructureRef = useRef<string>("");
  const selectionRef = useRef<ViewerSelection | null>(selection);
  const colorModeRef = useRef<StructureViewerProps["colorMode"]>(colorMode);
  const residueConfidencesRef = useRef<ResidueConfidence[]>(residueConfidences);
  const [viewerError, setViewerError] = useState<string | null>(null);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    colorModeRef.current = colorMode;
    residueConfidencesRef.current = residueConfidences;
  }, [colorMode, residueConfidences]);

  useEffect(() => {
    let cancelled = false;

    async function loadStructure() {
      if (!containerRef.current || !structureText.trim()) {
        return;
      }

      try {
        setViewerError(null);
        if (!isWebGlAvailable()) {
          setViewerError("Mol* needs WebGL, which is unavailable in this browser.");
          return;
        }

        const renderStarted = performance.now();
        const importStarted = performance.now();
        const { Viewer } = await import("molstar/lib/apps/viewer/app");
        const importMs = elapsedMs(importStarted);
        if (cancelled || !containerRef.current) {
          return;
        }

        const viewerCreateStarted = performance.now();
        viewerRef.current?.dispose();
        containerRef.current.replaceChildren();
        viewerRef.current = await Viewer.create(containerRef.current, {
          layoutIsExpanded: false,
          layoutShowControls: false,
          layoutShowSequence: false,
          layoutShowLog: false,
          layoutShowLeftPanel: false,
          collapseRightPanel: true,
          viewportShowControls: true,
          viewportShowExpand: true,
          viewportShowReset: true,
          viewportShowSelectionMode: true,
          viewportShowSettings: true,
          viewportShowToggleFullscreen: true,
          viewportBackgroundColor: "#ffffff",
          volumeStreamingDisabled: true,
        });
        const viewerCreateMs = elapsedMs(viewerCreateStarted);

        const viewer = viewerRef.current;
        const modelStarted = performance.now();
        await viewer.loadStructureFromData(structureText, molstarFormat(structureFormat), {
          dataLabel: structureFormat === "cif" ? "Uploaded mmCIF" : "Uploaded PDB",
        });
        loadedStructureRef.current = structureSignature(structureText, structureFormat);
        await applyColorTheme(viewer, colorModeRef.current, residueConfidencesRef.current);
        applySelection(viewer, selectionRef.current);
        viewer.handleResize();
        const modelRenderMs = elapsedMs(modelStarted);
        console.info("[protein.io timing] viewer render", {
          total_ms: elapsedMs(renderStarted),
          import_ms: importMs,
          viewer_create_ms: viewerCreateMs,
          model_render_ms: modelRenderMs,
          format: structureFormat,
          characters: structureText.length,
        });
      } catch (caught) {
        viewerRef.current?.dispose();
        viewerRef.current = null;
        loadedStructureRef.current = "";
        console.error("[protein.io viewer] render failed", caught);
        setViewerError("Mol* could not render this structure. Check that WebGL is enabled and the file is valid.");
      }
    }

    loadStructure();

    return () => {
      cancelled = true;
    };
  }, [structureFormat, structureText]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || loadedStructureRef.current !== structureSignature(structureText, structureFormat)) {
      return;
    }

    applySelection(viewer, selection);
  }, [selection, structureFormat, structureText]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || loadedStructureRef.current !== structureSignature(structureText, structureFormat)) {
      return;
    }

    void applyColorTheme(viewer, colorMode, residueConfidences);
  }, [colorMode, residueConfidences, structureFormat, structureText]);

  useEffect(() => {
    return () => {
      viewerRef.current?.dispose();
      viewerRef.current = null;
      loadedStructureRef.current = "";
    };
  }, []);

  if (!structureText.trim()) {
    return (
      <div className="relative flex h-[420px] min-w-0 max-w-full items-center justify-center overflow-hidden border border-dashed border-slate-300 bg-white text-sm text-slate-500">
        Upload a PDB or mmCIF file to render it with Mol*.
      </div>
    );
  }

  return (
    <div className="relative h-[420px] min-w-0 max-w-full overflow-hidden border border-slate-200 bg-white">
      <div ref={containerRef} className="absolute inset-0" />
      {colorMode === "plddt" && residueConfidences.length ? (
        <div className="pointer-events-none absolute left-3 top-3 max-w-[260px] border border-slate-200 bg-white/95 px-3 py-2 text-xs leading-5 text-slate-700 shadow-sm">
          Mol* pLDDT coloring is active using residue B-factor confidence values.
        </div>
      ) : null}
      {viewerError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white px-6 text-center text-sm leading-6 text-slate-600">
          {viewerError}
        </div>
      ) : null}
    </div>
  );
}

async function applyColorTheme(
  viewer: MolstarViewer,
  colorMode: StructureViewerProps["colorMode"],
  residueConfidences: ResidueConfidence[],
) {
  const color = colorMode === "plddt" && residueConfidences.length ? "uncertainty" : "default";

  await viewer.plugin.dataTransaction(async () => {
    for (const structure of viewer.plugin.managers.structure.hierarchy.current.structures) {
      await viewer.plugin.managers.structure.component.updateRepresentationsTheme(structure.components, { color });
    }
  });
}

function applySelection(viewer: MolstarViewer, selection: ViewerSelection | null) {
  if (!selection) {
    viewer.structureInteractivity({ action: ["select", "highlight"] });
    return;
  }

  viewer.structureInteractivity({
    action: ["select", "focus"],
    applyGranularity: true,
    expression: selectionExpression(selection),
    focusOptions: { durationMs: 250, extraRadius: 5 },
  });
}

function selectionExpression(selection: ViewerSelection): SelectionExpression {
  if (selection.kind === "chain") {
    return (MS) => chainExpression(MS, selection.chainId);
  }

  if (selection.kind === "ligand") {
    return (MS) =>
      residueExpression(MS, {
        chainId: selection.chainId,
        residueNumber: selection.residueNumber,
        residueName: selection.residueName,
      });
  }

  return (MS) => contactExpression(MS, selection.contact);
}

function contactExpression(MS: typeof MolScriptBuilder, contact: ContactRecord) {
  return MS.struct.combinator.merge([
    atomExpression(MS, {
      chainId: contact.chain_a,
      residueNumber: contact.residue_a,
      residueName: contact.residue_name_a,
      atomName: contact.atom_a,
    }),
    atomExpression(MS, {
      chainId: contact.chain_b,
      residueNumber: contact.residue_b,
      residueName: contact.residue_name_b,
      atomName: contact.atom_b,
    }),
  ]);
}

function atomExpression(
  MS: typeof MolScriptBuilder,
  selection: {
    chainId: string;
    residueNumber: string;
    residueName: string;
    atomName: string;
  },
) {
  return MS.struct.generator.atomGroups({
    "chain-test": chainTest(MS, selection.chainId),
    "residue-test": residueTest(MS, selection.residueNumber, selection.residueName),
    "atom-test": MS.core.rel.eq([MS.ammp("label_atom_id"), selection.atomName]),
  });
}

function residueExpression(
  MS: typeof MolScriptBuilder,
  selection: {
    chainId: string;
    residueNumber: string;
    residueName?: string;
  },
) {
  return MS.struct.generator.atomGroups({
    "chain-test": chainTest(MS, selection.chainId),
    "residue-test": residueTest(MS, selection.residueNumber, selection.residueName),
  });
}

function chainExpression(MS: typeof MolScriptBuilder, chainId: string) {
  return MS.struct.generator.atomGroups({
    "chain-test": chainTest(MS, chainId),
  });
}

function chainTest(MS: typeof MolScriptBuilder, chainId: string) {
  return MS.core.logic.or([
    MS.core.rel.eq([MS.ammp("auth_asym_id"), chainId]),
    MS.core.rel.eq([MS.ammp("label_asym_id"), chainId]),
  ]);
}

function residueTest(MS: typeof MolScriptBuilder, residueNumber: string, residueName?: string) {
  const numericResidue = Number(residueNumber);
  const residueTests: Expression[] = [];

  if (Number.isFinite(numericResidue)) {
    residueTests.push(
      MS.core.logic.or([
        MS.core.rel.eq([MS.ammp("auth_seq_id"), numericResidue]),
        MS.core.rel.eq([MS.ammp("label_seq_id"), numericResidue]),
      ]),
    );
  }

  if (residueName) {
    residueTests.push(MS.core.rel.eq([MS.ammp("label_comp_id"), residueName]));
  }

  if (residueTests.length === 1) {
    return residueTests[0];
  }

  return MS.core.logic.and(residueTests);
}

function molstarFormat(structureFormat: StructureViewerProps["structureFormat"]): BuiltInTrajectoryFormat {
  return structureFormat === "cif" ? "mmcif" : "pdb";
}

function structureSignature(structureText: string, structureFormat: StructureViewerProps["structureFormat"]) {
  return `${structureFormat}:${structureText.length}:${structureText.slice(0, 80)}`;
}

function isWebGlAvailable() {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl") || canvas.getContext("webgl2"));
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}
