"""
Parser da Curva ABC exportada do iTwo (.xlsx / .xlsm)

Estrutura real do arquivo Raízen VRO R8:
  Row 0: título ("CurvaABC-Insumos")
  Row 1: cabeçalho (CostCode | Descrição | ADF | Custo Unitário | Quantidade | Unidade | Custo Total | % Custo Total | ...)
  Row 2+: dados
  Última linha: TOTAL (filtrar)
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass
from typing import Optional

import openpyxl
import pandas as pd


# ---------------------------------------------------------------------------
# Tipos de resultado
# ---------------------------------------------------------------------------

@dataclass
class ParsedItem:
    order: int
    cost_code: str
    description: str
    adf: Optional[float]
    quantity: float
    unit: str
    unit_cost: float
    total_cost: float
    supplier: Optional[str]
    cost_pct: float
    cumulative_pct: float
    abc_class: str          # P1 | P2 | P3
    item_type: str          # A | B | C | D | E | F
    mapping_status: str     # pending | blocked | excluded (default: pending)
    classification_note: Optional[str]


@dataclass
class ParseResult:
    items: list[ParsedItem]
    total_cost: float
    file_name: str
    warnings: list[str]


# ---------------------------------------------------------------------------
# Mapeamento de colunas
# ---------------------------------------------------------------------------

COLUMN_ALIASES: dict[str, list[str]] = {
    "cost_code":  ["costcode", "cost code", "código", "codigo", "cod", "cód"],
    "description": ["descrição", "descricao", "description", "item", "desc"],
    "adf":        ["adf"],
    "unit_cost":  ["custo unitário", "custo unitario", "custo unit", "custo unit.", "preço unit", "unit cost"],
    "quantity":   ["quantidade", "qtd", "qty", "quant"],
    "unit":       ["unidade", "unid"],
    "total_cost": ["custo total", "total", "total cost"],
    "cost_pct":   ["% custo total", "% custo", "% total", "percentual"],
    "supplier":   ["fornecedor", "supplier", "fonte"],
}


def _normalize_header(text: str) -> str:
    """Minúsculas, sem acento, sem espaço duplo."""
    text = str(text).lower().strip()
    replacements = {"ã": "a", "â": "a", "á": "a", "à": "a",
                    "ê": "e", "é": "e", "è": "e",
                    "î": "i", "í": "i",
                    "õ": "o", "ô": "o", "ó": "o",
                    "ú": "u", "ü": "u",
                    "ç": "c"}
    for orig, repl in replacements.items():
        text = text.replace(orig, repl)
    return re.sub(r"\s+", " ", text)


def _detect_columns(header_row: tuple) -> dict[str, int]:
    """Retorna {campo: índice_coluna}."""
    mapping: dict[str, int] = {}
    for col_idx, cell in enumerate(header_row):
        if cell is None:
            continue
        normalized = _normalize_header(str(cell))
        for field, aliases in COLUMN_ALIASES.items():
            if field in mapping:
                continue
            if any(alias in normalized for alias in aliases):
                mapping[field] = col_idx
    return mapping


# ---------------------------------------------------------------------------
# Classificação de tipo A–F
# ---------------------------------------------------------------------------

# Prefixos de CostCode mapeados por tipo
_TYPE_BY_PREFIX: list[tuple[str, str]] = [
    # Mão de obra — prefixo 400
    ("400", "B"),
    # Equipamentos — prefixo 440
    ("440", "E"),
    # Diesel e combustíveis — código exato
    ("460114", "F"),
    # Ensaios e controle de qualidade
    ("460701", "F"),
    # Administrativo/indireto — prefixo 46
    ("46", "F"),
]

# Keywords na descrição que indicam o tipo
_TYPE_BY_KEYWORD: list[tuple[str, str]] = [
    # Mão de obra
    ("oficial", "B"),
    ("servente", "B"),
    ("mestre", "B"),
    ("encarregado", "B"),
    ("pedreiro", "B"),
    ("armador", "B"),
    ("soldador", "B"),
    ("salario", "B"),
    ("sal med", "B"),
    # Equipamentos
    ("retroescavadeira", "E"),
    ("basculante", "E"),
    ("maquina de solda", "E"),
    ("maquina solda", "E"),
    ("andaime", "E"),
    ("guindaste", "E"),
    # Agrupados: "Sub" no início do CostCode após o prefixo
    # Serviços com material embutido
    ("corte e dobra", "D"),
    ("corte dobra", "D"),
    ("bombeamento", "D"),
    ("arrasamento", "D"),
    # Administrativo
    ("ensaio", "F"),
    ("controle de concreto", "F"),
    ("prova de carga", "F"),
    ("administracao", "F"),
]

# Unidades que indicam equipamento/hora de uso
_EQUIPMENT_UNITS = {"h", "hora", "horas", "hrs", "hr"}


def _classify_type(cost_code: str, description: str, unit: str) -> tuple[str, str]:
    """Retorna (item_type, note)."""
    cc = cost_code.lower()
    desc = _normalize_header(description)
    unit_norm = unit.lower().strip()

    # --- Tipo C: item agrupado ---
    # Identificado por "Sub" no CostCode após o número de prefixo
    cc_parts = cost_code.split("-", 1)
    has_sub = len(cc_parts) > 1 and cc_parts[1].lower().startswith("sub")

    if has_sub:
        # Exceção: serviço com material embutido (Tipo D)
        # keywords que indicam serviço aplicado sobre material já contado
        d_keywords = ["cortedob", "cortedobra", "corteedob", "modob",
                      "mocort", "moarr", "arrasam", "bombea"]
        # também verifica no cost_code diretamente
        cc_lower = cost_code.lower().replace("-", "")
        if any(k in desc.replace(" ", "") for k in d_keywords) or \
           any(k in cc_lower for k in ["cortedob", "modob", "moarras"]):
            return "D", "Serviço com material embutido — risco de dupla contagem"

        # Exceção: controle de qualidade/ensaios (Tipo F)
        f_keywords = ["controleconcreto", "controleconcret", "provacarga",
                      "ensaio", "controle"]
        if any(k in desc.replace(" ", "").lower() for k in f_keywords):
            return "F", "Controle/ensaio de qualidade → Tipo F"

        return "C", "CostCode contém 'Sub' — item agrupado/subcontratado"

    # --- Tipo F especial: Diesel tem fator direto → reclassificar para A ---
    if cost_code.startswith("460114") or "oleodisel" in desc or "oleo diesel" in desc or "diesel" in desc:
        return "A", "Diesel reclassificado para Tipo A — fator direto 2,68 kgCO₂e/L"

    # --- Tipo por prefixo de CostCode ---
    for prefix, item_type in _TYPE_BY_PREFIX:
        if cc.startswith(prefix.lower()):
            return item_type, f"Prefixo CostCode '{prefix}' → Tipo {item_type}"

    # --- Tipo E por unidade ---
    if unit_norm in _EQUIPMENT_UNITS:
        return "E", f"Unidade '{unit}' indica equipamento"

    # --- Tipo por keyword na descrição ---
    for keyword, item_type in _TYPE_BY_KEYWORD:
        if keyword in desc:
            return item_type, f"Keyword '{keyword}' na descrição → Tipo {item_type}"

    # --- Fallback: Tipo A — Material Direto ---
    return "A", "Material direto — mapeamento EPD automático"


# ---------------------------------------------------------------------------
# Classificação ABC
# ---------------------------------------------------------------------------

def _classify_abc(cumulative_pct: float) -> str:
    if cumulative_pct <= 80.0:
        return "P1"
    elif cumulative_pct <= 95.0:
        return "P2"
    return "P3"


# ---------------------------------------------------------------------------
# Normalização de unidade
# ---------------------------------------------------------------------------

UNIT_NORMALIZE: dict[str, str] = {
    "hrs": "h", "hora": "h", "horas": "h", "hr": "h",
    "m3": "m³", "m2": "m²",
    "unid": "un", "unidade": "un",
    "kg": "kg", "kgs": "kg",
    "m": "m",
    "l": "L", "litros": "L", "litro": "L",
    "t": "t",
    "vb": "vb",
}


def _normalize_unit(unit: str) -> str:
    u = unit.strip().lower()
    return UNIT_NORMALIZE.get(u, unit.strip())


# ---------------------------------------------------------------------------
# Parser principal
# ---------------------------------------------------------------------------

def parse_abc_file(file_content: bytes, file_name: str) -> ParseResult:
    """
    Lê um arquivo XLSX ou XLSM e retorna ParseResult com todos os itens.
    """
    warnings: list[str] = []

    # Carregar workbook
    try:
        wb = openpyxl.load_workbook(
            io.BytesIO(file_content),
            read_only=True,
            keep_vba=file_name.lower().endswith(".xlsm"),
            data_only=True,  # ignora fórmulas, retorna valores calculados
        )
    except Exception as e:
        raise ValueError(f"Não foi possível abrir o arquivo: {e}")

    # Selecionar aba
    sheet_name = None
    for candidate in ["ABC", "Curva ABC", "CurvaABC", "Sheet1"]:
        if candidate in wb.sheetnames:
            sheet_name = candidate
            break
    if sheet_name is None:
        sheet_name = wb.sheetnames[0]
        warnings.append(f"Aba 'ABC' não encontrada. Usando '{sheet_name}'.")

    ws = wb[sheet_name]
    all_rows = list(ws.iter_rows(values_only=True))

    if len(all_rows) < 3:
        raise ValueError("Arquivo não contém dados suficientes.")

    # Encontrar linha de cabeçalho (buscar nas primeiras 5 linhas)
    header_idx = None
    col_map: dict[str, int] = {}
    for i, row in enumerate(all_rows[:6]):
        candidate_map = _detect_columns(row)
        # Cabeçalho válido precisa ter ao menos cost_code, description e total_cost
        if {"cost_code", "description", "total_cost"}.issubset(candidate_map.keys()):
            header_idx = i
            col_map = candidate_map
            break

    if header_idx is None:
        raise ValueError(
            "Cabeçalho não detectado. Colunas esperadas: CostCode, Descrição, Custo Total."
        )

    data_rows = all_rows[header_idx + 1:]

    # Extrair itens válidos
    raw_items: list[dict] = []
    for row in data_rows:
        def get(field: str):
            idx = col_map.get(field)
            if idx is None or idx >= len(row):
                return None
            val = row[idx]
            # Ignorar fórmulas que ficaram como string
            if isinstance(val, str) and val.startswith("="):
                return None
            return val

        cost_code = get("cost_code")

        # Filtrar linha vazia ou TOTAL
        if cost_code is None:
            continue
        cost_code = str(cost_code).strip()
        if not cost_code or cost_code.upper() == "TOTAL":
            continue

        # Extrair campos numéricos com fallback
        def to_float(v, default=0.0) -> float:
            if v is None:
                return default
            try:
                return float(v)
            except (TypeError, ValueError):
                return default

        description = str(get("description") or "").strip()
        adf = to_float(get("adf"), None)
        quantity = to_float(get("quantity"), 0.0)
        unit = _normalize_unit(str(get("unit") or "un"))
        unit_cost = to_float(get("unit_cost"), 0.0)
        total_cost = to_float(get("total_cost"), 0.0)

        # unit_cost pode ser negativo em subcontratados (vb negativo = % aplicado)
        # usar abs para o custo total
        total_cost = abs(total_cost)

        supplier_idx = col_map.get("supplier")
        supplier = None
        if supplier_idx is not None and supplier_idx < len(row):
            supplier = str(row[supplier_idx]).strip() if row[supplier_idx] else None

        raw_items.append({
            "cost_code": cost_code,
            "description": description,
            "adf": adf,
            "quantity": quantity,
            "unit": unit,
            "unit_cost": unit_cost,
            "total_cost": total_cost,
            "supplier": supplier,
        })

    if not raw_items:
        raise ValueError("Nenhum item de dados encontrado após o cabeçalho.")

    # Calcular total geral
    total_cost_sum = sum(r["total_cost"] for r in raw_items)
    if total_cost_sum == 0:
        warnings.append("Custo total igual a zero. Verifique o arquivo.")
        total_cost_sum = 1.0

    # Ordenar por custo decrescente (Pareto)
    raw_items.sort(key=lambda x: x["total_cost"], reverse=True)

    # Calcular percentuais e classificar
    items: list[ParsedItem] = []
    cumulative = 0.0

    for order, r in enumerate(raw_items):
        cost_pct = (r["total_cost"] / total_cost_sum) * 100
        cumulative += cost_pct
        abc_class = _classify_abc(cumulative)
        item_type, note = _classify_type(r["cost_code"], r["description"], r["unit"])

        # Status inicial de mapeamento
        if item_type == "A":
            mapping_status = "pending"  # será atualizado pelo EPD mapper
        elif item_type == "C":
            mapping_status = "blocked"
        else:
            mapping_status = "pending"

        items.append(ParsedItem(
            order=order,
            cost_code=r["cost_code"],
            description=r["description"],
            adf=r["adf"],
            quantity=r["quantity"],
            unit=r["unit"],
            unit_cost=r["unit_cost"],
            total_cost=r["total_cost"],
            supplier=r["supplier"],
            cost_pct=round(cost_pct, 4),
            cumulative_pct=round(cumulative, 4),
            abc_class=abc_class,
            item_type=item_type,
            mapping_status=mapping_status,
            classification_note=note,
        ))

    return ParseResult(
        items=items,
        total_cost=total_cost_sum,
        file_name=file_name,
        warnings=warnings,
    )
