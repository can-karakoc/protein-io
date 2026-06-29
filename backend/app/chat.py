import json
import os

import anthropic

from .models import AnalysisResponse

TOOLS: list[dict] = [
    {
        "name": "get_structure_summary",
        "description": "Returns the full structure summary: chains, residue counts, contact counts by type, and ligand list.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "query_contacts",
        "description": (
            "Query contacts with optional filters. Returns up to 50 matching contacts "
            "with chain IDs, residue names/numbers, atoms, distances, and interaction class."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_type": {
                    "type": "string",
                    "enum": ["protein-protein", "protein-ligand", "protein-water", "all"],
                    "description": "Filter by contact type",
                },
                "chain_a": {"type": "string", "description": "Filter where chain A matches this identifier"},
                "chain_b": {"type": "string", "description": "Filter where chain B matches this identifier"},
                "residue_name": {"type": "string", "description": "Filter by 3-letter residue name (e.g. HIS, ASP)"},
                "interaction_class": {
                    "type": "string",
                    "enum": ["h-bond", "salt-bridge", "aromatic", "pi-cation", "hydrophobic", "halogen-bond", "unclassified"],
                    "description": "Filter by interaction classification",
                },
                "max_distance": {"type": "number", "description": "Maximum distance in Ångströms"},
                "limit": {"type": "integer", "description": "Max results (default 20, max 50)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_ligand_details",
        "description": "Returns full interaction details for a named ligand: contacting residues, distances, interaction fingerprint, distance distribution.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ligand_name": {"type": "string", "description": "Ligand name (e.g. HEM, MK1, ATP)"},
            },
            "required": ["ligand_name"],
        },
    },
    {
        "name": "get_residue_contacts",
        "description": "Returns all contacts involving a specific residue identified by chain and residue number.",
        "input_schema": {
            "type": "object",
            "properties": {
                "chain": {"type": "string", "description": "Chain identifier"},
                "residue_number": {"type": "string", "description": "Residue number"},
            },
            "required": ["chain", "residue_number"],
        },
    },
    {
        "name": "get_chain_summary",
        "description": "Returns residue count and contact count for one chain (pass chain ID) or all chains (omit chain ID).",
        "input_schema": {
            "type": "object",
            "properties": {
                "chain": {"type": "string", "description": "Chain identifier, or omit for all chains"},
            },
            "required": [],
        },
    },
]


def _build_system(analysis: AnalysisResponse) -> str:
    s = analysis.summary
    m = analysis.metadata
    title = (m.title or m.pdb_id or m.uniprot_id or "Uploaded structure") if m else "Uploaded structure"
    source = (m.source or "upload") if m else "upload"
    source_id = ((m.pdb_id or m.uniprot_id or "")) if m else ""
    chain_list = ", ".join(c.id for c in analysis.chains[:10]) if analysis.chains else "none"
    ligand_names = ", ".join(li.name for li in analysis.ligand_interactions[:10]) if analysis.ligand_interactions else "none"

    conf_line = ""
    if analysis.confidence:
        mean = analysis.confidence.mean_plddt
        tier = "high" if mean >= 70 else "moderate" if mean >= 50 else "low"
        conf_line = f"Confidence (pLDDT): mean {mean:.1f} ({tier})\n"

    return (
        "You are a protein structure analysis assistant embedded in the Protein I/O workbench.\n\n"
        f"Loaded structure: {title}\n"
        f"Source: {source} {source_id}\n"
        f"Chains: {s.chain_count} ({chain_list})\n"
        f"Residues: {s.residue_count} | Contacts: {s.contact_count} | Ligands: {s.ligand_count} ({ligand_names})\n"
        f"{conf_line}\n"
        "RULES:\n"
        "- Only state facts retrieved via tools or explicitly in this summary. Never invent residue numbers, distances, or interaction types.\n"
        "- When a user asks about a specific residue, ligand, or contact, use the appropriate tool to look it up first.\n"
        "- Cite exact values (distances in Å, residue IDs, chain labels) from tool results.\n"
        "- Be concise and scientifically precise. Flag uncertainty clearly."
    )


def _run_tool(name: str, tool_input: dict, analysis: AnalysisResponse) -> object:
    if name == "get_structure_summary":
        m = analysis.metadata
        return {
            "chain_count": analysis.summary.chain_count,
            "residue_count": analysis.summary.residue_count,
            "contact_count": analysis.summary.contact_count,
            "ligand_count": analysis.summary.ligand_count,
            "chains": [{"chain_id": c.id, "residue_count": c.residue_count} for c in analysis.chains],
            "ligands": [{"name": li.name, "chain": li.chain_id, "contact_count": li.contact_count} for li in analysis.ligand_interactions],
            "metadata": {
                "title": m.title if m else None,
                "source": m.source if m else "upload",
                "pdb_id": m.pdb_id if m else None,
                "method": m.method if m else None,
                "resolution_angstrom": m.resolution_angstrom if m else None,
            },
            "confidence": {"mean_plddt": round(analysis.confidence.mean_plddt, 2)} if analysis.confidence else None,
        }

    if name == "query_contacts":
        contact_type = tool_input.get("contact_type", "all")
        chain_a_f = tool_input.get("chain_a")
        chain_b_f = tool_input.get("chain_b")
        res_name_f = (tool_input.get("residue_name") or "").upper() or None
        iclass_f = tool_input.get("interaction_class")
        max_dist = tool_input.get("max_distance")
        limit = min(int(tool_input.get("limit", 20)), 50)

        results = []
        for c in analysis.contacts:
            if contact_type != "all" and c.contact_type != contact_type:
                continue
            if chain_a_f and c.chain_a != chain_a_f and c.chain_b != chain_a_f:
                continue
            if chain_b_f and c.chain_b != chain_b_f and c.chain_a != chain_b_f:
                continue
            if res_name_f and res_name_f not in c.residue_name_a.upper() and res_name_f not in c.residue_name_b.upper():
                continue
            if iclass_f and c.interaction_class != iclass_f:
                continue
            if max_dist and c.distance_angstrom > max_dist:
                continue
            results.append({
                "chain_a": c.chain_a, "residue_a": c.residue_a, "residue_name_a": c.residue_name_a, "atom_a": c.atom_a,
                "chain_b": c.chain_b, "residue_b": c.residue_b, "residue_name_b": c.residue_name_b, "atom_b": c.atom_b,
                "distance_angstrom": round(c.distance_angstrom, 3),
                "contact_type": c.contact_type,
                "interaction_class": c.interaction_class,
            })
            if len(results) >= limit:
                break
        return {"count": len(results), "contacts": results}

    if name == "get_ligand_details":
        query = (tool_input.get("ligand_name") or "").upper()
        lig = next((li for li in analysis.ligand_interactions if li.name.upper() == query), None)
        if not lig:
            lig = next((li for li in analysis.ligand_interactions if query in li.name.upper()), None)
        if not lig:
            return {"error": f"Ligand '{query}' not found. Available: {[li.name for li in analysis.ligand_interactions]}"}
        return {
            "name": lig.name, "chain": lig.chain_id, "residue_number": lig.residue_number,
            "contact_count": lig.contact_count, "protein_contact_count": lig.protein_contact_count,
            "water_contact_count": lig.water_contact_count, "possible_clash_count": lig.possible_clash_count,
            "closest_distance_angstrom": lig.closest_distance_angstrom,
            "interaction_class_breakdown": lig.interaction_class_breakdown,
            "contacting_residues": [
                {"chain": r.chain_id, "residue_name": r.residue_name, "residue_number": r.residue_number, "contact_count": r.contact_count}
                for r in lig.contacting_residues
            ],
            "distance_distribution": {
                "under_2A": lig.distance_distribution.under_2_angstrom,
                "2_to_3A": lig.distance_distribution.two_to_3_angstrom,
                "3_to_4A": lig.distance_distribution.three_to_4_angstrom,
                "over_4A": lig.distance_distribution.over_4_angstrom,
            },
        }

    if name == "get_residue_contacts":
        chain = tool_input.get("chain", "")
        res_num = str(tool_input.get("residue_number", ""))
        matched = []
        for c in analysis.contacts:
            is_a = c.chain_a == chain and str(c.residue_a) == res_num
            is_b = c.chain_b == chain and str(c.residue_b) == res_num
            if not is_a and not is_b:
                continue
            matched.append({
                "partner_chain": c.chain_b if is_a else c.chain_a,
                "partner_residue": c.residue_b if is_a else c.residue_a,
                "partner_name": c.residue_name_b if is_a else c.residue_name_a,
                "own_atom": c.atom_a if is_a else c.atom_b,
                "partner_atom": c.atom_b if is_a else c.atom_a,
                "distance_angstrom": round(c.distance_angstrom, 3),
                "contact_type": c.contact_type,
                "interaction_class": c.interaction_class,
            })
        return {"chain": chain, "residue_number": res_num, "contact_count": len(matched), "contacts": matched[:50]}

    if name == "get_chain_summary":
        target = tool_input.get("chain")
        if target:
            ch = next((c for c in analysis.chains if c.id == target), None)
            if not ch:
                return {"error": f"Chain '{target}' not found. Available: {[c.id for c in analysis.chains]}"}
            return {"chain_id": ch.id, "residue_count": ch.residue_count, "atom_count": ch.atom_count}
        return {"chains": [{"chain_id": c.id, "residue_count": c.residue_count} for c in analysis.chains]}

    return {"error": f"Unknown tool: {name}"}


async def run_chat(analysis: AnalysisResponse, messages: list[dict]) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return {"reply": None, "tool_calls": [], "error": "ANTHROPIC_API_KEY is not set on the server."}
    try:
        return await _run_chat(api_key, analysis, messages)
    except anthropic.AuthenticationError:
        return {"reply": None, "tool_calls": [], "error": "Invalid Anthropic API key."}
    except anthropic.RateLimitError:
        return {"reply": None, "tool_calls": [], "error": "Anthropic rate limit hit — try again in a moment."}
    except Exception as exc:
        return {"reply": None, "tool_calls": [], "error": f"Chat error: {exc}"}


async def _run_chat(api_key: str, analysis: AnalysisResponse, messages: list[dict]) -> dict:

    client = anthropic.AsyncAnthropic(api_key=api_key)
    system = _build_system(analysis)
    tool_calls_log: list[dict] = []
    current_messages = list(messages)

    for _ in range(8):
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=system,
            tools=TOOLS,  # type: ignore[arg-type]
            messages=current_messages,  # type: ignore[arg-type]
        )

        if response.stop_reason == "end_turn":
            text = next((b.text for b in response.content if hasattr(b, "text")), "")
            return {"reply": text, "tool_calls": tool_calls_log, "error": None}

        if response.stop_reason == "tool_use":
            tool_uses = [b for b in response.content if b.type == "tool_use"]
            tool_results = []
            for tu in tool_uses:
                result = _run_tool(tu.name, tu.input, analysis)
                tool_calls_log.append({"name": tu.name, "input": tu.input, "result": result})
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": json.dumps(result),
                })
            current_messages = [
                *current_messages,
                {"role": "assistant", "content": response.content},
                {"role": "user", "content": tool_results},
            ]
        else:
            break

    text = next((b.text for b in response.content if hasattr(b, "text")), "No response generated.")
    return {"reply": text, "tool_calls": tool_calls_log, "error": None}
