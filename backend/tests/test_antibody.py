"""Phase 14 — in-house antibody Fv/CDR annotation."""

from types import SimpleNamespace

# Real sequences. CDR expectations use IMGT (AntPack's default scheme).
TRAS_VH = "EVQLVESGGGLVQPGGSLRLSCAASGFNIKDTYIHWVRQAPGKGLEWVARIYPTNGYTRYADSVKGRFTISADTSKNTAYLQMNSLRAEDTAVYYCSRWGGDGFYAMDYWGQGTLVTVSS"
TRAS_VL = "DIQMTQSPSSLSASVGDRVTITCRASQDVNTAVAWYQQKPGKAPKLLIYSASFLYSGVPSRFSGSRSGTDFTLTISSLQPEDFATYYCQQHYTTPPTFGQGTKVEIK"
RITUX_VH = "QVQLQQPGAELVKPGASVKMSCKASGYTFTSYNMHWVKQTPGRGLEWIGAIYPGNGDTSYNQKFKGKATLTADKSSSTAYMQLSSLTSEDSAVYYCARSTYYGGDWYFNVWGAGTTVTVSA"
# Caplacizumab — a single-domain camelid nanobody (VHH); the case the in-house
# 2-reference heuristic couldn't handle but AntPack numbers correctly.
NANOBODY_VHH = "EVQLVESGGGLVQPGNSLRLSCAASGFTFSSVYMNWVRQAPGKGLEWVSAISGSGGSTYYADSVKGRFTISRDNSKNTLYLQMNSLRAEDTAVYYCAKDRGVPYYYGMDYWGKGTLVTVSS"
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
    # IMGT CDR definitions (AntPack).
    assert h_cdrs["CDR-H1"] == "GFNIKDTY"
    assert h_cdrs["CDR-H2"] == "IYPTNGYT"
    assert h_cdrs["CDR-H3"] == "SRWGGDGFYAMDY"
    l_cdrs = {c["name"]: c["sequence"] for c in by_chain["L"]["cdrs"]}
    assert l_cdrs["CDR-L3"] == "QQHYTTPPT"


def test_generalises_to_a_different_antibody():
    from app.antibody import annotate_antibody

    result = annotate_antibody(chain_atoms("A", RITUX_VH))
    assert len(result) == 1
    assert result[0]["domain_type"] == "VH"
    assert len(result[0]["cdrs"]) == 3  # all three heavy CDRs numbered


def test_detects_nanobody_vhh():
    # The payoff of real numbering: a single-domain camelid VHH is detected + its CDRs.
    from app.antibody import annotate_antibody

    result = annotate_antibody(chain_atoms("A", NANOBODY_VHH))
    assert len(result) == 1
    assert result[0]["domain_type"] == "VH"
    cdrs = {c["name"]: c["sequence"] for c in result[0]["cdrs"]}
    assert cdrs["CDR-H3"] == "AKDRGVPYYYGMDY"


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


def test_inhouse_fallback_still_works():
    # Deploy resilience: if AntPack can't be imported, the in-house estimate runs.
    from app.antibody import _annotate_inhouse

    out = _annotate_inhouse(TRAS_VH)
    assert out is not None
    domain_type, identity, regions, order = out
    assert domain_type == "VH"
    assert identity >= 0.9  # trastuzumab is the reference
    assert _annotate_inhouse(HBA) is None  # non-antibody rejected


def test_service_attaches_mean_plddt():
    from app.models import ResidueConfidence
    from app.service import _compute_antibody

    atoms = chain_atoms("H", TRAS_VH)
    confs = [
        ResidueConfidence(chain_id="H", residue_number=str(1 + i), residue_name="ALA", plddt=90.0, category="very_high")
        for i in range(len(TRAS_VH))
    ]
    ab = _compute_antibody(atoms, confs, [], {"H"})
    assert ab is not None
    assert ab.chains[0].domain_type == "VH"
    assert all(c.mean_plddt == 90.0 for c in ab.chains[0].cdrs)
    # No antigen chain present → no paratope contacts.
    assert all(c.paratope_residues == [] for c in ab.chains[0].cdrs)
    assert ab.chains[0].antigen_chains == []
    # AntPack exposes all four numbering schemes.
    assert ab.schemes == ["imgt", "kabat", "martin", "aho"]
    assert set(ab.chains[0].cdr_schemes or {}) == {"imgt", "kabat", "martin", "aho"}


def test_paratope_and_scheme_boundaries():
    from app.antibody import annotate_antibody
    from app.service import _compute_antibody

    atoms = chain_atoms("H", TRAS_VH)
    raw = annotate_antibody(atoms)
    h3 = next(c for c in raw[0]["cdrs"] if c["name"] == "CDR-H3")
    # Every CDR-H3 residue contacts antigen chain G; a water contact (chain W / HOH)
    # must be excluded from the paratope. Contacts are duck-typed.
    contacts = [
        SimpleNamespace(chain_a="H", residue_a=rn, residue_name_a="ALA",
                        chain_b="G", residue_b="10", residue_name_b="LEU")
        for rn in h3["residue_numbers"]
    ]
    contacts.append(SimpleNamespace(chain_a="H", residue_a=h3["residue_numbers"][0], residue_name_a="ALA",
                                    chain_b="W", residue_b="1", residue_name_b="HOH"))
    ab = _compute_antibody(atoms, [], contacts, {"H", "G"})  # W is not a polymer chain
    chain = ab.chains[0]
    assert chain.antigen_chains == ["G"]  # water/non-polymer excluded
    imgt_h3 = next(c for c in chain.cdrs if c.name == "CDR-H3")
    assert imgt_h3.paratope_residues == h3["residue_numbers"]
    # CDR-H3 boundaries genuinely differ by scheme (IMGT is wider than Aho for H3).
    aho_h3 = next(c for c in (chain.cdr_schemes or {})["aho"] if c.name == "CDR-H3")
    assert aho_h3.length < imgt_h3.length
