# EPD Data Requirements — ZNIT Carbon Calculator
**Versão:** 1.2 | **Data:** 2026-03-17
**Contexto:** Requisitos de dados para integração da Parte 2 (mapeamento automático + cálculo de emissões)

---

## Hierarquia de fontes

O sistema busca um fator de emissão para cada item seguindo esta ordem de prioridade, do mais específico para o mais genérico:

```
Nível 1 — EPD certificada
  Declaração ambiental de produto específica do fabricante ou material.
  Maior precisão. Exemplos: EPD Norge, IBU, Inies, EPD Brasil.
        ↓ não encontrou
Nível 2 — GHG Protocol
  Fatores setoriais com contexto brasileiro. Amplamente aceito para
  inventários corporativos. Fonte preferencial quando não há EPD.
        ↓ não encontrou
Nível 3 — Ecoinvent
  Base LCA processo a processo. Referência global, base europeia com
  adaptações regionais. Mais granular, requer atenção aos limites de sistema.
        ↓ não encontrou
Nível 4 — Fator manual (analista)
  Analista insere valor, fonte e justificativa. Registrado no memorando.
        ↓ não aplicável
Nível 5 — Excluir do inventário
  Com justificativa obrigatória. Registrado no memorando como item fora
  do escopo, com rastreabilidade completa.
```

> **Nota sobre Ecoinvent:** a integração pressupõe que os fatores do Ecoinvent já estão importados e armazenados na tabela (requer licença comercial). O sistema **não consulta a API do Ecoinvent** diretamente — busca os fatores na própria tabela filtrados por `source_tier = "ecoinvent"`.

---

## Fluxo completo do mapper

```
Curva ABC importada — item Tipo A
        │
        ▼
Busca na tabela de fatores por tier (em ordem):
  ┌─ Tier 1: source_tier = "epd"
  │   fuzzy match em material_name + keywords
  │   score ≥ 80 → usa com confiança "alta"
  │   score 60–79 → usa com confiança "média", marca para revisão
  │   score < 60  → sem match neste tier → próximo tier
  │
  ├─ Tier 2: source_tier = "ghg_protocol"
  │   mesmo critério de score
  │   score ≥ 60 → usa (confiança alta ou média conforme score)
  │   score < 60  → sem match neste tier → próximo tier
  │
  ├─ Tier 3: source_tier = "ecoinvent"
  │   mesmo critério de score
  │   score ≥ 60 → usa; memorando registra limitação de sistema
  │   score < 60  → sem match em nenhum tier
  │
  └─ Sem match em nenhum tier
        │
        ▼ (ver fluxo de fallback manual abaixo)

Item com fator encontrado
        │
        ▼
Calculator
  emission_kgco2e = item.quantity × factor_kgco2e_per_unit
  emission_tco2e  = emission_kgco2e / 1000
        │
        ▼
ScenarioResult → Overview + Relatórios
```

---

## Schema da tabela de fatores

Uma linha por variante de material (não por material).

```sql
emission_factors (
  id                      uuid / text     -- chave primária
  source_tier             text            -- "epd" | "ghg_protocol" | "ecoinvent"
  material_name           text            -- nome completo — campo principal de matching
  variant_name            text            -- variante do mesmo material (nullable)
  category                text            -- agrupamento: "Concreto", "Aço", "Madeira"...
  factor_kgco2e_per_unit  float           -- valor do fator de emissão
  unit                    text            -- unidade funcional normalizada
  scope                   text            -- "1" | "2" | "3"
  system_boundary         text            -- "A1-A3" | "A1-A4" | "cradle-to-gate" (nullable)
  source                  text            -- ex: "GHG Protocol BR 2023", "Ecoinvent 3.10"
  source_url              text            -- URL da publicação (nullable)
  valid_from              date            -- nullable
  valid_until             date            -- nullable
  keywords                text[]          -- aliases PT-BR para melhorar o match (nullable)
  region                  text            -- "BR" | "EU" | "Global" (nullable)
)
```

---

## Campos obrigatórios — detalhe por funcionalidade

### 1 — Identificação do tier (novo campo central)

| Campo | Obrigatório | Valores aceitos |
|---|---|---|
| `source_tier` | ✅ sim | `"epd"`, `"ghg_protocol"`, `"ecoinvent"` |

O mapper usa `source_tier` para filtrar a busca em cada nível. Sem esse campo, não é possível respeitar a hierarquia de prioridade.

---

### 2 — Mapeamento automático (fuzzy matching)

O mapper compara `item.cost_code + item.description` contra `material_name + category + keywords`.

| Campo | Obrigatório | Uso no matcher |
|---|---|---|
| `material_name` | ✅ sim | Campo principal de comparação |
| `unit` | ✅ sim | Bônus de +10 pontos quando unidade do item bate com a do fator |
| `category` | ✅ sim | Filtro no drawer + agrupamento de alternativas |
| `keywords` | recomendado | Aliases em PT-BR — ex: `["ca50", "vergalhão", "barra"]` |

**Score de confiança por tier:**

| Score | Resultado |
|---|---|
| ≥ 80 | Alta confiança — mapeado automaticamente, sem revisão |
| 60–79 | Média confiança — mapeado, marcado para revisão pelo analista |
| < 60 | Sem match neste tier — sistema tenta o próximo tier |

---

### 3 — Cálculo de emissões

```
emission_kgco2e = item.quantity × factor_kgco2e_per_unit
emission_tco2e  = emission_kgco2e / 1000
```

| Campo | Obrigatório | Observação |
|---|---|---|
| `factor_kgco2e_per_unit` | ✅ sim | Valor numérico, nunca nulo |
| `unit` | ✅ sim | Deve ser compatível com a unidade do item na Curva ABC |
| `scope` | ✅ sim | Necessário para breakdown Scope 1 / 2 / 3 no dashboard |

---

### 4 — Rastreabilidade no memorando de cálculo

O memorando cita, por item: tier usado, fonte, data de validade e limitações de sistema.

| Campo | Obrigatório | Observação |
|---|---|---|
| `source_tier` | ✅ sim | Indica qual nível da hierarquia foi usado |
| `source` | ✅ sim | Nome da publicação ou base de dados |
| `system_boundary` | recomendado | Importante para Ecoinvent — limites podem incluir transporte e fim de vida |
| `region` | recomendado | Para identificar quando fator europeu está sendo usado no Brasil |
| `valid_until` | recomendado | Alerta quando o fator está vencido |
| `source_url` | opcional | URL da publicação para citação formal |

**Aviso gerado no memorando quando `source_tier = "ecoinvent"`:**
> _"Fator Ecoinvent aplicado. Origem: base europeia — verificar aplicabilidade ao contexto brasileiro. Limite de sistema: [system_boundary]. Revisar se inclui etapas além de A1–A3."_

---

### 5 — Cenários alternativos

Para que o drawer mostre "outras opções de menor emissão" e permita gerar cenários comparativos.

| Campo | Obrigatório | Observação |
|---|---|---|
| `variant_name` | ✅ sim | Distingue variantes do mesmo material base |
| `category` | ✅ sim | Agrupa variantes — o drawer exibe alternativas da mesma categoria |

Sem `variant_name`, não é possível gerar cenários com substituição de materiais.

**Exemplo — variantes por tier:**

| source_tier | material_name | variant_name | factor | unit |
|---|---|---|---|---|
| epd | Concreto usinado Fck=30 | EPD Votorantim 2024 | 312 | kgCO₂e/m³ |
| ghg_protocol | Concreto usinado Fck=30 | convencional | 355 | kgCO₂e/m³ |
| ghg_protocol | Concreto usinado Fck=30 | 30% cinza volante | 248 | kgCO₂e/m³ |
| ecoinvent | Concreto usinado Fck=30 | Ecoinvent 3.10 EU mix | 290 | kgCO₂e/m³ |
| ghg_protocol | Aço em barras CA50 | convencional | 1.85 | kgCO₂e/kg |
| ghg_protocol | Aço em barras CA50 | aço reciclado | 0.92 | kgCO₂e/kg |
| ecoinvent | Aço em barras CA50 | Ecoinvent 3.10 global | 1.70 | kgCO₂e/kg |

---

## Fluxo de fallback — itens sem fator encontrado em nenhum tier

Quando o matcher não encontra score ≥ 60 em nenhum dos três tiers:

### Nível 4 — Fator definido manualmente pelo analista

O analista insere um fator diretamente no drawer do item. Dados obrigatórios:

| Campo | Obrigatório | Exemplo |
|---|---|---|
| `factor_kgco2e_per_unit` | ✅ sim | `2.10` |
| `unit` | ✅ sim | `kg` — deve bater com a unidade do item |
| `source` | ✅ sim | "ABNT NBR 15575", "Fabricante X", "Estimativa ZNIT" |
| `scope` | ✅ sim | `"3"` |
| `justification` | ✅ sim | Texto livre — exportado no memorando |

O fator manual fica salvo como `mapped_by = "user_custom"` no `ItemMapping`. **Não** é adicionado à tabela de fatores — é uma decisão pontual daquele item naquele projeto.

---

### Nível 5 — Excluir do inventário com justificativa

Quando não há fator disponível nem estimativa aceitável. Casos típicos:
- Material muito específico sem referência pública
- Item cujo impacto é negligenciável
- Decisão metodológica acordada com o cliente

`justification` é obrigatória. O memorando lista todos os itens excluídos com a justificativa correspondente.

---

## Unidades aceitas (normalização obrigatória)

O bônus de compatibilidade de unidade só é aplicado quando `item.unit == factor.unit` (string exata). Normalizar antes de importar:

| Aceito | Não aceito (converter) |
|---|---|
| `kg` | KG, Kg, kilogram, kgf |
| `m³` | M3, m3, m^3, cubic meter |
| `m²` | M2, m2, m^2, sqm |
| `m` | metro, mt |
| `t` | ton, tonelada, Ton |
| `L` | litro, lt, liter |
| `kWh` | kwh, KWH, kilowatt-hour |
| `h` | hora, hr, hour |
| `un` | unidade, unid, pc, pç |

---

## Valores aceitos para `scope`

| Valor | Significado |
|---|---|
| `"1"` | Scope 1 — combustão direta na obra (diesel, gás) |
| `"2"` | Scope 2 — energia elétrica consumida na obra |
| `"3"` | Scope 3 — materiais, logística, cadeia produtiva |

---

## Problemas comuns em bases de fatores existentes

| Problema | Impacto | Solução |
|---|---|---|
| Sem campo `source_tier` | Hierarquia EPD → GHG Protocol → Ecoinvent não funciona | Adicionar coluna; classificar registros existentes |
| Unidade não normalizada | Match de unidade falha, score mais baixo | Script de normalização antes de importar |
| Sem `variant_name` | Impossível gerar cenários comparativos | Adicionar coluna; usar "convencional" como default |
| Nomes em inglês (Ecoinvent) | Fuzzy match ruim contra descrições do iTwo em PT-BR | Adicionar aliases PT-BR na coluna `keywords` |
| `scope` em formato livre ("Scope 3", "A1-A3") | Breakdown do dashboard quebra | Mapear para "1", "2" ou "3" |
| Ecoinvent sem `system_boundary` | Memorando não pode alertar sobre limites de sistema | Adicionar coluna; aceita null |
| Ecoinvent sem `region` | Não dá para identificar fatores europeus usados no BR | Adicionar coluna com "EU", "Global", "BR" |
| Fatores sem `valid_until` | Memorando não pode citar vigência | Aceitar null, mas preencher quando disponível |

---

## Checklist de validação antes de conectar

- [ ] Todos os registros têm `source_tier` preenchido (`"epd"`, `"ghg_protocol"` ou `"ecoinvent"`)
- [ ] Todos os registros têm `material_name` preenchido
- [ ] Todos os registros têm `factor_kgco2e_per_unit` numérico (não texto, não nulo)
- [ ] Campo `unit` normalizado conforme lista acima
- [ ] Campo `scope` normalizado como `"1"`, `"2"` ou `"3"`
- [ ] Campo `source` preenchido em todos os registros
- [ ] Coluna `variant_name` existe (pode ser null)
- [ ] Coluna `category` existe e está preenchida
- [ ] Fatores Ecoinvent têm `system_boundary` e `region` preenchidos
- [ ] Materiais com variantes têm linhas separadas (não colunas)
- [ ] Sem duplicatas exatas (mesmo `material_name` + `variant_name` + `unit` + `source_tier`)

---

## Mapeamento de campos — quando o schema for diferente

Se a sua tabela usar nomes de coluna diferentes, o mapper aceita um dicionário de remapeamento:

```python
# services/epd_mapper.py

FIELD_MAP = {
    "source_tier":            "tier",             # nome da coluna na sua tabela
    "material_name":          "nome_material",
    "variant_name":           "variante",
    "category":               "categoria",
    "factor_kgco2e_per_unit": "fator_emissao",
    "unit":                   "unidade",
    "scope":                  "escopo",
    "system_boundary":        "limite_sistema",
    "source":                 "fonte",
    "source_url":             "url_fonte",
    "valid_until":            "validade",
    "keywords":               "aliases",
    "region":                 "regiao",
}
```

Compartilhe o schema da sua tabela e ajusto o mapeamento.
