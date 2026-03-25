"""
Serviço de mapeamento automático de itens ABC → fatores de emissão.
Hierarquia: GHG Protocol → CECarbon → Ecoinvent.
Busca via Supabase externo. Usa thefuzz para ranking de similaridade.
"""

import re
from thefuzz import fuzz
from app.core.supabase_client import search_ecoinvent, search_ghg, search_cecarbon, search_epd_with_gwp
from app.services.calculator import get_conversion_factor


# ---------------------------------------------------------------------------
# Tradução PT→EN e queries compostas para Ecoinvent
# ---------------------------------------------------------------------------

# Cada entrada pode gerar múltiplas queries de busca
SEARCH_QUERIES: dict[str, list[str]] = {
    # Concreto
    "concreto": ["concrete"],
    "fck=25": ["concrete 25MPa", "25MPa"],
    "fck=30": ["concrete 30MPa", "30MPa"],
    "fck=35": ["concrete 35MPa", "35MPa"],
    "fck=40": ["concrete 40MPa", "40MPa"],
    "fck=45": ["concrete 45MPa", "45MPa"],
    "fck25": ["concrete 25MPa"],
    "fck30": ["concrete 30MPa"],
    "fck35": ["concrete 35MPa"],
    "fck40": ["concrete 40MPa"],
    "bombeado": ["concrete"],
    "usinado": ["concrete"],
    "mrtf": ["concrete"],
    # Aço e metais ferrosos
    "aço": ["reinforcing steel", "steel"],
    "vergalhão": ["reinforcing steel"],
    "armadura": ["reinforcing steel"],
    "ca50": ["reinforcing steel"],
    "ca60": ["reinforcing steel"],
    "ca25": ["reinforcing steel"],
    "tela soldada": ["welded mesh"],
    "treliça": ["steel", "reinforcing steel"],
    "barra": ["steel bar", "reinforcing steel"],
    "chapa metálica": ["steel sheet", "steel plate"],
    "xadrez": ["steel plate"],
    "arame": ["steel wire", "wire"],
    "prego": ["steel nail", "nail"],
    "eletrodo": ["welding electrode", "electrode"],
    "chumbador": ["steel anchor", "anchor bolt"],
    "ancoragem": ["anchor", "chemical anchor"],
    "parafuso": ["bolt", "screw"],
    "porca": ["steel nut"],
    "luva": ["steel coupling"],
    "tampão": ["cast iron", "manhole cover"],
    "fofo": ["cast iron"],
    "distanciador": ["spacer", "reinforcing steel"],
    # Aço protendido / Dywidag
    "dw": ["prestressing steel"],
    "dywidag": ["prestressing steel"],
    "protensão": ["prestressing steel"],
    "estaca": ["concrete pile", "steel pile"],
    # Cimento e argamassa
    "cimento": ["cement", "portland cement"],
    "cimentcola": ["tile adhesive", "cement"],
    "argamassa": ["morite", "cement morite"],
    "chapisco": ["mortar", "rendering mortar"],
    "rejunte": ["grout", "tile grout"],
    "sikagrout": ["grout"],
    "grout": ["grout"],
    # Madeira
    "madeira": ["sawn wood", "wood"],
    "compensado": ["plywood"],
    "chapa compensada": ["plywood"],
    "tábua": ["sawn timber", "sawn wood"],
    "sarrafo": ["sawn timber", "sawn wood"],
    "batente": ["wood door frame", "sawn wood"],
    "batentaço": ["wood door frame", "sawn wood"],
    # Alvenaria e cerâmica
    "bloco": ["concrete block"],
    "tijolo": ["brick"],
    "telha": ["roof tile"],
    "porcelanato": ["ceramic tile", "porcelain tile"],
    "cerâmica": ["ceramic tile"],
    "rodapé": ["ceramic tile"],
    "chapim": ["precast concrete"],
    # Agregados
    "areia": ["sand"],
    "brita": ["gravel"],
    "pedra": ["gravel", "crusite stone"],
    # Metais não ferrosos
    "alumínio": ["aluminium"],
    "cobre": ["copper"],
    "zinco": ["zinc"],
    # Plásticos e isolantes
    "pvc": ["pvc pipe", "polyvinyl chloride"],
    "polietileno": ["polyethylene"],
    "tubo": ["pipe"],
    "lona": ["polyethylene film", "plastic film"],
    "bidim": ["geotextile", "polypropylene"],
    "geotêxtil": ["geotextile"],
    "isopor": ["polystyrene", "expanded polystyrene"],
    "eps": ["expanded polystyrene"],
    # Selantes, adesivos e químicos
    "selante": ["sealant", "silicone"],
    "sikaflex": ["sealant", "polyurethane sealant"],
    "silicone": ["silicone sealant"],
    "aditivo": ["concrete admixture"],
    "sika1": ["concrete admixture", "waterproofing admixture"],
    "impermeabilizante": ["bitumen", "waterproofing"],
    "fugenband": ["waterstop", "pvc waterstop"],
    "hidro expansivo": ["waterstop", "hydrophilic waterstop"],
    # Outros materiais
    "tinta": ["paint", "alkyd paint"],
    "neutrol": ["bitumen paint", "waterproofing paint"],
    "desmol": ["release agent"],
    "vidro": ["flat glass"],
    "asfalto": ["asphalt"],
    "isolamento": ["insulation"],
    "gesso": ["gypsum", "plasterboard"],
    "manta": ["bitumen sheet"],
    "colante": ["tile adhesive"],
    # Solo / Movimentação
    "escavação": ["excavation"],
    "terraplenagem": ["excavation"],
    # Combustíveis (busca no GHG preferencialmente)
    "diesel": ["diesel"],
    "óleodiesel": ["diesel"],
    "gasolina": ["gasoline"],
}

# Normalização de nomes compostos escritos junto
COMPOUND_FIXES = {
    "óleodiesel": "óleo diesel",
    "cimentcola": "cimento cola",
    "chapiscofix": "chapisco fix",
}

# Categorias GHG — se a descrição contém essas palavras, buscar no GHG
GHG_TRIGGER_WORDS = {
    "diesel", "gasolina", "combustível", "glp", "gás", "etanol",
    "biodiesel", "gnv", "carvão", "lenha", "biomassa",
    "óleodiesel", "óleo",
}

# Palavras ignoradas
STOPWORDS = {
    "de", "do", "da", "dos", "das", "em", "e", "para", "por", "com", "sem",
    "ou", "um", "uma", "no", "na", "ao", "à", "o", "a", "os", "as",
    "ser", "estar", "ter", "haver", "ir", "vir",
    "inclusive", "conforme", "segundo", "tipo", "ref", "und",
}


def _stem_pt(word: str) -> str:
    """Simple Portuguese stemming — strip common suffixes for matching."""
    # Plural → singular
    if word.endswith("ões"):
        return word[:-3] + "ão"
    if word.endswith("ães"):
        return word[:-3] + "ão"
    if word.endswith("ais"):
        return word[:-2] + "al"
    if word.endswith("éis"):
        return word[:-3] + "el"
    if word.endswith("ores"):
        return word[:-2]   # chumbadores → chumbador
    if word.endswith("es") and len(word) > 4:
        return word[:-2] if word[-3] in "rszl" else word[:-1]
    if word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def extract_keywords(description: str) -> list[str]:
    """Extract meaningful keywords from a Portuguese item description."""
    text = description.lower().strip()
    # Normalizar fck
    text = re.sub(r"fck\s*=?\s*(\d+)", r"fck=\1", text)
    text = re.sub(r"mrtf\s*=?\s*[\d,]+", "mrtf", text)
    # Normalizar palavras escritas junto (case já é lower)
    text = re.sub(r"[oó]l[eé]o\s*diesel", "óleo diesel", text)
    for wrong, fixed in COMPOUND_FIXES.items():
        text = text.replace(wrong, fixed)
    words = re.split(r"[\s/\-,;:()+]+", text)
    keywords = []
    for w in words:
        w = w.strip(".,;:()")
        if len(w) < 2 or w in STOPWORDS:
            continue
        stemmed = _stem_pt(w)
        keywords.append(stemmed)
        # Also keep original if different (for exact match)
        if stemmed != w and w not in keywords:
            keywords.append(w)
    return keywords


def _build_search_queries(keywords: list[str]) -> tuple[list[str], bool]:
    """
    Build Ecoinvent search queries from keywords.
    Returns (queries, should_search_ghg).
    """
    queries: list[str] = []
    should_ghg = False

    for kw in keywords:
        if kw in GHG_TRIGGER_WORDS:
            should_ghg = True
        if kw in SEARCH_QUERIES:
            queries.extend(SEARCH_QUERIES[kw])
        # Also check multi-word matches
        for trigger, q_list in SEARCH_QUERIES.items():
            if " " in trigger and trigger in " ".join(keywords):
                queries.extend(q_list)

    # Deduplicate preserving order
    seen = set()
    unique = []
    for q in queries:
        if q not in seen:
            seen.add(q)
            unique.append(q)

    # If no specific queries matched, try raw keywords as fallback
    if not unique:
        unique = [kw for kw in keywords if len(kw) > 3][:3]
        should_ghg = True  # also try GHG as fallback

    return unique, should_ghg


def _score_ecoinvent(item_desc: str, row: dict, search_queries: list[str] | None = None) -> int:
    """Score an ecoinvent row against the item description (0-100).

    Applies a boost when the search query that found this row
    appears directly in the product_name (semantic match).
    """
    desc_lower = item_desc.lower()
    product_name = (row.get("product_name", "") or "").lower()
    product_name_pt = (row.get("product_name_pt", "") or "").lower()
    candidates = [
        product_name,
        product_name_pt,
        (row.get("activity_name", "") or "").lower(),
        (row.get("activity_name_pt", "") or "").lower(),
    ]
    best = 0
    for c in candidates:
        if not c:
            continue
        s1 = fuzz.token_set_ratio(desc_lower, c)
        s2 = fuzz.partial_ratio(desc_lower, c)
        s = max(s1, s2)
        if s > best:
            best = s

    # Boost: if any search query is a direct substring of product_name
    if search_queries:
        for q in search_queries:
            q_lower = q.lower()
            if q_lower in product_name or q_lower in product_name_pt:
                best = max(best, 82)  # strong signal → high confidence
                break

    return min(best, 100)


def _score_ghg(item_desc: str, row: dict, search_queries: list[str] | None = None) -> int:
    """Score a GHG factor row against the item description (0-100).

    GHG Protocol BR gets a boost for fuel/transport items since it's
    the authoritative source for Brazilian emission factors.
    """
    produto = (row.get("produto", "") or "").lower()
    desc_lower = item_desc.lower()
    s1 = fuzz.token_set_ratio(desc_lower, produto)
    s2 = fuzz.partial_ratio(desc_lower, produto)
    best = max(s1, s2)

    # Boost: if search query matches the GHG product name
    if search_queries:
        for q in search_queries:
            if q.lower() in produto:
                best = max(best, 85)  # GHG preferred for fuels
                break

    return min(best, 100)


# ---------------------------------------------------------------------------
# CECarbon keywords — termos PT-BR para busca na tabela produtos_cecarbon_dev
# ---------------------------------------------------------------------------

CECARBON_QUERIES: dict[str, list[str]] = {
    # Concreto
    "concreto": ["concreto"],
    "fck=25": ["concreto 25"],
    "fck=30": ["concreto 30"],
    "fck=35": ["concreto 35"],
    "fck=40": ["concreto 40"],
    "fck25": ["concreto 25"],
    "fck30": ["concreto 30"],
    "fck35": ["concreto 35"],
    "fck40": ["concreto 40"],
    "bombeado": ["concreto"],
    "usinado": ["concreto"],
    "graute": ["graute"],
    # Aço e metais
    "aço": ["aço"],
    "vergalhão": ["aço"],
    "armadura": ["aço"],
    "ca50": ["aço"],
    "ca60": ["aço"],
    "treliça": ["estrutura metálica", "aço"],
    "chapa metálica": ["estrutura metálica"],
    "xadrez": ["estrutura metálica"],
    "arame": ["arame de aço"],
    "prego": ["prego de aço"],
    "eletrodo": ["aço"],
    "chumbador": ["aço", "prego de aço"],
    "ancoragem": ["aço"],
    "parafuso": ["aço"],
    "porca": ["aço"],
    "distanciador": ["aço"],
    "tampão": ["aço"],
    "luva": ["aço"],
    "placa": ["aço"],
    "barra": ["aço"],
    "alumínio": ["alumínio", "esquadrias de alumínio"],
    # Cimento e argamassa
    "cimento": ["cimento"],
    "cimentcola": ["argamassa colante"],
    "argamassa": ["argamassa"],
    "chapisco": ["argamassa"],
    "rejunte": ["argamassa"],
    "colante": ["argamassa colante"],
    "grout": ["graute"],
    "sikagrout": ["graute"],
    # Madeira
    "madeira": ["madeira"],
    "compensado": ["compensado de madeira"],
    "chapa compensada": ["compensado de madeira"],
    "tábua": ["madeira bruta serrada"],
    "sarrafo": ["madeira bruta serrada"],
    "batente": ["esquadrias de madeira"],
    "batentaço": ["esquadrias de madeira"],
    "mdf": ["mdf"],
    # Alvenaria e cerâmica
    "bloco": ["bloco de concreto", "bloco cerâmico"],
    "tijolo": ["tijolo", "bloco cerâmico"],
    "telha": ["telha"],
    "porcelanato": ["revestimentos cerâmicos"],
    "cerâmica": ["revestimentos cerâmicos", "cerâmica"],
    "chapim": ["concreto"],
    # Agregados
    "areia": ["areia"],
    "brita": ["brita"],
    "pedra": ["brita", "rocha natural"],
    # Isolantes e impermeabilizantes
    "isopor": ["placa de espuma de poliestireno"],
    "eps": ["placa de espuma de poliestireno"],
    "manta": ["manta asfáltica"],
    "lã": ["lã de rocha", "lã de vidro"],
    "impermeabilizante": ["manta asfáltica"],
    # Vidro, tinta, gesso
    "vidro": ["vidro"],
    "tinta": ["tinta"],
    "gesso": ["gesso"],
    "dry wall": ["dry wall"],
    "drywall": ["dry wall"],
    # PVC e tubos
    "pvc": ["pvc", "esquadrias de pvc"],
    "tubo": ["tubo"],
    "eletroduto": ["eletroduto de pvc"],
    # Outros
    "cal": ["cal"],
    "asfalto": ["asfalto"],
    "granito": ["granito"],
    "mármore": ["mármore"],
    "selante": [],  # no direct CECarbon match → fallback Ecoinvent
    "sikaflex": [],  # sealant → fallback Ecoinvent
    "bidim": [],  # geotextile — no direct CECarbon match, will fallback to Ecoinvent
    "lona": [],  # plastic film — no direct CECarbon match
    # Combustíveis
    "diesel": ["óleo diesel"],
    "gasolina": ["gasolina"],
    "óleo": ["óleos lubrificantes"],
}


def _build_cecarbon_queries(keywords: list[str]) -> list[str]:
    """Build CECarbon search queries from keywords (PT-BR)."""
    queries: list[str] = []
    for kw in keywords:
        if kw in CECARBON_QUERIES:
            queries.extend(CECARBON_QUERIES[kw])
    # Deduplicate
    seen = set()
    unique = []
    for q in queries:
        if q not in seen:
            seen.add(q)
            unique.append(q)
    # Fallback: use raw keywords for fuzzy search
    if not unique:
        unique = [kw for kw in keywords if len(kw) > 3][:3]
    return unique


def _score_cecarbon(item_desc: str, row: dict, search_queries: list[str] | None = None) -> int:
    """Score a CECarbon row against the item description (0-100).

    CECarbon descriptions are in PT-BR, so direct fuzzy match works well.
    """
    desc_cecarbon = (row.get("Descrição fator de emissao", "") or "").lower()
    desc_lower = item_desc.lower()

    s1 = fuzz.token_set_ratio(desc_lower, desc_cecarbon)
    s2 = fuzz.partial_ratio(desc_lower, desc_cecarbon)
    best = max(s1, s2)

    # Boost: if search query is a substring of the CECarbon description
    if search_queries:
        for q in search_queries:
            q_lower = q.lower()
            if q_lower in desc_cecarbon:
                best = max(best, 82)
                break

    # Extra boost for exact category matches (e.g. "aço" → "aço")
    # CECarbon has short, clean names — substring match is strong signal
    desc_words = set(re.split(r"[\s/\-,;:()+]+", desc_lower))
    cecarbon_words = set(re.split(r"[\s/\-,;:()+]+", desc_cecarbon))
    overlap = desc_words & cecarbon_words - STOPWORDS
    if overlap and len(overlap) >= 1:
        best = max(best, 78)
    if len(overlap) >= 2:
        best = max(best, 85)

    return min(best, 100)


# ---------------------------------------------------------------------------
# EPD keywords — termos para busca na tabela epd_dev (com gwp_a1a3)
# ---------------------------------------------------------------------------

EPD_QUERIES: dict[str, list[str]] = {
    # Concreto
    "concreto": ["concreto", "concrete", "hormigón"],
    "fck=25": ["concrete 25", "concreto 25"],
    "fck=30": ["concrete 30", "concreto 30"],
    "fck=35": ["concrete 35", "concreto 35"],
    "fck=40": ["concrete 40", "concreto 40"],
    # Aço
    "aço": ["steel", "aço", "acero"],
    "vergalhão": ["rebar", "reinforcing steel"],
    "ca50": ["reinforcing steel", "rebar"],
    "tela soldada": ["welded mesh", "steel mesh"],
    # Cimento
    "cimento": ["cement", "cimento", "cemento"],
    # Alumínio
    "alumínio": ["aluminium", "aluminum"],
    # Vidro
    "vidro": ["glass", "vidro"],
    # Madeira
    "madeira": ["wood", "timber", "madeira"],
    "compensado": ["plywood"],
    # Cerâmica
    "porcelanato": ["ceramic tile", "porcelain"],
    "cerâmica": ["ceramic", "cerâmica"],
    "tijolo": ["brick"],
    "bloco": ["block", "bloco"],
    "telha": ["roof tile"],
    # Isolantes
    "eps": ["expanded polystyrene", "EPS"],
    "isopor": ["expanded polystyrene", "EPS"],
    "lã": ["mineral wool", "rock wool", "glass wool"],
    # Impermeabilizantes
    "manta": ["bitumen", "waterproofing"],
    # PVC
    "pvc": ["PVC", "polyvinyl"],
    # Tinta
    "tinta": ["paint", "coating"],
    # Gesso
    "gesso": ["gypsum", "plasterboard"],
    # Agregados
    "areia": ["sand"],
    "brita": ["gravel", "aggregate"],
}


def _build_epd_queries(keywords: list[str]) -> list[str]:
    """Build EPD search queries from keywords."""
    queries: list[str] = []
    for kw in keywords:
        if kw in EPD_QUERIES:
            queries.extend(EPD_QUERIES[kw])
    seen = set()
    unique = []
    for q in queries:
        if q not in seen:
            seen.add(q)
            unique.append(q)
    if not unique:
        unique = [kw for kw in keywords if len(kw) > 3][:3]
    return unique


def _score_epd(item_desc: str, row: dict, search_queries: list[str] | None = None) -> int:
    """Score an EPD row against the item description (0-100).

    EPDs are supplier-specific so they get a bonus for being the most
    accurate source (real product data vs. generic averages).
    """
    titulo = (row.get("titulo", "") or "").lower()
    info_produto = (row.get("informacao_produto", "") or "").lower()
    company = (row.get("company_name", "") or "").lower()
    desc_lower = item_desc.lower()

    candidates = [titulo, info_produto, f"{titulo} {company}"]
    best = 0
    for c in candidates:
        if not c:
            continue
        s1 = fuzz.token_set_ratio(desc_lower, c)
        s2 = fuzz.partial_ratio(desc_lower, c)
        s = max(s1, s2)
        if s > best:
            best = s

    # Boost: if search query appears in titulo or info_produto
    if search_queries:
        for q in search_queries:
            q_lower = q.lower()
            if q_lower in titulo or q_lower in info_produto:
                best = max(best, 80)
                break

    return min(best, 100)


def check_factor_rules(description: str, company_id: str | None = None) -> dict | None:
    """Check if any saved factor rule matches this item description.

    Returns the matching rule as a candidate dict, or None.
    Uses normalized keyword matching with fuzzy fallback.
    """
    if not company_id:
        return None

    from app.api.factor_rules import normalize_keyword
    from app.core.database import SessionLocal
    from app.models.factor_rule import FactorRule

    normalized = normalize_keyword(description)
    if not normalized:
        return None

    db = SessionLocal()
    try:
        rules = (
            db.query(FactorRule)
            .filter(
                FactorRule.company_id == company_id,
                FactorRule.is_active == True,
            )
            .all()
        )
        if not rules:
            return None

        best_rule = None
        best_score = 0

        for rule in rules:
            # Exact keyword match
            if rule.match_keyword == normalized:
                best_rule = rule
                best_score = 100
                break

            # Fuzzy match on keyword
            score = fuzz.token_set_ratio(normalized, rule.match_keyword)
            if score > best_score and score >= 80:
                best_rule = rule
                best_score = score

        if best_rule:
            # Increment times_applied
            best_rule.times_applied = (best_rule.times_applied or 0) + 1
            db.commit()

            return {
                "source_tier": "rule",
                "score": best_score,
                "factor_value": best_rule.factor_value,
                "factor_unit": best_rule.factor_unit,
                "product_unit": "",
                "factor_name": best_rule.factor_name,
                "factor_source": f"Regra salva: {best_rule.original_description}",
                "geography": "Brasil",
                "rule_id": best_rule.id,
                "confidence": "high",
            }
        return None
    finally:
        db.close()


def auto_match_item(description: str, unit: str | None = None, company_id: str | None = None) -> dict:
    """
    Attempt to auto-match an ABC item to an emission factor.
    Hierarchy: Factor Rules → GHG Protocol → CECarbon → EPD (com GWP) → Ecoinvent.

    Returns dict with:
      - results: list of scored candidates (top 10)
      - best: the top candidate (or None)
      - confidence: 'high' | 'medium' | 'low' | None
    """
    # ---------------------------------------------------------------
    # Priority 0: Check saved factor rules (Premissa Library)
    # ---------------------------------------------------------------
    rule_match = check_factor_rules(description, company_id)
    if rule_match and rule_match["score"] >= 80:
        return {
            "results": [rule_match],
            "best": rule_match,
            "confidence": "high",
        }

    keywords = extract_keywords(description)
    ecoinvent_queries, should_search_ghg = _build_search_queries(keywords)
    cecarbon_queries = _build_cecarbon_queries(keywords)
    epd_queries = _build_epd_queries(keywords)

    all_candidates = []

    # ---------------------------------------------------------------
    # Tier 1: GHG Protocol (combustíveis e transporte — fonte BR)
    # ---------------------------------------------------------------
    if should_search_ghg:
        for kw in keywords[:3]:
            try:
                rows = search_ghg(kw, limit=5)
                for row in rows:
                    score = _score_ghg(description, row, ecoinvent_queries)
                    co2 = float(row.get("co2") or 0)
                    ch4 = float(row.get("ch4") or 0)
                    n2o = float(row.get("n2o") or 0)
                    co2e = co2 + (ch4 * 28) + (n2o * 265)
                    all_candidates.append({
                        "source_tier": "ghg_protocol",
                        "score": score,
                        "factor_value": round(co2e, 6),
                        "factor_unit": "kgCO2e",
                        "product_unit": "",
                        "factor_name": row.get("produto", ""),
                        "factor_source": f"GHG Protocol BR {row.get('versao_ghg', '')}",
                        "geography": row.get("pais", "Brasil"),
                        "ghg_factor_id": row.get("id"),
                    })
            except Exception:
                continue

    # ---------------------------------------------------------------
    # Tier 2: CECarbon (materiais de construção — fonte BR, PT-BR)
    # ---------------------------------------------------------------
    for q in cecarbon_queries[:6]:
        try:
            rows = search_cecarbon(q, limit=10)
            for row in rows:
                score = _score_cecarbon(description, row, cecarbon_queries)
                factor_value = row.get("fator de emissão (kgCO2)", 0)
                if factor_value is None:
                    factor_value = 0
                factor_value = float(factor_value)
                unit_cecarbon = (row.get("Unidade") or "").strip()
                desc_factor = row.get("Descrição fator de emissao", "")
                ref = row.get("Referencia", "CECARBON 2024")
                density = row.get("densidade", 1)
                all_candidates.append({
                    "source_tier": "cecarbon",
                    "score": score,
                    "factor_value": factor_value,
                    "factor_unit": f"kgCO₂/{unit_cecarbon}",
                    "product_unit": unit_cecarbon,
                    "factor_name": desc_factor,
                    "factor_source": ref,
                    "geography": "Brasil",
                    "cecarbon_id": row.get("id"),
                    "density": float(density) if density else 1.0,
                })
        except Exception:
            continue

    # ---------------------------------------------------------------
    # Tier 3: EPD Catalog (fornecedor-específico, com GWP extraído)
    # ---------------------------------------------------------------
    for q in epd_queries[:6]:
        try:
            rows = search_epd_with_gwp(q, limit=10)
            for row in rows:
                gwp = row.get("gwp_a1a3")
                if gwp is None:
                    continue
                gwp = float(gwp)
                if gwp <= 0:
                    continue

                score = _score_epd(description, row, epd_queries)
                declared_unit = (row.get("declared_unit") or "").strip()
                declared_value = float(row.get("declared_value") or 1)
                # Normalize to per-unit: gwp_a1a3 / declared_value
                factor_per_unit = gwp / declared_value if declared_value > 0 else gwp
                company = row.get("company_name", "")
                titulo = row.get("titulo", "")

                all_candidates.append({
                    "source_tier": "epd",
                    "score": score,
                    "factor_value": round(factor_per_unit, 6),
                    "factor_unit": f"kgCO₂e/{declared_unit}" if declared_unit else "kgCO₂e",
                    "product_unit": declared_unit,
                    "factor_name": titulo,
                    "factor_source": f"EPD — {company}" if company else "EPD",
                    "geography": row.get("country") or row.get("geographical_scopes") or "",
                    "epd_id": row.get("id"),
                    "epd_registration": row.get("registration_number"),
                    "company_name": company,
                })
        except Exception:
            continue

    # ---------------------------------------------------------------
    # Tier 4: Ecoinvent (global, EN — fallback)
    # ---------------------------------------------------------------
    for q in ecoinvent_queries[:6]:
        try:
            rows = search_ecoinvent(q, limit=15)
            for row in rows:
                score = _score_ecoinvent(description, row, ecoinvent_queries)
                impact = row.get("impact_score", "0")
                all_candidates.append({
                    "source_tier": "ecoinvent",
                    "score": score,
                    "factor_value": float(impact) if impact else 0.0,
                    "factor_unit": row.get("impact_unit", "kg CO2-Eq"),
                    "product_unit": row.get("product_unit", ""),
                    "factor_name": row.get("product_name", ""),
                    "factor_source": f"Ecoinvent — {row.get('activity_name', '')}",
                    "geography": row.get("geography", ""),
                    "ecoinvent_product_id": row.get("product_id"),
                    "ecoinvent_activity_id": row.get("activity_id"),
                })
        except Exception:
            continue

    # ---------------------------------------------------------------
    # Dedup, filter, rank
    # ---------------------------------------------------------------
    seen = set()
    unique = []
    for c in all_candidates:
        key = (
            c["source_tier"],
            c.get("ecoinvent_product_id") or c.get("ghg_factor_id") or c.get("cecarbon_id") or c.get("epd_id") or c["factor_name"],
            c.get("ecoinvent_activity_id", ""),
        )
        if key not in seen:
            seen.add(key)
            unique.append(c)

    # Filter out zero-value factors (keep all scores — even low ones show in drawer)
    unique = [c for c in unique if c["factor_value"] > 0]

    # Filter out infrastructure-scale factors
    unique = [
        c for c in unique
        if not (c.get("product_unit", "").lower() == "unit" and c["factor_value"] > 10000)
    ]

    # Filter out disabled CECarbon entries (prefixed with *)
    unique = [
        c for c in unique
        if not (c["source_tier"] == "cecarbon" and c["factor_name"].startswith("*"))
    ]

    # Filter out zero-description / placeholder rows
    unique = [
        c for c in unique
        if c["factor_name"] and c["factor_name"] != "0"
    ]

    # Penalize waste/by-product results
    waste_indicators = ["waste", "bottom ash", "mswi", "wastewater", "sludge", "scrap"]
    desc_lower = description.lower()
    has_waste_keyword = any(w in desc_lower for w in ["resíduo", "lixo", "sucata", "efluente"])
    if not has_waste_keyword:
        for c in unique:
            name = c.get("factor_name", "").lower()
            if any(w in name for w in waste_indicators):
                c["score"] = max(0, c["score"] - 30)

    # Tier priority bonus: at equal scores, prefer EPD > GHG > CECarbon > Ecoinvent
    # EPD gets highest bonus because it's supplier-specific (real product data)
    TIER_BONUS = {"epd": 5, "ghg_protocol": 3, "cecarbon": 2, "ecoinvent": 0}
    for c in unique:
        c["score"] += TIER_BONUS.get(c["source_tier"], 0)

    # For fuel/transport items, extra boost for GHG
    if should_search_ghg:
        for c in unique:
            if c["source_tier"] == "ghg_protocol" and c["score"] >= 80:
                c["score"] += 5

    # ---------------------------------------------------------------
    # Unit compatibility: penalize candidates with incompatible units
    # ---------------------------------------------------------------
    if unit:
        for c in unique:
            factor_unit = c.get("factor_unit", "")
            conv = get_conversion_factor(unit, factor_unit)
            if conv == 0.0:
                # Incompatible units → heavy penalty (push below threshold)
                c["score"] = max(0, c["score"] - 50)
                c["_unit_incompatible"] = True
            elif conv != 1.0:
                # Convertible but not exact match → small bonus for having conversion
                c["score"] += 1

    # Sort by score descending
    unique.sort(key=lambda x: x["score"], reverse=True)

    # Determine best and confidence
    best = unique[0] if unique else None
    confidence = None
    if best:
        if best["score"] >= 80:
            confidence = "high"
        elif best["score"] >= 60:
            confidence = "medium"
        else:
            confidence = "low"

    return {
        "results": unique[:10],
        "best": best,
        "confidence": confidence,
    }
