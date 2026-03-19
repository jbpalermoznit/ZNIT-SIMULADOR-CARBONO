"""
Agent API endpoints.
Uses Gemini via n8n webhook with a single prompt containing full context.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.gemini_client import call_gemini_sync
from app.models.user import User
from app.models.abc_item import AbcItem, AbcCurve
from app.services.agent.context_builder import build_agent_prompt, _get_pending_items
from app.services.agent.action_applier import apply_decisions
from app.services.agent.rule_based_resolver import resolve_locally

router = APIRouter(prefix="/api/agent", tags=["agent"])


# ── Request / Response models ──────────────────────────────────────────────────

class ResolveRequest(BaseModel):
    message: str
    item_type: Optional[str] = None
    item_ids: Optional[list[str]] = None
    conversation_history: Optional[list[dict]] = None  # [{"role": "user"|"assistant", "content": "..."}]


class ApplyRequest(BaseModel):
    decisions: list[dict]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/pending-summary")
def pending_summary(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns summary of pending items for the agent greeting."""
    curve = (
        db.query(AbcCurve)
        .filter(AbcCurve.project_id == project_id)
        .order_by(AbcCurve.imported_at.desc())
        .first()
    )
    if not curve:
        return {"total_pending": 0, "by_type": {}, "items": []}

    items = (
        db.query(AbcItem)
        .filter(
            AbcItem.abc_curve_id == curve.id,
            AbcItem.mapping_status.in_(["pending", "blocked"]),
        )
        .order_by(AbcItem.total_cost.desc())
        .all()
    )

    by_type: dict[str, int] = {}
    items_list = []
    for item in items:
        t = item.item_type
        by_type[t] = by_type.get(t, 0) + 1
        items_list.append({
            "id": item.id,
            "cost_code": item.cost_code,
            "description": item.description,
            "item_type": item.item_type,
            "total_cost": float(item.total_cost) if item.total_cost else 0,
            "unit": item.unit or "",
            "quantity": float(item.quantity) if item.quantity else 0,
        })

    return {
        "total_pending": len(items),
        "by_type": by_type,
        "items": items_list,
    }


@router.post("/projects/{project_id}/resolve")
def resolve_items(
    project_id: str,
    req: ResolveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Send context + user message to Gemini, return proposed decisions.
    Does NOT apply them — frontend shows action cards for user to accept/reject.
    """
    # Build complete prompt
    prompt = build_agent_prompt(
        project_id=project_id,
        user_message=req.message,
        db=db,
        item_type=req.item_type,
        item_ids=req.item_ids,
        conversation_history=req.conversation_history,
    )

    # Try Gemini via n8n webhook first, fallback to local rule-based resolver
    try:
        result = call_gemini_sync(prompt)
        agent_response = result.get("agent_response", "")
        decisions = result.get("decisions", [])

        # If result is just text (no structured JSON), wrap it
        if not decisions and isinstance(result, dict) and "text" in result:
            agent_response = result["text"]
            decisions = []
    except Exception:
        # Fallback: resolve locally using rule-based logic
        pending = _get_pending_items(project_id, db, req.item_type)
        if req.item_ids:
            pending = [p for p in pending if p["item_id"] in req.item_ids]
        result = resolve_locally(pending, req.message, db)
        agent_response = result["agent_response"]
        decisions = result["decisions"]

    # Fix invalid item_ids — Gemini sometimes invents UUIDs
    pending_fix = _get_pending_items(project_id, db, req.item_type)
    if req.item_ids:
        pending_fix = [p for p in pending_fix if p["item_id"] in req.item_ids]
    valid_ids = {p["item_id"] for p in pending_fix}
    for dec in decisions:
        if dec.get("item_id") not in valid_ids and len(pending_fix) > 0:
            if len(pending_fix) == 1:
                dec["item_id"] = pending_fix[0]["item_id"]
            else:
                used_ids = {d.get("item_id") for d in decisions if d.get("item_id") in valid_ids}
                remaining = [p["item_id"] for p in pending_fix if p["item_id"] not in used_ids]
                if remaining:
                    dec["item_id"] = remaining[0]

    return {
        "agent_response": agent_response,
        "decisions": decisions,
        "summary": {
            "proposed": len(decisions),
            "exclude": sum(1 for d in decisions if d.get("action") == "exclude"),
            "map_factor": sum(1 for d in decisions if d.get("action") == "map_factor"),
            "equipment_calc": sum(1 for d in decisions if d.get("action") == "equipment_calc"),
            "decompose": sum(1 for d in decisions if d.get("action") == "decompose"),
        },
    }


@router.post("/projects/{project_id}/apply")
def apply_agent_decisions(
    project_id: str,
    req: ApplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply accepted decisions from the agent."""
    result = apply_decisions(
        decisions=req.decisions,
        project_id=project_id,
        db=db,
        user_id=current_user.id,
    )
    return result
