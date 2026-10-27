/**
 * Constrói a string de "versão" de um fator de emissão a exibir/exportar —
 * cada fonte versiona de um jeito diferente e a maioria não tem um campo
 * estruturado único. Best-effort por tier; retorna null quando não há nada
 * confiável pra mostrar (nunca inventa uma versão).
 */

export function buildFactorVersion(
  sourceTier: string | null | undefined,
  row: Record<string, unknown> | null | undefined
): string | null {
  if (!row) return null;

  switch (sourceTier) {
    case "ghg_protocol": {
      const versao = row.versao_ghg as string | null;
      const ano = row.ano as number | string | null;
      if (versao) return String(versao);
      if (ano) return String(ano);
      return null;
    }
    case "epd": {
      const validUntil = row.valid_until as string | null;
      const registration = row.registration_date as string | null;
      if (validUntil) return `válido até ${validUntil}`;
      if (registration) return `registrado em ${registration}`;
      return null;
    }
    case "ecoinvent": {
      const start = row.year_start as number | string | null;
      const end = row.year_end as number | string | null;
      if (start && end && String(start) !== String(end)) return `${start}–${end}`;
      if (start) return String(start);
      if (end) return String(end);
      return null;
    }
    case "cecarbon":
      return extractYearFromText(row.Referencia as string | null);
    default:
      return null;
  }
}

/** CECarbon não tem coluna de versão estruturada — só um texto livre em
 *  "Referencia" (ex.: "CECARBON 2024"). Melhor esforço: extrai um ano de
 *  4 dígitos plausível (2000–2099); retorna null se não achar. */
export function extractYearFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/\b(20\d{2})\b/);
  return match ? match[1] : null;
}
