"""Foldseek structural similarity search via the public API.

Flow:
  1. POST /api/ticket  → ticket_id
  2. Poll GET /api/ticket/{id} until status == COMPLETE
  3. GET /api/result/{id}/0  → parse alignments into FoldseekHit list
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

import httpx

from app.models import FoldseekHit, FoldseekSearchResult

logger = logging.getLogger(__name__)

FOLDSEEK_API = "https://search.foldseek.com/api"
DATABASES = ["pdb100", "afdb50"]
POLL_INTERVAL = 2.5          # seconds between status checks
MAX_POLLS = 36               # 36 × 2.5s ≈ 90s ceiling
MAX_HITS_PER_DB = 10


class FoldseekError(Exception):
    """Raised when the Foldseek API returns an error or times out."""


async def search_foldseek(
    content: bytes,
    filename: str,
    max_hits_per_db: int = MAX_HITS_PER_DB,
) -> FoldseekSearchResult:
    """Submit a structure, poll until done, return ranked hits."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=30.0)) as client:
        ticket_id = await _submit(client, content, filename)
        logger.info("foldseek ticket=%s submitted", ticket_id)
        await _poll(client, ticket_id)
        logger.info("foldseek ticket=%s complete", ticket_id)
        return await _fetch_results(client, ticket_id, max_hits_per_db)


# ── internal ──────────────────────────────────────────────────────────────────

async def _submit(client: httpx.AsyncClient, content: bytes, filename: str) -> str:
    files: list[tuple[str, Any]] = [("q", (filename, content, "text/plain"))]
    for db in DATABASES:
        files.append(("database[]", (None, db)))
    files.append(("mode", (None, "3diaa")))

    try:
        r = await client.post(f"{FOLDSEEK_API}/ticket", files=files)
        r.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise FoldseekError(f"Foldseek submission failed: {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        raise FoldseekError(f"Foldseek unreachable: {exc}") from exc

    data = r.json()
    ticket_id = data.get("id")
    if not ticket_id:
        raise FoldseekError(f"No ticket ID in response: {data}")
    return str(ticket_id)


async def _poll(client: httpx.AsyncClient, ticket_id: str) -> None:
    url = f"{FOLDSEEK_API}/ticket/{ticket_id}"
    for attempt in range(MAX_POLLS):
        await asyncio.sleep(POLL_INTERVAL)
        try:
            r = await client.get(url)
            r.raise_for_status()
        except httpx.RequestError as exc:
            raise FoldseekError(f"Polling failed: {exc}") from exc

        status = r.json().get("status", "")
        if status == "COMPLETE":
            return
        if status == "ERROR":
            raise FoldseekError("Foldseek job errored on the server.")
        # PENDING / RUNNING — keep polling

    raise FoldseekError("Foldseek search timed out after 90 seconds.")


async def _fetch_results(
    client: httpx.AsyncClient,
    ticket_id: str,
    max_hits_per_db: int,
) -> FoldseekSearchResult:
    url = f"{FOLDSEEK_API}/result/{ticket_id}/0"
    try:
        r = await client.get(url)
        r.raise_for_status()
    except httpx.RequestError as exc:
        raise FoldseekError(f"Result fetch failed: {exc}") from exc

    data = r.json()
    results: list[dict] = data.get("results", [])

    hits: list[FoldseekHit] = []
    db_counts: dict[str, int] = {}
    rank = 1

    for result in results:
        db = result.get("db", "")
        alignments = result.get("alignments", [])
        # API may return a list-of-lists or list-of-dicts
        if alignments and isinstance(alignments[0], list):
            alignments = alignments[0]

        db_counts[db] = len(alignments)
        for aln in alignments[:max_hits_per_db]:
            hit = _parse_hit(rank, db, aln)
            hits.append(hit)
            rank += 1

    # Sort all hits by TM-score descending
    hits.sort(key=lambda h: h.tmscore or 0.0, reverse=True)
    for i, h in enumerate(hits):
        h.rank = i + 1

    return FoldseekSearchResult(hits=hits, ticket_id=ticket_id, database_counts=db_counts)


def _parse_hit(rank: int, db: str, aln: dict) -> FoldseekHit:
    target: str = aln.get("target", "")
    theader: str = aln.get("theader", "") or target
    title: str = aln.get("title", "") or _title_from_header(theader)

    pdb_id, chain = _parse_pdb_target(target)
    uniprot_id = _parse_uniprot_target(target) if not pdb_id else None

    organism: str | None = aln.get("taxName") or None

    return FoldseekHit(
        rank=rank,
        database=db,
        target=target,
        pdb_id=pdb_id,
        chain=chain,
        uniprot_id=uniprot_id,
        title=title or None,
        organism=organism,
        tmscore=_float(aln.get("tmscore")),
        seq_identity=_float(aln.get("seqId")),
        evalue=_float(aln.get("eval")),
        prob=_float(aln.get("prob")),
    )


# PDB target: "4hhb_A"  →  pdb_id="4hhb", chain="A"
_PDB_RE = re.compile(r"^([0-9][a-zA-Z0-9]{3})_([a-zA-Z0-9]+)$")
# AlphaFold target: "AF-P02023-F1-model_v4"
_AF_RE = re.compile(r"AF-([A-Z0-9]+)-F\d+")


def _parse_pdb_target(target: str) -> tuple[str | None, str | None]:
    m = _PDB_RE.match(target.split()[0])
    if m:
        return m.group(1).upper(), m.group(2)
    return None, None


def _parse_uniprot_target(target: str) -> str | None:
    m = _AF_RE.search(target)
    return m.group(1) if m else None


def _title_from_header(header: str) -> str:
    # Strip target prefix like "4hhb_A " from the header
    return re.sub(r"^[^\s]+\s+", "", header).strip()


def _float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 4)
    except (TypeError, ValueError):
        return None
