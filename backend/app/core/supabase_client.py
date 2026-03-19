"""
Cliente HTTP para consultar o Supabase externo (banco de fatores de emissão).
Usa httpx para requests async-safe (mas síncrono por ora — FastAPI sync endpoints).
"""

import httpx
from app.core.config import settings

_HEADERS = {
    "apikey": settings.SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {settings.SUPABASE_ANON_KEY}",
    "Accept-Profile": settings.SUPABASE_SCHEMA,
    "Content-Type": "application/json",
}

BASE_URL = f"{settings.SUPABASE_URL}/rest/v1"


def _get(table: str, params: dict | None = None) -> list[dict]:
    """GET request to Supabase REST API. Returns list of rows."""
    url = f"{BASE_URL}/{table}"
    resp = httpx.get(url, headers=_HEADERS, params=params or {}, timeout=15)
    resp.raise_for_status()
    return resp.json()


def search_ecoinvent(query: str, limit: int = 20) -> list[dict]:
    """Search ecoinvent_dev by product_name or activity_name (ilike)."""
    # Search in both English and Portuguese names
    params = {
        "or": (
            f"(product_name.ilike.%{query}%,"
            f"product_name_pt.ilike.%{query}%,"
            f"activity_name.ilike.%{query}%,"
            f"activity_name_pt.ilike.%{query}%)"
        ),
        "limit": str(limit),
        "order": "product_name",
    }
    return _get("ecoinvent_dev", params)


def search_ghg(query: str, limit: int = 20) -> list[dict]:
    """Search fatores_ghg_dev by produto (ilike)."""
    params = {
        "produto": f"ilike.%{query}%",
        "limit": str(limit),
        "order": "produto",
    }
    return _get("fatores_ghg_dev", params)


def search_epd_catalog(query: str, limit: int = 20) -> list[dict]:
    """Search epd_dev by titulo or informacao_produto (ilike)."""
    params = {
        "or": (
            f"(titulo.ilike.%{query}%,"
            f"informacao_produto.ilike.%{query}%,"
            f"company_name.ilike.%{query}%)"
        ),
        "limit": str(limit),
        "order": "titulo",
    }
    return _get("epd_dev", params)


def get_ecoinvent_by_id(product_id: str, activity_id: str) -> dict | None:
    """Get a specific ecoinvent factor by product_id + activity_id."""
    rows = _get("ecoinvent_dev", {
        "product_id": f"eq.{product_id}",
        "activity_id": f"eq.{activity_id}",
        "limit": "1",
    })
    return rows[0] if rows else None


def get_ghg_by_id(row_id: int) -> dict | None:
    """Get a specific GHG factor by id."""
    rows = _get("fatores_ghg_dev", {"id": f"eq.{row_id}", "limit": "1"})
    return rows[0] if rows else None


def get_ghg_latest(produto: str) -> dict | None:
    """Get the latest year factor for a specific GHG product."""
    rows = _get("fatores_ghg_dev", {
        "produto": f"eq.{produto}",
        "order": "ano.desc",
        "limit": "1",
    })
    return rows[0] if rows else None


def search_cecarbon(query: str, limit: int = 20) -> list[dict]:
    """Search produtos_cecarbon_dev by description (ilike). PT-BR materials."""
    params = {
        "Descrição fator de emissao": f"ilike.%{query}%",
        "limit": str(limit),
        "order": "Descrição fator de emissao",
    }
    return _get("produtos_cecarbon_dev", params)


def get_cecarbon_by_id(row_id: int) -> dict | None:
    """Get a specific CECarbon factor by id."""
    rows = _get("produtos_cecarbon_dev", {"id": f"eq.{row_id}", "limit": "1"})
    return rows[0] if rows else None
