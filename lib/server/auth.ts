/**
 * Auth service — Clerk + Supabase lookup.
 *
 * Clerk owns identity (signin/signup/sessions). We mirror users + companies
 * into our public schema via the webhook (/api/webhooks/clerk) so the rest of
 * the app continues to query a single source of truth keyed by the local
 * `user.id` / `company.id`.
 */
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabase } from "./supabase";

export interface AuthUser {
  id: string;
  company_id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  clerk_user_id: string;
  clerk_org_id: string;
}

/**
 * Resolve the current request's Clerk session into our local user record.
 *
 * Throws when:
 * - no Clerk session (not signed in)
 * - signed in but no active Organization (caller is mid-onboarding)
 * - signed in but no matching row in public.users (webhook hasn't fired yet,
 *   or the user was deleted)
 */
export async function getCurrentUser(_req?: NextRequest): Promise<AuthUser> {
  const { userId, orgId } = await auth();

  if (!userId) throw new Error("Autenticação necessária");
  if (!orgId) throw new Error("Usuário sem organização ativa");

  const { data: user, error } = await supabase
    .from("users")
    .select("id, company_id, name, email, role, is_active, clerk_user_id, clerk_org_id")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  if (error || !user || !user.is_active) {
    throw new Error("Usuário não encontrado ou inativo");
  }

  return user as AuthUser;
}

/** 401 helper to keep route handlers terse */
export function unauthorized(message = "Autenticação necessária") {
  return Response.json({ detail: message }, { status: 401 });
}

/** 403 helper for authenticated-but-not-authorized (e.g. admin-only routes) */
export function forbidden(message = "Acesso restrito a administradores") {
  return Response.json({ detail: message }, { status: 403 });
}
