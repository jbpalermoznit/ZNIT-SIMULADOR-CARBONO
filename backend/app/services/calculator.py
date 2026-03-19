"""
Motor de cálculo de emissões.
Aplica fatores de emissão mapeados aos itens do cenário.
"""

from sqlalchemy.orm import Session
from app.models.abc_item import AbcItem, AbcCurve
from app.models.item_mapping import ItemMapping
from app.models.scenario import Scenario, ScenarioItem, ScenarioResult
from app.models.project import Project


# Fatores de transporte — kgCO₂e por tonelada·km (GHG Protocol BR)
TRANSPORT_FACTORS = {
    "truck": 0.062,
    "rail": 0.022,
    "ship": 0.008,
}


def normalize_unit(unit_str: str | None) -> str:
    """Normalize unit string to a canonical form."""
    if not unit_str:
        return ""
    u = unit_str.lower().strip()
    # Remove "kgco2/" or "kgco₂/" prefix to get the denominator unit
    for prefix in ["kgco₂/", "kgco₂e/", "kgco2/", "kgco2e/", "kg co2-eq/", "kg co2-eq"]:
        if u.startswith(prefix):
            u = u[len(prefix):].strip()
            break
    # Normalize common unit names
    UNIT_MAP = {
        "t": "t", "ton": "t", "tonelada": "t", "toneladas": "t",
        "kg": "kg", "quilograma": "kg",
        "m3": "m3", "m³": "m3",
        "m2": "m2", "m²": "m2",
        "m": "m", "ml": "m",
        "l": "L", "litro": "L", "litros": "L",
        "un": "un", "unit": "un", "unidade": "un", "pç": "un", "peça": "un",
    }
    return UNIT_MAP.get(u, u)


def get_conversion_factor(item_unit: str, factor_unit: str) -> float:
    """
    Calculate the conversion multiplier so that:
      emission = item_qty * factor_value * conversion_factor

    Example:
      item_unit = "kg", factor_unit = "t" → conversion = 0.001 (kg→t)
      item_unit = "m³", factor_unit = "m3" → conversion = 1.0
      item_unit = "un", factor_unit = "t" → conversion = 0.0 (incompatible)

    Returns 0.0 when units are from different dimensions (mass vs volume vs area vs length).
    """
    iu = normalize_unit(item_unit)
    fu = normalize_unit(factor_unit)

    if not iu or not fu:
        return 1.0
    if iu == fu:
        return 1.0

    # Define unit families
    MASS_TO_KG = {"kg": 1.0, "t": 1000.0, "g": 0.001}
    VOL_TO_M3 = {"m3": 1.0, "L": 0.001}
    AREA = {"m2"}
    LENGTH = {"m"}
    COUNT = {"un"}

    # Mass conversions
    if iu in MASS_TO_KG and fu in MASS_TO_KG:
        return MASS_TO_KG[iu] / MASS_TO_KG[fu]

    # Volume conversions
    if iu in VOL_TO_M3 and fu in VOL_TO_M3:
        return VOL_TO_M3[iu] / VOL_TO_M3[fu]

    # Same family — 1:1 (m→m, m²→m², un→un)
    for family in [AREA, LENGTH, COUNT]:
        if iu in family and fu in family:
            return 1.0

    # Different families → incompatible, cannot calculate
    # (e.g., kg vs m³, un vs t, m² vs t)
    return 0.0


def calc_item_emission(item: AbcItem, mapping: ItemMapping | None) -> float:
    """Calcula emissão de um item (Scope 3 — embodied carbon).

    Handles unit conversion between item quantity unit and factor unit.
    Example: item qty in kg, factor in kgCO₂/t → converts kg to tonnes.
    """
    if not mapping or mapping.source_tier == "excluded":
        return 0.0
    if mapping.factor_value is None or mapping.factor_value <= 0:
        return 0.0
    qty = item.quantity or 0
    conversion = get_conversion_factor(item.unit, mapping.factor_unit)
    return qty * mapping.factor_value * conversion


def calc_logistics_emission(mapping: ItemMapping | None) -> float:
    """Calcula emissão de logística (Scope 3 — transporte)."""
    if not mapping or not mapping.distance_km:
        return 0.0
    # Estimar tonelagem a partir da quantidade (simplificação para piloto)
    # TODO: melhorar com unidade real → conversão de massa
    factor = TRANSPORT_FACTORS.get(mapping.transport_modal or "truck", 0.062)
    tonnage = 1.0  # placeholder — será configurável por item
    return mapping.distance_km * tonnage * factor


def create_base_scenario(project_id: str, user_id: str, db: Session) -> Scenario:
    """
    Cria o Cenário Base para um projeto a partir dos itens mapeados.
    - Pega a curva ABC mais recente
    - Para cada item, copia o mapping atual como fator do cenário
    - Calcula emissões de todos os itens
    - Salva ScenarioResult
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise ValueError("Projeto não encontrado")

    # Buscar curva mais recente
    curve = (
        db.query(AbcCurve)
        .filter(AbcCurve.project_id == project_id)
        .order_by(AbcCurve.imported_at.desc())
        .first()
    )
    if not curve:
        raise ValueError("Nenhuma curva ABC importada")

    # Remover cenário base anterior se existir
    old_base = (
        db.query(Scenario)
        .filter(Scenario.project_id == project_id, Scenario.is_base == True)
        .first()
    )
    if old_base:
        db.delete(old_base)
        db.flush()

    # Criar cenário
    scenario = Scenario(
        project_id=project_id,
        name="Cenário Base",
        description="Cenário base gerado automaticamente a partir dos mapeamentos atuais.",
        is_base=True,
        status="draft",
        created_by=user_id,
    )
    db.add(scenario)
    db.flush()

    # Buscar todos os itens da curva
    items = (
        db.query(AbcItem)
        .filter(AbcItem.abc_curve_id == curve.id)
        .order_by(AbcItem.item_order)
        .all()
    )

    # Pré-carregar mappings
    item_ids = [item.id for item in items]
    mappings = (
        db.query(ItemMapping)
        .filter(ItemMapping.abc_item_id.in_(item_ids))
        .all()
    )
    mapping_by_item = {m.abc_item_id: m for m in mappings}

    # Criar ScenarioItems e calcular emissões
    scenario_items = []
    for item in items:
        mapping = mapping_by_item.get(item.id)
        is_excluded = (
            item.mapping_status == "excluded"
            or (mapping and mapping.source_tier == "excluded")
        )

        emission = calc_item_emission(item, mapping)
        logistics = calc_logistics_emission(mapping)

        si = ScenarioItem(
            scenario_id=scenario.id,
            abc_item_id=item.id,
            factor_value=mapping.factor_value if mapping else None,
            factor_unit=mapping.factor_unit if mapping else None,
            factor_name=mapping.factor_name if mapping else None,
            source_tier=mapping.source_tier if mapping else None,
            emission_kgco2e=emission,
            emission_scope3_logistics_kgco2e=logistics,
            is_excluded=is_excluded,
            exclusion_reason=mapping.exclusion_justification if mapping and is_excluded else None,
        )
        scenario_items.append(si)

    db.bulk_save_objects(scenario_items)
    db.flush()

    # Calcular resultado
    result = calculate_scenario_result(scenario.id, project, db)
    db.add(result)
    db.commit()

    return scenario


def calculate_scenario_result(scenario_id: str, project: Project, db: Session) -> ScenarioResult:
    """Calcula os totais de emissões de um cenário."""
    items = (
        db.query(ScenarioItem)
        .filter(ScenarioItem.scenario_id == scenario_id)
        .all()
    )

    total_materials = 0.0
    total_logistics = 0.0
    items_mapped = 0
    items_excluded = 0

    for si in items:
        if si.is_excluded:
            items_excluded += 1
            continue
        if si.emission_kgco2e and si.emission_kgco2e > 0:
            total_materials += si.emission_kgco2e
            items_mapped += 1
        if si.emission_scope3_logistics_kgco2e:
            total_logistics += si.emission_scope3_logistics_kgco2e

    total_kgco2e = total_materials + total_logistics
    total_tco2e = total_kgco2e / 1000

    # Intensidade por m²
    intensity = None
    if project.total_area_m2 and project.total_area_m2 > 0:
        intensity = total_tco2e / project.total_area_m2

    # Cobertura: % de itens não-excluídos que têm emissão calculada
    eligible = len(items) - items_excluded
    coverage = (items_mapped / eligible * 100) if eligible > 0 else 0.0

    # Remover resultado anterior
    db.query(ScenarioResult).filter(ScenarioResult.scenario_id == scenario_id).delete()

    return ScenarioResult(
        scenario_id=scenario_id,
        total_kgco2e=round(total_kgco2e, 2),
        total_tco2e=round(total_tco2e, 4),
        intensity_per_m2=round(intensity, 6) if intensity else None,
        scope1_kgco2e=0.0,  # TODO: equipamentos
        scope2_kgco2e=0.0,  # TODO: eletricidade
        scope3_materials_kgco2e=round(total_materials, 2),
        scope3_logistics_kgco2e=round(total_logistics, 2),
        items_total=len(items),
        items_mapped=items_mapped,
        items_excluded=items_excluded,
        coverage_pct=round(coverage, 1),
    )


def recalculate_scenario(scenario_id: str, db: Session) -> ScenarioResult:
    """Recalcula emissões de um cenário existente."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise ValueError("Cenário não encontrado")

    project = db.query(Project).filter(Project.id == scenario.project_id).first()

    # Recalcular emissões de cada item
    scenario_items = (
        db.query(ScenarioItem)
        .filter(ScenarioItem.scenario_id == scenario_id)
        .all()
    )

    for si in scenario_items:
        if si.is_excluded:
            si.emission_kgco2e = 0.0
            continue
        abc_item = db.query(AbcItem).filter(AbcItem.id == si.abc_item_id).first()
        if abc_item and si.factor_value:
            qty = si.quantity_override or abc_item.quantity or 0
            conversion = get_conversion_factor(abc_item.unit, si.factor_unit)
            si.emission_kgco2e = qty * si.factor_value * conversion

    db.flush()

    result = calculate_scenario_result(scenario_id, project, db)
    db.add(result)
    db.commit()
    return result
