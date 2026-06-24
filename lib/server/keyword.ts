/**
 * Normalização de keyword para Factor Rules.
 *
 * Usada em DOIS pontos que PRECISAM concordar, senão a regra nunca casa:
 *  1. Ao SALVAR a regra (`POST /api/factor-rules`, action-applier do agente):
 *     `match_keyword = normalizeKeyword(original_description)`.
 *  2. Ao APLICAR a regra (`autoMatchItem`, prioridade 0): a descrição do item
 *     é normalizada com a MESMA função e comparada via `descNorm.includes(keyword)`.
 *
 * Bug que isto corrige: o salvamento trocava pontuação por espaço
 * ("ACO CA-50 - BITOLA MEDIA" → "aco ca 50 bitola media"), mas o match em
 * runtime só removia acento e MANTINHA a pontuação ("aco ca-50 - bitola
 * media"). O `includes` então falhava — a regra não casava nem com o próprio
 * item de origem. Centralizar a normalização garante simetria.
 */
export function normalizeKeyword(text: string | null | undefined): string {
  let t = (text ?? "").toLowerCase().trim();
  // Remove acentos
  t = t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  // Troca tudo que não é alfanumérico/espaço por espaço (hífen, barra, etc.)
  t = t.replace(/[^a-z0-9\s]/g, " ");
  // Colapsa espaços
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
