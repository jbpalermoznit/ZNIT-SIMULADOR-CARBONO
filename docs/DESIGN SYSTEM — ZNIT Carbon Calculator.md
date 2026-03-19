# Design System — ZNIT Carbon Calculator
**Versão:** 2.0 | **Data:** 2026-03-15 | **Referência:** ZNIT Branding Book v1
**Princípio:** Dados de sustentabilidade apresentados com a clareza e confiança da marca ZNIT.

---

## 1. Identidade de Marca

### Posicionamento
> "Transformando dados em soluções sustentáveis e acessíveis."

A ZNIT combina tecnologia avançada com facilidade de uso para democratizar o acesso a dados de sustentabilidade. O produto deve refletir: **precisão técnica + acessibilidade + impacto positivo**.

### Atributos visuais derivados do branding
- **Teal como linguagem** — não verde genérico de sustentabilidade, mas o teal ZNIT: sofisticado, tecnológico, único
- **Limpeza tipográfica** — Gotham carrega autoridade sem arrogância
- **Espaço como comunicação** — marca que respira, sem excesso de elementos
- **Dados com clareza** — hierarquia de informação precisa, nunca confusa

---

## 2. Paleta de Cores

Extraída diretamente do **ZNIT Branding Book**, página 13.

### 2.1 Cores Primárias ZNIT

```
Color 1 — Brand Primary     Color 2 — Brand Light      Color 3 — Brand Lighter
HEX #56B7A5                 HEX #81C8B9                HEX #A9D7CD
RGB 86, 183, 165            RGB 129, 200, 185           RGB 169, 215, 205

Color 4 — Brand Background  Color 5 — Near Black
HEX #E6F3EE                 HEX #030304
RGB 230, 243, 238           RGB 3, 3, 4
```

### 2.2 Escala de Neutros ZNIT

```
Color 6 — Dark Gray         Color 7 — Mid Gray         Color 8 — Light Gray
HEX #404040                 HEX #808181                HEX #BDBDBC
RGB 64, 64, 64              RGB 128, 129, 129           RGB 189, 189, 188

Color 9 — White
HEX #FFFFFF
```

### 2.3 Tokens CSS

```css
:root {
  /* --- BRAND ZNIT (Branding Book) --- */
  --color-brand-500:    #56B7A5;   /* primária — ações, destaques, nav ativo */
  --color-brand-400:    #81C8B9;   /* hover states, ícones secundários */
  --color-brand-300:    #A9D7CD;   /* borders de cards brand, badges */
  --color-brand-50:     #E6F3EE;   /* backgrounds sutis, badge fill */
  --color-brand-hover:  #4AA595;   /* hover do botão primário (5% mais escuro) */
  --color-brand-active: #3F9283;   /* pressed (10% mais escuro) */

  /* --- NEUTROS ZNIT (Branding Book) --- */
  --color-black:        #030304;   /* headings, KPI numbers, texto de alto peso */
  --color-gray-700:     #404040;   /* texto de corpo, dados de tabela */
  --color-gray-500:     #808181;   /* labels, captions, texto secundário */
  --color-gray-300:     #BDBDBC;   /* borders, divisores, placeholder */
  --color-white:        #FFFFFF;   /* backgrounds de card, inputs */

  /* --- SUPERFÍCIES --- */
  --color-bg-page:      #FAFAFA;   /* background da página — branco ligeiramente suave */
  --color-bg-section:   #F7F7F7;   /* sidebar, table header, inputs desabilitados */
  --color-bg-brand:     #E6F3EE;   /* Color 4 do branding — seções com identidade ZNIT */

  /* --- SEMÂNTICAS --- */
  --color-warning-bg:   #FFFBEB;
  --color-warning-border:#FDE68A;
  --color-warning-text: #92400E;

  --color-error-bg:     #FEF2F2;
  --color-error-border: #FECACA;
  --color-error-text:   #991B1B;

  --color-info-bg:      #EFF6FF;
  --color-info-border:  #BFDBFE;
  --color-info-text:    #1E40AF;

  /* --- TIPOS DE ITEM (badges A-F) — derivados da paleta ZNIT --- */
  --color-type-a-bg:    #E6F3EE;   /* brand-50 — material direto (verde teal ZNIT) */
  --color-type-a-text:  #2E7D68;   /* verde escuro derivado */
  --color-type-b-bg:    #F7F7F7;   /* neutro — mão de obra excluída */
  --color-type-b-text:  #808181;
  --color-type-c-bg:    #FEF3C7;   /* âmbar — agrupado bloqueado */
  --color-type-c-text:  #92400E;
  --color-type-d-bg:    #FEF2F2;   /* vermelho — risco dupla contagem */
  --color-type-d-text:  #991B1B;
  --color-type-e-bg:    #EFF6FF;   /* azul — equipamento */
  --color-type-e-text:  #1E40AF;
  --color-type-f-bg:    #FAF5FF;   /* roxo — indireto */
  --color-type-f-text:  #6B21A8;

  /* --- ABC CLASS --- */
  --color-class-a:      #030304;   /* near-black ZNIT */
  --color-class-b:      #808181;
  --color-class-c:      #BDBDBC;
}
```

### 2.4 Guia de Uso

| Token | Onde usar |
|---|---|
| `--color-brand-500` | Botão primário, nav ativo, link, ícone de ação, progress bar |
| `--color-brand-400` | Hover de elementos interativos, ícones de suporte |
| `--color-brand-300` | Bordas de cards com destaque brand, separadores ativos |
| `--color-brand-50` | Background de seções brand, badge Tipo A, empty state background |
| `--color-black` | Headings H1, números KPI hero |
| `--color-gray-700` | Corpo de texto, dados de tabela, descrições |
| `--color-gray-500` | Labels de input, captions, texto terciário |
| `--color-gray-300` | Borders padrão, divisores, placeholder |
| `--color-bg-brand` | Seções institucionais, header da sidebar, upload dropzone ativo |

---

## 3. Tipografia

### 3.1 Fonte Principal — Gotham

Gotham é a fonte oficial ZNIT (Branding Book, página 12).

```css
/* Gotham — fonte licenciada (Hoefler&Co) */
/* Para uso em produção: adquirir via fonts.adobe.com ou hoeflerco.com */

:root {
  --font-brand: 'Gotham', 'Nunito Sans', 'Helvetica Neue', sans-serif;
  --font-mono:  'JetBrains Mono', 'Fira Code', monospace;
}
```

**Pesos disponíveis no Branding Book:**

| Peso | Nome Gotham | CSS weight | Uso |
|---|---|---|---|
| Bold | Gotham Bold | `700` | Títulos, KPI numbers, destaques |
| Medium | Gotham Medium | `500` | Subtítulos, botões, labels |
| Book | Gotham Book | `400` | Textos de apoio, corpo, descrições |
| Light | Gotham Light | `300` | Captions, texto auxiliar, placeholder |

**Fallback para desenvolvimento** (sem licença Gotham):
```css
/* Nunito Sans — substituto visual mais próximo disponível no Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;500;600;700&display=swap');
:root { --font-brand: 'Nunito Sans', sans-serif; }
```

> **Produção:** Substituir por Gotham com @font-face dos arquivos originais ZNIT.

### 3.2 Escala de Tamanhos

```css
:root {
  --text-xs:   11px;   /* captions, badges, table headers (caps) */
  --text-sm:   13px;   /* corpo de tabela, labels de input */
  --text-base: 15px;   /* corpo de texto, descrições */
  --text-lg:   18px;   /* subtítulos de seção */
  --text-xl:   22px;   /* título de página */
  --text-2xl:  28px;   /* KPI secundário */
  --text-3xl:  36px;   /* KPI hero (tCO₂e total) */
  --text-4xl:  48px;   /* hero de landing */
}
```

### 3.3 Hierarquia na Prática

| Elemento | Size | Peso | Cor | Tracking |
|---|---|---|---|---|
| Page title | 22px | Bold (700) | `--color-black` | -0.02em |
| Section heading | 15px | Medium (500) | `--color-black` | 0 |
| KPI hero | 36px | Bold (700) | `--color-black` | -0.02em |
| KPI label | 11px | Medium (500) | `--color-gray-500` | 0.06em (CAPS) |
| Table header | 11px | Medium (500) | `--color-gray-500` | 0.06em (CAPS) |
| Table body | 13px | Book (400) | `--color-gray-700` | 0 |
| Body text | 15px | Book (400) | `--color-gray-700` | 0 |
| Caption | 11px | Light (300) | `--color-gray-500` | 0 |
| Badge | 11px | Medium (500) | varies | 0.02em |
| Button | 13px | Medium (500) | white / black | 0 |
| Numeric (mono) | 13px | Book (400) | `--color-gray-700` | 0 |
| Chat agent | 14px | Book (400) | `--color-gray-700` | 0 |

### 3.4 Line Height

```css
:root {
  --leading-tight:   1.2;   /* headings grandes, KPIs */
  --leading-snug:    1.4;   /* subtítulos, cards */
  --leading-normal:  1.6;   /* corpo de texto */
  --leading-relaxed: 1.75;  /* texto longo, chat */
}
```

---

## 4. Espaçamento

Base: **4px grid**. Todos os valores são múltiplos de 4.

```css
:root {
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

| Contexto | Valor |
|---|---|
| Entre elementos dentro de um card | 12–16px |
| Entre cards / seções | 24–32px |
| Padding interno de card | 20–24px |
| Padding de linha de tabela | 10px 16px |
| Padding de input | 8px 12px |
| Padding de botão médio | 8px 16px |
| Gap entre KPI cards | 16px |
| Margem entre seções da página | 40–48px |

---

## 5. Border Radius

```css
:root {
  --radius-sm:   4px;    /* inputs, badges */
  --radius-md:   6px;    /* botões */
  --radius-lg:   8px;    /* cards, modais */
  --radius-xl:   12px;   /* cards hero */
  --radius-full: 9999px; /* pill badges, avatar */
}
```

---

## 6. Sombras

Discretas. Apenas para separação funcional.

```css
:root {
  --shadow-xs: 0 1px 2px rgba(3,3,4,0.05);
  --shadow-sm: 0 1px 3px rgba(3,3,4,0.08), 0 1px 2px rgba(3,3,4,0.04);
  --shadow-md: 0 4px 6px rgba(3,3,4,0.07), 0 2px 4px rgba(3,3,4,0.04);
  --shadow-lg: 0 10px 15px rgba(3,3,4,0.08), 0 4px 6px rgba(3,3,4,0.04);
}
```

---

## 7. Componentes

### 7.1 Button

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border-radius: var(--radius-md);
  font-family: var(--font-brand);
  font-weight: 500;                  /* Gotham Medium */
  font-size: var(--text-sm);
  line-height: 1;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  white-space: nowrap;
}

.btn-sm { padding: 6px 12px; font-size: var(--text-xs); }
.btn-md { padding: 8px 16px; }
.btn-lg { padding: 10px 20px; font-size: var(--text-base); }

/* PRIMARY — teal ZNIT */
.btn-primary {
  background: var(--color-brand-500);
  color: white;
  border: 1px solid transparent;
}
.btn-primary:hover  { background: var(--color-brand-hover); }
.btn-primary:active { background: var(--color-brand-active); }

/* SECONDARY */
.btn-secondary {
  background: white;
  color: var(--color-gray-700);
  border: 1px solid var(--color-gray-300);
}
.btn-secondary:hover { background: var(--color-bg-section); }

/* GHOST */
.btn-ghost {
  background: transparent;
  color: var(--color-gray-500);
  border: 1px solid transparent;
}
.btn-ghost:hover {
  background: var(--color-bg-section);
  color: var(--color-gray-700);
}

/* BRAND OUTLINE */
.btn-outline-brand {
  background: transparent;
  color: var(--color-brand-500);
  border: 1px solid var(--color-brand-500);
}
.btn-outline-brand:hover {
  background: var(--color-brand-50);
}

.btn:disabled { opacity: 0.4; cursor: not-allowed; }
```

---

### 7.2 Badge

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-family: var(--font-brand);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

/* Status de mapeamento */
.badge-success  { background: var(--color-brand-50);  color: var(--color-type-a-text); border: 1px solid var(--color-brand-300); }
.badge-warning  { background: var(--color-warning-bg); color: var(--color-warning-text); }
.badge-error    { background: var(--color-error-bg);   color: var(--color-error-text); }
.badge-neutral  { background: var(--color-bg-section); color: var(--color-gray-500); }

/* Tipos de item A-F */
.badge-type-a { background: var(--color-type-a-bg); color: var(--color-type-a-text); border: 1px solid var(--color-brand-300); }
.badge-type-b { background: var(--color-type-b-bg); color: var(--color-type-b-text); }
.badge-type-c { background: var(--color-type-c-bg); color: var(--color-type-c-text); }
.badge-type-d { background: var(--color-type-d-bg); color: var(--color-type-d-text); }
.badge-type-e { background: var(--color-type-e-bg); color: var(--color-type-e-text); }
.badge-type-f { background: var(--color-type-f-bg); color: var(--color-type-f-text); }

/* Classe ABC */
.badge-class-a { font-weight: 700; color: var(--color-class-a); }
.badge-class-b { font-weight: 500; color: var(--color-class-b); }
.badge-class-c { color: var(--color-class-c); }
```

**Tabela de tipos de item:**

| Badge | Label | Cor | Significado |
|---|---|---|---|
| `badge-type-a` | Tipo A | Teal ZNIT | Material direto — mapeável automaticamente |
| `badge-type-b` | Tipo B | Cinza | Mão de obra — premissa necessária |
| `badge-type-c` | Tipo C | Âmbar | Agrupado — decomposição obrigatória |
| `badge-type-d` | Tipo D | Vermelho | Serviço c/ material embutido — risco |
| `badge-type-e` | Tipo E | Azul | Equipamento — dados operacionais |
| `badge-type-f` | Tipo F | Roxo | Administrativo — decisão de escopo |

---

### 7.3 Input

```css
.input {
  width: 100%;
  padding: 8px 12px;
  font-family: var(--font-brand);
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--color-gray-700);
  background: white;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color 100ms ease, box-shadow 100ms ease;
}
.input::placeholder { color: var(--color-gray-300); font-weight: 300; }
.input:hover  { border-color: var(--color-gray-500); }
.input:focus  {
  border-color: var(--color-brand-500);
  box-shadow: 0 0 0 3px rgba(86,183,165,0.15);  /* brand-500 com opacidade */
}
.input:disabled {
  background: var(--color-bg-section);
  color: var(--color-gray-300);
  cursor: not-allowed;
}
.input-error { border-color: var(--color-error-text); }
```

---

### 7.4 Card

```css
.card {
  background: white;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-xs);
}

/* Card com accent brand — borda superior teal */
.card-brand {
  border-top: 3px solid var(--color-brand-500);
}

/* Card de seção — fundo levemente cinza */
.card-section {
  background: var(--color-bg-section);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

/* Card de destaque brand — fundo teal suave */
.card-highlight {
  background: var(--color-brand-50);
  border: 1px solid var(--color-brand-300);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
}
```

---

### 7.5 KPI Card

```css
.kpi-card {
  background: white;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-lg);
  padding: var(--space-5) var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  box-shadow: var(--shadow-xs);
}

/* KPI primário — borda teal no topo */
.kpi-card-primary {
  border-top: 3px solid var(--color-brand-500);
}

.kpi-label {
  font-family: var(--font-brand);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-gray-500);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.kpi-value {
  font-family: var(--font-brand);
  font-size: var(--text-3xl);         /* 36px — hero */
  font-weight: 700;
  color: var(--color-black);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.kpi-value-md { font-size: var(--text-2xl); }  /* 28px — secundário */

.kpi-unit {
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--color-gray-500);
  margin-left: 4px;
}

.kpi-delta-positive { font-size: var(--text-sm); color: var(--color-brand-500); font-weight: 500; }
.kpi-delta-negative { font-size: var(--text-sm); color: var(--color-error-text); font-weight: 500; }
```

---

### 7.6 Table

```css
.table-container {
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.table { width: 100%; border-collapse: collapse; }

.table thead tr {
  background: var(--color-bg-section);
  border-bottom: 1px solid var(--color-gray-300);
}

.table th {
  padding: 10px 16px;
  font-family: var(--font-brand);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-gray-500);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  text-align: left;
  white-space: nowrap;
}

.table td {
  padding: 10px 16px;
  font-family: var(--font-brand);
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--color-gray-700);
  border-bottom: 1px solid rgba(189,189,188,0.5);  /* gray-300 suave */
  vertical-align: middle;
}

.table tbody tr:last-child td { border-bottom: none; }
.table tbody tr:hover { background: var(--color-brand-50); }  /* teal ZNIT */

/* Coluna numérica — mono, alinhada à direita */
.table td.numeric, .table th.numeric {
  text-align: right;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

/* Linha ativa (sendo tratada pelo agente) */
.table tr.active {
  background: var(--color-brand-50);
  border-left: 2px solid var(--color-brand-500);
}

/* Linha excluída */
.table tr.excluded td {
  color: var(--color-gray-300);
  text-decoration: line-through;
}

/* Linha crítica — top emissores */
.table tr.top-emitter td:first-child {
  border-left: 2px solid var(--color-brand-500);
}
```

**Colunas — Tabela de Itens:**

| Coluna | Largura | Alinhamento | Notas |
|---|---|---|---|
| CostCode | 150px | esquerda | font-mono, gray-500 |
| Descrição | auto | esquerda | book (400) |
| Tipo | 72px | centro | badge colorido |
| Und | 56px | centro | |
| Qtd | 100px | direita | mono |
| Classe | 56px | centro | A bold, B/C suave |
| Status EPD | 120px | centro | badge status |
| tCO₂e | 100px | direita | mono, bold |
| Ações | 48px | centro | ghost icons |

---

### 7.7 Alert / Banner

```css
.alert {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-family: var(--font-brand);
  font-size: var(--text-sm);
  font-weight: 400;
  border: 1px solid;
}

/* Brand ZNIT — informações positivas / progresso */
.alert-brand {
  background: var(--color-brand-50);
  border-color: var(--color-brand-300);
  color: var(--color-type-a-text);
}
.alert-warning {
  background: var(--color-warning-bg);
  border-color: var(--color-warning-border);
  color: var(--color-warning-text);
}
.alert-error {
  background: var(--color-error-bg);
  border-color: var(--color-error-border);
  color: var(--color-error-text);
}
.alert-info {
  background: var(--color-info-bg);
  border-color: var(--color-info-border);
  color: var(--color-info-text);
}

.alert-icon  { flex-shrink: 0; width: 16px; height: 16px; margin-top: 1px; }
.alert-title { font-weight: 500; margin-bottom: 2px; }  /* Medium */
```

---

### 7.8 Sidebar

```css
.sidebar {
  width: 220px;
  height: 100vh;
  background: var(--color-bg-section);
  border-right: 1px solid var(--color-gray-300);
  padding: var(--space-4) 0;
  display: flex;
  flex-direction: column;
}

/* Logo ZNIT na sidebar */
.sidebar-logo {
  padding: var(--space-3) var(--space-5);
  margin-bottom: var(--space-4);
}

/* Divisor de seção */
.sidebar-section-label {
  padding: var(--space-2) var(--space-5);
  font-family: var(--font-brand);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-gray-300);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-top: var(--space-3);
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-5);
  font-family: var(--font-brand);
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--color-gray-500);
  text-decoration: none;
  transition: background 100ms ease, color 100ms ease;
}
.sidebar-item:hover {
  background: rgba(86,183,165,0.08);  /* brand-500 translúcido */
  color: var(--color-gray-700);
}
.sidebar-item.active {
  background: white;
  color: var(--color-brand-500);
  font-weight: 500;
  border-right: 2px solid var(--color-brand-500);
}
.sidebar-item .icon {
  width: 16px;
  height: 16px;
  opacity: 0.6;
  color: currentColor;
}
.sidebar-item.active .icon { opacity: 1; }
```

---

### 7.9 Chat — Agente de IA

```css
.agent-panel {
  display: grid;
  grid-template-columns: 280px 1fr;
  height: 100%;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

/* Lista de itens pendentes */
.pending-list {
  background: var(--color-bg-section);
  border-right: 1px solid var(--color-gray-300);
  overflow-y: auto;
}
.pending-item {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid rgba(189,189,188,0.5);
  cursor: pointer;
  transition: background 100ms;
}
.pending-item:hover  { background: rgba(86,183,165,0.06); }
.pending-item.active {
  background: white;
  border-left: 2px solid var(--color-brand-500);
}
.pending-item-code { font-size: var(--text-xs); font-family: var(--font-mono); color: var(--color-gray-500); }
.pending-item-desc { font-size: var(--text-sm); font-weight: 500; color: var(--color-black); margin: 2px 0; }
.pending-item-meta { display: flex; gap: var(--space-2); align-items: center; }

/* Área de conversa */
.chat-area { display: flex; flex-direction: column; background: white; }
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* Mensagem do agente */
.msg-agent {
  max-width: 85%;
  background: var(--color-brand-50);
  border: 1px solid var(--color-brand-300);
  border-radius: 0 var(--radius-lg) var(--radius-lg) var(--radius-lg);
  padding: var(--space-4);
  font-family: var(--font-brand);
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--color-gray-700);
  line-height: var(--leading-relaxed);
}

/* Mensagem do usuário */
.msg-user {
  max-width: 75%;
  align-self: flex-end;
  background: var(--color-black);
  color: white;
  border-radius: var(--radius-lg) 0 var(--radius-lg) var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-brand);
  font-size: var(--text-sm);
  font-weight: 400;
  line-height: var(--leading-snug);
}

/* Action card — proposta de decisão do agente */
.action-card {
  border: 1px solid var(--color-brand-300);
  background: white;
  border-radius: var(--radius-md);
  padding: var(--space-4);
  margin-top: var(--space-3);
}
.action-card-label {
  font-size: var(--text-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-brand-500);
  margin-bottom: var(--space-2);
}
.action-card-body   { font-size: var(--text-sm); color: var(--color-gray-700); margin-bottom: var(--space-3); }
.action-card-footer { display: flex; gap: var(--space-2); }

/* Quick-replies */
.quick-replies { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }
.quick-reply {
  padding: 5px 12px;
  font-family: var(--font-brand);
  font-size: var(--text-xs);
  font-weight: 500;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-full);
  background: white;
  color: var(--color-gray-500);
  cursor: pointer;
  transition: border-color 100ms, color 100ms, background 100ms;
}
.quick-reply:hover {
  border-color: var(--color-brand-500);
  color: var(--color-brand-500);
  background: var(--color-brand-50);
}

/* Input do chat */
.chat-input-area {
  padding: var(--space-4);
  border-top: 1px solid var(--color-gray-300);
  display: flex;
  gap: var(--space-2);
}
```

---

### 7.10 File Dropzone

```css
.dropzone {
  border: 2px dashed var(--color-gray-300);
  border-radius: var(--radius-lg);
  padding: var(--space-12) var(--space-8);
  text-align: center;
  cursor: pointer;
  background: white;
  transition: border-color 150ms ease, background 150ms ease;
}
.dropzone:hover,
.dropzone.dragging {
  border-color: var(--color-brand-500);
  background: var(--color-brand-50);
}
.dropzone-icon   { color: var(--color-gray-300); margin-bottom: var(--space-3); }
.dropzone-label  { font-family: var(--font-brand); font-size: var(--text-base); font-weight: 500; color: var(--color-gray-700); }
.dropzone-hint   { font-size: var(--text-sm); font-weight: 400; color: var(--color-gray-500); margin-top: var(--space-1); }
.dropzone-formats{ font-size: var(--text-xs); color: var(--color-gray-300); margin-top: var(--space-2); }
```

---

## 8. Layout da Aplicação

```
┌──────────────────────────────────────────────────────────────────┐
│  Sidebar (220px, fixed) — fundo #F7F7F7                         │
│  ┌──────────────────┐  │  Main Content Area                     │
│  │  [Logo ZNIT]     │  │  ┌─ TopBar (56px, sticky) ──────────┐ │
│  │                  │  │  │ Breadcrumb           Avatar       │ │
│  │  PROJETOS        │  │  └────────────────────────────────────┘ │
│  │  > Raízen ← ativo│  │                                        │
│  │    Outro projeto │  │  ┌─ Page Content ─────────────────────┐ │
│  │                  │  │  │  padding: 32px 40px                │ │
│  │  BIBLIOTECA      │  │  │  max-width: 1200px                 │ │
│  │  Configurações   │  │  │                                    │ │
│  └──────────────────┘  │  └────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Grid de KPIs

```css
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}
@media (max-width: 900px) {
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
}
```

---

## 9. Tailwind Config

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* ZNIT Brand — Branding Book */
        brand: {
          500: '#56B7A5',
          400: '#81C8B9',
          300: '#A9D7CD',
          50:  '#E6F3EE',
          hover:  '#4AA595',
          active: '#3F9283',
        },
        /* Neutros ZNIT */
        znit: {
          black:  '#030304',
          700:    '#404040',
          500:    '#808181',
          300:    '#BDBDBC',
          white:  '#FFFFFF',
        },
      },
      fontFamily: {
        brand: ['Gotham', 'Nunito Sans', 'Helvetica Neue', 'sans-serif'],
        mono:  ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'xs':   ['11px', { lineHeight: '1.5',  letterSpacing: '0em' }],
        'sm':   ['13px', { lineHeight: '1.5',  letterSpacing: '0em' }],
        'base': ['15px', { lineHeight: '1.6',  letterSpacing: '0em' }],
        'lg':   ['18px', { lineHeight: '1.4',  letterSpacing: '0em' }],
        'xl':   ['22px', { lineHeight: '1.3',  letterSpacing: '-0.02em' }],
        '2xl':  ['28px', { lineHeight: '1.2',  letterSpacing: '-0.02em' }],
        '3xl':  ['36px', { lineHeight: '1.1',  letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
      },
      boxShadow: {
        'xs': '0 1px 2px rgba(3,3,4,0.05)',
        'sm': '0 1px 3px rgba(3,3,4,0.08), 0 1px 2px rgba(3,3,4,0.04)',
        'md': '0 4px 6px rgba(3,3,4,0.07), 0 2px 4px rgba(3,3,4,0.04)',
        'lg': '0 10px 15px rgba(3,3,4,0.08), 0 4px 6px rgba(3,3,4,0.04)',
      },
    },
  },
  plugins: [],
}

export default config
```

---

## 10. shadcn/ui — Overrides por Componente

```bash
npx shadcn-ui@latest add button badge input card table dialog
npx shadcn-ui@latest add dropdown-menu tabs alert tooltip separator
npx shadcn-ui@latest add progress skeleton
```

| Componente | Override principal |
|---|---|
| `button` | Variante primary usa `brand-500`, ring de focus `brand-500/20` |
| `badge` | Adicionar variantes `type-a` → `type-f` e `class-a/b/c` |
| `input` | Focus: `border-brand-500 + ring brand-500/15` |
| `card` | `border-znit-300 shadow-xs`, variante `card-brand` com `border-t-brand-500` |
| `table` | Header `bg-znit-bg` uppercase 11px, hover `bg-brand-50` |
| `dialog` | Overlay `rgba(3,3,4,0.5)`, radius `lg`, shadow `lg` |

---

## 11. Iconografia

**Biblioteca:** `lucide-react` — consistente com shadcn/ui.

**Cor dos ícones:** sempre herda `currentColor`. Em repouso usa `gray-500`, no hover e ativo usa `brand-500`.

**Tamanhos:** 14px (botões) | 16px (tabelas, sidebar) | 20px (alertas) | 40px (empty states)
**Stroke-width:** 1.5 por padrão | 1 para ícones decorativos grandes

| Contexto | Ícone |
|---|---|
| Upload | `Upload`, `FileSpreadsheet` |
| Agente ZNIT | `Bot`, `Sparkles` |
| Cenários | `GitBranch`, `Layers` |
| Carbono / Emissões | `Leaf`, `Wind`, `Factory` |
| Alerta agrupado | `AlertTriangle` |
| Risco dupla contagem | `AlertOctagon` |
| Exportar | `Download`, `FileDown` |
| Configurações | `Settings`, `SlidersHorizontal` |
| Usuários | `Users`, `UserPlus` |
| Biblioteca | `BookOpen`, `Library` |
| Status OK / resolvido | `CheckCircle2` |
| Bloqueado | `Lock` |
| Equipamento | `Truck`, `Wrench` |
| Tela vazia | contexto específico + `ghost` de 40px |

---

## 12. Motion

```css
:root {
  --duration-fast:   100ms;
  --duration-normal: 150ms;
  --duration-slow:   250ms;
  --ease-out:        cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Mensagens do agente aparecem progressivamente */
.msg-agent { animation: fade-in-up var(--duration-normal) var(--ease-out); }

/* Skeleton — cor brand-50 */
@keyframes shimmer {
  from { background-position: -200% 0; }
  to   { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-gray-300) 25%,
    var(--color-brand-50) 50%,
    var(--color-gray-300) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}
```

---

## 13. Estados Vazios

```
[Ícone 40px — brand-300]
Título  (18px, font-weight 500, gray-700)      ← 12px gap
Descrição (14px, gray-500, max-w-360, center)  ← 20px gap
[btn-primary ou btn-outline-brand]             ← quando há ação disponível
```

Fundo dos empty states: `brand-50` no container, ícone em `brand-300`.

---

## 14. Notas de Implementação

### Gotham vs Fallback
- **Desenvolvimento:** usar `Nunito Sans` do Google Fonts como substituto visual
- **Produção:** integrar arquivos Gotham originais via `@font-face` com os arquivos licenciados pela ZNIT
- A troca de fonte não altera nenhuma medida de espaçamento pois ambas têm métricas similares

### Logo ZNIT
- Utilizar apenas os arquivos originais fornecidos pela ZNIT (Branding Book p.6)
- Na sidebar: versão horizontal sobre fundo `#F7F7F7`
- Jamais reconstruir ou distorcer a marca
- Área de proteção: 5% da largura do logotipo em todos os lados (Branding Book p.9)

### Cor Teal vs Verde
- O verde genérico de sustentabilidade (`#16A34A`) foi **substituído** pelo teal ZNIT (`#56B7A5`)
- Esta é uma diferenciação intencional: a ZNIT não é "mais um produto verde"
- O teal comunica tecnologia + natureza de forma única
