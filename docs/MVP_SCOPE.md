# MVP Scope

## In Scope

- Upload a local PDB or mmCIF file.
- Parse PDB and mmCIF files on the backend.
- Normalize parsed structures into `StructureData`.
- Return structure summary data:
  - structure ID
  - atom count
  - protein residue count
  - chain count
  - chain summaries
  - ligand summaries
  - residue-residue contacts
  - protein-ligand contacts when ligands exist
- Use a configurable distance cutoff, defaulting to 4.0 angstroms.
- Ignore hydrogen atoms in contact calculations.
- Cap very large contact results and return a warning.
- Render the uploaded structure in-browser using Mol*.
- Show clean scientific UI tables and summary cards.
- Export contacts as CSV.
- Include backend tests.
- Include clear docs that explain architecture and biology basics.

## Out of Scope for MVP

- Authentication.
- Database persistence.
- User accounts.
- Shareable report URLs.
- Cloud file storage.
- Background jobs.
- Live model inference.
- PDB ID fetch.
- AlphaFold, ColabFold, or Boltz-specific workflows.
- Production observability beyond basic logs.

## Quality Bar

- The app should run locally with explicit commands.
- The backend should reject empty or invalid files with useful errors.
- The frontend should have clear empty, loading, success, and error states.
- Code should stay readable and educational.
- Avoid abstractions that do not remove current complexity.
- Keep route handlers thin and keep biology logic in parser/contact/service modules.

## MVP Success Criteria

A user can upload `examples/sample.pdb` or `examples/sample.cif`, see a structure viewer, receive backend analysis, inspect tables, change the distance cutoff, and export contacts as CSV.

## Backend Scope Boundary

The backend may be shaped for future extension, but it should not implement future systems yet. In this MVP, `StructureData` is the only extension point we need: PDB/mmCIF parsing produces it, contact analysis consumes it, and the service returns a typed response. Do not add a plugin registry, parser registry, database, queue, or storage layer until there is a concrete feature that needs it.
