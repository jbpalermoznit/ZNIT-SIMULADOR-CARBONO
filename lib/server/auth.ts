/**
 * Auth service — JWT + bcrypt. Replaces backend/app/core/auth.py
 */
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { supabase } from "./supabase";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "change-me"
);
const JWT_EXPIRE_MINUTES = Number(process.env.JWT_EXPIRE_MINUTES ?? "60");
const ALGORITHM = "HS256";

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(plain: string, hashed: string): boolean {
  return bcrypt.compareSync(plain, hashed);
}

export async function createAccessToken(data: Record<string, unknown>): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + JWT_EXPIRE_MINUTES * 60;
  return new SignJWT({ ...data, exp })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .sign(JWT_SECRET);
}

export async function decodeToken(token: string): Promise<Record<string, unknown>> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: [ALGORITHM],
    });
    return payload as Record<string, unknown>;
  } catch {
    throw new Error("Token inválido ou expirado");
  }
}

export interface AuthUser {
  id: string;
  company_id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
}

/**
 * Extracts and validates the JWT from the request, returns the user.
 * Throws on auth failure.
 */
export async function getCurrentUser(req: NextRequest): Promise<AuthUser> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Autenticação necessária");
  }

  const token = authHeader.slice(7);
  const payload = await decodeToken(token);
  const userId = payload.sub as string | undefined;

  if (!userId) throw new Error("Token inválido");

  const { data: user, error } = await supabase
    .from("users")
    .select("id, company_id, name, email, role, is_active")
    .eq("id", userId)
    .single();

  if (error || !user || !user.is_active) {
    throw new Error("Usuário não encontrado");
  }

  return user as AuthUser;
}

/** Helper to return a 401 JSON response */
export function unauthorized(message = "Autenticação necessária") {
  return Response.json({ detail: message }, { status: 401 });
}
