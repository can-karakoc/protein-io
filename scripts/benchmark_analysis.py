from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from time import perf_counter

from app.service import TimedAnalysis, analyze_pdb_content_with_timing


@dataclass(frozen=True)
class BenchmarkInput:
    label: str
    path: Path


@dataclass(frozen=True)
class BenchmarkResult:
    label: str
    path: Path
    file_size_kb: float
    runs: int
    atom_count: int
    residue_count: int
    chain_count: int
    ligand_count: int
    contact_count: int
    parse_ms_mean: float
    contacts_ms_mean: float
    response_ms_mean: float
    analysis_ms_mean: float
    wall_ms_mean: float
    wall_ms_min: float
    wall_ms_max: float


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark parser and contact analysis performance.")
    parser.add_argument(
        "inputs",
        nargs="*",
        help="Benchmark inputs as label=path. Example: medium=/tmp/1ake.pdb",
    )
    parser.add_argument("--runs", type=int, default=5, help="Measured runs per input.")
    parser.add_argument("--warmups", type=int, default=1, help="Warmup runs per input.")
    args = parser.parse_args()

    inputs = parse_inputs(args.inputs)
    results = [benchmark_input(item, runs=args.runs, warmups=args.warmups) for item in inputs]
    print_markdown(results)


def parse_inputs(raw_inputs: list[str]) -> list[BenchmarkInput]:
    if not raw_inputs:
        return [BenchmarkInput("small-sample", Path("examples/sample.pdb"))]

    inputs: list[BenchmarkInput] = []
    for raw_input in raw_inputs:
        if "=" not in raw_input:
            raise SystemExit(f"Expected label=path input, got: {raw_input}")
        label, raw_path = raw_input.split("=", maxsplit=1)
        path = Path(raw_path)
        if not path.exists():
            raise SystemExit(f"Benchmark file does not exist: {path}")
        inputs.append(BenchmarkInput(label, path))
    return inputs


def benchmark_input(item: BenchmarkInput, runs: int, warmups: int) -> BenchmarkResult:
    content = item.path.read_bytes()
    for _ in range(warmups):
        analyze_pdb_content_with_timing(content, filename=item.path.name)

    timed_results: list[TimedAnalysis] = []
    wall_times: list[float] = []
    for _ in range(runs):
        started = perf_counter()
        result = analyze_pdb_content_with_timing(content, filename=item.path.name)
        wall_times.append((perf_counter() - started) * 1000)
        timed_results.append(result)

    response = timed_results[-1].response
    timings = [result.timing for result in timed_results]
    return BenchmarkResult(
        label=item.label,
        path=item.path,
        file_size_kb=len(content) / 1024,
        runs=runs,
        atom_count=response.summary.atom_count,
        residue_count=response.summary.residue_count,
        chain_count=response.summary.chain_count,
        ligand_count=response.summary.ligand_count,
        contact_count=response.summary.contact_count,
        parse_ms_mean=mean(timing.parse_ms for timing in timings),
        contacts_ms_mean=mean(timing.contacts_ms for timing in timings),
        response_ms_mean=mean(timing.response_ms for timing in timings),
        analysis_ms_mean=mean(timing.total_ms for timing in timings),
        wall_ms_mean=mean(wall_times),
        wall_ms_min=min(wall_times),
        wall_ms_max=max(wall_times),
    )


def print_markdown(results: list[BenchmarkResult]) -> None:
    print("| Input | Size KB | Runs | Atoms | Protein residues | Chains | Ligands | Contacts | Parse ms | Contacts ms | Response ms | Analysis ms | Wall ms |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for result in results:
        print(
            "| "
            f"{result.label} | "
            f"{result.file_size_kb:.1f} | "
            f"{result.runs} | "
            f"{result.atom_count} | "
            f"{result.residue_count} | "
            f"{result.chain_count} | "
            f"{result.ligand_count} | "
            f"{result.contact_count} | "
            f"{result.parse_ms_mean:.2f} | "
            f"{result.contacts_ms_mean:.2f} | "
            f"{result.response_ms_mean:.2f} | "
            f"{result.analysis_ms_mean:.2f} | "
            f"{result.wall_ms_mean:.2f} |"
        )


if __name__ == "__main__":
    main()
