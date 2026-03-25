from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base
from app.api import auth, projects, emission_factors, scenarios, factor_rules as factor_rules_router, equipment_rules as equipment_rules_router, agent as agent_router, macc as macc_router
from app.models.factor_rule import FactorRule  # noqa: F401 — register model
from app.models.equipment_rule import EquipmentRule  # noqa: F401 — register model

# Criar todas as tabelas no startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ZNIT Carbon Calculator API",
    version="1.0.0",
    description="API para cálculo de pegada de carbono em projetos de construção civil",
)

origins = [o.strip() for o in settings.FRONTEND_URL.split(",") if o.strip()]
if "*" not in origins:
    origins.append("http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if "*" in origins else origins,
    allow_credentials=False if "*" in origins else True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(emission_factors.router, prefix="/api")
app.include_router(scenarios.router, prefix="/api")
app.include_router(factor_rules_router.router, prefix="/api")
app.include_router(equipment_rules_router.router, prefix="/api")
app.include_router(agent_router.router)
app.include_router(macc_router.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


# ---------------------------------------------------------------------------
# Seed inicial — cria empresa HTB e usuário demo se não existirem
# ---------------------------------------------------------------------------

@app.on_event("startup")
def seed_initial_data():
    from sqlalchemy.orm import Session
    from app.core.database import SessionLocal
    from app.core.auth import hash_password
    from app.models.company import Company
    from app.models.user import User

    db: Session = SessionLocal()
    try:
        # Verificar se já existe
        if db.query(Company).first():
            return

        company = Company(
            id="company-htb",
            name="Grupo HTB",
            color_primary="#56B7A5",
            color_secondary="#E6F3EE",
        )
        db.add(company)

        user = User(
            id="user-joao",
            company_id="company-htb",
            name="João Palermo",
            email="joao@znit.io",
            hashed_password=hash_password("demo1234"),
            role="admin",
        )
        db.add(user)

        from app.models.project import Project
        project = Project(
            id="proj-raizen-r8",
            company_id="company-htb",
            name="Raízen VRO R8",
            client_name="Raízen",
            address="São Paulo, SP",
            total_area_m2=102000,
            building_type="Industrial",
            status="active",
        )
        db.add(project)
        db.commit()
        print("Seed: empresa HTB, usuário demo e projeto Raízen VRO R8 criados.")
    finally:
        db.close()
