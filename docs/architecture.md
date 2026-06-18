# Backend Architecture

## Current Shape

The backend is intentionally small:

```text
backend/app/
  main.py
  routes.py
  service.py
  models.py
  parser.py
  contacts.py
```

`main.py` creates the FastAPI app and registers routes. `routes.py` handles HTTP details. `service.py` orchestrates the analysis flow. `parser.py` converts PDB/mmCIF content into normalized structure data. `contacts.py` performs geometry-based contact analysis.

## Why StructureData Exists

`StructureData` is the internal structure format owned by this project. The structure parser uses Gemmi, but the rest of the backend should not depend on Gemmi classes.

That gives us one clean path:

```text
PDB/mmCIF content -> parser.py -> StructureData -> analysis modules -> AnalysisResponse
```

Later, other inputs can target the same middle model:

```text
RCSB PDB ID -> future fetcher/parser -> StructureData
AlphaFold/Boltz/OpenFold output -> future parser -> StructureData
```

Once those inputs become `StructureData`, contact analysis and future report modules can reuse the same code.

## Why Routes Are Thin

Routes should know about HTTP, not structural biology. They accept uploads, read bytes, validate simple form inputs, call the service, and translate known exceptions into HTTP errors.

This keeps the app easier to test and makes the analysis code reusable from future CLIs, scripts, notebooks, or batch jobs.

## Why Analysis Modules Accept StructureData

Analysis modules should accept stable internal records, not raw upload objects or parser library objects. That keeps each module focused:

- `parser.py`: input format conversion
- `contacts.py`: distance/contact logic
- `service.py`: orchestration
- `routes.py`: HTTP boundary

This also creates a natural future path for ligand analysis, structure comparison, confidence panels, metadata extraction, and report generation.

## Contact Search

Contact detection uses Gemmi NeighborSearch as the spatial candidate generator. Relevant heavy atoms from `StructureData` are copied into a temporary Gemmi search structure, then each atom queries nearby candidates within the active cutoff. This avoids scanning every atom against every other atom while keeping the public analysis boundary based on app-owned records.

NeighborSearch is only a candidate generator. A contact is accepted only after an exact Euclidean distance check confirms the atom pair is within the cutoff.

## Why Plugins Are Not Built Yet

The project is being shaped for future plugin-style analysis modules, but there is no plugin registry in the MVP.

Reasons:

- There is currently only one real analysis module.
- A plugin system would add naming, discovery, configuration, execution, and error-handling complexity.
- Plain Python modules that accept `StructureData` give most of the future-proofing benefit now.

The correct next step is to add a few real analysis modules first, then extract a plugin interface once repeated patterns are obvious.

## Current API Response

`/analyze` and `/api/analyze` return:

```json
{
  "version": "0.1.0",
  "summary": {
    "atom_count": 0,
    "residue_count": 0,
    "chain_count": 0,
    "ligand_count": 0,
    "contact_count": 0
  },
  "chains": [],
  "ligands": [],
  "contacts": [],
  "warnings": []
}
```

The `warnings` array exists from the beginning so future parsers and modules can report issues like multiple models, skipped residues, no ligands, unsupported formats, or capped result sets without changing the response shape.
