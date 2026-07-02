"""Physical-validity and cheminformatics analysis of bound ligands.

Given raw structure content (PDB/mmCIF), extract each small-molecule ligand as an
RDKit molecule (bond orders perceived from 3D coordinates), then compute:

  * RDKit chemistry: SMILES, formula, MW, logP, HBD/HBA, TPSA, rotatable bonds,
    ring count, QED, Lipinski, PAINS, and a 2D depiction (SVG).
  * PoseBusters physical validity (config "mol"): sanitization, connectivity,
    bond geometry, steric clashes, ring/double-bond planarity, internal energy.
  * Ligand strain energy (pose vs. relaxed conformer, MMFF with UFF fallback).

Everything is fail-soft: a ligand that cannot be perceived (ions, exotic cofactors,
bad geometry) is reported with a note rather than raising, so the core analysis is
never blocked. Ions/atoms below MIN_HEAVY_ATOMS are flagged as non-small-molecule
and skipped for chemistry/validity.
"""

from __future__ import annotations

import logging

import gemmi

from app.parser import (
    classify_residue,
    detect_structure_format_from_content,
    format_residue_number,
    parse_gemmi_structure,
)

logger = logging.getLogger(__name__)

# Below this heavy-atom count a "ligand" is almost always an ion, buffer, or single
# cofactor atom — chemistry/validity is not meaningful, so we flag and skip.
MIN_HEAVY_ATOMS = 6

# Human-readable descriptions for the PoseBusters "mol" test suite.
_CHECK_DESCRIPTIONS: dict[str, str] = {
    "mol_pred_loaded": "Molecule could be loaded",
    "sanitization": "Passes RDKit sanitization",
    "inchi_convertible": "Convertible to InChI",
    "all_atoms_connected": "All atoms are connected (single fragment)",
    "bond_lengths": "Bond lengths within normal range",
    "bond_angles": "Bond angles within normal range",
    "internal_steric_clash": "No internal steric clashes",
    "aromatic_ring_flatness": "Aromatic rings are flat",
    "double_bond_flatness": "Double bonds are planar",
    "internal_energy": "Internal energy ratio is reasonable",
    "passes_valence_checks": "Passes valence checks",
    "passes_kekulization": "Passes kekulization",
}


class ChemistryError(Exception):
    """Raised only for unrecoverable, whole-structure failures (e.g. parse errors)."""


def analyze_ligand_validity(content: bytes, filename: str | None = None) -> list[dict]:
    """Return a list of per-ligand validity dicts for a structure.

    Each dict matches the ``LigandValidity`` model shape. Never raises for individual
    ligand failures — those are captured in the per-ligand ``note`` field.
    """
    text = content.decode("utf-8", errors="replace")
    try:
        fmt = detect_structure_format_from_content(text)
        structure = parse_gemmi_structure(text, "validity", file_format=fmt)
    except Exception as exc:  # pragma: no cover - defensive
        raise ChemistryError(f"Parse error: {exc}") from exc

    results: list[dict] = []
    model = structure[0]
    for chain in model:
        for residue in chain:
            if classify_residue(residue) != "ligand":
                continue
            results.append(_analyze_one(chain.name, residue))
    return results


# ── per-ligand ──────────────────────────────────────────────────────────────────


def _analyze_one(chain_id: str, residue: gemmi.Residue) -> dict:
    name = residue.name.strip()
    resnum = format_residue_number(residue)
    heavy_atoms = [a for a in residue if a.element.atomic_number > 1]
    atom_count = len(list(residue))

    base = {
        "name": name,
        "chain_id": chain_id,
        "residue_number": resnum,
        "atom_count": atom_count,
        "is_small_molecule": False,
        "pb_valid": None,
        "checks": [],
        "strain_energy": None,
        "chemistry": None,
        "note": None,
    }

    if len(heavy_atoms) < MIN_HEAVY_ATOMS:
        base["note"] = f"Ion or small cofactor ({len(heavy_atoms)} heavy atoms) — chemistry not computed."
        return base

    try:
        mol = _build_mol(residue)
    except Exception as exc:
        base["note"] = f"Could not perceive chemistry from coordinates: {exc}"
        return base

    base["is_small_molecule"] = True
    base["chemistry"] = _chemistry(mol)

    checks, pb_valid = _pose_checks(mol)
    base["checks"] = checks
    base["pb_valid"] = pb_valid

    base["strain_energy"] = _strain_energy(mol)
    return base


def _build_mol(residue: gemmi.Residue):
    """Build a sanitized RDKit Mol with a 3D conformer from a gemmi residue.

    Bond-order perception is the hard part (ligands rarely carry hydrogens). Strategy,
    most-reliable first:
      1. PDB Chemical Component Dictionary template (by residue name) mapped onto the
         3D connectivity via AssignBondOrdersFromTemplate — correct for any standard
         PDB/CCD ligand.
      2. If hydrogens are present, perceive directly from geometry (valence unambiguous).
      3. Heavy-atom-only neutral perception as a last resort (rejected if it yields
         radicals / wrong bond orders).
    """
    from rdkit import Chem
    from rdkit.Chem import AllChem, rdDetermineBonds

    has_h = any(a.element.atomic_number == 1 for a in residue)

    # 1. CCD template (correct bond orders on the real coordinates)
    template_smiles = _ccd_smiles(residue.name.strip())
    if template_smiles:
        try:
            block = _residue_pdb_block(residue, keep_h=False)
            raw = Chem.MolFromPDBBlock(block, sanitize=False, proximityBonding=True, removeHs=True)
            template = Chem.MolFromSmiles(template_smiles)
            if raw is not None and template is not None:
                fixed = AllChem.AssignBondOrdersFromTemplate(template, raw)
                Chem.SanitizeMol(fixed)
                if not _has_radicals(fixed):
                    return fixed
        except Exception:
            pass  # fall through to geometric perception

    # 2. Hydrogens present → direct geometric perception
    if has_h:
        try:
            mol = _mol_from_coords(residue, keep_h=True)
            rdDetermineBonds.DetermineBonds(mol, charge=0)
            Chem.SanitizeMol(mol)
            return Chem.RemoveHs(mol)
        except Exception:
            pass

    # 3. Heavy-atom-only neutral perception (last resort)
    try:
        mol = _mol_from_coords(residue, keep_h=False)
        rdDetermineBonds.DetermineBonds(mol, charge=0, allowChargedFragments=True)
        Chem.SanitizeMol(mol)
        if not _has_radicals(mol):
            return mol
    except Exception as exc:
        raise RuntimeError(str(exc)) from exc

    raise RuntimeError("could not assign a valid bond ordering")


def _mol_from_coords(residue: gemmi.Residue, keep_h: bool):
    from rdkit import Chem
    from rdkit.Geometry import Point3D

    rw = Chem.RWMol()
    positions: list[tuple[float, float, float]] = []
    for atom in residue:
        if not keep_h and atom.element.atomic_number <= 1:
            continue
        rw.AddAtom(Chem.Atom(atom.element.name))
        p = atom.pos
        positions.append((p.x, p.y, p.z))
    mol = rw.GetMol()
    conf = Chem.Conformer(mol.GetNumAtoms())
    for i, (x, y, z) in enumerate(positions):
        conf.SetAtomPosition(i, Point3D(x, y, z))
    mol.AddConformer(conf, assignId=True)
    return mol


def _residue_pdb_block(residue: gemmi.Residue, keep_h: bool) -> str:
    lines: list[str] = []
    serial = 1
    for atom in residue:
        if not keep_h and atom.element.atomic_number <= 1:
            continue
        element = atom.element.name.upper()
        name = (atom.name or element)[:4]
        p = atom.pos
        lines.append(
            f"HETATM{serial:>5} {name:<4} LIG A 301    "
            f"{p.x:>8.3f}{p.y:>8.3f}{p.z:>8.3f}  1.00  0.00          {element:>2}"
        )
        serial += 1
    return "\n".join(lines) + "\nEND\n"


def _has_radicals(mol) -> bool:
    return any(atom.GetNumRadicalElectrons() > 0 for atom in mol.GetAtoms())


# ── PDB Chemical Component Dictionary (CCD) SMILES lookup ──────────────────────────

_CCD_CACHE: dict[str, str | None] = {}
_CCD_URL = "https://data.rcsb.org/rest/v1/core/chemcomp/{comp_id}"
_CCD_TIMEOUT = 6


def _ccd_smiles(comp_id: str) -> str | None:
    """Fetch the ideal SMILES for a 3-letter ligand code from the RCSB CCD (cached)."""
    if not comp_id or len(comp_id) > 5:
        return None
    if comp_id in _CCD_CACHE:
        return _CCD_CACHE[comp_id]

    smiles: str | None = None
    try:
        import json
        from urllib.request import Request, urlopen

        url = _CCD_URL.format(comp_id=comp_id.upper())
        req = Request(url, headers={"User-Agent": "protein-interaction-explorer/0.1"})
        with urlopen(req, timeout=_CCD_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        descr = data.get("rcsb_chem_comp_descriptor", {}) or {}
        smiles = (
            descr.get("SMILES_stereo")
            or descr.get("SMILES")
            or descr.get("smiles_stereo")
            or descr.get("smiles")
        )
    except Exception as exc:
        logger.info("CCD lookup for %s failed: %s", comp_id, exc)
        smiles = None

    _CCD_CACHE[comp_id] = smiles
    return smiles


def _chemistry(mol) -> dict:
    from rdkit import Chem
    from rdkit.Chem import Crippen, Descriptors, QED, rdMolDescriptors

    def _safe(fn, default=None):
        try:
            return fn()
        except Exception:
            return default

    mw = _safe(lambda: round(Descriptors.MolWt(mol), 2))
    logp = _safe(lambda: round(Crippen.MolLogP(mol), 2))
    hbd = _safe(lambda: rdMolDescriptors.CalcNumHBD(mol))
    hba = _safe(lambda: rdMolDescriptors.CalcNumHBA(mol))
    tpsa = _safe(lambda: round(rdMolDescriptors.CalcTPSA(mol), 1))
    rot = _safe(lambda: rdMolDescriptors.CalcNumRotatableBonds(mol))
    rings = _safe(lambda: rdMolDescriptors.CalcNumRings(mol))
    qed = _safe(lambda: round(QED.qed(mol), 3))
    formula = _safe(lambda: rdMolDescriptors.CalcMolFormula(mol))
    smiles = _safe(lambda: Chem.MolToSmiles(mol))

    # Lipinski rule-of-five violations
    violations = 0
    if mw is not None and mw > 500:
        violations += 1
    if logp is not None and logp > 5:
        violations += 1
    if hbd is not None and hbd > 5:
        violations += 1
    if hba is not None and hba > 10:
        violations += 1

    pains = _pains_alerts(mol)

    return {
        "smiles": smiles,
        "formula": formula,
        "molecular_weight": mw,
        "logp": logp,
        "h_bond_donors": hbd,
        "h_bond_acceptors": hba,
        "tpsa": tpsa,
        "rotatable_bonds": rot,
        "ring_count": rings,
        "qed": qed,
        "lipinski_pass": violations <= 1,
        "lipinski_violations": violations,
        "pains_alerts": pains,
        "depiction_svg": _depiction_svg(mol),
    }


def _pains_alerts(mol) -> int | None:
    try:
        from rdkit.Chem import FilterCatalog

        params = FilterCatalog.FilterCatalogParams()
        params.AddCatalog(FilterCatalog.FilterCatalogParams.FilterCatalogs.PAINS)
        catalog = FilterCatalog.FilterCatalog(params)
        return len(catalog.GetMatches(mol))
    except Exception:
        return None


def _depiction_svg(mol) -> str | None:
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem
        from rdkit.Chem.Draw import rdMolDraw2D

        flat = Chem.Mol(mol)
        flat.RemoveAllConformers()
        AllChem.Compute2DCoords(flat)
        drawer = rdMolDraw2D.MolDraw2DSVG(300, 220)
        opts = drawer.drawOptions()
        opts.clearBackground = False
        drawer.DrawMolecule(flat)
        drawer.FinishDrawing()
        return drawer.GetDrawingText()
    except Exception:
        return None


def _pose_checks(mol) -> tuple[list[dict], bool | None]:
    """Run PoseBusters "mol" checks. Returns (checks, pb_valid)."""
    try:
        from posebusters import PoseBusters

        buster = PoseBusters(config="mol")
        df = buster.bust([mol], None, None, full_report=False)
        if df.empty:
            return [], None
        row = df.iloc[0].to_dict()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("PoseBusters failed: %s", exc)
        return [], None

    checks: list[dict] = []
    all_passed = True
    for key, value in row.items():
        try:
            passed = bool(value)
        except Exception:
            continue
        checks.append({
            "name": key,
            "passed": passed,
            "description": _CHECK_DESCRIPTIONS.get(key, key.replace("_", " ").capitalize()),
        })
        all_passed = all_passed and passed

    pb_valid = all_passed if checks else None
    return checks, pb_valid


def _strain_energy(mol) -> float | None:
    """kcal/mol difference between the bound pose and a relaxed conformer."""
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem

        pose = Chem.AddHs(mol, addCoords=True)

        def _energy(m) -> float | None:
            props = AllChem.MMFFGetMoleculeProperties(m)
            if props is not None:
                ff = AllChem.MMFFGetMoleculeForceField(m, props)
            else:
                ff = AllChem.UFFGetMoleculeForceField(m)
            return ff.CalcEnergy() if ff is not None else None

        e_pose = _energy(pose)
        if e_pose is None:
            return None

        relaxed = Chem.Mol(pose)
        if AllChem.MMFFGetMoleculeProperties(relaxed) is not None:
            AllChem.MMFFOptimizeMolecule(relaxed, maxIters=500)
        else:
            AllChem.UFFOptimizeMolecule(relaxed, maxIters=500)
        e_relaxed = _energy(relaxed)
        if e_relaxed is None:
            return None

        return round(e_pose - e_relaxed, 1)
    except Exception:
        return None
