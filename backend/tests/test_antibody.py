"""Phase 14 — in-house antibody Fv/CDR annotation."""

from types import SimpleNamespace

# Real sequences (trastuzumab VH/VL, rituximab VH, hemoglobin-α as a negative).
TRAS_VH = "EVQLVESGGGLVQPGGSLRLSCAASGFNIKDTYIHWVRQAPGKGLEWVARIYPTNGYTRYADSVKGRFTISADTSKNTAYLQMNSLRAEDTAVYYCSRWGGDGFYAMDYWGQGTLVTVSS"
TRAS_VL = "DIQMTQSPSSLSASVGDRVTITCRASQDVNTAVAWYQQKPGKAPKLLIYSASFLYSGVPSRFSGSRSGTDFTLTISSLQPEDFATYYCQQHYTTPPTFGQGTKVEIK"
RITUX_VH = "QVQLQQPGAELVKPGASVKMSCKASGYTFTSYNMHWVKQTPGRGLEWIGAIYPGNGDTSYNQKFKGKATLTADKSSSTAYMQLSSLTSEDSAVYYCARSTYYGGDWYFNVWGAGTTVTVSA"
HBA = "VLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR"

_ONE_TO_THREE = {
    "A": "ALA", "R": "ARG", "N": "ASN", "D": "ASP", "C": "CYS", "Q": "GLN", "E": "GLU",
    "G": "GLY", "H": "HIS", "I": "ILE", "L": "LEU", "K": "LYS", "M": "MET", "F": "PHE",
    "P": "PRO", "S": "SER", "T": "THR", "W": "TRP", "Y": "TYR", "V": "VAL",
}


def chain_atoms(chain_id: str, seq: str, start: int = 1) -> list:
    """One Cα AtomRecord-like object per residue in a sequence."""
    return [
        SimpleNamespace(
            name="CA", residue_kind="protein", chain_id=chain_id,
            residue_number=str(start + i), residue_name=_ONE_TO_THREE[aa],
            x=float(i), y=0.0, z=0.0,
        )
        for i, aa in enumerate(seq)
    ]


def test_detects_heavy_and_light_with_cdrs():
    from app.antibody import annotate_antibody

    atoms = chain_atoms("H", TRAS_VH) + chain_atoms("L", TRAS_VL)
    result = annotate_antibody(atoms)
    by_chain = {r["chain_id"]: r for r in result}

    assert set(by_chain) == {"H", "L"}
    assert by_chain["H"]["domain_type"] == "VH"
    assert by_chain["L"]["domain_type"] == "VL"
    # Heavy chain sorts first.
    assert result[0]["chain_id"] == "H"

    h_cdrs = {c["name"]: c["sequence"] for c in by_chain["H"]["cdrs"]}
    assert h_cdrs["CDR-H1"] == "GFNIKDTYIH"
    assert h_cdrs["CDR-H2"] == "RIYPTNGYTRYADSVKG"
    assert h_cdrs["CDR-H3"] == "SRWGGDGFYAMDY"
    l_cdrs = {c["name"]: c["sequence"] for c in by_chain["L"]["cdrs"]}
    assert l_cdrs["CDR-L3"] == "QQHYTTPPT"


def test_generalises_to_a_different_antibody():
    from app.antibody import annotate_antibody

    result = annotate_antibody(chain_atoms("A", RITUX_VH))
    assert len(result) == 1
    assert result[0]["domain_type"] == "VH"
    cdrs = {c["name"]: c["sequence"] for c in result[0]["cdrs"]}
    # Rituximab's own CDR-H3 (different length from the trastuzumab reference).
    assert cdrs["CDR-H3"] == "STYYGGDWYFNV"
    assert cdrs["CDR-H1"] == "GYTFTSYNMH"


def test_non_antibody_chain_rejected():
    from app.antibody import annotate_antibody

    assert annotate_antibody(chain_atoms("A", HBA)) == []


def test_only_antibody_chains_returned_in_mixed_structure():
    from app.antibody import annotate_antibody

    atoms = chain_atoms("H", TRAS_VH) + chain_atoms("L", TRAS_VL) + chain_atoms("G", HBA)
    result = annotate_antibody(atoms)
    assert {r["chain_id"] for r in result} == {"H", "L"}


def test_short_chain_skipped():
    from app.antibody import annotate_antibody

    assert annotate_antibody(chain_atoms("A", TRAS_VH[:40])) == []


def test_long_non_antibody_chain_not_a_false_positive():
    # A long receptor-like chain (HER2 is 581 aa) must not be smeared into a match.
    # Global alignment inflated such chains to ~0.72; the fit alignment rejects them.
    from app.antibody import annotate_antibody

    long_chain = (HBA * 4)[:560]
    assert annotate_antibody(chain_atoms("C", long_chain)) == []


def test_cdr_residue_numbers_track_structure_numbering():
    from app.antibody import annotate_antibody

    # Start numbering at 100 → CDR residue numbers should reflect that offset.
    result = annotate_antibody(chain_atoms("H", TRAS_VH, start=100))
    h3 = next(c for c in result[0]["cdrs"] if c["name"] == "CDR-H3")
    assert h3["residue_numbers"][0] == h3["start"]
    assert int(h3["start"]) >= 100
    assert len(h3["residue_numbers"]) == h3["length"]


def test_service_attaches_mean_plddt():
    from app.models import ResidueConfidence
    from app.service import _compute_antibody

    atoms = chain_atoms("H", TRAS_VH)
    confs = [
        ResidueConfidence(chain_id="H", residue_number=str(1 + i), residue_name="ALA", plddt=90.0, category="very_high")
        for i in range(len(TRAS_VH))
    ]
    ab = _compute_antibody(atoms, confs)
    assert ab is not None
    assert ab.chains[0].domain_type == "VH"
    assert all(c.mean_plddt == 90.0 for c in ab.chains[0].cdrs)
