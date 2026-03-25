# ZNIT ESG — Claude Development Guide

## Project Overview

ZNIT ESG is an agentic data platform that unifies every ESG framework with expert guidance, delivering data you can trust and use anywhere.

Current focus: Carbon calculator for construction projects (Piloto HTB — Raízen VRO R8).

## Architecture

- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS (app router)
- **Backend**: FastAPI (Python 3.14) + SQLAlchemy + SQLite
- **External data**: Supabase (schema `backend`) — Ecoinvent, GHG Protocol BR, CECarbon, EPD catalog
- **Deploy**: Render (Docker — single container with Next.js + FastAPI)

## Specification Documents

Always consult these docs before implementing features or making architectural decisions:

- **[PRD](docs/specs/PRD.md)** — Product Requirements Document. Goals, user personas, features, success metrics.
- **[SPEC](docs/specs/SPEC.md)** — Technical Specification. Data models, API contracts, business rules, calculation logic.
- **[IMPL](docs/specs/IMPL.md)** — Implementation Guide. Step-by-step build plan, file structure, integration patterns.
- **[DESIGN_SYSTEM](docs/specs/DESIGN_SYSTEM.md)** — Design System. Colors, typography, components, spacing, layout patterns.
- **[EPD_DATA_REQUIREMENTS](docs/specs/EPD_DATA_REQUIREMENTS.md)** — EPD data structure, GWP fields, EN 15804 compliance requirements.

## Key Conventions

### Frontend
- Design tokens: primary `#56B7A5`, bg `#F8FAF9`, border `#E0E4E3`, text `#030304`
- Components in `components/ui/` (shadcn-style) and `components/layout/`
- API client in `lib/api/` — always use `api.get/post/put/delete` from `lib/api/client.ts`
- Portuguese (PT-BR) for all user-facing text

### Backend
- API prefix: `/api/` for all routes
- Auth: JWT via `get_current_user` dependency
- Emission factors hierarchy: Factor Rules → GHG Protocol → CECarbon → EPD (with GWP) → Ecoinvent
- Unit conversion: always use `get_conversion_factor()` from `services/calculator.py`
- Supabase schema: `backend` (set via `SUPABASE_SCHEMA` env var)

### Git
- Author/committer: `jbpalermoznit <jbpalermo@znit.ai>`
- Branch naming: `feat/`, `fix/`, `docs/`
- Commit style: conventional commits (feat, fix, docs, refactor)
- No Co-Authored-By trailers
