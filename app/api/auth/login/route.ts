import { NextRequest } from "next/server";
import { verifyPassword, createAccessToken } from "@/lib/server/auth";
import { supabase } from "@/lib/server/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return Response.json(
        { detail: "Email e senha são obrigatórios" },
        { status: 400 }
      );
    }

    // Look up user by email
    const { data: user, error } = await supabase
      .from("users")
      .select("id, company_id, name, email, role, is_active, hashed_password")
      .eq("email", email)
      .single();

    if (error || !user || !verifyPassword(password, user.hashed_password)) {
      return Response.json(
        { detail: "Credenciais inválidas" },
        { status: 401 }
      );
    }

    if (!user.is_active) {
      return Response.json({ detail: "Usuário inativo" }, { status: 403 });
    }

    const token = await createAccessToken({
      sub: user.id,
      company_id: user.company_id,
    });

    return Response.json({
      access_token: token,
      user_id: user.id,
      user_name: user.name,
      company_id: user.company_id,
      role: user.role,
    });
  } catch (err) {
    console.error("Login error:", err);
    return Response.json({ detail: "Erro interno" }, { status: 500 });
  }
}
