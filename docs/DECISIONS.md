# Decisions

## Use a Next.js and FastAPI Split

Decision: Use Next.js for the frontend and FastAPI for the backend.

Why:

- Next.js is a strong fit for an interactive scientific web UI.
- FastAPI is a clear fit for Python-based structural biology analysis.
- Keeping analysis in Python avoids forcing comp-bio parsing into JavaScript.

Tradeoff:

- Local development uses two processes.
- Deployment requires coordinating frontend and backend hosting.

## Support PDB and mmCIF Through Gemmi

Decision: Support PDB and mmCIF uploads through Gemmi while keeping `StructureData` as the internal app boundary.

Why:

- PDB keeps the sample/demo workflow simple.
- mmCIF is the modern archive format and makes the parser more credible.
- Gemmi supports both formats behind one parser boundary.

Tradeoff:

- The UI and parser need a small amount of format detection.

## Normalize Structures into StructureData

Decision: Convert parser output into an app-owned `StructureData` model before analysis.

Why:

- Contact analysis should not depend on parser-library objects.
- Future PDB, mmCIF, RCSB, AlphaFold, ColabFold, Boltz, and OpenFold-style inputs can target one internal structure shape.
- Tests can focus on app behavior instead of parser library details.

Tradeoff:

- We duplicate a small subset of structural data instead of passing parser-library objects around directly.
- The normalized model must be maintained as new analysis needs appear.

## Keep Routes Thin

Decision: FastAPI route handlers only validate HTTP inputs, call `service.py`, and convert known errors into HTTP responses.

Why:

- Route handlers are easier to test and reason about.
- Biology logic stays reusable outside HTTP contexts.
- Future CLI, batch, or notebook integrations could call the service or analysis modules directly.

Tradeoff:

- There is one extra layer (`service.py`) for a small app, but it keeps responsibilities clean.

## Do Not Build Plugins Yet

Decision: Do not add a plugin registry or plugin lifecycle in the MVP.

Why:

- We do not yet have enough analysis modules to justify plugin machinery.
- `StructureData` gives us the main future-proofing benefit without extra architecture.
- Open-source contributors can still add modules as plain functions first.

Tradeoff:

- Later plugin work may require naming conventions and module boundaries, but the current data model reduces rewrite risk.

## Use 3Dmol.js for Visualization

Decision: Use 3Dmol.js unless a clear MVP blocker appears.

Why:

- It is browser-native and commonly used for molecular visualization.
- It can load PDB text directly.
- It is lighter to integrate than building custom WebGL molecular rendering.

Tradeoff:

- Advanced visualization workflows may eventually need more viewer-specific work.

## Keep One Closest Atom Pair Per Residue Pair

Decision: Contact analysis returns the closest atom-level contact for each residue-residue or protein-ligand pair.

Why:

- Returning every atom pair under cutoff creates noisy tables.
- A closest-pair summary is easier to inspect in an MVP UI.

Tradeoff:

- Users do not see every individual atom-atom contact unless this is expanded later.

## Use Gemmi NeighborSearch for Contact Search

Decision: Contact search uses Gemmi NeighborSearch as the spatial candidate generator.

Why:

- A naive all-pairs atom scan scales poorly as structures get larger.
- Gemmi NeighborSearch is faster than the first custom spatial-grid implementation on medium and large benchmark structures.
- It avoids adding SciPy while keeping parser and neighbor-search capabilities in one structural biology library.
- `contacts.py` still accepts `StructureData`, so parser-library objects do not leak into the public analysis boundary.

Tradeoff:

- `contacts.py` now creates a lightweight temporary Gemmi search structure from normalized atom records.
- If future analyses need more advanced geometry queries, SciPy `cKDTree` can still be benchmarked later.

Manual concept:

- Relevant heavy atoms are copied into a temporary Gemmi structure.
- Gemmi NeighborSearch returns nearby candidate atoms within the cutoff.
- Exact Euclidean distance is still checked before a contact is accepted.

## Fetch RCSB Structures as mmCIF

Decision: PDB ID fetch retrieves mmCIF coordinates from RCSB and runs them through the same parser and analysis pipeline as uploaded files.

Why:

- mmCIF is the modern archive format and avoids legacy PDB column limits.
- The existing Gemmi parser already supports mmCIF.
- Keeping RCSB input behind `StructureData` prevents provider-specific objects from leaking into analysis code.

Tradeoff:

- The first implementation fetches live RCSB data on demand and does not cache structures.
- Some obsolete entries are absent from the current-entry metadata API even when coordinate files are still downloadable.

Metadata scope:

- Show practical entry metadata only: PDB ID, title, method, resolution, organism when available, deposition date, entity/chain counts, and RCSB link.
- For removed/superseded entries, fall back to RCSB holdings metadata and show `status: removed` plus replacement IDs.

Parser compatibility:

- Some older mmCIF files mark standard amino acids with hetero flags. Standard amino acid residue names are still classified as protein so old entries such as `1HHB` produce useful residue/contact analysis.

## Ignore Hydrogens

Decision: Hydrogen atoms are excluded from contact detection.

Why:

- Many PDB files omit hydrogens.
- Including hydrogens can make results inconsistent across files.
- Heavy-atom contacts are a common simple starting point.

Tradeoff:

- This is not a full physical interaction model.

## No Database in MVP

Decision: Do not add a database yet.

Why:

- MVP analysis can be request/response.
- Avoids account, storage, cleanup, and privacy complexity.

Tradeoff:

- Reports are not persistent or shareable yet.
