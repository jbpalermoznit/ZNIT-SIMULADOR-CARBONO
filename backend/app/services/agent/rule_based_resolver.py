"""
Local rule-based resolver — fallback when Gemini webhook is unavailable.
Applies the same logic as Skill_CarbonAgent.md but without AI.
"""

from sqlalchemy.orm import Session
from app.models.abc_item import AbcItem
from app.services.emission_mapper import auto_match_item, extract_keywords

# Default equipment profiles
EQUIPMENT_PROFILES = {
    "retroescavadeira": {"fuel_type": "diesel", "consumption_per_hour": 12, "consumption_unit": "L/h", "emission_factor": 2.643, "emission_factor_unit": "kgCO₂/L"},
    "escavadeira": {"fuel_type": "diesel", "consumption_per_hour": 20, "consumption_unit": "L/h", "emission_factor": 2.643, "emission_factor_unit": "kgCO₂/L"},
    "caminhão": {"fuel_type": "diesel", "consumption_per_hour": 15, "consumption_unit": "L/h", "emission_factor": 2.643, "emission_factor_unit": "kgCO₂/L"},
    "basculante": {"fuel_type": "diesel", "consumption_per_hour": 15, "consumption_unit": "L/h", "emission_factor": 2.643, "emission_factor_unit": "kgCO₂/L"},
    "guindaste": {"fuel_type": "diesel", "consumption_per_hour": 25, "consumption_unit": "L/h", "emission_factor": 2.643, "emission_factor_unit": "kgCO₂/L"},
    "solda": {"fuel_type": "electric", "consumption_per_hour": 8, "consumption_unit": "kWh/h", "emission_factor": 0.10, "emission_factor_unit": "kgCO₂/kWh"},
    "andaime": None,  # No emission — passive structure
}


def _match_equipment_profile(description: str) -> dict | None:
    """Find the best equipment profile for a description."""
    desc_lower = description.lower()
    for keyword, profile in EQUIPMENT_PROFILES.items():
        if keyword in desc_lower:
            return profile
    return None


def resolve_locally(
    pending_items: list[dict],
    user_message: str,
    db: Session,
) -> dict:
    """
    Resolve items using rule-based logic.
    Returns same format as Gemini agent response.
    """
    decisions = []
    msg_lower = user_message.lower()

    # Determine which types to resolve
    resolve_types = set()
    if "tipo b" in msg_lower or "mão de obra" in msg_lower or "mao de obra" in msg_lower:
        resolve_types.add("B")
    if "tipo c" in msg_lower or "agrupado" in msg_lower:
        resolve_types.add("C")
    if "tipo d" in msg_lower or "dupla" in msg_lower or "embutido" in msg_lower:
        resolve_types.add("D")
    if "tipo e" in msg_lower or "equipamento" in msg_lower:
        resolve_types.add("E")
    if "tipo f" in msg_lower or "administrativo" in msg_lower:
        resolve_types.add("F")
    if "tudo" in msg_lower or "todos" in msg_lower:
        resolve_types = {"B", "C", "D", "E", "F"}

    for item in pending_items:
        item_type = item.get("item_type", "")
        if resolve_types and item_type not in resolve_types:
            continue

        if item_type == "B":
            decisions.append({
                "item_id": item["item_id"],
                "action": "exclude",
                "justification": "Mão de obra — excluída conforme escopo operacional (GHG Protocol, Scope 1+2+3 materiais).",
                "save_as_rule": True,
            })

        elif item_type == "F":
            decisions.append({
                "item_id": item["item_id"],
                "action": "exclude",
                "justification": "Custo administrativo/indireto — excluído conforme escopo. Sem emissão direta de carbono associada.",
                "save_as_rule": True,
            })

        elif item_type == "E":
            profile = _match_equipment_profile(item["description"])
            if profile is None:
                # Andaime or unknown — exclude
                decisions.append({
                    "item_id": item["item_id"],
                    "action": "exclude",
                    "justification": f"Equipamento passivo (sem consumo de combustível) — excluído do inventário.",
                    "save_as_rule": True,
                })
            else:
                decisions.append({
                    "item_id": item["item_id"],
                    "action": "equipment_calc",
                    "justification": f"Equipamento: {profile['fuel_type']}, {profile['consumption_per_hour']} {profile['consumption_unit']} × {profile['emission_factor']} {profile['emission_factor_unit']}",
                    "save_as_rule": True,
                    "equipment_config": profile,
                })

        elif item_type == "D":
            # Check double counting with Type A items
            decisions.append({
                "item_id": item["item_id"],
                "action": "exclude",
                "justification": "Material embutido em serviço — verificar dupla contagem com itens Tipo A. Excluído por precaução.",
                "save_as_rule": False,
            })

        elif item_type == "C":
            # Grouped items — cannot auto-resolve without decomposition
            decisions.append({
                "item_id": item["item_id"],
                "action": "exclude",
                "justification": f"Item agrupado (subempreitada) — requer decomposição manual. Custo: R$ {item.get('total_cost', 0):,.0f}. Excluído temporariamente.",
                "save_as_rule": False,
            })

        elif item_type == "A":
            # Try auto-match
            match = auto_match_item(item["description"], item.get("unit"))
            best = match.get("best")
            if best and best.get("score", 0) >= 50:
                decisions.append({
                    "item_id": item["item_id"],
                    "action": "map_factor",
                    "factor_value": best.get("factor_value", 0),
                    "factor_unit": best.get("factor_unit", ""),
                    "factor_name": best.get("factor_name", ""),
                    "source_tier": best.get("source_tier", ""),
                    "justification": f"Auto-match: {best.get('factor_name')} (score={best.get('score', 0)})",
                    "save_as_rule": best.get("score", 0) >= 70,
                })

    # Build response text
    type_counts = {}
    for d in decisions:
        a = d["action"]
        type_counts[a] = type_counts.get(a, 0) + 1

    parts = []
    if type_counts.get("exclude"):
        parts.append(f"{type_counts['exclude']} itens excluídos")
    if type_counts.get("map_factor"):
        parts.append(f"{type_counts['map_factor']} itens mapeados")
    if type_counts.get("equipment_calc"):
        parts.append(f"{type_counts['equipment_calc']} equipamentos calculados")

    agent_response = (
        f"Análise concluída para {len(decisions)} itens. "
        + ", ".join(parts) + ". "
        + "Revise as decisões e clique 'Aceitar todos' para aplicar."
    ) if decisions else "Nenhum item encontrado para resolver com os critérios informados."

    return {
        "agent_response": agent_response,
        "decisions": decisions,
    }
