# Biology Notes

These notes explain the biological terms used by the MVP. They are intentionally practical rather than exhaustive.

## Structures

A structure file stores 3D coordinates for atoms in a biomolecule. In this MVP, the supported inputs are PDB and mmCIF files. Each atom record includes a position in angstroms and belongs to a residue and chain.

## Chains

A chain is one continuous molecular chain in the structure file. Many proteins have one chain, but complexes can contain multiple chains. Chain IDs usually look like `A`, `B`, or `C`.

## Residues

A residue is one building block in a protein chain. For proteins, residues are amino acids such as alanine, glycine, serine, or lysine. The app counts protein residues and groups them by chain.

## Ligands

A ligand is a non-water hetero residue in the uploaded structure. Ligands can include small molecules, cofactors, ions, or bound compounds. The MVP reports ligand name, chain, residue number, and atom count.

Water molecules are excluded from the ligand table because water is common in experimental structures and usually creates noisy results for a first-pass interaction report.

## Contacts

A contact is a simple distance-based interaction candidate. The MVP looks for heavy-atom pairs within the selected cutoff distance and reports the closest atom pair for each residue-residue or protein-ligand pair.

This is not a full physical interaction model. A contact means two residues or a residue and ligand are spatially close enough to inspect.

## Distance Cutoff

The default cutoff is `4.0` angstroms. A smaller cutoff returns fewer, tighter contacts. A larger cutoff returns more possible interactions but can include weaker or less meaningful neighbors.

## Hydrogens

Hydrogen atoms are ignored during contact detection. Many structure files do not include hydrogens, so ignoring them keeps results more consistent across files.

## Limitations

- The MVP supports PDB and mmCIF upload.
- Only the first model is analyzed when a file contains multiple models.
- Contact categories are currently broad: residue-residue and protein-ligand.
- The app does not yet classify hydrogen bonds, salt bridges, hydrophobic contacts, aromatic contacts, or metal coordination.
- AlphaFold-style confidence annotations are planned but not yet parsed.
