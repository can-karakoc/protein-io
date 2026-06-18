# Performance Baseline

Baseline captured on 2026-06-18 before Gemmi parsing or Gemmi NeighborSearch migration.

## Purpose

Measure the current Biopython parser and custom spatial-grid contact search so future parser/contact changes can be compared against real numbers.

## Inputs

| Label | Source | Notes |
| --- | --- | --- |
| `small` | `examples/sample.pdb` | Bundled app sample. |
| `medium-4HHB` | RCSB PDB `4HHB` | Human deoxyhemoglobin, downloaded to `/tmp/protein-io-bench/4HHB.pdb`. |
| `large-6VXX` | RCSB PDB `6VXX` | SARS-CoV-2 spike glycoprotein closed state, downloaded to `/tmp/protein-io-bench/6VXX.pdb`. |

## Command

```bash
.venv/bin/python scripts/benchmark_analysis.py \
  small=examples/sample.pdb \
  medium-4HHB=/tmp/protein-io-bench/4HHB.pdb \
  large-6VXX=/tmp/protein-io-bench/6VXX.pdb \
  --runs 5 \
  --warmups 1
```

## Results

| Input | Size KB | Runs | Atoms | Protein residues | Chains | Ligands | Contacts | Parse ms | Contacts ms | Response ms | Analysis ms | Wall ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| small | 1.4 | 5 | 17 | 3 | 2 | 1 | 6 | 0.30 | 0.15 | 0.01 | 0.45 | 0.45 |
| medium-4HHB | 462.7 | 5 | 4779 | 574 | 4 | 6 | 2564 | 29.68 | 120.18 | 0.10 | 149.96 | 150.59 |
| large-6VXX | 2124.7 | 5 | 23694 | 2916 | 18 | 63 | 5000 | 142.36 | 625.96 | 0.42 | 768.73 | 772.71 |

## Interpretation

- The bundled sample is effectively instant in backend-only analysis.
- On medium and large structures, contact detection is the dominant backend cost.
- Parser time still matters for large structures, but the current spatial-grid contact search takes roughly 4x the parser time on these benchmark inputs.
- Response assembly is negligible compared with parsing and contact search.
- The large `6VXX` result hits the current `5000` contact cap, so user-facing result size is controlled even when internal candidate search is expensive.

## Implications

- Gemmi parsing should still be benchmarked because parse time reaches meaningful values on large files.
- Gemmi NeighborSearch is likely the higher-impact migration because contact detection dominates the current backend wall time.
- The next comparison should run this same script after the Gemmi parser migration, then again after Gemmi NeighborSearch.

## Gemmi Parser Branch Comparison

These numbers were captured on the `feature/gemmi-parser` branch after replacing Biopython parser internals with Gemmi while keeping the existing spatial-grid contact search.

| Input | Size KB | Runs | Atoms | Protein residues | Chains | Ligands | Contacts | Parse ms | Contacts ms | Response ms | Analysis ms | Wall ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| small | 1.4 | 5 | 17 | 3 | 2 | 1 | 6 | 0.14 | 0.13 | 0.01 | 0.28 | 0.28 |
| medium-4HHB | 462.7 | 5 | 4779 | 574 | 4 | 6 | 2564 | 22.06 | 119.68 | 0.08 | 141.82 | 142.50 |
| large-6VXX | 2124.7 | 5 | 23694 | 2916 | 18 | 63 | 5000 | 101.95 | 622.63 | 0.39 | 724.97 | 729.12 |

Parser-only improvement versus the baseline:

- `small`: 0.30 ms to 0.14 ms.
- `medium-4HHB`: 29.68 ms to 22.06 ms.
- `large-6VXX`: 142.36 ms to 101.95 ms.

The contact-search cost remains essentially unchanged, which confirms that Gemmi NeighborSearch should be evaluated next.

## Gemmi Parser + NeighborSearch Branch Comparison

These numbers were captured on the `feature/gemmi-parser` branch after replacing both Biopython parser internals and the custom spatial-grid candidate search with Gemmi.

| Input | Size KB | Runs | Atoms | Protein residues | Chains | Ligands | Contacts | Parse ms | Contacts ms | Response ms | Analysis ms | Wall ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| small | 1.4 | 5 | 17 | 3 | 2 | 1 | 6 | 0.15 | 0.24 | 0.01 | 0.40 | 0.41 |
| medium-4HHB | 462.7 | 5 | 4779 | 574 | 4 | 6 | 2564 | 19.46 | 74.94 | 0.09 | 94.49 | 95.28 |
| large-6VXX | 2124.7 | 5 | 23694 | 2916 | 18 | 63 | 5000 | 93.29 | 391.05 | 0.38 | 484.71 | 488.81 |

Contact-search improvement versus Gemmi parser plus custom grid:

- `small`: 0.13 ms to 0.24 ms. The tiny sample is too small for NeighborSearch overhead to matter.
- `medium-4HHB`: 119.68 ms to 74.94 ms.
- `large-6VXX`: 622.63 ms to 391.05 ms.

Total backend wall-time improvement versus the original Biopython plus custom-grid baseline:

- `medium-4HHB`: 150.59 ms to 95.28 ms.
- `large-6VXX`: 772.71 ms to 488.81 ms.

Gemmi NeighborSearch is clearly worthwhile for real structures. SciPy `cKDTree` is not needed for the next production step unless later benchmarks show Gemmi is insufficient for a new workflow.
