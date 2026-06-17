# Learning Notes

Use this file to record what you learn while building Protein Interaction Explorer.

## Comp-Bio Concepts

- PDB files describe 3D molecular structures with atom coordinates.
- Chains are polymer subunits, often protein chains.
- Residues are amino acids or other grouped molecular units.
- Ligands are non-polymer molecules such as ATP, drugs, cofactors, or ions.
- Contacts are distance-based proximity events, not proof of biochemical interaction.

## Backend Concepts

- FastAPI exposes typed Python functions as HTTP endpoints.
- Pydantic models define clean request and response contracts.
- Biopython `Bio.PDB` parses structure files into structure, model, chain, residue, and atom objects.
- Separating parsing from contact detection keeps the code easier to test.

## Frontend Concepts

- Next.js will manage the upload workflow and result UI.
- 3Dmol.js will render PDB text in a browser-based molecular viewer.
- CSV export can happen in the browser because the contact table is already available as JSON.

## Product Lessons

- Keep the MVP focused on one complete workflow.
- A useful scientific tool needs clear empty, loading, error, and success states.
- Tables should be exportable because scientists often continue analysis in spreadsheets or notebooks.

## Open Questions

- How should contacts be grouped or filtered for larger structures?
- Should water be ignored completely or optionally shown?
- Which ligand classes should be highlighted first?
- What deployment target should host the backend?
