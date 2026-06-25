# Biology Notes

These notes explain the biological terms used by the app. They are intentionally practical rather than exhaustive.

## Structures

A structure file stores 3D coordinates for atoms in a biomolecule. The supported inputs are PDB and mmCIF files (uploaded or fetched from RCSB / AlphaFold DB). Each atom record includes a position in angstroms and belongs to a residue and chain.

## Chains

A chain is one continuous molecular chain in the structure file. Many proteins have one chain, but complexes can contain multiple chains. Chain IDs usually look like `A`, `B`, or `C`.

## Residues

A residue is one building block in a protein chain. For proteins, residues are amino acids such as alanine, glycine, serine, or lysine. The app counts protein residues and groups them by chain.

## Ligands

A ligand is a non-water hetero residue in the structure. Ligands can include small molecules, cofactors, ions, or bound compounds. The app reports ligand name, chain, residue number, atom count, and interaction summary.

Water molecules are excluded from the ligand table because water is ubiquitous in experimental structures and creates noisy results for a first-pass interaction report.

## Contacts

A contact is a simple distance-based interaction candidate. The app looks for heavy-atom pairs within the selected cutoff distance and reports the closest atom pair for each residue-residue or protein-ligand pair.

This is not a full physical interaction model. A contact means two residues or a residue and ligand are spatially close enough to inspect.

### Contact categories

Each contact is classified into one or more of the following categories:

| Category | Description |
|---|---|
| `protein-protein` | Both partners are protein residues |
| `protein-ligand` | One partner is a protein residue, the other a ligand |
| `protein-water` | One partner is a protein residue, the other a water molecule |
| `ligand-water` | One partner is a ligand, the other a water molecule |
| `inter-chain` | Partners are on different chains |
| `very-close-contact` | Heavy-atom distance is below 2.0 Å and should be reviewed |

Very-close-contact flags are not proof of a steric clash. They may include covalently connected or otherwise expected atom pairs because the current analysis does not perform bond perception or full stereochemical validation.

## Distance Cutoff

The default cutoff is `4.0` angstroms. A smaller cutoff returns fewer, tighter contacts. A larger cutoff returns more possible interactions but can include weaker or less meaningful neighbours.

## Hydrogens

Hydrogen atoms are ignored during contact detection. Many structure files do not include hydrogens, so ignoring them keeps results consistent across files.

## Confidence (pLDDT)

AlphaFold structures include per-residue pLDDT (predicted Local Distance Difference Test) scores that indicate model confidence:

| Score range | Label | Meaning |
|---|---|---|
| ≥ 90 | Very high | Backbone expected to be accurate |
| 70–90 | Confident | Generally correct backbone |
| 50–70 | Low | Likely disordered or flexible |
| < 50 | Very low | Should not be interpreted as a structure |

The app surfaces these as colour-coded confidence annotations in the viewer and flags contacts where one or both endpoints fall below the low-confidence threshold.

## PAE (Predicted Aligned Error)

PAE is an AlphaFold 2 output that estimates the expected error (in angstroms) for each residue-pair alignment. A low PAE between two regions means the relative positions of those regions are predicted with high confidence. The app accepts a PAE JSON sidecar file for uploaded AlphaFold structures.

## Limitations

- Only the first model is analysed when a file contains multiple models.
- Contact detection is distance-based only; the app does not classify hydrogen bonds, salt bridges, hydrophobic contacts, aromatic stacking, or metal coordination.
- Structural alignment (RMSD, TM-score) is not yet implemented. A residue-identity contact-difference endpoint exists, but the dedicated Compare user interface is not available yet.
