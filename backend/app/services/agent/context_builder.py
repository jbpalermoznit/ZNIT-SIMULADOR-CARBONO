"""
Builds the complete prompt for the Gemini agent, including:
- Skill file (Skill_CarbonAgent.md)
- Pending items with details
- Saved rules (FactorRule + EquipmentRule)
- Available emission factors for key items
- Double-count risk analysis for Type D
"""

import os
import json
from sqlalchemy.orm import Session
from app.models.abc_item import AbcItem, AbcCurve
from app.models.project import Project
from app.models.factor_rule import FactorRule
from app.models.equipment_rule import EquipmentRule
from app.models.item_mapping import ItemMapping
from app.services.emission_mapper import auto_match_item, extract_keywords

SKILL_PATH = os.path.join(os.path.dirname(__file__), "Skill_CarbonAgent.md")


def _load_skill() -> str:
    with open(SKILL_PATH, "r", encoding="utf-8") as f:
        return f.read()


def _get_pending_items(project_id: str, db: Session, item_type: str | None = None) -> list[dict]:
    """Get pending/blocked items, ordered by total_cost DESC."""
    curve = (
        db.query(AbcCurve)
        .filter(AbcCurve.project_id == project_id)
        .order_by(AbcCurve.imported_at.desc())
        .first()
    )
    if not curve:
        return []

    q = db.query(AbcItem).filter(
        AbcItem.abc_curve_id == curve.id,
        AbcItem.mapping_status.in_(["pending", "blocked"]),
    )
    if item_type:
        q = q.filter(AbcItem.item_type == item_type)

    items = q.order_by(AbcItem.total_cost.desc()).all()

    result = []
    for item in items:
        result.append({
            "item_id": item.id,
            "cost_code": item.cost_code,
            "description": item.description,
            "quantity": float(item.quantity) if item.quantity else 0,
            "unit": item.unit or "",
            "total_cost": float(item.total_cost) if item.total_cost else 0,
            "item_type": item.item_type,
            "abc_class": item.abc_class or "",
            "mapping_status": item.mapping_status,
        })
    return result


def _get_saved_rules(company_id: str, db: Session) -> list[dict]:
    """Get active factor and equipment rules."""
    factor_rules = (
        db.query(FactorRule)
        .filter(FactorRule.company_id == company_id, FactorRule.is_active == True)
        .order_by(FactorRule.times_applied.desc())
        .limit(50)
        .all()
    )
    equipment_rules = (
        db.query(EquipmentRule)
        .filter(EquipmentRule.company_id == company_id, EquipmentRule.is_active == True)
        .all()
    )

    rules = []
    for r in factor_rules:
        rules.append({
            "type": "factor",
            "keyword": r.match_keyword,
            "factor_value": float(r.factor_value) if r.factor_value else 0,
            "factor_unit": r.factor_unit or "",
            "factor_name": r.factor_name or "",
            "source_tier": r.source_tier or "",
            "times_applied": r.times_applied or 0,
        })
    for r in equipment_rules:
        rules.append({
            "type": "equipment",
            "keyword": r.match_keyword,
            "category": r.category or "",
            "fuel_type": r.fuel_type or "",
            "consumption_per_hour": float(r.consumption_per_hour) if r.consumption_per_hour else 0,
            "emission_factor_value": float(r.emission_factor_value) if r.emission_factor_value else 0,
            "times_applied": r.times_applied or 0,
        })
    return rules


def _check_double_count(pending_items: list[dict], all_type_a_items: list[dict]) -> list[dict]:
    """For Type D items, find overlapping Type A items."""
    overlaps = []
    for item in pending_items:
        if item["item_type"] != "D":
            continue
        keywords = extract_keywords(item["description"])
        matching_a = []
        for a_item in all_type_a_items:
            a_keywords = extract_keywords(a_item["description"])
            common = set(keywords) & set(a_keywords)
            if common:
                matching_a.append({
                    "item_id": a_item["item_id"],
                    "description": a_item["description"],
                    "common_keywords": list(common),
                })
        if matching_a:
            overlaps.append({
                "item_id": item["item_id"],
                "description": item["description"],
                "overlapping_type_a": matching_a,
            })
    return overlaps


def build_agent_prompt(
    project_id: str,
    user_message: str,
    db: Session,
    item_type: str | None = None,
    item_ids: list[str] | None = None,
    conversation_history: list[dict] | None = None,
) -> str:
    """Build the complete prompt for the Gemini agent."""

    # Load skill
    skill = _load_skill()

    # Get project info
    project = db.query(Project).filter(Project.id == project_id).first()
    project_name = project.name if project else "Projeto"
    project_area = project.total_area_m2 if project else None

    # Get pending items
    pending = _get_pending_items(project_id, db, item_type)

    # Filter to specific items if requested
    if item_ids:
        pending = [p for p in pending if p["item_id"] in item_ids]

    # Get all Type A items for double-count analysis
    curve = (
        db.query(AbcCurve)
        .filter(AbcCurve.project_id == project_id)
        .order_by(AbcCurve.imported_at.desc())
        .first()
    )
    all_type_a = []
    if curve:
        type_a_items = (
            db.query(AbcItem)
            .filter(AbcItem.abc_curve_id == curve.id, AbcItem.item_type == "A")
            .all()
        )
        all_type_a = [
            {"item_id": i.id, "description": i.description, "cost_code": i.cost_code}
            for i in type_a_items
        ]

    # Double-count analysis
    double_counts = _check_double_count(pending, all_type_a)

    # Get saved rules
    company_id = project.company_id if project else "company-htb"
    saved_rules = _get_saved_rules(company_id, db)

    # Build summary by type
    type_summary = {}
    for item in pending:
        t = item["item_type"]
        type_summary[t] = type_summary.get(t, 0) + 1

    # Assemble prompt
    prompt_parts = [
        skill,
        "\n---\n",
        f"## Contexto do Projeto\n",
        f"- **Projeto**: {project_name}",
        f"- **Área total**: {project_area} m²" if project_area else "",
        f"- **Total de itens pendentes**: {len(pending)}",
        f"- **Por tipo**: {json.dumps(type_summary, ensure_ascii=False)}",
        "\n",
    ]

    # Saved rules
    if saved_rules:
        prompt_parts.append("## Regras Salvas (usar como referência)\n")
        prompt_parts.append("```json\n")
        prompt_parts.append(json.dumps(saved_rules[:20], ensure_ascii=False, indent=2))
        prompt_parts.append("\n```\n\n")

    # Double-count risks
    if double_counts:
        prompt_parts.append("## Riscos de Dupla Contagem (Tipo D)\n")
        prompt_parts.append("```json\n")
        prompt_parts.append(json.dumps(double_counts, ensure_ascii=False, indent=2))
        prompt_parts.append("\n```\n\n")

    # Pending items
    prompt_parts.append("## Itens Pendentes para Análise\n")
    prompt_parts.append("```json\n")
    prompt_parts.append(json.dumps(pending, ensure_ascii=False, indent=2))
    prompt_parts.append("\n```\n\n")

    # Conversation history (if any)
    if conversation_history:
        prompt_parts.append("## Histórico da Conversa\n")
        for msg in conversation_history[-6:]:  # Last 6 messages to keep prompt manageable
            role = "Usuário" if msg.get("role") == "user" else "Agente"
            prompt_parts.append(f"**{role}:** {msg.get('content', '')}\n")
        prompt_parts.append("\n")

    # User message
    prompt_parts.append(f"## Instrução do Usuário (MENSAGEM ATUAL)\n")
    prompt_parts.append(f"{user_message}\n\n")
    prompt_parts.append("Responda EXCLUSIVAMENTE em formato JSON conforme o formato de saída definido no skill acima. Não inclua texto fora do JSON.")

    return "\n".join(prompt_parts)
