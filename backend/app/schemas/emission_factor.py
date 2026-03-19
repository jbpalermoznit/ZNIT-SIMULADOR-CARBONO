from pydantic import BaseModel
from typing import Optional


# ---------------------------------------------------------------------------
# Respostas de busca — formatadas para o frontend
# ---------------------------------------------------------------------------

class EcoinventResult(BaseModel):
    product_id: str
    activity_id: str
    product_name: str
    product_name_pt: Optional[str] = None
    activity_name: str
    activity_name_pt: Optional[str] = None
    product_unit: str
    geography: Optional[str] = None
    impact_score: float
    impact_unit: str
    year_start: Optional[int] = None
    year_end: Optional[int] = None
    source_tier: str = "ecoinvent"

    @classmethod
    def from_supabase(cls, row: dict) -> "EcoinventResult":
        score = row.get("impact_score", "0")
        return cls(
            product_id=row["product_id"],
            activity_id=row["activity_id"],
            product_name=row.get("product_name", ""),
            product_name_pt=row.get("product_name_pt"),
            activity_name=row.get("activity_name", ""),
            activity_name_pt=row.get("activity_name_pt"),
            product_unit=row.get("product_unit", ""),
            geography=row.get("geography"),
            impact_score=float(score) if score else 0.0,
            impact_unit=row.get("impact_unit", "kg CO2-Eq"),
            year_start=row.get("year_start"),
            year_end=row.get("year_end"),
        )


class GhgResult(BaseModel):
    id: int
    produto: str
    categoria: Optional[str] = None
    pais: Optional[str] = None
    ano: Optional[int] = None
    co2: float
    ch4: float = 0.0
    n2o: float = 0.0
    co2_bio: float = 0.0
    co2e_total: float  # calculado: co2 + ch4*28 + n2o*265
    versao_ghg: Optional[str] = None
    source_tier: str = "ghg_protocol"

    @classmethod
    def from_supabase(cls, row: dict) -> "GhgResult":
        co2 = float(row.get("co2") or 0)
        ch4 = float(row.get("ch4") or 0)
        n2o = float(row.get("n2o") or 0)
        co2_bio = float(row.get("co2_bio") or 0)
        # GWP AR5: CH4=28, N2O=265
        co2e = co2 + (ch4 * 28) + (n2o * 265)
        ano_raw = row.get("ano")
        ano = int(ano_raw) if ano_raw and ano_raw != 9999 else None
        return cls(
            id=row["id"],
            produto=row.get("produto", ""),
            categoria=row.get("categoria"),
            pais=row.get("pais"),
            ano=ano,
            co2=co2,
            ch4=ch4,
            n2o=n2o,
            co2_bio=co2_bio,
            co2e_total=round(co2e, 6),
            versao_ghg=row.get("versao_ghg"),
        )


class EpdCatalogResult(BaseModel):
    id: int
    epd_id: Optional[str] = None
    titulo: str
    informacao_produto: Optional[str] = None
    registration_number: Optional[str] = None
    status: Optional[str] = None
    company_name: Optional[str] = None
    country: Optional[str] = None
    geographical_scopes: Optional[str] = None
    registration_date: Optional[str] = None
    valid_until: Optional[str] = None
    pdf_url: Optional[str] = None
    source_url: Optional[str] = None
    en15804_compliant: Optional[str] = None
    source_tier: str = "epd_catalog"

    @classmethod
    def from_supabase(cls, row: dict) -> "EpdCatalogResult":
        return cls(
            id=row["id"],
            epd_id=row.get("epd_id"),
            titulo=row.get("titulo", ""),
            informacao_produto=row.get("informacao_produto"),
            registration_number=row.get("registration_number"),
            status=row.get("status"),
            company_name=row.get("company_name"),
            country=row.get("country"),
            geographical_scopes=row.get("geographical_scopes"),
            registration_date=str(row["registration_date"]) if row.get("registration_date") else None,
            valid_until=str(row["valid_until"]) if row.get("valid_until") else None,
            pdf_url=row.get("pdf_url"),
            source_url=row.get("source_url"),
            en15804_compliant=row.get("en15804_compliant"),
        )


class CecarbonResult(BaseModel):
    id: int
    description: str
    unit: str
    factor_value: float
    factor_unit: str
    reference: str
    density: float = 1.0
    source_tier: str = "cecarbon"

    @classmethod
    def from_supabase(cls, row: dict) -> "CecarbonResult":
        desc = row.get("Descrição fator de emissao", "") or ""
        unit = (row.get("Unidade") or "").strip()
        factor = float(row.get("fator de emissão (kgCO2)") or 0)
        ref = row.get("Referencia", "CECARBON 2024") or "CECARBON 2024"
        density = float(row.get("densidade") or 1)
        return cls(
            id=row["id"],
            description=desc,
            unit=unit,
            factor_value=factor,
            factor_unit=f"kgCO₂/{unit}" if unit else "kgCO₂",
            reference=ref,
            density=density,
        )


class EmissionSearchResponse(BaseModel):
    ecoinvent: list[EcoinventResult] = []
    ghg_protocol: list[GhgResult] = []
    cecarbon: list[CecarbonResult] = []
    epd_catalog: list[EpdCatalogResult] = []


# ---------------------------------------------------------------------------
# Request — confirmar mapeamento
# ---------------------------------------------------------------------------

class MappingConfirmRequest(BaseModel):
    """Confirmar mapeamento de um item a um fator de emissão."""
    source_tier: str  # 'ecoinvent' | 'ghg_protocol' | 'epd' | 'user_custom' | 'excluded'

    # Para ecoinvent
    ecoinvent_product_id: Optional[str] = None
    ecoinvent_activity_id: Optional[str] = None

    # Para GHG Protocol
    ghg_factor_id: Optional[int] = None

    # Para EPD (manual com referência ao catálogo)
    epd_id: Optional[int] = None

    # Fator efetivo (obrigatório exceto para 'excluded')
    factor_value: Optional[float] = None
    factor_unit: str = "kg CO2-Eq"
    factor_name: Optional[str] = None

    # Para user_custom
    custom_factor_source: Optional[str] = None

    # Para excluded
    exclusion_justification: Optional[str] = None

    # Logística
    distance_km: Optional[float] = None
    transport_modal: Optional[str] = None

    notes: Optional[str] = None


class MappingResponse(BaseModel):
    id: str
    abc_item_id: str
    source_tier: str
    factor_value: float
    factor_unit: str
    factor_name: str
    factor_source: Optional[str] = None
    confidence: Optional[str] = None
    similarity_score: Optional[float] = None
    mapped_by: str
    notes: Optional[str] = None

    class Config:
        from_attributes = True
