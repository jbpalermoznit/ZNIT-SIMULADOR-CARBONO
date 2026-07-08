export interface SeedRow {
  company_id: string;
  match_keyword: string;
  original_description: string;
  factor_value: number;
  factor_unit: string;
  factor_name: string;
  source_tier: string;
  source_description: string;
  created_by: string;
  is_active: boolean;
}

/**
 * Parser mínimo dos VALUES de supabase/seed-factor-rules-v29-htb.sql:
 * divide os campos de cada tupla respeitando strings SQL ('...' com ''
 * de escape). Uma tupla por linha.
 */
export function parseSeedRows(sqlText: string): SeedRow[] {
  const rows: SeedRow[] = [];
  for (const line of sqlText.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("('")) continue;
    const inner = t.replace(/^\(/, "").replace(/\)[,;]?$/, "");
    const fields: string[] = [];
    let cur = "";
    let inStr = false;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (inStr) {
        if (ch === "'" && inner[i + 1] === "'") {
          cur += "'";
          i++;
        } else if (ch === "'") {
          inStr = false;
        } else {
          cur += ch;
        }
      } else if (ch === "'") {
        inStr = true;
      } else if (ch === ",") {
        fields.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    if (fields.length !== 10) {
      throw new Error(`linha do seed com ${fields.length} campos (esperado 10): ${t.slice(0, 80)}`);
    }
    rows.push({
      company_id: fields[0],
      match_keyword: fields[1],
      original_description: fields[2],
      factor_value: parseFloat(fields[3]),
      factor_unit: fields[4],
      factor_name: fields[5],
      source_tier: fields[6],
      source_description: fields[7],
      created_by: fields[8],
      is_active: fields[9].trim() === "true",
    });
  }
  return rows;
}
