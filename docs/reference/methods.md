# Methods — Scientific Calculations

Every metric Protein I/O reports is computed **in-house** with numpy / scipy / gemmi (plus RDKit
for chemistry and AntPack for antibody numbering) — no external binaries, no GPU. This document
is the reference for each calculation: the algorithm, its thresholds, its assumptions, its
limitations, and the literature it follows.

> **Honesty principle.** Numbers are either directly computed from coordinates or explicitly
> labelled estimates. Heuristics that are not validated scientific metrics (e.g. the per-contact
> "trust label", the druggability proxy) say so here and in the UI.

---

## 1. Parsing & the structure model

`app/parser.py` reads PDB / mmCIF with **gemmi** into an internal `StructureData` (atoms, chains,
ligands, waters, metadata). Atoms carry element, residue kind (`protein` / `ligand` / `water`),
chain, residue number/name, atom name, and coordinates. Hydrogens are detected and excluded from
geometric passes that assume heavy-atom distances. Alternate locations and insertion codes are
handled; residue identity is `(chain, residue_number)`.

---

## 2. Contacts

**Module:** `app/contacts.py` · **Default cutoff:** 4.0 Å (heavy-atom, tunable).

An inter-atomic **contact** is any pair of non-hydrogen atoms within the distance cutoff, found
with a scipy `cKDTree` neighbour search. For each residue–residue pair only the closest atom pair
is kept. Contacts span protein–protein, protein–ligand, and protein–water. Results are capped
(with a warning) to bound response size. The contact count is a first-order measure of packing /
interface extent.

**Assumptions:** a purely geometric heavy-atom distance criterion; no energy model. 4.0 Å is the
conventional "in contact" shell (covers H-bonds and the first van der Waals layer).

---

## 3. Interaction classification

**Module:** `app/interaction_classifier.py`

Each contact is classified into a single interaction class by a **priority cascade** (first match
wins), using element identity, charged/aromatic functional-group membership, and a distance cutoff
per class:

| Class | Cutoff (Å) | Criterion |
|---|---|---|
| salt-bridge | 5.0 | cationic group (Arg/Lys/His N⁺…) ↔ anionic group (Asp/Glu O⁻…) |
| halogen-bond | 4.0 | C–X (X = Cl/Br/I) donor ↔ polar acceptor (N/O) |
| hydrogen-bond | 3.5 | polar donor/acceptor pair (N/O/S ↔ N/O/S) |
| π-cation | 6.5 | aromatic ring atom ↔ cationic nitrogen |
| aromatic (π–π) | 5.5 | aromatic ring atom ↔ aromatic ring atom |
| hydrophobic | 4.5 | non-polar C ↔ non-polar C |
| unclassified | — | none of the above |

H-bonds additionally carry a strong/moderate/weak strength band by distance. Cutoffs follow common
interaction-fingerprint conventions (e.g. PLIP). **Limitation:** geometry-only — angles and
explicit hydrogens are not modelled, so H-bonds and π-interactions are *candidate* geometries
(cutoff-generous by design, for review rather than scoring). Aromatic and π-cation use a ring-atom
proxy, not a fitted ring centroid/normal.

---

## 4. Water bridges

**Module:** `app/contacts.py::find_water_bridges` · **Cutoff:** 3.5 Å (H-bond range, PLIP-style).

A water bridge is reported when a single water oxygen is simultaneously within 3.5 Å of both a
protein atom and a ligand atom — i.e. a water-mediated protein–ligand contact. The nearest protein
and ligand partner per bridging water is reported.

---

## 5. Steric clashes (van der Waals overlap)

**Module:** `app/clashes.py` · **Threshold:** VDW overlap ≥ **0.7 Å** (`CLASH_OVERLAP`).

A clash is a van der Waals overlap between atoms that are **not covalently connected** — *not*
simply "closer than 2 Å", which would count every peptide-bond C–N (~1.33 Å). The detector:

1. Builds a **covalent bond graph** from Cordero covalent radii: two atoms are bonded if
   `dist ≤ r_cov(a) + r_cov(b) + 0.45 Å`.
2. Excludes **1–2** (bonded) and **1–3** (share a bonded neighbour — bond-angle) pairs.
3. For each remaining pair, computes overlap `= vdw(a) + vdw(b) − dist` using **Bondi** VDW radii.
4. Flags the pair as a clash when overlap ≥ 0.7 Å.

The 0.7 Å threshold is calibrated so normal well-packed heavy-atom contacts (which overlap ~0.4–0.5 Å)
do not register: crambin (1CRN) → 0, 2HHB → a handful, an over-clashed model → many. This
**calibrated heavy-atom estimate** replaces an earlier naive distance count. **Limitation:** it does
not add or optimise hydrogens (no reduce/MolProbity all-atom pass), so it is a conservative
heavy-atom clash estimate, not a MolProbity clashscore. Metal-coordination and other non-covalent
close contacts can appear as clashes; this is documented rather than special-cased.

---

## 6. Confidence — pLDDT

**Module:** `app/confidence.py`

For predicted structures, pLDDT is read per residue (from the B-factor column of AlphaFold-style
files) and binned:

| Band | pLDDT | Meaning |
|---|---|---|
| very high | ≥ 90 | backbone + side-chain generally reliable |
| confident | 70 – 90 | backbone reliable |
| low | 50 – 70 | treat with caution |
| very low | < 50 | likely disordered / unreliable |

The summary reports the average pLDDT and per-band counts. Experimental structures have no pLDDT;
the app says so rather than inventing confidence. Predicted-structure detection keys off source
markers (`alphafold`, `colabfold`, `boltz`, `plddt`, …).

---

## 7. PAE and global model scores

**Modules:** `app/pae.py`, `app/models.py::GlobalModelScores`

**PAE** (Predicted Aligned Error) is *provided* by the predictor as a sidecar (JSON matrix), not
computed here. The app validates and retains the matrix, downsamples it for a heatmap, and derives
interface metrics from it (§8). **ipTM / pTM / chain-pair ipTM** likewise come from the Boltz / Chai
/ AlphaFold sidecar (`GlobalModelScores`) — they are read and displayed, never fabricated.

---

## 8. Interface confidence

**Module:** `app/interface_confidence.py`

Global pLDDT/PAE correlate poorly with *complex* quality, so interface-specific metrics are the
honest signal. Given the PAE matrix and the parsed structure, for each chain pair the module
computes, aligning PAE tokens to protein residues by parse order (guarded on an exact residue-count
match):

- **interface PAE (iPAE):** mean PAE over interface residue pairs (symmetric).
- **cross-PAE:** mean PAE over *all* inter-chain residue pairs (symmetric).
- an **interface-confidence verdict** from iPAE + interface pLDDT.

If tokens can't be aligned (e.g. counts differ because of ligands), the heatmap is still produced
but per-pair metrics degrade gracefully to null.

---

## 9. Interfaces and buried surface area (BSA / dSASA)

**Modules:** `app/interfaces.py`, `app/sasa.py`

Interfaces are the inter-chain contact clusters (chain pairs and their interface residues). For each
chain pair the **buried surface area** on binding is the change in solvent-accessible surface area:

```
ΔSASA = SASA(A alone) + SASA(B alone) − SASA(A+B complex)
```

SASA is computed with an **in-house Shrake–Rupley** algorithm (numpy; the freesasa wheel does not
build on Python 3.13/arm64). ΔSASA counts area buried on *both* partners — a typical protein–protein
interface buries ~1500–2000 Å². This is the dSASA used by binder-design filters (e.g. BindCraft).

---

## 10. lDDT (local Distance Difference Test)

**Module:** `app/lddt.py` · **Inclusion radius:** 15 Å · **Thresholds:** 0.5, 1, 2, 4 Å.

lDDT is the superposition-free local metric used by CASP/CAMEO and AlphaFold: the fraction of
reference inter-residue distances (within the 15 Å inclusion radius) preserved in the model,
averaged over the four tolerance thresholds. It needs no alignment and is robust to domain motion.
Residues are matched between the two structures by `(chain, residue_number)`, so it is meaningful
for a model vs. a reference of the same molecule. Reference: Mariani et al. 2013.

---

## 11. DockQ

**Module:** `app/dockq.py` · Reference: Basu & Wallner, 2016.

The standard continuous [0, 1] quality score for a predicted protein complex, combining three CAPRI
quantities on the primary (most-native-contacts) interface:

```
DockQ = ( Fnat + 1/(1+(iRMSD/1.5)²) + 1/(1+(LRMSD/8.5)²) ) / 3
```

- **Fnat** — fraction of native (reference) residue–residue contacts preserved.
- **iRMSD** — interface backbone RMSD after superposing the interface.
- **LRMSD** — ligand-chain backbone RMSD after superposing on the receptor.

In-house: numpy Kabsch superposition, scipy contacts. Model (A) and reference (B) chains/residues
are matched by identity.

---

## 12. Secondary structure

**Module:** `app/secondary_structure.py` · Method: **P-SEA** (Labesse et al. 1997).

Helix / sheet / coil is assigned from **Cα-only** geometry — three Cα distances `d(i, i+2/3/4)` and
two angles (the Cα valence angle θ and the Cα torsion τ) matched against helix/strand reference
values, then filtered by minimum segment length (helix ≥ 5, strand ≥ 3). No hydrogen bonds, no DSSP
binary. It is deliberately labelled a **geometric estimate**; it is robust to missing side chains,
so it works on predicted and Cα-trace models where DSSP would be unreliable.

---

## 13. Binding pockets

**Module:** `app/pockets.py` · Method: **LIGSITE**-style (Hendlich et al. 1997).

A grid is laid over the protein; a free grid point is a pocket point if it is enclosed by protein
along enough of **7 scan directions** (3 axes + 4 body diagonals). Connected pocket points are
clustered into pockets, reported by **volume**, with the **lining residues** and a **druggability
proxy = volume × mean enclosure**. The druggability value is an explicit *proxy*, not a trained
druggability model. Gated to the interactive path (heavier); fail-soft.

---

## 14. Ligand physical validity

**Module:** `app/integrations/chemistry.py` · **RDKit** + **PoseBusters** (`mol` config).

For each bound ligand a gemmi residue is converted to an RDKit molecule (bond orders perceived from
3-D coordinates) and checked:

- **RDKit chemistry:** SMILES, formula, MW, logP, HBD/HBA, TPSA, rotatable bonds.
- **PoseBusters `mol` suite:** sanitization, connectivity, bond lengths, bond angles, internal
  steric clashes, aromatic-ring / double-bond flatness, valence checks, internal energy ratio.
- **Ligand strain energy:** pose vs. a relaxed conformer (MMFF, UFF fallback).

Fails soft per ligand (a ligand that RDKit can't perceive is skipped, not fatal). This is the
"is the bound pose physically sensible?" review, not a docking score.

---

## 15. Antibody numbering, CDRs, and paratope

**Modules:** `app/antibody.py`, `app/service.py` · Numbering: **AntPack** (pip wheel, no HMMER).

- **Fv detection + numbering.** Each chain ≥ ~90 aa is numbered with AntPack; a chain is accepted
  as a variable domain (VH / VL, including single-domain **nanobodies / VHH**) above a germline
  identity floor. Falls back to an in-house fit-alignment estimate if AntPack is unavailable.
- **CDRs.** CDR-1/2/3 loops (H or L) with residue range, sequence, length, and per-CDR mean pLDDT.
- **Numbering schemes.** CDR boundaries are precomputed under **IMGT, Kabat, Martin, and Aho** in a
  single pass so the UI can toggle numbering with no re-analysis. Martin ≈ Chothia-extended
  (AntPack has no separate Chothia scheme).
- **Paratope.** CDR residues that contact an **antigen** — a non-antibody polymer chain, with waters
  and ligands excluded — are marked per CDR (`paratope_residues`), and each Fv chain lists the
  antigen chains it binds. Verified on 1VFB (Fv D1.3 + lysozyme): antigen chain C, CDR-H3 shifts
  96–105 (IMGT) → 98–104 (Aho), paratope H3 99–102.

---

## 16. Fold clustering (batch)

**Module:** `app/clustering.py` · **tmtools** (TM-align, pip wheel).

For a design campaign, an all-vs-all TM-align similarity matrix drives leader/greedy clustering into
fold groups (representative, members, mean intra-cluster TM-score). O(N²) TM-align — fine for the
laptop-scale campaigns this review tool handles (capped at the batch limit), CPU-only, fail-soft.

---

## 17. Structural comparison

**Module:** `app/comparison.py`

Compares two analysed structures: summary deltas plus **shared / gained / lost** residue-residue
contact identities (by `(chain, residue)` pairs), so a mutation or a redesign can be reviewed as
what interactions it kept, added, or broke.

---

## 18. Trust label (heuristic — not a validated metric)

**Module:** `app/trust_score.py`

Each contact gets a review-aid label — `possible-clash`, `no-confidence-data`, `low-confidence`,
`high-confidence`, or `inspect-manually` — from the contact's clash flag and the pLDDT of its
residues. Its own docstring states it is **"not a validated scientific metric"**; it is a triage
aid for a human reviewer, surfaced as such in the UI.

---

## Global assumptions & limitations

- **Geometry, not energetics.** Interactions and clashes are distance/geometry criteria, not a force
  field. They are tuned for interpretable review, not for ranking by binding energy.
- **Heavy-atom, no added hydrogens.** Clashes and H-bond geometry use heavy atoms; the app does not
  run an all-atom H-placement/optimisation pass (the deferred MolProbity-grade build).
- **Provided vs. computed confidence.** pLDDT, PAE, ipTM, and pTM originate from the predictor; the
  app displays and derives from them but never invents them. Experimental structures simply have no
  such scores.
- **Estimates are labelled.** Secondary structure (P-SEA), druggability (volume × enclosure), and the
  contact trust label are explicit estimates/proxies.
- **Fail-soft everywhere.** Any heavy pass that errors (or is starved of memory on a small box) drops
  its section; the rest of the analysis still returns.

## References

- Mariani et al. (2013). *lDDT.* Bioinformatics 29(21):2722–8.
- Basu & Wallner (2016). *DockQ.* PLoS ONE 11(8):e0161879.
- Labesse et al. (1997). *P-SEA.* CABIOS 13(3):291–5.
- Hendlich, Rippmann & Barnickel (1997). *LIGSITE.* J Mol Graph Model 15(6):359–63.
- Bondi (1964). *van der Waals radii.* J Phys Chem 68(3):441–51.
- Cordero et al. (2008). *Covalent radii.* Dalton Trans. 2832–8.
- Buttenschoen, Morris & Deane (2024). *PoseBusters.* Chem Sci 15:3130.
- Dunbar & Deane (2016). *ANARCI / IMGT numbering* (AntPack implements the schemes).
- Zhang & Skolnick (2005). *TM-align.* Nucleic Acids Res 33(7):2302–9.
