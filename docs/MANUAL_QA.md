# Manual QA Checklist

Use this checklist before public demo updates and after meaningful frontend or backend changes.

## Local Backend

- `[ ]` Start the backend from the repo root.
- `[ ]` Visit `http://localhost:8000/health`.
- `[ ]` Confirm the response is `{"status":"ok"}`.
- `[ ]` Run `.venv/bin/pytest backend/tests`.

## Local Frontend

- `[ ]` Start the frontend from `frontend/`.
- `[ ]` Open `http://localhost:3000`.
- `[ ]` Confirm the upload panel, sample button, viewer area, summary cards, tables, and export button render.
- `[ ]` Confirm no obvious console errors.

## Sample Flow

- `[ ]` Click `Load sample`.
- `[ ]` Confirm the sample file name appears.
- `[ ]` Confirm the structure renders in the 3D viewer.
- `[ ]` Click `Analyze structure`.
- `[ ]` Confirm summary cards update.
- `[ ]` Confirm the interaction summary panel appears.
- `[ ]` Confirm chain rows are shown.
- `[ ]` Confirm ligand rows are shown when ligands exist.
- `[ ]` Confirm contact rows are shown.
- `[ ]` Confirm contact rows include category labels.
- `[ ]` Confirm `Export CSV` downloads a contacts CSV.

## Contact Category Flow

- `[ ]` Analyze a structure with contacts.
- `[ ]` Switch the contact filter between `All`, `Protein-protein`, `Protein-ligand`, `Protein-water`, `Ligand-water`, `Inter-chain`, and `Very close`.
- `[ ]` Confirm the contact table count and visible rows update for each available category.
- `[ ]` Confirm selecting a filtered contact still highlights the matching residues in the viewer.
- `[ ]` Confirm exported CSV includes the `contact_categories` column.

## Ligand Interaction Flow

- `[ ]` Analyze a structure with at least one ligand.
- `[ ]` Confirm the ligand interaction summary appears.
- `[ ]` Confirm each ligand row shows total, protein, water, very-close, closest contact, top residues, and distance buckets.
- `[ ]` Click `Export ligand CSV` and confirm the downloaded CSV includes one row per ligand.

## Upload Flow

- `[ ]` Upload a local `.pdb` file.
- `[ ]` Upload a local `.cif` or `.mmcif` file.
- `[ ]` Confirm the file name appears.
- `[ ]` Confirm the structure renders in the 3D viewer.
- `[ ]` Analyze with the default `4.0` angstrom cutoff.
- `[ ]` Change the cutoff and rerun analysis.
- `[ ]` Confirm contact count changes when appropriate.
- `[ ]` Confirm invalid or empty files show useful errors.

## PAE Sidecar Flow

- `[ ]` Upload or load a structure file.
- `[ ]` Attach a valid AlphaFold-style PAE JSON sidecar.
- `[ ]` Run analysis and confirm the PAE sidecar panel appears.
- `[ ]` Confirm residue count, mean PAE, max PAE, and high-error pair count are shown.
- `[ ]` Attach invalid PAE JSON and confirm a useful validation error appears.
- `[ ]` Confirm analysis still works without a PAE sidecar.

## Table-to-Viewer Interaction

- `[ ]` Select a chain row and confirm the row and 3D structure highlight update.
- `[ ]` Select a ligand row and confirm the ligand is highlighted in the viewer.
- `[ ]` Select a contact row and confirm both contact residues are highlighted.
- `[ ]` Clear the selection and confirm the viewer returns to the base structure style.
- `[ ]` Confirm selection controls work with keyboard focus and activation.

## Predicted Confidence Flow

- `[ ]` Upload an AlphaFold-style file with a filename such as `AF-P69905-F1-model_v4.pdb`.
- `[ ]` Confirm the confidence panel appears after analysis.
- `[ ]` Confirm average pLDDT, category counts, and low-confidence warnings are shown when applicable.
- `[ ]` Switch between `Structure` and `pLDDT` coloring modes and confirm the Mol* viewer updates its confidence coloring.
- `[ ]` Upload a normal experimental-style file and confirm no confidence panel appears.

## Structure Comparison Flow

- `[ ]` Open Compare and confirm the structure A/B file inputs render.
- `[ ]` Confirm each side can switch independently between File, PDB ID, and AlphaFold.
- `[ ]` Fetch an RCSB entry such as `4HHB` on one side and confirm the fetched mmCIF becomes ready.
- `[ ]` Fetch an AlphaFold entry such as `P69905` on one side and confirm the fetched mmCIF becomes ready.
- `[ ]` Confirm invalid IDs and failed public fetches stay scoped to the relevant side.
- `[ ]` Confirm Compare remains disabled until both supported files are selected.
- `[ ]` Compare `examples/sample.pdb` with `examples/sample.cif`.
- `[ ]` Confirm A/B summary metrics and B-minus-A deltas appear.
- `[ ]` Switch between Shared, Gained in B, and Lost from A.
- `[ ]` Confirm the limitations state that no alignment, RMSD, TM-score, or 3D superposition is performed.
- `[ ]` Export the representative examples CSV and confirm it includes difference category, contact identity, categories, and A/B distances.
- `[ ]` Select an unsupported file or invalid cutoff and confirm a useful error appears.

## RCSB Fetch Flow

- `[ ]` Enter a valid PDB ID such as `4HHB`.
- `[ ]` Click `Fetch`.
- `[ ]` Confirm the mmCIF structure renders in the 3D viewer.
- `[ ]` Confirm the metadata panel shows title, method, RCSB link, and any available resolution or organism.
- `[ ]` Confirm chains, ligands, contacts, contact categories, interaction summary, and CSV export work after fetch.
- `[ ]` Enter removed entry `1HHB` and confirm analysis succeeds with `removed` status and replacement IDs.
- `[ ]` Enter an invalid PDB ID and confirm a useful error appears.

## AlphaFold DB Fetch Flow

- `[ ]` Enter a valid UniProt accession such as `P69905`.
- `[ ]` Click `Fetch` in the AlphaFold DB fetch panel.
- `[ ]` Confirm the mmCIF structure renders in the 3D viewer.
- `[ ]` Confirm the metadata panel shows UniProt accession, method, organism, AlphaFold DB link, and model version when available.
- `[ ]` Confirm the predicted confidence panel appears and `pLDDT` coloring mode is selected.
- `[ ]` Confirm chains, contacts, contact categories, interaction summary, and CSV export work after fetch.
- `[ ]` Enter an invalid accession and confirm a useful error appears.

## Deployed Demo

- `[ ]` Open `https://protein-io.vercel.app`.
- `[ ]` Click `Load sample`.
- `[ ]` Click `Analyze structure`.
- `[ ]` Confirm the deployed frontend reaches the deployed backend.
- `[ ]` Confirm the viewer, summary cards, chains, ligands, contacts, and CSV export work.

## Visual Layout

- `[ ]` Check desktop layout.
- `[ ]` Check mobile-width layout.
- `[ ]` Confirm the Mol* canvas and controls stay inside the viewer panel.
- `[ ]` Confirm text does not overlap controls or tables.

## Browser Cache

- `[ ]` Analyze a local uploaded structure, reload, and confirm the upload is not restored.
- `[ ]` Fetch an RCSB or AlphaFold structure, reload, and confirm the public structure is restored.
- `[ ]` Confirm the selected mode, results tab, and tab-strip position survive reload.
- `[ ]` Click `Reset`, reload, and confirm the restored public structure is cleared.
