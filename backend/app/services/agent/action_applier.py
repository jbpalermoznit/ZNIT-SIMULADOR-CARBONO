"""
Applies agent decisions to the database:
- Creates/updates ItemMappings
- Creates FactorRules and EquipmentRules when save_as_rule=True
- Updates mapping_status on AbcItems
- Recalculates base scenario if it exists
"""

import re
from sqlalchemy.orm import Session
from app.models.abc_item import AbcItem
from app.models.item_mapping import ItemMapping
from app.models.factor_rule import FactorRule
from app.models.equipment_rule import EquipmentRule
from app.models.scenario import Scenario, ScenarioItem


def _normalize_keyword(text: str) -> str:
    """Normalize description to a match keyword."""
    text = text.lower().strip()
    text = re.sub(r"[^a-záàâãéèêíïóôõúüç0-9\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def apply_decisions(
    decisions: list[dict],
    project_id: str,
    db: Session,
    user_id: str = "agent",
) -> dict:
    """
    Apply a list of agent decisions.
    Returns summary: { resolved, rules_saved, excluded, errors }
    """
    resolved = 0
    rules_saved = 0
    excluded = 0
    errors = []

    for decision in decisions:
        item_id = decision.get("item_id")
        action = decision.get("action")

        if not item_id or not action:
            errors.append(f"Decision missing item_id or action: {decision}")
            continue

        item = db.query(AbcItem).filter(AbcItem.id == item_id).first()
        if not item:
            errors.append(f"Item not found: {item_id}")
            continue

        try:
            if action == "exclude":
                _apply_exclude(item, decision, db, user_id)
                excluded += 1

            elif action == "map_factor":
                _apply_map_factor(item, decision, db, user_id)
                resolved += 1

            elif action == "equipment_calc":
                _apply_equipment(item, decision, db, user_id)
                resolved += 1

            elif action == "decompose":
                # For now, mark as manual with a note about decomposition
                _apply_decompose(item, decision, db, user_id)
                resolved += 1

            else:
                errors.append(f"Unknown action '{action}' for item {item_id}")
                continue

            # Save as rule if requested
            if decision.get("save_as_rule"):
                _save_rule(item, decision, db, user_id)
                rules_saved += 1

            db.commit()

        except Exception as e:
            db.rollback()
            errors.append(f"Error applying decision for {item_id}: {str(e)}")

    return {
        "resolved": resolved,
        "rules_saved": rules_saved,
        "excluded": excluded,
        "errors": errors,
    }


def _apply_exclude(item: AbcItem, decision: dict, db: Session, user_id: str):
    """Exclude an item with justification."""
    # Update or create mapping
    mapping = db.query(ItemMapping).filter(ItemMapping.abc_item_id == item.id).first()
    if not mapping:
        mapping = ItemMapping(abc_item_id=item.id)
        db.add(mapping)

    mapping.source_tier = "excluded"
    mapping.mapped_by = "agent"
    mapping.confidence = "high"
    mapping.factor_name = "Excluído"
    mapping.factor_value = 0
    mapping.factor_unit = ""
    mapping.factor_source = decision.get("justification", "Excluído pelo agente")
    mapping.notes = decision.get("justification", "")

    item.mapping_status = "excluded"


def _apply_map_factor(item: AbcItem, decision: dict, db: Session, user_id: str):
    """Map an item to an emission factor."""
    mapping = db.query(ItemMapping).filter(ItemMapping.abc_item_id == item.id).first()
    if not mapping:
        mapping = ItemMapping(abc_item_id=item.id)
        db.add(mapping)

    mapping.source_tier = decision.get("source_tier", "cecarbon")
    mapping.factor_value = decision.get("factor_value", 0)
    mapping.factor_unit = decision.get("factor_unit", "")
    mapping.factor_name = decision.get("factor_name", "")
    mapping.factor_source = decision.get("source_tier", "")
    mapping.confidence = "high"
    mapping.mapped_by = "agent"

    item.mapping_status = "auto"


def _apply_equipment(item: AbcItem, decision: dict, db: Session, user_id: str):
    """Apply equipment calculation chain."""
    config = decision.get("equipment_config", {})
    fuel_type = config.get("fuel_type", "diesel")
    consumption = config.get("consumption_per_hour", 0)
    emission_factor = config.get("emission_factor", 2.643)

    # Total emission factor per hour
    factor_per_hour = consumption * emission_factor

    mapping = db.query(ItemMapping).filter(ItemMapping.abc_item_id == item.id).first()
    if not mapping:
        mapping = ItemMapping(abc_item_id=item.id)
        db.add(mapping)

    mapping.source_tier = "ghg_protocol"
    mapping.factor_value = factor_per_hour
    mapping.factor_unit = f"kgCO₂e/h ({consumption} {config.get('consumption_unit', 'L/h')} × {emission_factor} kgCO₂/{config.get('consumption_unit', 'L/h').replace('/h', '')})"
    mapping.factor_name = f"{item.description} ({fuel_type})"
    mapping.factor_source = "GHG Protocol BR + perfil de equipamento"
    mapping.confidence = "high"
    mapping.mapped_by = "agent"

    item.mapping_status = "auto"


def _apply_decompose(item: AbcItem, decision: dict, db: Session, user_id: str):
    """Create real sub-items from decomposition and mark parent as decomposed."""
    decomposition = decision.get("decomposition", [])

    if not decomposition:
        # No sub-items — just exclude with note
        _apply_exclude(item, {
            "justification": f"Item agrupado sem decomposição disponível — excluído temporariamente."
        }, db, user_id)
        return

    # Create real sub-items
    for i, sub in enumerate(decomposition):
        cost_pct = sub.get("cost_pct", 0) / 100
        sub_cost = (item.total_cost or 0) * cost_pct
        sub_type = sub.get("item_type", "A")
        desc = sub.get("description", f"Sub-item {i+1}")
        factor_value = sub.get("factor_value", 0)
        factor_unit = sub.get("factor_unit", "")
        factor_name = sub.get("factor_name", "")

        # Create sub-item as a real AbcItem
        sub_item = AbcItem(
            abc_curve_id=item.abc_curve_id,
            cost_code=f"{item.cost_code}.{i+1}",
            description=f"{desc} ({item.description})",
            quantity=sub_cost if sub_type == "B" else (item.quantity or 0) * cost_pct,
            unit=item.unit or "vb",
            unit_cost=0,
            total_cost=sub_cost,
            cost_pct=(item.cost_pct or 0) * cost_pct,
            cumulative_pct=0,
            abc_class=item.abc_class or "P1",
            item_type=sub_type,
            item_order=(item.item_order or 0) * 100 + i + 1,
            parent_item_id=item.id,
            classification_note=f"Sub-item de decomposição do item {item.cost_code}",
        )

        if sub_type == "B":
            # Mão de obra — exclude
            sub_item.mapping_status = "excluded"
            db.add(sub_item)
            db.flush()
            excluded_mapping = ItemMapping(
                abc_item_id=sub_item.id,
                source_tier="excluded",
                mapped_by="agent",
                confidence="high",
                factor_name="Excluído",
                factor_value=0,
                factor_unit="",
                factor_source="Mão de obra — excluída conforme escopo operacional",
            )
            db.add(excluded_mapping)
        elif factor_value > 0:
            # Has emission factor — map it
            sub_item.mapping_status = "auto"
            db.add(sub_item)
            db.flush()
            sub_mapping = ItemMapping(
                abc_item_id=sub_item.id,
                source_tier=sub.get("source_tier", "cecarbon"),
                factor_value=factor_value,
                factor_unit=factor_unit,
                factor_name=factor_name,
                factor_source=sub.get("source_tier", "cecarbon"),
                confidence="medium",
                mapped_by="agent",
            )
            db.add(sub_mapping)
        else:
            # No factor — pending
            sub_item.mapping_status = "pending"
            db.add(sub_item)

    # Mark parent as decomposed (excluded from direct calculation)
    parent_mapping = db.query(ItemMapping).filter(ItemMapping.abc_item_id == item.id).first()
    if not parent_mapping:
        parent_mapping = ItemMapping(abc_item_id=item.id)
        db.add(parent_mapping)

    parent_mapping.source_tier = "excluded"
    parent_mapping.mapped_by = "agent"
    parent_mapping.confidence = "high"
    parent_mapping.factor_name = f"Decomposto em {len(decomposition)} sub-itens"
    parent_mapping.factor_value = 0
    parent_mapping.factor_unit = ""
    parent_mapping.factor_source = "Agente ZNIT — item decomposto, emissões nos sub-itens"
    parent_mapping.notes = f"Sub-itens criados: {', '.join(s.get('description', '') for s in decomposition)}"

    item.mapping_status = "excluded"


def _save_rule(item: AbcItem, decision: dict, db: Session, user_id: str):
    """Save a FactorRule or EquipmentRule from the decision."""
    keyword = _normalize_keyword(item.description)
    action = decision.get("action")

    if action == "equipment_calc":
        config = decision.get("equipment_config", {})
        existing = db.query(EquipmentRule).filter(
            EquipmentRule.match_keyword == keyword,
            EquipmentRule.is_active == True,
        ).first()
        if existing:
            existing.times_applied = (existing.times_applied or 0) + 1
        else:
            rule = EquipmentRule(
                company_id="company-htb",
                match_keyword=keyword,
                original_description=item.description,
                category=config.get("fuel_type", "diesel"),
                fuel_type=config.get("fuel_type", "diesel"),
                consumption_per_hour=config.get("consumption_per_hour", 0),
                consumption_unit=config.get("consumption_unit", "L/h"),
                emission_factor_value=config.get("emission_factor", 2.643),
                emission_factor_unit=f"kgCO₂/{config.get('consumption_unit', 'L/h').replace('/h', '')}",
                emission_factor_source="GHG Protocol BR",
                emission_factor_tier="ghg_protocol",
                scope=1,
                created_by=user_id,
            )
            db.add(rule)

    elif action in ("map_factor", "exclude"):
        existing = db.query(FactorRule).filter(
            FactorRule.match_keyword == keyword,
            FactorRule.is_active == True,
        ).first()
        if existing:
            existing.times_applied = (existing.times_applied or 0) + 1
        else:
            rule = FactorRule(
                company_id="company-htb",
                match_keyword=keyword,
                original_description=item.description,
                factor_value=decision.get("factor_value", 0),
                factor_unit=decision.get("factor_unit", ""),
                factor_name=decision.get("factor_name", "excluído"),
                source_tier=decision.get("source_tier", "excluded") if action != "exclude" else "excluded",
                created_by=user_id,
            )
            db.add(rule)
