# Product Direction

Protein Interaction Explorer is a browser-based structural biology workspace for loading, visualizing, analyzing, comparing, and reporting protein structures.

The app should feel like a serious scientist-facing workbench, not a demo page.

## Long-Term Goal

Help researchers inspect experimental and predicted protein structures by combining structure loading, Mol* visualization, contact analysis, ligand summaries, confidence interpretation, comparison workflows, and clean report exports in one open-source web app.

The project should be especially relevant to AI-bio and computational biology engineering teams, including companies like Boltz, because it focuses on practical workflows around structure model outputs:

- loading experimental or predicted structures
- interpreting protein contacts
- understanding ligand interactions
- validating confidence and uncertainty
- comparing predicted and reference structures
- generating clean, shareable reports

## Current App Status

The app already includes:

- Next.js frontend and FastAPI backend
- Mol* 3D viewer
- Vercel deployment
- support for `.pdb`, `.cif`, and `.mmcif`
- local file upload and bundled sample loader
- RCSB PDB ID fetch
- AlphaFold DB fetch by UniProt accession
- optional PAE JSON sidecar
- structure comparison endpoint
- table-to-viewer selection for chains, ligands, and contacts
- pLDDT coloring mode
- contact CSV export and ligand interaction CSV export
- backend/frontend timing diagnostics
- public docs, screenshots, QA checklist, and roadmap

## Current Main Problems

The next work should focus on product polish and industry-relevant workflows:

1. Full frontend redesign pass
2. Better workflow grouping
3. Better empty, loading, and error states
4. Better selected states between tables and the Mol* viewer
5. Better ligand detail workflow
6. Quality and validation panel
7. Contact confidence warnings
8. Example gallery
9. Methods and provenance panel
10. Richer report/export experience
11. Structure comparison upgrades later

## Product Modes

The redesigned app should be organized around three modes:

```text
Explore | Compare | Report
```

### Explore

Primary workflow:

```text
Load structure -> inspect metadata -> analyze contacts/ligands/confidence -> export results
```

Recommended desktop layout:

```text
Top Nav
├── App name / logo
├── Explore / Compare / Report tabs
├── Docs / GitHub links
└── Export button

Main Workbench
├── Left Sidebar: load, analysis controls, metadata
├── Center Panel: Mol* viewer
└── Right/Bottom Panel: result tabs
```

Results tabs:

```text
Overview | Chains | Ligands | Contacts | Confidence | PAE | Quality
```

Only show `Confidence` and `PAE` when relevant.

### Compare

Primary workflow:

```text
Load structure A + structure B -> compare counts/contacts -> inspect shared/gained/lost contacts
```

The current comparison is residue-contact based. Alignment, RMSD, TM-score, Foldseek integration, and side-by-side 3D superposition are future work and should not be added until the base comparison UI is clean.

### Report

Primary workflow:

```text
Generate clean shareable/exportable analysis summary
```

Reports should eventually include metadata, summary metrics, viewer screenshot if possible, ligand summaries, contact summaries, confidence warnings, PAE summary, comparison summary when applicable, methods/provenance, and export buttons.

## Product Boundaries

Do not overbuild. Avoid:

- authentication
- database
- cloud storage
- background jobs
- payments
- user accounts
- GPU/model inference
- complex state management unless necessary
- unnecessary dependencies

Keep the app simple, public, fast, and open-source friendly. Work in small, reviewable steps.

## Success Criteria

The project should demonstrate:

- serious scientist-facing product thinking
- clean browser-based structural biology workflows
- reliable Mol* visualization
- practical contact and ligand interpretation
- confidence-aware analysis for predicted structures
- transparent methods and provenance
- useful reports and exports
- open-source maintainability
- clear relevance to AI-bio workflows
