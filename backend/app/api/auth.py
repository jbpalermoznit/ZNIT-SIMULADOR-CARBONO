from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.auth import verify_password, create_access_token
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuário inativo")

    token = create_access_token({"sub": user.id, "company_id": user.company_id})
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        user_name=user.name,
        company_id=user.company_id,
        role=user.role,
    )
