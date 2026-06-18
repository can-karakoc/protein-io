"use client";

import { useEffect, useRef } from "react";

type StructureViewerProps = {
  pdbText: string;
};

type ViewerLike = {
  clear: () => void;
  addModel: (data: string, format: string) => void;
  setStyle: (selection: object, style: object) => void;
  zoomTo: () => void;
  render: () => void;
};

export function StructureViewer({ pdbText }: StructureViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<ViewerLike | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderStructure() {
      if (!containerRef.current || !pdbText.trim()) {
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
      viewer.addModel(pdbText, "pdb");
      viewer.setStyle({}, { cartoon: { color: "spectrum" } });
      viewer.setStyle({ hetflag: true }, { stick: { radius: 0.22, colorscheme: "greenCarbon" } });
      viewer.zoomTo();
      viewer.render();
      const modelRenderMs = elapsedMs(modelStarted);
      console.info("[protein.io timing] viewer render", {
        total_ms: elapsedMs(renderStarted),
        import_ms: importMs,
        viewer_create_ms: viewerCreateMs,
        model_render_ms: modelRenderMs,
        characters: pdbText.length,
      });
    }

    renderStructure();

    return () => {
      cancelled = true;
    };
  }, [pdbText]);

  if (!pdbText.trim()) {
    return (
      <div className="relative flex h-[420px] items-center justify-center overflow-hidden border border-dashed border-slate-300 bg-white text-sm text-slate-500">
        Upload a PDB file to render the structure.
      </div>
    );
  }

  return <div ref={containerRef} className="relative h-[420px] w-full overflow-hidden border border-slate-200 bg-white" />;
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}
