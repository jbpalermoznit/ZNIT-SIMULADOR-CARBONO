# ZNIT ESG — Claude Development Guide

## Project Overview

ZNIT ESG is an agentic data platform that unifies every ESG framework with expert guidance, delivering data you can trust and use anywhere.

Current focus: Carbon calculator for construction projects.

## Architecture

- **Frontend + API**: Next.js 16 + TypeScript + Tailwind CSS (app router + API routes)
- **Database**: Supabase PostgreSQL (app data in `public` schema, emission factors in `backend` schema)
- **Server logic**: `lib/server/` — auth, calculator, parser, emission-mapper, agent services
- **Deploy**: Vercel (automatic from GitHub)

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

### API / Server
- API routes in `app/api/` (Next.js route handlers)
- Auth: Clerk via `getCurrentUser()` from `lib/server/auth.ts` (Organizations as tenant unit)
- Supabase client: `lib/server/supabase.ts` (service_role key, server-side only)
- Auto-map hierarchy: Factor Rules → GHG Protocol → CECarbon → Ecoinvent. EPDs are intentionally NOT auto-selected — they're reserved for explicit substitution via the factor editor (searchEmissionFactors) or curated Factor Rules.
- Unit conversion: always use `getConversionFactor()` from `lib/server/calculator.ts`
- Emission factor data: `backend` schema in Supabase via `lib/server/supabase-emission.ts`

### Git — MANDATORY
- **ALL commits MUST use**: `git -c user.name="jbpalermoznit" -c user.email="jbpalermo@znit.ai" commit`
- Author and committer must ALWAYS be `jbpalermoznit <jbpalermo@znit.ai>` — no exceptions
- NEVER add Co-Authored-By, Signed-off-by, or any other trailer attributing anyone else
- Branch naming: `feat/`, `fix/`, `docs/`
- Commit style: conventional commits (feat, fix, docs, refactor)
