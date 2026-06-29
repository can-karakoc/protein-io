# Protein I/O — Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Protein I/O from a useful structure viewer into a confidence-aware post-prediction review and reporting workbench for protein design and drug discovery workflows.

**Architecture:** FastAPI backend exposes analysis/comparison/interfaces endpoints; Next.js + Tailwind CSS v4 frontend renders results in mode tabs (Explore | Compare | Ligands | Design Review | Report). Each phase adds a self-contained layer of scientific value without breaking the previous.

**Tech Stack:** Python 3.12 / FastAPI / Pydantic / gemmi, Next.js 15 App Router / React 19 / Tailwind CSS v4, Mol* viewer, localStorage for client-side state persistence.

---

## Gap Analysis: Current State vs Product Direction

### What's already working
- Upload PDB/mmCIF, RCSB fetch, AlphaFold DB fetch
- Distance-based contacts (gemmi NeighborSearch), contact categories (protein-protein, inter/intra-chain, possible-clash)
- pLDDT confidence (B-factor heuristic for named predicted structures), PAE sidecar parsing
- Contact-set comparison diff (shared/gained/lost) at backend
- All 8 Explore result tabs built and live
- Report mode (partially)
- Compare mode input UI in progress on `feature/compare-workspace`
- localStorage cache for Explore mode, Compare mode persistence (lazy-initializer pattern)

### Critical gaps (near-term)
| Gap | Impact | Phase |
|---|---|---|
| `ContactRecord` in backend has no confidence fields, but frontend `types.ts` declares `source_residue_confidence` + `confidence_warning` | Confidence badges never render; the app claims confidence-awareness but doesn't deliver it | P1 |
| Compare results display not implemented | Compare tab can run analysis but shows nothing | P1 (in progress) |
| `comparison.py` caps shared/gained/lost at 10 rows each; no way to see the rest | Comparison output is severely incomplete | P1 |
| pLDDT detection uses filename heuristic — uploaded files without "alphafold" in name get no confidence | Users uploading AlphaFold outputs directly get no confidence scoring | P1 |
| Report export doesn't include comparison output | Can't export a comparison | P2 |
| No interaction type classification beyond distance + clash flag | "Contacts" are not biochemically meaningful — distance only | P2 |
| Interface review (chain-pair contacts, interface confidence) not built | No protein-protein / binder-target support | P3 |
| UniProt integration missing | No biological context (domains, function, variants, active sites) | P3 |

---

## Phase 1: Demo-Ready MVP + Finish Compare Mode

These tasks make the current app impressive to demo and complete the in-progress Compare mode.
Branch: `feature/compare-workspace` (worktree `/private/tmp/protein-io-pr2/`)

---

### Task 1: Wire confidence fields onto ContactRecord (backend)

The backend `ContactRecord` model is missing `source_residue_confidence`, `target_residue_confidence`, and `confidence_warning` fields that the frontend `types.ts` already declares. This means confidence badges in the contacts table never render.

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/service.py`
- Modify: `backend/tests/test_contacts.py`

- [ ] **Step 1: Add fields to the backend model**

In `backend/app/models.py`, update `ContactRecord`:

```python
class ContactRecord(BaseModel):
    chain_a: str
    residue_a: str
    residue_name_a: str
    atom_a: str
    chain_b: str
    residue_b: str
    residue_name_b: str
    atom_b: str
    distance_angstrom: float
    contact_type: ContactType
    contact_categories: list[ContactCategory] = Field(default_factory=list)
    source_residue_confidence: ResidueConfidence | None = None
    target_residue_confidence: ResidueConfidence | None = None
    confidence_warning: bool = False
```

- [ ] **Step 2: Build a lookup from (chain_id, residue_number) → ResidueConfidence**

In `backend/app/service.py`, update `analyze_pdb_content_with_timing` to pass `residue_confidences` to a helper that annotates contacts:

```python
def build_confidence_lookup(
    residue_confidences: list[ResidueConfidence],
) -> dict[tuple[str, str], ResidueConfidence]:
    return {(rc.chain_id, rc.residue_number): rc for rc in residue_confidences}
```

- [ ] **Step 3: Annotate contacts with confidence after calculating them**

In `service.py`, after `calculate_contacts(...)` and `analyze_plddt_confidence(...)`:

```python
from app.service import annotate_contacts_with_confidence  # new function below

def annotate_contacts_with_confidence(
    contacts: list[ContactRecord],
    confidence_lookup: dict[tuple[str, str], ResidueConfidence],
    low_confidence_threshold: ConfidenceCategory = "low",
) -> list[ContactRecord]:
    LOW_CATEGORIES = {"low", "very_low"}
    annotated = []
    for contact in contacts:
        src = confidence_lookup.get((contact.chain_a, contact.residue_a))
        tgt = confidence_lookup.get((contact.chain_b, contact.residue_b))
        warning = bool(
            (src and src.category in LOW_CATEGORIES) or
            (tgt and tgt.category in LOW_CATEGORIES)
        )
        annotated.append(
            contact.model_copy(update={
                "source_residue_confidence": src,
                "target_residue_confidence": tgt,
                "confidence_warning": warning,
            })
        )
    return annotated
```

In `analyze_pdb_content_with_timing`, after both calls:

```python
confidence, residue_confidences, confidence_warnings = analyze_plddt_confidence(structure)
confidence_lookup = build_confidence_lookup(residue_confidences)
annotated_contacts = annotate_contacts_with_confidence(contacts, confidence_lookup)
```

Then use `annotated_contacts` instead of `contacts` everywhere in the response builder.

- [ ] **Step 4: Write failing test**

In `backend/tests/test_contacts.py` (or a new `test_service.py`):

```python
def test_contacts_annotated_with_confidence_for_predicted_structure(alphafold_cif_bytes):
    """ContactRecords from a predicted structure carry pLDDT confidence fields."""
    from app.service import analyze_pdb_content
    result = analyze_pdb_content(alphafold_cif_bytes, filename="alphafold_P12345.cif")
    contacts_with_confidence = [c for c in result.contacts if c.source_residue_confidence is not None]
    assert len(contacts_with_confidence) > 0

def test_contacts_not_annotated_for_experimental_structure(experimental_cif_bytes):
    """ContactRecords from an experimental structure have no confidence annotation."""
    from app.service import analyze_pdb_content
    result = analyze_pdb_content(experimental_cif_bytes, filename="1abc.cif")
    assert all(c.source_residue_confidence is None for c in result.contacts)
```

- [ ] **Step 5: Run tests**

```bash
cd ~/Codex/protein-interaction-explorer/backend
pytest tests/ -x -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/app/service.py backend/tests/
git commit -m "feat: annotate ContactRecord with per-residue pLDDT confidence fields"
```

---

### Task 2: Fix pLDDT detection — allow explicit override via metadata source

The current `looks_like_predicted_structure()` in `confidence.py` uses a filename heuristic. When source is `alphafold` (from metadata), we should always score confidence.

**Files:**
- Modify: `backend/app/confidence.py`
- Modify: `backend/app/service.py`

- [ ] **Step 1: Add a `force_predicted` parameter to `analyze_plddt_confidence`**

```python
def analyze_plddt_confidence(
    structure: StructureData,
    force_predicted: bool = False,
) -> tuple[ConfidenceSummary | None, list[ResidueConfidence], list[str]]:
    if not force_predicted and not looks_like_predicted_structure(structure.structure_id):
        return None, [], []
    # ... rest unchanged
```

- [ ] **Step 2: Pass `force_predicted` based on metadata source in `service.py`**

In `analyze_pdb_content_with_timing`, after building `structure`:

```python
is_predicted = metadata is not None and metadata.source in {"alphafold"}
confidence, residue_confidences, confidence_warnings = analyze_plddt_confidence(
    structure, force_predicted=is_predicted
)
```

- [ ] **Step 3: Write a failing test**

```python
def test_alphafold_metadata_source_forces_confidence_scoring():
    from app.service import analyze_pdb_content_with_timing
    from app.models import StructureMetadata
    # Use a CIF with valid B-factor range but no "alphafold" in filename
    metadata = StructureMetadata(source="alphafold", uniprot_id="P12345")
    result = analyze_pdb_content_with_timing(
        some_cif_bytes, filename="custom_output.cif", metadata=metadata
    )
    assert result.response.confidence is not None
```

- [ ] **Step 4: Run and commit**

```bash
pytest tests/test_confidence.py -x -v
git add backend/app/confidence.py backend/app/service.py backend/tests/
git commit -m "fix: force pLDDT confidence scoring when metadata source is alphafold"
```

---

### Task 3: Compare results display — delta summary + contact diff table

The `feature/compare-workspace` branch has the A/B input UI and the `POST /api/compare` call working. What's missing is the results panel that renders the `StructureComparisonResponse`.

**Files:**
- Modify: `frontend/src/components/workbench/CompareWorkspace.tsx` (primary work file, worktree path)
- Path in worktree: `/private/tmp/protein-io-pr2/frontend/src/components/workbench/CompareWorkspace.tsx`

- [ ] **Step 1: Add a `ComparisonResultsPanel` section below the cutoff row**

The component already has `comparison` state (`StructureComparisonResponse | null`). When `comparison !== null`, render a results section:

```tsx
{comparison && (
  <div className="mt-6 space-y-4">
    <ComparisonDeltaRow delta={comparison.delta} />
    <ComparisonContactsPanel contacts={comparison.contacts} />
  </div>
)}
```

- [ ] **Step 2: Implement `ComparisonDeltaRow`**

A row of 5 metric tiles showing atom/residue/chain/ligand/contact count deltas. Positive = gained (green badge), negative = lost (coral badge):

```tsx
function ComparisonDeltaRow({ delta }: { delta: StructureComparisonDelta }) {
  const tiles = [
    { label: "Atoms", value: delta.atom_count_delta },
    { label: "Residues", value: delta.residue_count_delta },
    { label: "Chains", value: delta.chain_count_delta },
    { label: "Ligands", value: delta.ligand_count_delta },
    { label: "Contacts", value: delta.contact_count_delta },
  ];
  return (
    <div className="grid grid-cols-5 gap-2">
      {tiles.map(({ label, value }) => (
        <div key={label} className="rounded-[12px] bg-[#F5F5F5] p-3 text-center">
          <div className="pio-label">{label}</div>
          <div className={`mt-1 font-mono text-[15px] font-semibold ${
            value > 0 ? "text-[var(--pio-green)]" :
            value < 0 ? "text-[var(--pio-coral)]" : "text-[var(--pio-graphite)]"
          }`}>
            {value > 0 ? `+${value}` : value}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Implement `ComparisonContactsPanel` with three tabs**

```tsx
type ContactTab = "shared" | "gained" | "lost";

function ComparisonContactsPanel({ contacts }: { contacts: ContactComparisonSummary }) {
  const [activeTab, setActiveTab] = useState<ContactTab>("shared");
  const rows = {
    shared: contacts.shared_contacts,
    gained: contacts.gained_contacts,
    lost: contacts.lost_contacts,
  };
  const counts = {
    shared: contacts.shared_contact_count,
    gained: contacts.gained_contact_count,
    lost: contacts.lost_contact_count,
  };
  const tabLabels: { id: ContactTab; label: string; colorClass: string }[] = [
    { id: "shared", label: "Shared", colorClass: "text-[var(--pio-ink)]" },
    { id: "gained", label: "Gained in B", colorClass: "text-[var(--pio-green)]" },
    { id: "lost", label: "Lost from A", colorClass: "text-[var(--pio-coral)]" },
  ];
  return (
    <div className="rounded-[12px] border border-[var(--pio-line)] bg-[var(--pio-white)] p-4">
      <div className="mb-3 flex items-center gap-4">
        {tabLabels.map(({ id, label, colorClass }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`pio-label ${colorClass} ${activeTab === id ? "font-semibold underline underline-offset-2" : "opacity-60"}`}
          >
            {label} ({counts[id].toLocaleString()})
          </button>
        ))}
      </div>
      {rows[activeTab].length === 0 ? (
        <p className="pio-label text-center py-6 opacity-50">No {activeTab} contacts.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--pio-line)]">
                <th className="pb-2 text-left pio-label">Contact</th>
                <th className="pb-2 text-left pio-label">Type</th>
                <th className="pb-2 text-right pio-label">Dist A (Å)</th>
                <th className="pb-2 text-right pio-label">Dist B (Å)</th>
              </tr>
            </thead>
            <tbody>
              {rows[activeTab].map((contact, i) => (
                <tr key={i} className="border-b border-[var(--pio-line-light)] hover:bg-[var(--pio-sand)]">
                  <td className="py-1.5 font-mono text-[11px]">{contact.label}</td>
                  <td className="py-1.5">{contact.contact_type}</td>
                  <td className="py-1.5 text-right font-mono">{contact.distance_a_angstrom?.toFixed(2) ?? "—"}</td>
                  <td className="py-1.5 text-right font-mono">{contact.distance_b_angstrom?.toFixed(2) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {counts[activeTab] > rows[activeTab].length && (
            <p className="mt-2 text-center pio-label opacity-50">
              Showing {rows[activeTab].length} of {counts[activeTab].toLocaleString()} contacts.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Fix the `max_examples` cap in the backend**

In `backend/app/comparison.py`, raise the cap from 10 to 500 and make it a parameter:

```python
def compare_analyses(
    analysis_a: AnalysisResponse,
    analysis_b: AnalysisResponse,
    max_examples: int = 500,   # was 10
) -> StructureComparisonResponse:
```

- [ ] **Step 5: Verify in browser**

Start both servers, run an analysis on two structures, confirm the delta row and contact diff table render correctly.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/workbench/CompareWorkspace.tsx backend/app/comparison.py
git commit -m "feat: compare results panel — delta tiles + shared/gained/lost contact table"
```

---

### Task 4: Comparison structure labels + warnings display

The comparison API returns warnings (e.g. "Comparison uses residue-level contact identities without structural alignment"). These should be surfaced in the UI.

**Files:**
- Modify: `/private/tmp/protein-io-pr2/frontend/src/components/workbench/CompareWorkspace.tsx`

- [ ] **Step 1: Add a warnings strip below the results panel**

```tsx
{comparison?.warnings && comparison.warnings.length > 0 && (
  <div className="mt-3 rounded-[12px] bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
    {comparison.warnings.map((w, i) => (
      <p key={i} className="text-[12px] text-amber-800">{w}</p>
    ))}
  </div>
)}
```

- [ ] **Step 2: Add structure A/B labels to the delta row header**

Above the delta tiles, show the two filenames/IDs being compared:

```tsx
<div className="mb-2 flex items-center gap-2 text-[12px]">
  <span className="font-semibold text-[var(--pio-ink)]">A:</span>
  <span className="text-[var(--pio-graphite)] truncate max-w-[200px]">
    {inputA.file?.name ?? inputA.pdbId ?? inputA.uniprotId ?? "Structure A"}
  </span>
  <span className="mx-1 text-[var(--pio-line-strong)]">→</span>
  <span className="font-semibold text-[var(--pio-ink)]">B:</span>
  <span className="text-[var(--pio-graphite)] truncate max-w-[200px]">
    {inputB.file?.name ?? inputB.pdbId ?? inputB.uniprotId ?? "Structure B"}
  </span>
</div>
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: compare — structure labels, warnings strip"
```

---

### Task 5: Compare CSV export

**Files:**
- Modify: `frontend/src/lib/csv.ts` (already has `comparisonContactsToCsv`)
- Modify: `/private/tmp/protein-io-pr2/frontend/src/components/workbench/CompareWorkspace.tsx`

- [ ] **Step 1: Add a download button to the results panel**

Import the existing `comparisonContactsToCsv` from `@/lib/csv` and wire it to a button:

```tsx
function downloadComparisonCsv(comparison: StructureComparisonResponse) {
  const csv = comparisonContactsToCsv(comparison);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "comparison.csv";
  a.click();
  URL.revokeObjectURL(url);
}
```

Add button in the results header row:
```tsx
<button
  className="pio-button-secondary ml-auto gap-1.5 px-3 py-1.5 text-[12px]"
  style={{ borderRadius: 12 }}
  onClick={() => downloadComparisonCsv(comparison)}
>
  <Download className="h-3.5 w-3.5" /> Export CSV
</button>
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat: compare — CSV export button"
```

---

### Task 6: Merge Compare workspace → main and deploy

- [ ] **Step 1: Check diff between branches**

```bash
cd ~/Codex/protein-interaction-explorer
git diff main feature/compare-workspace --stat
```

- [ ] **Step 2: Create PR or merge**

```bash
git checkout main
git merge feature/compare-workspace --no-ff -m "feat: Compare mode — A/B inputs, results panel, CSV export, localStorage persistence"
```

- [ ] **Step 3: Run backend tests**

```bash
cd backend && pytest -x -v
```

- [ ] **Step 4: Deploy frontend**

```bash
cd frontend && vercel --prod
```

---

## Phase 2: Interaction Credibility Layer

Goal: move from "here are distance contacts" to "here are contacts, here is why some are suspicious."

---

### Task 7: Confidence badges on the Contacts tab

The frontend `types.ts` already has `confidence_warning: boolean` on `ContactRecord`. After Task 1 (backend populates this field), the Contacts tab can show a badge.

**Files:**
- Modify: `frontend/src/components/workbench/ProteinWorkbench.tsx` (contacts table section)

- [ ] **Step 1: Find the contacts table render in `ProteinWorkbench.tsx`**

Search for the contacts table — it renders `ContactRecord` rows. Each row should check `contact.confidence_warning`.

- [ ] **Step 2: Add a warning badge to the row**

In the row render, after the distance cell:
```tsx
{contact.confidence_warning && (
  <span className="pio-badge pio-badge-warning ml-1.5 text-[10px] px-1.5 py-0.5">
    low conf
  </span>
)}
```

- [ ] **Step 3: Add a tooltip on the badge**

```tsx
<span
  title="One or both residues in this contact have low predicted confidence (pLDDT < 70). Interpret cautiously."
  className="pio-badge pio-badge-warning cursor-help"
>
  low conf
</span>
```

- [ ] **Step 4: Add a filter toggle above the contacts table**

```tsx
const [hideUncertain, setHideUncertain] = useState(false);
const displayedContacts = hideUncertain
  ? contacts.filter(c => !c.confidence_warning)
  : contacts;
```

Add a toggle pill near the contacts table header:
```tsx
<button
  onClick={() => setHideUncertain(v => !v)}
  className={`pio-button-secondary text-[12px] px-3 py-1 ${hideUncertain ? "ring-2 ring-[var(--pio-highlight)]" : ""}`}
  style={{ borderRadius: 12 }}
>
  {hideUncertain ? "Showing high-confidence only" : "Show all contacts"}
</button>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workbench/ProteinWorkbench.tsx
git commit -m "feat: confidence warning badges + filter toggle on contacts table"
```

---

### Task 8: Interaction Trust Score (per-contact heuristic label)

Add a `trust_label` field to `ContactRecord` that summarizes the confidence level in a human-readable way.

**Files:**
- Create: `backend/app/trust_score.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/service.py`
- Create: `backend/tests/test_trust_score.py`

- [ ] **Step 1: Define the labels and scoring logic**

Create `backend/app/trust_score.py`:

```python
from __future__ import annotations
from typing import Literal
from app.models import ContactRecord, ResidueConfidence

TrustLabel = Literal[
    "high-confidence",
    "inspect-manually",
    "low-confidence",
    "possible-clash",
    "no-confidence-data",
]

LOW_PLDDT_CATEGORIES = {"low", "very_low"}


def assign_trust_label(contact: ContactRecord) -> TrustLabel:
    """Assign a review heuristic label to a contact. Not a validated scientific metric."""
    if "possible-clash" in contact.contact_categories:
        return "possible-clash"

    src = contact.source_residue_confidence
    tgt = contact.target_residue_confidence

    if src is None and tgt is None:
        return "no-confidence-data"

    src_low = src is not None and src.category in LOW_PLDDT_CATEGORIES
    tgt_low = tgt is not None and tgt.category in LOW_PLDDT_CATEGORIES

    if src_low or tgt_low:
        return "low-confidence"

    src_high = src is not None and src.category == "very_high"
    tgt_high = tgt is not None and tgt.category == "very_high"

    if src_high and tgt_high:
        return "high-confidence"

    return "inspect-manually"
```

- [ ] **Step 2: Add `trust_label` field to `ContactRecord`**

In `backend/app/models.py`:
```python
TrustLabel = Literal["high-confidence", "inspect-manually", "low-confidence", "possible-clash", "no-confidence-data"]

class ContactRecord(BaseModel):
    # ... existing fields ...
    trust_label: TrustLabel | None = None
```

- [ ] **Step 3: Populate `trust_label` during contact annotation in `service.py`**

In `annotate_contacts_with_confidence`, after setting the confidence fields:
```python
from app.trust_score import assign_trust_label

annotated_contact = contact.model_copy(update={
    "source_residue_confidence": src,
    "target_residue_confidence": tgt,
    "confidence_warning": warning,
})
annotated.append(annotated_contact.model_copy(update={"trust_label": assign_trust_label(annotated_contact)}))
```

- [ ] **Step 4: Write failing tests**

Create `backend/tests/test_trust_score.py`:

```python
from app.trust_score import assign_trust_label
from app.models import ContactRecord, ResidueConfidence


def make_contact(src_cat=None, tgt_cat=None, categories=None):
    src = ResidueConfidence(chain_id="A", residue_number="1", residue_name="ALA", plddt=80, category=src_cat) if src_cat else None
    tgt = ResidueConfidence(chain_id="A", residue_number="2", residue_name="GLY", plddt=80, category=tgt_cat) if tgt_cat else None
    return ContactRecord(
        chain_a="A", residue_a="1", residue_name_a="ALA", atom_a="CA",
        chain_b="A", residue_b="2", residue_name_b="GLY", atom_b="CA",
        distance_angstrom=3.5, contact_type="residue-residue",
        contact_categories=categories or ["protein-protein", "intra-chain"],
        source_residue_confidence=src, target_residue_confidence=tgt,
    )


def test_possible_clash_overrides_confidence():
    c = make_contact(src_cat="very_high", tgt_cat="very_high", categories=["protein-protein", "possible-clash"])
    assert assign_trust_label(c) == "possible-clash"

def test_both_very_high_is_high_confidence():
    c = make_contact(src_cat="very_high", tgt_cat="very_high")
    assert assign_trust_label(c) == "high-confidence"

def test_one_low_confidence_is_low_confidence():
    c = make_contact(src_cat="very_high", tgt_cat="low")
    assert assign_trust_label(c) == "low-confidence"

def test_no_confidence_data():
    c = make_contact()
    assert assign_trust_label(c) == "no-confidence-data"

def test_mixed_confident_is_inspect_manually():
    c = make_contact(src_cat="very_high", tgt_cat="confident")
    assert assign_trust_label(c) == "inspect-manually"
```

- [ ] **Step 5: Run and verify**

```bash
pytest tests/test_trust_score.py -x -v
```

Expected: all pass.

- [ ] **Step 6: Add trust label to frontend type**

In `frontend/src/lib/types.ts`, add to `ContactRecord`:
```typescript
trust_label?: "high-confidence" | "inspect-manually" | "low-confidence" | "possible-clash" | "no-confidence-data" | null;
```

- [ ] **Step 7: Render trust label badge in the contacts table**

```tsx
const TRUST_COLORS: Record<string, string> = {
  "high-confidence": "pio-badge-active",
  "inspect-manually": "pio-badge-caution",
  "low-confidence": "pio-badge-warning",
  "possible-clash": "pio-badge-warning",
  "no-confidence-data": "pio-badge-neutral",
};

{contact.trust_label && (
  <span className={`pio-badge ${TRUST_COLORS[contact.trust_label] ?? "pio-badge-neutral"}`}>
    {contact.trust_label.replace(/-/g, " ")}
  </span>
)}
```

Add a disclaimer near the table header:
```tsx
<p className="text-[11px] text-[var(--pio-graphite)] opacity-70">
  Trust labels are review heuristics based on pLDDT confidence, not validated scientific metrics.
</p>
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/trust_score.py backend/app/models.py backend/app/service.py backend/tests/test_trust_score.py frontend/src/lib/types.ts frontend/src/components/workbench/ProteinWorkbench.tsx
git commit -m "feat: per-contact Interaction Trust Score labels (review heuristic)"
```

---

### Task 9: PLIP evaluation spike

Evaluate whether PLIP can be integrated as a backend module before committing to full integration. This is a research+proof-of-concept task, not production code.

**Files:**
- Create: `backend/app/integrations/plip_spike.py` (spike only, not wired to routes)
- Create: `backend/tests/test_plip_spike.py`

- [ ] **Step 1: Install PLIP in the dev environment**

```bash
cd ~/Codex/protein-interaction-explorer/backend
pip install plip
```

Check if it imports cleanly:
```bash
python -c "from plip.structure.preparation import PDBComplex; print('PLIP OK')"
```

- [ ] **Step 2: Write a minimal spike that classifies one protein-ligand interaction**

Create `backend/app/integrations/plip_spike.py`:

```python
"""
PLIP integration spike. Not wired to production routes.
Goal: confirm PLIP can run against our parsed structures and return interaction types.
"""
from __future__ import annotations
import tempfile
import os
from dataclasses import dataclass
from typing import Literal

PlipInteractionType = Literal[
    "hbond", "hydrophobic", "saltbridge", "pistacking", "pication",
    "halogen", "waterbridge", "metal"
]


@dataclass
class PlipInteraction:
    interaction_type: PlipInteractionType
    residue_name: str
    residue_number: str
    chain_id: str
    ligand_name: str
    distance_angstrom: float | None


def analyze_with_plip(pdb_content: bytes) -> list[PlipInteraction]:
    """Run PLIP on raw PDB bytes and return classified interactions."""
    from plip.structure.preparation import PDBComplex
    with tempfile.NamedTemporaryFile(suffix=".pdb", delete=False) as f:
        f.write(pdb_content)
        tmp_path = f.name
    try:
        mol = PDBComplex()
        mol.load_pdb(tmp_path)
        mol.analyze()
        interactions: list[PlipInteraction] = []
        for site in mol.interaction_sets.values():
            ligand_name = site.ligand.hetid
            for hbond in site.hbonds_pdon + site.hbonds_ldon:
                interactions.append(PlipInteraction(
                    interaction_type="hbond",
                    residue_name=hbond.restype,
                    residue_number=str(hbond.resnr),
                    chain_id=hbond.reschain,
                    ligand_name=ligand_name,
                    distance_angstrom=round(hbond.distance_ah, 3),
                ))
            for hydro in site.hydrophobic_contacts:
                interactions.append(PlipInteraction(
                    interaction_type="hydrophobic",
                    residue_name=hydro.restype,
                    residue_number=str(hydro.resnr),
                    chain_id=hydro.reschain,
                    ligand_name=ligand_name,
                    distance_angstrom=round(hydro.distance, 3),
                ))
        return interactions
    finally:
        os.unlink(tmp_path)
```

- [ ] **Step 3: Test against a known ligand-bound structure (1A3N or 1HVR)**

```python
# backend/tests/test_plip_spike.py
import pytest

@pytest.mark.integration
def test_plip_spike_on_ligand_bound_structure():
    """Smoke test: PLIP returns at least one interaction for a known ligand-bound PDB."""
    import urllib.request
    with urllib.request.urlopen("https://files.rcsb.org/download/1A3N.pdb") as r:
        pdb_bytes = r.read()
    from app.integrations.plip_spike import analyze_with_plip
    interactions = analyze_with_plip(pdb_bytes)
    assert len(interactions) > 0
    types_found = {i.interaction_type for i in interactions}
    assert len(types_found) >= 1  # at minimum hydrophobic or hbond
```

Run:
```bash
pytest tests/test_plip_spike.py -v -m integration
```

- [ ] **Step 4: Document findings and decision**

Create `docs/PLIP_SPIKE.md` summarizing:
- Does PLIP install cleanly?
- Does it correctly classify HBonds/hydrophobic on the test structure?
- What limitations exist (mmCIF support? speed? dependency weight?)
- Decision: integrate as backend service or call as subprocess?

- [ ] **Step 5: Commit spike**

```bash
git add backend/app/integrations/plip_spike.py backend/tests/test_plip_spike.py docs/PLIP_SPIKE.md
git commit -m "spike: PLIP protein-ligand interaction classification evaluation"
```

---

## Phase 3: Interface Review

Goal: support protein-protein, binder-target, and multimer workflows.

---

### Task 10: Backend interface analysis module

**Files:**
- Create: `backend/app/interfaces.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/service.py`
- Modify: `backend/app/routes.py`
- Create: `backend/tests/test_interfaces.py`

- [ ] **Step 1: Define interface models in `models.py`**

```python
class ChainPairSummary(BaseModel):
    chain_a: str
    chain_b: str
    contact_count: int
    inter_chain_contact_count: int
    mean_plddt_a: float | None = None
    mean_plddt_b: float | None = None
    interface_residue_count_a: int = 0
    interface_residue_count_b: int = 0


class InterfaceAnalysis(BaseModel):
    chain_pairs: list[ChainPairSummary] = Field(default_factory=list)
    inter_chain_contact_count: int = 0
    intra_chain_contact_count: int = 0
```

Add `interface_analysis: InterfaceAnalysis | None = None` to `AnalysisResponse`.

- [ ] **Step 2: Implement `interfaces.py`**

```python
from __future__ import annotations
from collections import Counter, defaultdict
from app.models import ChainPairSummary, ContactRecord, InterfaceAnalysis, ResidueConfidence


def analyze_interfaces(
    contacts: list[ContactRecord],
    residue_confidences: list[ResidueConfidence],
) -> InterfaceAnalysis:
    confidence_by_residue = {(rc.chain_id, rc.residue_number): rc.plddt for rc in residue_confidences}
    inter_chain = [c for c in contacts if "inter-chain" in c.contact_categories]
    intra_chain = [c for c in contacts if "intra-chain" in c.contact_categories]

    pair_contacts: dict[tuple[str, str], list[ContactRecord]] = defaultdict(list)
    for contact in inter_chain:
        key = tuple(sorted([contact.chain_a, contact.chain_b]))
        pair_contacts[key].append(contact)  # type: ignore

    chain_pairs: list[ChainPairSummary] = []
    for (ca, cb), pair in pair_contacts.items():
        interface_residues_a = {(c.chain_a, c.residue_a) for c in pair if c.chain_a == ca}
        interface_residues_b = {(c.chain_b, c.residue_b) for c in pair if c.chain_b == cb}
        plddt_a = [confidence_by_residue[r] for r in interface_residues_a if r in confidence_by_residue]
        plddt_b = [confidence_by_residue[r] for r in interface_residues_b if r in confidence_by_residue]
        chain_pairs.append(ChainPairSummary(
            chain_a=ca,
            chain_b=cb,
            contact_count=len(pair),
            inter_chain_contact_count=len(pair),
            mean_plddt_a=round(sum(plddt_a) / len(plddt_a), 2) if plddt_a else None,
            mean_plddt_b=round(sum(plddt_b) / len(plddt_b), 2) if plddt_b else None,
            interface_residue_count_a=len(interface_residues_a),
            interface_residue_count_b=len(interface_residues_b),
        ))

    chain_pairs.sort(key=lambda p: -p.contact_count)
    return InterfaceAnalysis(
        chain_pairs=chain_pairs,
        inter_chain_contact_count=len(inter_chain),
        intra_chain_contact_count=len(intra_chain),
    )
```

- [ ] **Step 3: Wire into `service.py`**

In `analyze_pdb_content_with_timing`, after contacts and confidence:
```python
from app.interfaces import analyze_interfaces
interface_analysis = analyze_interfaces(annotated_contacts, residue_confidences)
```

Add `interface_analysis=interface_analysis` to the `AnalysisResponse(...)` constructor.

- [ ] **Step 4: Write tests**

```python
# backend/tests/test_interfaces.py
def test_inter_chain_contact_count():
    """Chain pairs are identified from inter-chain contacts."""
    from app.interfaces import analyze_interfaces
    from app.models import ContactRecord, ResidueConfidence
    contacts = [
        ContactRecord(
            chain_a="A", residue_a="10", residue_name_a="ALA", atom_a="CA",
            chain_b="B", residue_b="20", residue_name_b="GLY", atom_b="CA",
            distance_angstrom=3.5, contact_type="residue-residue",
            contact_categories=["protein-protein", "inter-chain"],
        )
    ]
    result = analyze_interfaces(contacts, [])
    assert result.inter_chain_contact_count == 1
    assert len(result.chain_pairs) == 1
    assert result.chain_pairs[0].chain_a == "A"
    assert result.chain_pairs[0].chain_b == "B"

def test_interface_mean_plddt_computed():
    from app.interfaces import analyze_interfaces
    from app.models import ContactRecord, ResidueConfidence
    contacts = [ContactRecord(
        chain_a="A", residue_a="1", residue_name_a="ALA", atom_a="CA",
        chain_b="B", residue_b="2", residue_name_b="GLY", atom_b="CA",
        distance_angstrom=3.5, contact_type="residue-residue",
        contact_categories=["protein-protein", "inter-chain"],
    )]
    confidences = [
        ResidueConfidence(chain_id="A", residue_number="1", residue_name="ALA", plddt=90.0, category="very_high"),
        ResidueConfidence(chain_id="B", residue_number="2", residue_name="GLY", plddt=60.0, category="low"),
    ]
    result = analyze_interfaces(contacts, confidences)
    assert result.chain_pairs[0].mean_plddt_a == 90.0
    assert result.chain_pairs[0].mean_plddt_b == 60.0
```

- [ ] **Step 5: Run tests and commit**

```bash
pytest tests/test_interfaces.py tests/test_routes.py -x -v
git add backend/app/interfaces.py backend/app/models.py backend/app/service.py backend/tests/test_interfaces.py
git commit -m "feat: interface analysis module — chain-pair contacts + interface pLDDT"
```

---

### Task 11: Interfaces tab (frontend)

**Files:**
- Modify: `frontend/src/components/workbench/ProteinWorkbench.tsx`

- [ ] **Step 1: Add `interface_analysis` to frontend types**

In `frontend/src/lib/types.ts`:

```typescript
export type ChainPairSummary = {
  chain_a: string;
  chain_b: string;
  contact_count: number;
  inter_chain_contact_count: number;
  mean_plddt_a: number | null;
  mean_plddt_b: number | null;
  interface_residue_count_a: number;
  interface_residue_count_b: number;
};

export type InterfaceAnalysis = {
  chain_pairs: ChainPairSummary[];
  inter_chain_contact_count: number;
  intra_chain_contact_count: number;
};
```

Add `interface_analysis?: InterfaceAnalysis | null` to `AnalysisResponse`.

- [ ] **Step 2: Add the Interfaces tab to the results tab strip**

In `ProteinWorkbench.tsx`, add `"interfaces"` to the tabs array (show tab only when `analysis.interface_analysis?.chain_pairs.length > 0`). Render a chain-pair table:

```tsx
function InterfacesTab({ interfaceAnalysis }: { interfaceAnalysis: InterfaceAnalysis }) {
  return (
    <div className="space-y-4">
      <div className="rounded-[12px] bg-[var(--pio-white)] border border-[var(--pio-line)] p-4">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-[12px] bg-[#F5F5F5] p-3">
            <div className="pio-label">Inter-chain contacts</div>
            <div className="mt-1 font-mono text-[20px] font-semibold">
              {interfaceAnalysis.inter_chain_contact_count.toLocaleString()}
            </div>
          </div>
          <div className="rounded-[12px] bg-[#F5F5F5] p-3">
            <div className="pio-label">Chain pairs</div>
            <div className="mt-1 font-mono text-[20px] font-semibold">
              {interfaceAnalysis.chain_pairs.length}
            </div>
          </div>
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--pio-line)]">
              <th className="pb-2 text-left pio-label">Chain A</th>
              <th className="pb-2 text-left pio-label">Chain B</th>
              <th className="pb-2 text-right pio-label">Contacts</th>
              <th className="pb-2 text-right pio-label">Residues A</th>
              <th className="pb-2 text-right pio-label">Residues B</th>
              <th className="pb-2 text-right pio-label">Mean pLDDT A</th>
              <th className="pb-2 text-right pio-label">Mean pLDDT B</th>
            </tr>
          </thead>
          <tbody>
            {interfaceAnalysis.chain_pairs.map((pair, i) => (
              <tr key={i} className="border-b border-[var(--pio-line-light)]">
                <td className="py-2 font-mono">{pair.chain_a}</td>
                <td className="py-2 font-mono">{pair.chain_b}</td>
                <td className="py-2 text-right font-mono">{pair.contact_count}</td>
                <td className="py-2 text-right">{pair.interface_residue_count_a}</td>
                <td className="py-2 text-right">{pair.interface_residue_count_b}</td>
                <td className="py-2 text-right">
                  {pair.mean_plddt_a != null ? (
                    <span className={`font-mono ${pair.mean_plddt_a >= 70 ? "text-[var(--pio-green)]" : "text-[var(--pio-coral)]"}`}>
                      {pair.mean_plddt_a.toFixed(1)}
                    </span>
                  ) : "—"}
                </td>
                <td className="py-2 text-right">
                  {pair.mean_plddt_b != null ? (
                    <span className={`font-mono ${pair.mean_plddt_b >= 70 ? "text-[var(--pio-green)]" : "text-[var(--pio-coral)]"}`}>
                      {pair.mean_plddt_b.toFixed(1)}
                    </span>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/components/workbench/ProteinWorkbench.tsx
git commit -m "feat: Interfaces tab — chain-pair contact summary + interface pLDDT"
```

---

## Phase 4: UniProt Annotations

Goal: add biological context (function, domains, active/binding sites) to Explore results.

---

### Task 12: UniProt integration module

**Files:**
- Create: `backend/app/integrations/uniprot.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/routes.py`
- Create: `backend/tests/test_uniprot.py`

- [ ] **Step 1: Define UniProt models**

In `backend/app/models.py`:

```python
class UniProtFeature(BaseModel):
    feature_type: str     # "Domain", "Active site", "Binding site", "Natural variant", etc.
    description: str | None = None
    start: int | None = None   # sequence position (1-indexed)
    end: int | None = None
    evidence: str | None = None


class UniProtAnnotation(BaseModel):
    uniprot_id: str
    gene_name: str | None = None
    protein_name: str | None = None
    organism: str | None = None
    function: str | None = None
    features: list[UniProtFeature] = Field(default_factory=list)
```

Add `uniprot_annotation: UniProtAnnotation | None = None` to `AnalysisResponse`.

- [ ] **Step 2: Implement `integrations/uniprot.py`**

```python
"""UniProt REST API v2 integration for biological annotations."""
from __future__ import annotations
import urllib.request
import json
from app.models import UniProtAnnotation, UniProtFeature


UNIPROT_API = "https://rest.uniprot.org/uniprotkb"
TIMEOUT_SECONDS = 8


def fetch_uniprot_annotation(uniprot_id: str) -> UniProtAnnotation:
    url = f"{UNIPROT_API}/{uniprot_id}.json"
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_SECONDS) as resp:
            data = json.loads(resp.read())
    except Exception as exc:
        raise UniProtFetchError(f"Failed to fetch UniProt annotation for {uniprot_id}: {exc}") from exc

    gene_name = None
    if data.get("genes"):
        gene_name = data["genes"][0].get("geneName", {}).get("value")

    protein_name = None
    if data.get("proteinDescription"):
        protein_name = (
            data["proteinDescription"]
            .get("recommendedName", {})
            .get("fullName", {})
            .get("value")
        )

    function_text = None
    for comment in data.get("comments", []):
        if comment.get("commentType") == "FUNCTION":
            texts = comment.get("texts", [])
            if texts:
                function_text = texts[0].get("value")
            break

    features: list[UniProtFeature] = []
    for feat in data.get("features", []):
        feat_type = feat.get("type", "")
        if feat_type not in {"Domain", "Active site", "Binding site", "Natural variant", "Motif", "Region"}:
            continue
        loc = feat.get("location", {})
        features.append(UniProtFeature(
            feature_type=feat_type,
            description=feat.get("description") or feat.get("featureId"),
            start=loc.get("start", {}).get("value"),
            end=loc.get("end", {}).get("value"),
            evidence=feat.get("evidences", [{}])[0].get("evidenceCode") if feat.get("evidences") else None,
        ))

    return UniProtAnnotation(
        uniprot_id=uniprot_id,
        gene_name=gene_name,
        protein_name=protein_name,
        organism=data.get("organism", {}).get("scientificName"),
        function=function_text,
        features=features,
    )


class UniProtFetchError(Exception):
    pass
```

- [ ] **Step 3: Wire UniProt fetch into AlphaFold analysis route**

In `service.py` `analyze_alphafold_id_with_timing`, after the analysis:
```python
from app.integrations.uniprot import fetch_uniprot_annotation, UniProtFetchError

try:
    uniprot_annotation = fetch_uniprot_annotation(uniprot_id)
except UniProtFetchError:
    uniprot_annotation = None
# attach to response
```

- [ ] **Step 4: Write tests**

```python
# backend/tests/test_uniprot.py
from unittest.mock import patch
import json

MOCK_UNIPROT_P69905 = {
    "primaryAccession": "P69905",
    "genes": [{"geneName": {"value": "HBA1"}}],
    "proteinDescription": {"recommendedName": {"fullName": {"value": "Hemoglobin subunit alpha"}}},
    "organism": {"scientificName": "Homo sapiens"},
    "comments": [{"commentType": "FUNCTION", "texts": [{"value": "Involved in oxygen transport."}]}],
    "features": [{"type": "Domain", "description": "Globin", "location": {"start": {"value": 1}, "end": {"value": 141}}, "evidences": []}],
}

def test_fetch_uniprot_annotation_parses_correctly():
    from app.integrations.uniprot import fetch_uniprot_annotation
    import urllib.request
    with patch.object(urllib.request, "urlopen") as mock_open:
        mock_open.return_value.__enter__ = lambda s: s
        mock_open.return_value.__exit__ = lambda *args: None
        mock_open.return_value.read.return_value = json.dumps(MOCK_UNIPROT_P69905).encode()
        result = fetch_uniprot_annotation("P69905")
    assert result.gene_name == "HBA1"
    assert result.protein_name == "Hemoglobin subunit alpha"
    assert result.function == "Involved in oxygen transport."
    assert len(result.features) == 1
    assert result.features[0].feature_type == "Domain"
```

- [ ] **Step 5: Commit**

```bash
pytest tests/test_uniprot.py -x -v
git add backend/app/integrations/uniprot.py backend/app/models.py backend/app/service.py backend/tests/test_uniprot.py
git commit -m "feat: UniProt annotation integration — function, domains, active/binding sites"
```

---

### Task 13: UniProt annotations panel (frontend)

Show function text and feature list in the Methods/Overview tab for AlphaFold-fetched structures.

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/components/workbench/ProteinWorkbench.tsx`

- [ ] **Step 1: Add types**

```typescript
export type UniProtFeature = {
  feature_type: string;
  description: string | null;
  start: number | null;
  end: number | null;
  evidence: string | null;
};

export type UniProtAnnotation = {
  uniprot_id: string;
  gene_name: string | null;
  protein_name: string | null;
  organism: string | null;
  function: string | null;
  features: UniProtFeature[];
};
```

Add `uniprot_annotation?: UniProtAnnotation | null` to `AnalysisResponse`.

- [ ] **Step 2: Render in Overview/Methods tab**

When `analysis.uniprot_annotation` exists, render a collapsible "UniProt annotations" section after the metadata rows:

```tsx
{analysis.uniprot_annotation && (
  <section className="mt-5">
    <h3 className="pio-label mb-2">UniProt annotations</h3>
    {analysis.uniprot_annotation.function && (
      <p className="text-[13px] text-[var(--pio-ink)] mb-3">
        {analysis.uniprot_annotation.function}
      </p>
    )}
    {analysis.uniprot_annotation.features.length > 0 && (
      <div className="space-y-1">
        {analysis.uniprot_annotation.features.map((feat, i) => (
          <div key={i} className="flex items-start gap-2 text-[12px]">
            <span className="pio-badge pio-badge-metadata shrink-0">{feat.feature_type}</span>
            <span className="text-[var(--pio-graphite)]">
              {feat.description}{feat.start ? ` (${feat.start}–${feat.end})` : ""}
            </span>
          </div>
        ))}
      </div>
    )}
  </section>
)}
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: UniProt annotations panel in Overview/Methods tab"
```

---

## Phase 5: Batch Design Review (foundation)

Goal: accept multiple structure files and return ranked analysis results.

---

### Task 14: Batch analysis endpoint

**Files:**
- Modify: `backend/app/routes.py`
- Create: `backend/app/batch.py`
- Modify: `backend/app/models.py`
- Create: `backend/tests/test_batch.py`

- [ ] **Step 1: Define batch response model**

```python
class BatchDesignEntry(BaseModel):
    filename: str
    analysis: AnalysisResponse | None = None
    error: str | None = None

class BatchAnalysisResponse(BaseModel):
    entries: list[BatchDesignEntry]
    total: int
    succeeded: int
    failed: int
```

- [ ] **Step 2: Implement `batch.py`**

```python
from __future__ import annotations
import asyncio
from app.models import AnalysisResponse, BatchAnalysisResponse, BatchDesignEntry
from app.service import analyze_pdb_content


async def batch_analyze(
    files: list[tuple[str, bytes]],
    cutoff_angstrom: float = 4.0,
) -> BatchAnalysisResponse:
    entries: list[BatchDesignEntry] = []
    for filename, content in files:
        try:
            analysis = analyze_pdb_content(content, filename=filename, cutoff_angstrom=cutoff_angstrom)
            entries.append(BatchDesignEntry(filename=filename, analysis=analysis))
        except Exception as exc:
            entries.append(BatchDesignEntry(filename=filename, error=str(exc)))
    succeeded = sum(1 for e in entries if e.error is None)
    return BatchAnalysisResponse(
        entries=entries,
        total=len(entries),
        succeeded=succeeded,
        failed=len(entries) - succeeded,
    )
```

- [ ] **Step 3: Add the route**

```python
@router.post("/api/batch/analyze", response_model=BatchAnalysisResponse)
async def batch_analyze_structures(
    files: list[UploadFile] = File(...),
    cutoff_angstrom: float = Form(4.0),
) -> BatchAnalysisResponse:
    if len(files) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 structures per batch request.")
    file_contents = [(f.filename or f"file_{i}", await f.read()) for i, f in enumerate(files)]
    from app.batch import batch_analyze
    return await batch_analyze(file_contents, cutoff_angstrom=cutoff_angstrom)
```

- [ ] **Step 4: Write tests**

```python
# backend/tests/test_batch.py
def test_batch_analyze_returns_one_entry_per_file(minimal_cif_bytes):
    from app.batch import batch_analyze
    import asyncio
    result = asyncio.run(batch_analyze([
        ("a.cif", minimal_cif_bytes),
        ("b.cif", minimal_cif_bytes),
    ]))
    assert result.total == 2
    assert result.succeeded == 2
    assert result.failed == 0

def test_batch_analyze_reports_error_per_bad_file(minimal_cif_bytes):
    from app.batch import batch_analyze
    import asyncio
    result = asyncio.run(batch_analyze([
        ("good.cif", minimal_cif_bytes),
        ("bad.cif", b"not a valid structure"),
    ]))
    assert result.total == 2
    assert result.succeeded == 1
    assert result.failed == 1
    assert result.entries[1].error is not None
```

- [ ] **Step 5: Commit**

```bash
pytest tests/test_batch.py -x -v
git add backend/app/batch.py backend/app/models.py backend/app/routes.py backend/tests/test_batch.py
git commit -m "feat: POST /api/batch/analyze — multi-structure batch analysis endpoint"
```

---

## Phase 6: Report Polish

Goal: make Report mode comprehensive enough to stand alone.

---

### Task 15: Auto-include comparison in Report mode

**Files:**
- Modify: `frontend/src/components/workbench/ProteinWorkbench.tsx` (Report tab)

- [ ] **Step 1: When `comparison` state is set, add a Comparison section to the Report**

```tsx
{comparison && (
  <ReportSection title="Structure Comparison">
    <p>Comparing <strong>{labelA}</strong> vs <strong>{labelB}</strong> at {cutoff.toFixed(1)} Å cutoff.</p>
    <div className="mt-3 grid grid-cols-3 gap-2">
      <ReportMetricTile label="Shared contacts" value={comparison.contacts.shared_contact_count} />
      <ReportMetricTile label="Gained in B" value={comparison.contacts.gained_contact_count} />
      <ReportMetricTile label="Lost from A" value={comparison.contacts.lost_contact_count} />
    </div>
    {comparison.warnings.map((w, i) => (
      <p key={i} className="mt-2 text-[12px] text-amber-700">{w}</p>
    ))}
  </ReportSection>
)}
```

- [ ] **Step 2: Add disclaimer section to Report**

```tsx
<ReportSection title="Limitations">
  <ul className="text-[13px] text-[var(--pio-graphite)] space-y-1 list-disc pl-4">
    <li>Contacts are distance-based ({cutoff.toFixed(1)} Å cutoff). Distances alone do not confirm biochemical interactions.</li>
    <li>Confidence badges are review heuristics based on pLDDT scores, not validated interaction metrics.</li>
    <li>Structure comparison uses residue-level identity without structural alignment. Results may differ from RMSD/TM-score alignment.</li>
    {analysis.metadata?.source === "alphafold" && (
      <li>This structure is an AI-generated prediction. Interpret all contacts and interfaces in the context of confidence scores.</li>
    )}
  </ul>
</ReportSection>
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: report — comparison section + limitations disclaimer"
```

---

## Phase 7: Demo-Readiness (README + Examples)

### Task 16: README + best demo path

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write a clear README opening**

The README should open with the one-line positioning, then a "Best demo path" section:

```markdown
# Protein I/O

**A confidence-aware review and reporting workspace for experimental and AI-predicted protein structures.**

Load structures from RCSB PDB or AlphaFold DB, inspect contacts and confidence scores, compare models, and export clean scientific reports — all in the browser.

## Best demo path (5 minutes)

1. Open the app at [protein-io.vercel.app](https://protein-io.vercel.app)
2. In the sidebar, select **AlphaFold**, enter UniProt ID `P69905` (human hemoglobin α), click **Fetch**
3. In the **Contacts** tab, observe contacts annotated with pLDDT confidence badges
4. In the **Interfaces** tab, inspect chain-pair contacts and mean interface confidence
5. Switch to **Compare** tab, load `P69905` in slot A and `2HHB` (RCSB) in slot B, click **Analyze**
6. Review shared/gained/lost contacts and the delta summary
7. Switch to **Report** tab and click **Download JSON**
```

- [ ] **Step 2: Add example gallery descriptions**

Document which example structures are pre-loaded in the gallery and what scientific insight each one demonstrates.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README rewrite with demo path and positioning"
```

---

## Phases 8+: Future Work (High-Level)

These phases are not yet ready for detailed task decomposition. Each should become its own plan document when prioritized.

### Phase 8: PLIP Integration (after spike confirms feasibility)
- Wire `plip_spike.py` into production `service.py`
- Add `PlipInteraction` list to `AnalysisResponse`
- Render PLIP interaction types in Ligands tab as classified interaction badges (H-bond, hydrophobic, etc.)
- Add per-ligand interaction summary card using PLIP output
- Add "Ligands" mode to the top nav alongside Explore / Compare / Report

### Phase 9: Boltz / Chai Output Support
- Add parsers for Boltz JSON output format (affinity metadata, multi-chain)
- Add Chai output parser (constraint/restraint metadata, covalent bonds)
- Extend `StructureMetadata` with `source` variants: `"boltz"`, `"chai"`, `"colabfold"`
- Show source-specific metadata panels (affinity score, model rank, ipTM)

### Phase 10: Provenance Graph
- Add `run_id` to all analysis results
- Store `AnalysisRun` records (source, parameters, parser version, timestamp)
- Show provenance chain in Report (structure → analysis → comparison → report)
- Add `GET /api/runs/{id}` endpoint

### Phase 11: Chat Workspace
- Add a chat panel (bottom drawer or right sidebar)
- Tool-calling agent with `analyze_structure`, `compare_structures`, `summarize_contacts`, `generate_report` tools
- Provenance-cited answers: agent cites the specific row/table/run it's reasoning from
- Explicit boundary: agent explains analysis, does not invent scientific conclusions

---

## Branch strategy

```
main            — production (deployed to Vercel)
feature/compare-workspace  — Phase 1 Compare mode (merge when Tasks 3-5 done)
feat/confidence-badges      — Phase 2 Tasks 1-2 (confidence fields + trust score)
feat/interfaces             — Phase 3 Task 10-11
feat/uniprot                — Phase 4 Tasks 12-13
feat/batch                  — Phase 5 Task 14
```

Each feature branch targets `main`. Keep backend and frontend changes together in the same branch per feature (they're one service).

## Running tests

```bash
# Backend
cd ~/Codex/protein-interaction-explorer/backend
pytest -x -v

# Frontend type check
cd ~/Codex/protein-interaction-explorer/frontend
npx tsc --noEmit
```

## Dev servers

```bash
# Backend
cd ~/Codex/protein-interaction-explorer/backend
python -m uvicorn app.main:app --port 8000 --reload

# Frontend (main repo)
cd ~/Codex/protein-interaction-explorer/frontend
npm run dev   # → localhost:3000

# Frontend (compare worktree)
cd /private/tmp/protein-io-pr2/frontend
npm run dev -- --port 3001
```
