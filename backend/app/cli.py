"""
protein-io CLI

Commands:
  analyze  — analyze a single structure file (PDB/CIF/mmCIF)
  compare  — compare two structure files
  batch    — analyze all structure files in a directory or a list of files

Output is JSON by default; use --summary for a compact human-readable table.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path


# ── helpers ───────────────────────────────────────────────────────────────────

STRUCTURE_EXTENSIONS = {".pdb", ".cif", ".mmcif"}

RANK_MEDALS = {1: "🥇", 2: "🥈", 3: "🥉"}


def _err(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)


def _collect_structure_files(paths: list[str]) -> list[Path]:
    """Expand directories to structure files; pass files through directly."""
    collected: list[Path] = []
    for raw in paths:
        p = Path(raw)
        if p.is_dir():
            for f in sorted(p.iterdir()):
                if f.suffix.lower() in STRUCTURE_EXTENSIONS:
                    collected.append(f)
        elif p.is_file():
            if p.suffix.lower() in STRUCTURE_EXTENSIONS:
                collected.append(p)
            else:
                _err(f"skipping {p} (unsupported extension)")
        else:
            _err(f"path not found: {p}")
    return collected


def _plddt_bar(plddt: float | None, width: int = 10) -> str:
    if plddt is None:
        return "─" * width
    filled = round(plddt / 100 * width)
    bar = "█" * filled + "░" * (width - filled)
    if plddt >= 90:
        color = "\033[92m"  # bright green
    elif plddt >= 70:
        color = "\033[93m"  # yellow
    else:
        color = "\033[91m"  # red
    return f"{color}{bar}\033[0m"


def _print_summary_table(entries: list[dict]) -> None:
    """Print a compact ranked table to stdout."""
    COL_W = {"rank": 5, "file": 28, "chains": 7, "res": 7, "contacts": 9, "plddt": 16, "score": 7, "status": 8}
    header = (
        f"{'#':<{COL_W['rank']}} "
        f"{'FILE':<{COL_W['file']}} "
        f"{'CHAINS':>{COL_W['chains']}} "
        f"{'RES':>{COL_W['res']}} "
        f"{'CONTACTS':>{COL_W['contacts']}} "
        f"{'pLDDT':^{COL_W['plddt']}} "
        f"{'SCORE':>{COL_W['score']}} "
        f"STATUS"
    )
    sep = "─" * len(header)
    print(sep)
    print(header)
    print(sep)
    for e in entries:
        rank = e.get("rank")
        medal = RANK_MEDALS.get(rank, "") if rank else ""
        rank_str = f"{medal}#{rank}" if rank else "  —"
        filename = e["filename"]
        if len(filename) > COL_W["file"]:
            filename = "…" + filename[-(COL_W["file"] - 1):]
        a = e.get("analysis") or {}
        summ = a.get("summary") or {}
        conf = a.get("confidence") or {}
        plddt = conf.get("average_plddt")
        score = e.get("score")
        bar = _plddt_bar(plddt)
        plddt_str = f"{bar} {f'{plddt:.1f}':>5}" if plddt is not None else f"{'':16}"
        status = "✗ Error" if e.get("error") else "✓ OK"
        print(
            f"{rank_str:<{COL_W['rank']}} "
            f"{filename:<{COL_W['file']}} "
            f"{summ.get('chain_count', '—'):>{COL_W['chains']}} "
            f"{summ.get('residue_count', '—'):>{COL_W['res']}} "
            f"{summ.get('contact_count', '—'):>{COL_W['contacts']}} "
            f"{plddt_str} "
            f"{f'{score:.1f}' if score is not None else '—':>{COL_W['score']}} "
            f"{status}"
        )
        if e.get("error"):
            print(f"  {'':>{COL_W['rank']}} \033[91m{e['error']}\033[0m")
    print(sep)


def _compute_score(entry: dict, max_density: float) -> float | None:
    a = entry.get("analysis")
    if not a:
        return None
    summ = a.get("summary") or {}
    conf = a.get("confidence") or {}
    plddt = conf.get("average_plddt")
    residues = summ.get("residue_count") or 1
    contacts = summ.get("contact_count") or 0
    clashes = (a.get("interaction_summary") or {}).get("possible_clash_count") or 0
    density = contacts / residues
    plddt_part = (plddt / 100) * 70 if plddt is not None else 35
    density_part = (density / max_density) * 30 if max_density > 0 else 0
    clash_penalty = min(10, (clashes / residues) * 200)
    return max(0.0, plddt_part + density_part - clash_penalty)


def _rank_entries(entries: list[dict]) -> list[dict]:
    densities = []
    for e in entries:
        a = e.get("analysis") or {}
        summ = a.get("summary") or {}
        r = summ.get("residue_count") or 1
        c = summ.get("contact_count") or 0
        densities.append(c / r)
    max_density = max(densities, default=1) or 1

    for e in entries:
        e["score"] = _compute_score(e, max_density)

    succeeded = [e for e in entries if e["score"] is not None]
    succeeded.sort(key=lambda e: e["score"], reverse=True)
    for i, e in enumerate(succeeded, 1):
        e["rank"] = i

    for e in entries:
        if "rank" not in e:
            e["rank"] = None
    return entries


# ── subcommands ───────────────────────────────────────────────────────────────

def cmd_analyze(args: argparse.Namespace) -> int:
    from app.service import analyze_pdb_content

    path = Path(args.file)
    if not path.exists():
        _err(f"file not found: {path}")
        return 1
    if path.suffix.lower() not in STRUCTURE_EXTENSIONS:
        _err(f"unsupported format: {path.suffix}")
        return 1

    content = path.read_bytes()
    try:
        result = analyze_pdb_content(content, filename=path.name, cutoff_angstrom=args.cutoff)
    except Exception as exc:
        _err(str(exc))
        return 1

    data = result.model_dump()
    if args.summary:
        a = data
        summ = a.get("summary") or {}
        conf = a.get("confidence") or {}
        inter = a.get("interaction_summary") or {}
        plddt = conf.get("average_plddt")
        print(f"\n\033[1m{path.name}\033[0m")
        print(f"  Chains      {summ.get('chain_count', '—')}")
        print(f"  Residues    {summ.get('residue_count', '—')}")
        print(f"  Contacts    {summ.get('contact_count', '—')}")
        print(f"  Ligands     {summ.get('ligand_count', '—')}")
        if plddt is not None:
            print(f"  pLDDT       {_plddt_bar(plddt)} {plddt:.1f}")
        if inter.get("possible_clash_count"):
            print(f"  \033[91mClashes     {inter['possible_clash_count']}\033[0m")
        if data.get("warnings"):
            for w in data["warnings"]:
                print(f"  \033[93m⚠  {w}\033[0m")
        print()
    else:
        print(json.dumps(data, indent=2))
    return 0


def cmd_compare(args: argparse.Namespace) -> int:
    from app.service import compare_pdb_contents

    path_a, path_b = Path(args.file_a), Path(args.file_b)
    for p in (path_a, path_b):
        if not p.exists():
            _err(f"file not found: {p}")
            return 1

    try:
        result = compare_pdb_contents(
            path_a.read_bytes(),
            path_b.read_bytes(),
            filename_a=path_a.name,
            filename_b=path_b.name,
            cutoff_angstrom=args.cutoff,
        )
    except Exception as exc:
        _err(str(exc))
        return 1

    data = result.model_dump()
    if args.summary:
        delta = data.get("delta") or {}
        contacts = data.get("contacts") or {}
        shared = contacts.get("shared_contacts") or []
        gained = contacts.get("gained_contacts") or []
        lost = contacts.get("lost_contacts") or []
        print(f"\n\033[1mCompare: {path_a.name}  vs  {path_b.name}\033[0m")
        if delta:
            res_d = delta.get("residue_count_delta")
            con_d = delta.get("contact_count_delta")
            pld_d = delta.get("plddt_delta")
            print(f"  ΔResidues   {'+' if res_d and res_d > 0 else ''}{res_d if res_d is not None else '—'}")
            print(f"  ΔContacts   {'+' if con_d and con_d > 0 else ''}{con_d if con_d is not None else '—'}")
            if pld_d is not None:
                print(f"  ΔpLDDT      {'+' if pld_d > 0 else ''}{pld_d:.1f}")
        print(f"  Shared      {len(shared)}")
        print(f"  \033[92mGained      {len(gained)}\033[0m")
        print(f"  \033[91mLost        {len(lost)}\033[0m")
        print()
    else:
        print(json.dumps(data, indent=2))
    return 0


def cmd_batch(args: argparse.Namespace) -> int:
    from app.batch import batch_analyze

    files = _collect_structure_files(args.paths)
    if not files:
        _err("no structure files found")
        return 1

    if len(files) > 50:
        _err(f"too many files ({len(files)}); maximum is 50 per batch")
        return 1

    print(f"Analyzing {len(files)} structure{'s' if len(files) != 1 else ''}…", file=sys.stderr)

    file_contents = [(f.name, f.read_bytes()) for f in files]
    result = asyncio.run(batch_analyze(file_contents, cutoff_angstrom=args.cutoff))

    entries = [e.model_dump() for e in result.entries]
    entries = _rank_entries(entries)

    if args.summary:
        _print_summary_table(entries)
        print(f"  {result.succeeded}/{result.total} succeeded", file=sys.stderr)
    else:
        print(json.dumps({
            "total": result.total,
            "succeeded": result.succeeded,
            "failed": result.failed,
            "entries": entries,
        }, indent=2))

    if args.output:
        out = Path(args.output)
        _write_csv(entries, out, cutoff=args.cutoff)
        print(f"CSV written to {out}", file=sys.stderr)

    return 0 if result.failed == 0 else 2


def _write_csv(entries: list[dict], path: Path, cutoff: float) -> None:
    import csv
    headers = ["Rank", "File", "Score", "Chains", "Residues", "Contacts", "pLDDT", "Clashes", "Status", "Error"]
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(headers)
        for e in entries:
            a = e.get("analysis") or {}
            summ = a.get("summary") or {}
            conf = a.get("confidence") or {}
            inter = a.get("interaction_summary") or {}
            w.writerow([
                e.get("rank") or "",
                e["filename"],
                f"{e['score']:.1f}" if e.get("score") is not None else "",
                summ.get("chain_count") or "",
                summ.get("residue_count") or "",
                summ.get("contact_count") or "",
                f"{conf['average_plddt']:.1f}" if conf.get("average_plddt") is not None else "",
                inter.get("possible_clash_count") or "",
                "Error" if e.get("error") else "OK",
                e.get("error") or "",
            ])


# ── entry point ───────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="protein-io",
        description="Protein Interaction Explorer — command-line interface",
    )
    sub = parser.add_subparsers(dest="command", metavar="COMMAND")

    # analyze
    p_analyze = sub.add_parser("analyze", help="Analyze a single structure file")
    p_analyze.add_argument("file", help="Path to a .pdb, .cif, or .mmcif file")
    p_analyze.add_argument("--cutoff", type=float, default=4.0, metavar="Å",
                           help="Contact distance cutoff in Ångströms (default: 4.0)")
    p_analyze.add_argument("--summary", action="store_true",
                           help="Print a compact human-readable summary instead of JSON")

    # compare
    p_compare = sub.add_parser("compare", help="Compare two structure files")
    p_compare.add_argument("file_a", help="First structure file (.pdb / .cif)")
    p_compare.add_argument("file_b", help="Second structure file (.pdb / .cif)")
    p_compare.add_argument("--cutoff", type=float, default=4.0, metavar="Å",
                           help="Contact distance cutoff in Ångströms (default: 4.0)")
    p_compare.add_argument("--summary", action="store_true",
                           help="Print a compact human-readable summary instead of JSON")

    # batch
    p_batch = sub.add_parser("batch", help="Analyze all structures in a directory or a list of files")
    p_batch.add_argument("paths", nargs="+", metavar="PATH",
                         help="Directory or .pdb/.cif files (max 50)")
    p_batch.add_argument("--cutoff", type=float, default=4.0, metavar="Å",
                         help="Contact distance cutoff in Ångströms (default: 4.0)")
    p_batch.add_argument("--summary", action="store_true",
                         help="Print a ranked table instead of JSON")
    p_batch.add_argument("--output", "-o", metavar="FILE",
                         help="Write results to CSV (e.g. results.csv)")

    args = parser.parse_args(argv)

    if args.command == "analyze":
        return cmd_analyze(args)
    if args.command == "compare":
        return cmd_compare(args)
    if args.command == "batch":
        return cmd_batch(args)

    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
