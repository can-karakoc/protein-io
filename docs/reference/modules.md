# Module Reference

## Backend (`backend/app/`)

### Core pipeline
| Module | Responsibility |
|---|---|
| `main.py` | FastAPI app construction, `.env` load, CORS, router mount. |
| `routes.py` | All HTTP endpoints + request/response models (see [api.md](api.md)). |
| `service.py` | Orchestrates the analysis pipeline; assembles `AnalysisResponse`; core vs. `include_validity` tiers; RCSB/AlphaFold fetch-and-analyse wrappers. |
| `parser.py` | gemmi PDB/mmCIF → internal `StructureData` (atoms/chains/ligands/waters/metadata). |
| `models.py` | Pydantic response schema for the whole API. |
| `cli.py` | Command-line entry for local analysis. |

### Scientific modules (see [methods.md](methods.md))
| Module | Computes |
|---|---|
| `contacts.py` | Heavy-atom residue contacts (4.0 Å) + water bridges (3.5 Å). |
| `interaction_classifier.py` | Interaction class per contact (salt-bridge/H-bond/halogen/π-cation/aromatic/hydrophobic). |
| `contact_classification.py` | Contact categories / classification helpers. |
| `clashes.py` | Van der Waals steric clashes (overlap ≥ 0.7 Å, bond-graph-aware). |
| `confidence.py` | Per-residue pLDDT binning + summary. |
| `pae.py` | PAE sidecar parsing/validation + matrix handling. |
| `interface_confidence.py` | Interface PAE / cross-PAE + interface-confidence verdict + heatmap. |
| `interfaces.py` | Chain-pair interfaces + interface residues. |
| `sasa.py` | In-house Shrake–Rupley SASA + interface BSA (ΔSASA). |
| `lddt.py` | Superposition-free lDDT (model vs reference). |
| `dockq.py` | DockQ complex-quality score. |
| `secondary_structure.py` | P-SEA Cα-only helix/sheet/coil. |
| `pockets.py` | LIGSITE-style binding pockets + druggability proxy. |
| `antibody.py` | AntPack Fv/CDR numbering across IMGT/Kabat/Martin/Aho (+ in-house fallback). |
| `clustering.py` | TM-align fold clustering for batches. |
| `comparison.py` | Two-structure comparison (shared/gained/lost contacts). |
| `trust_score.py` | Per-contact heuristic trust label (explicitly not a validated metric). |
| `csv_export.py` | CSV serialisation. |
| `chat.py` | LLM narration / chat / batch-query (Anthropic), report-context builders, anti-fabrication prompts. |

### Integrations (`app/integrations/`)
| Module | External source / tool |
|---|---|
| `rcsb.py` | RCSB PDB fetch + metadata. |
| `alphafold.py` | AlphaFold DB fetch. |
| `uniprot.py` | UniProt annotations. |
| `chembl.py` | ChEMBL bioactivity context. |
| `foldseek.py` | Foldseek structural search. |
| `chemistry.py` | RDKit + PoseBusters ligand physical validity + strain. |
| `tmalign.py` | TM-align (tmtools) wrapper for clustering/comparison. |
| `boltz.py`, `chai.py` | Predictor-sidecar (PAE/ipTM/pTM) parsing. |

## Frontend (`frontend/src/`)

### Entry & shell
| Path | Responsibility |
|---|---|
| `app/page.tsx` | Root → `WorkspaceShell`. |
| `components/workspace/WorkspaceShell.tsx` | The live app shell — modes, layout, viewer + context panel, chat drawer. |
| `components/workspace/ContextPanel.tsx` | All result tabs, review verdict, AI review card, explain-metric popovers, antibody tab. |
| `components/workspace/StructureTray.tsx` | Loaded-structure tray (add/switch/compare/export/import). |
| `components/workspace/ChatDrawer.tsx` | Chat open/close toggle + panel. |
| `components/viewer/StructureViewer.tsx` | Mol* 3-D viewer wrapper + selection highlighting. |
| `components/workbench/BatchWorkspace.tsx` | Batch mode: ranked table, clustering, exports, "Ask the batch". |
| `components/workbench/ChatWorkspace.tsx` | Per-structure chat UI. |
| `components/workbench/*` | Legacy/auxiliary workbench components (compare, ligands, sidebar, top nav). |

### State & libraries (`src/lib/`)
| Module | Responsibility |
|---|---|
| `workspaceStore.ts` | Zustand store persisted to IndexedDB (structures, analyses, comparison, batch, chatHistory, reviewCache, chatOpen, UI). |
| `idbStorage.ts` | Debounced IndexedDB storage adapter for the persist middleware. |
| `api.ts` | `buildApiUrl` (base = `NEXT_PUBLIC_API_URL`). |
| `types.ts` | TypeScript mirror of the backend response schema. |
| `features.ts` | `CHAT_ENABLED` gate (dev or `NEXT_PUBLIC_ENABLE_CHAT`). |
| `chat.ts` | Chat request/message types + `sendChatMessage`. |
| `reviewVerdict.ts` | Deterministic rule-based Overview verdict. |
| `metricExplainers.ts` | Curated explain-this-metric text. |
| `sessionExport.ts` | PyMOL `.pml` / ChimeraX `.cxc` export. |
| `sessionBundle.ts` | Shareable workspace `.json` export/import. |
| `methodsReport.ts` | Versioned methods/provenance Markdown. |
| `campaignReport.ts`, `comparisonReport.ts` | Batch / comparison report builders. |
| `csv.ts`, `savedRuns.ts`, `compareSession.ts`, `fingerprint.ts`, `motion.ts` | CSV, saved-run cache, compare session, structure fingerprint, animation presets. |

### Design system
- Tokens in `app/globals.css` (`--pio-*`); rules in the repo `DESIGN_SYSTEM.md`. No Tailwind colour
  utilities, no hardcoded hex — everything routes through `var(--pio-*)` for light/dark theming.
