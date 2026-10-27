/**
 * Reconcilia memberships do Clerk (fonte da verdade) com public.users.
 *
 * O webhook organizationMembership.created falhava silenciosamente em
 * inserir a 2ª org de um mesmo usuário enquanto a constraint antiga
 * UNIQUE(clerk_user_id) existia (removida na migration-v7). O Clerk não
 * re-dispara eventos antigos, então toda membership criada nesse período
 * ficou sem linha em public.users — e getCurrentUser() falha pra esse
 * (usuário, org), deixando o app vazio pra pessoa naquela organização.
 *
 * Para cada company com clerk_org_id, busca a lista real de membros no
 * Clerk e cria as linhas que faltam (mesma lógica do webhook: role
 * org:admin → admin, senão analyst). Não altera linhas existentes.
 * Idempotente — seguro re-rodar sempre que suspeitar de dessincronização.
 *
 * Uso:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/sync-clerk-memberships.ts
 */
import { clerkClient } from "@clerk/nextjs/server";
import { supabase } from "../lib/server/supabase";

async function main() {
  const client = await clerkClient();

  const { data: companies, error: companiesErr } = await supabase
    .from("companies")
    .select("id, name, clerk_org_id")
    .not("clerk_org_id", "is", null);
  if (companiesErr) throw new Error(`fetch companies: ${companiesErr.message}`);

  let created = 0, existing = 0, failed = 0;

  for (const company of companies ?? []) {
    const orgId = company.clerk_org_id as string;
    let memberships;
    try {
      memberships = await client.organizations.getOrganizationMembershipList({
        organizationId: orgId,
        limit: 100,
      });
    } catch (e) {
      console.warn(`[${company.name}] falha ao listar membros no Clerk: ${e instanceof Error ? e.message : e}`);
      failed++;
      continue;
    }

    for (const m of memberships.data) {
      const pud = m.publicUserData;
      const clerkUserId = pud?.userId;
      if (!clerkUserId) continue;

      const { data: row } = await supabase
        .from("users")
        .select("id")
        .eq("clerk_user_id", clerkUserId)
        .eq("clerk_org_id", orgId)
        .maybeSingle();
      if (row) { existing++; continue; }

      const email = pud?.identifier ?? "";
      const name = [pud?.firstName, pud?.lastName].filter(Boolean).join(" ") || email || "Usuário";
      const role = m.role === "org:admin" ? "admin" : "analyst";

      const { error } = await supabase.from("users").insert({
        clerk_user_id: clerkUserId,
        clerk_org_id: orgId,
        company_id: company.id,
        email,
        name,
        role,
        is_active: true,
      });
      if (error) {
        console.warn(`[${company.name}] falha ao inserir ${email}: ${error.message}`);
        failed++;
        continue;
      }
      created++;
      console.log(`[${company.name}] criado: ${email} (${role})`);
    }
  }

  console.log(`\nTotal: criadas ${created} | já existiam ${existing} | falhas ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
