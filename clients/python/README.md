# proteinio — Python client for the Protein I/O API

Programmatic access to the same in-house, CPU-only structure **review** that the web app
uses: contacts, confidence-aware trust labels, interface metrics, pockets, secondary
structure, antibody CDRs, ligand validity, comparison (TM-align / lDDT / DockQ), and
batch triage.

Protein I/O is **local-first** — there is no hosted public endpoint. You point the client
at a backend **you run yourself**, so nothing leaves your machine and there are no rate
limits or costs but your own.

## Run a backend

```bash
# from the repo root
cd backend
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

## Install the client

```bash
pip install ./clients/python        # from the repo
# or, for development:
pip install -e ./clients/python
```

## Use it

```python
from proteinio import Client

pio = Client("http://localhost:8000")   # or set PROTEINIO_API_URL

pio.health()                             # {'status': 'ok'}
pio.versions()                           # tool versions (provenance)

# Analyze by identifier
a = pio.analyze_pdb("1hsg")              # RCSB fetch + analyze
print(a["summary"]["contact_count"], len(a["pockets"]))

af = pio.analyze_alphafold("P00533")     # AlphaFold DB model
print(af["confidence"]["average_plddt"])

# Analyze a local file (optionally with a PAE/Boltz/Chai confidence sidecar)
r = pio.analyze_file("design.cif", confidence="design.json", cutoff=4.0)

# Compare two structures
cmp = pio.compare("model.cif", "reference.cif")
print(cmp["tm_align"], cmp["dockq"])

# Batch triage + fold clustering (design campaigns)
batch = pio.batch_analyze(["d1.cif", "d2.cif"], include_validity=True)
clusters = pio.batch_cluster(["d1.cif", "d2.cif"], tm_threshold=0.5)

# Known binders (ChEMBL)
pio.chembl("P00533")
```

Every method returns plain `dict`s matching the API's JSON. See the interactive API docs
at `http://localhost:8000/docs` when the backend is running.

## License

GPL-3.0-or-later (same as Protein I/O).
