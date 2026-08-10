/**
 * PostgREST rejects `.in()` filters once the query string grows past its
 * request size limit — a curve with a few hundred+ items silently returns a
 * 400 Bad Request. `chunkArray` splits large id lists so callers can issue
 * several smaller `.in()` requests instead of one that fails.
 */
export const IN_FILTER_CHUNK_SIZE = 150;

export function chunkArray<T>(arr: T[], size: number = IN_FILTER_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
