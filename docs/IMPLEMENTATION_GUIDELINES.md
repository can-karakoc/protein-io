# Implementation Guidelines

Use this guide for the next phase of Protein Interaction Explorer. The goal is to improve the product workflow and UI architecture without overbuilding.

## First Implementation Plan

Start with Priority 1 and Priority 2 only:

1. Inspect the current frontend state and data flow in `frontend/src/components/protein-workbench.tsx`, `frontend/src/components/structure-viewer.tsx`, and `frontend/src/lib/types.ts`.
2. Split the current long workbench into a small number of product areas: app shell, left sidebar, viewer panel, results panel, and mode tabs.
3. Keep existing state in `ProteinWorkbench` at first unless extraction becomes necessary. Do not introduce global state management.
4. Add results tabs while reusing existing cards/tables before creating new visual systems.
5. Add empty/loading/error components that can be reused by upload, RCSB, AlphaFold, PAE, comparison, and Mol* rendering flows.
6. Verify every existing workflow still works: upload, sample, RCSB, AlphaFold, PAE, selection, CSV export, comparison, pLDDT coloring.

Stop after Priority 1 and Priority 2 are complete and explain the result before continuing.

## Recommended Component Structure

Use this structure only where it fits the existing codebase. Do not create empty or speculative files.

```text
components/
  layout/
    AppShell.tsx
    TopNav.tsx
    LeftSidebar.tsx
    ResultsPanel.tsx

  inputs/
    StructureLoader.tsx
    FileUploadCard.tsx
    RcsbFetchForm.tsx
    AlphaFoldFetchForm.tsx
    PaeUploadCard.tsx
    ExampleGallery.tsx

  viewer/
    MolstarViewer.tsx
    ViewerToolbar.tsx
    ViewerStatusBadge.tsx

  results/
    OverviewTab.tsx
    ChainsTab.tsx
    LigandsTab.tsx
    ContactsTab.tsx
    ConfidenceTab.tsx
    PaeTab.tsx
    QualityTab.tsx

  report/
    ReportView.tsx
    ProvenancePanel.tsx
    ExportMenu.tsx

  compare/
    CompareWorkspace.tsx
    CompareInputPanel.tsx
    CompareResultsPanel.tsx

  shared/
    MetricCard.tsx
    DataTable.tsx
    Badge.tsx
    Alert.tsx
    Drawer.tsx
    LoadingState.tsx
    ErrorState.tsx
    EmptyState.tsx
```

Likely first extraction:

- `TopNav`
- `LeftSidebar`
- `ResultsPanel`
- `StructureLoader`
- `AnalysisControls`
- `MetadataSummary`
- `EmptyState`
- `LoadingState`
- `ErrorState`

Keep deeper extraction for later if it makes the code easier to review.

## First Priorities to Implement

### Priority 1: Workbench Layout Redesign

Implement:

- top navigation
- `Explore | Compare | Report` mode tabs
- left sidebar for loading, controls, and metadata
- constrained Mol* viewer panel
- result tabs: Overview, Chains, Ligands, Contacts, Confidence, PAE, Quality
- responsive fallback for smaller screens

Acceptance criteria:

- UI no longer reads as one long page.
- Inputs are grouped clearly.
- Mol* stays within its panel and does not widen the page after render.
- Existing functionality still works.
- `npm run lint` and `npm run build` pass.

### Priority 2: Empty, Loading, and Error States

Implement:

- empty state with upload, RCSB, AlphaFold, and sample CTAs
- loading states for file parsing, RCSB fetch, AlphaFold fetch, PAE parsing, comparison, and Mol* rendering
- human-readable errors with suggested next actions

Acceptance criteria:

- no silent failures
- every input path has visible loading/error feedback
- users understand what happened and what to try next

## Risky Areas

- Mol* can inject canvas and controls with intrinsic sizing. Always constrain viewer parents with `min-w-0`, `max-w-full`, and overflow control.
- Next production builds should use Webpack for Mol* unless Turbopack compatibility is proven.
- Table-to-viewer selection depends on Mol* expression generation. Refactors must preserve chain, ligand, and contact selection behavior.
- Large structures can create wide/long result tables. Keep tables inside `overflow-x-auto` containers.
- Predicted-structure UI should only appear when confidence or PAE data exists.

## Preservation Rules

Do not break these existing paths:

- local upload for `.pdb`, `.cif`, `.mmcif`
- bundled sample loader
- RCSB fetch by PDB ID
- AlphaFold DB fetch by UniProt accession
- optional PAE JSON sidecar
- contact analysis and category filtering
- chain, ligand, and contact row selection
- pLDDT color mode
- contact CSV export
- ligand CSV export
- structure comparison endpoint and UI

## Reporting After Each Major Step

After each major step, report:

1. what changed
2. files edited
3. why it matters
4. how to run/test it
5. tradeoffs
6. what to understand before moving on
7. whether to continue
