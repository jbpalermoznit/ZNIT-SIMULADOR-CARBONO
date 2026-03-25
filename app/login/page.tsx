"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Leaf, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { login } from "@/lib/api/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("joao@znit.io");
  const [password, setPassword] = useState("demo1234");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (e: any) {
      setError(e.message ?? "Erro ao autenticar");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAF9] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-[#56B7A5] rounded-xl flex items-center justify-center mb-4 shadow-[0_4px_16px_rgba(86,183,165,0.3)]">
            <Leaf size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#030304]">ZNIT</h1>
          <p className="text-sm text-[#808181] mt-0.5">Calculadora de Carbono</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-[#E0E4E3] shadow-[0_4px_24px_rgba(3,3,4,0.06)] p-7">
          <h2 className="text-lg font-bold text-[#030304] mb-1">Bem-vindo de volta</h2>
          <p className="text-sm text-[#808181] mb-6">
            Acesse sua conta para continuar
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] bg-[#F8FAF9] placeholder:text-[#BDBDBC] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#404040] mb-1.5">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-10 px-3 pr-10 rounded-lg border border-[#E0E4E3] text-sm text-[#030304] bg-[#F8FAF9] placeholder:text-[#BDBDBC] focus:outline-none focus:border-[#56B7A5] focus:bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#808181] hover:text-[#404040]"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-[#808181] cursor-pointer">
                <input type="checkbox" className="w-3.5 h-3.5 accent-[#56B7A5]" defaultChecked />
                Lembrar acesso
              </label>
              <button className="text-xs text-[#56B7A5] font-semibold hover:text-[#3EA08E]">
                Esqueci a senha
              </button>
            </div>

            {error && (
              <p className="text-xs text-[#DC2626] bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-[#808181] mt-6">
          Piloto ZNIT · NDA Assinado · 90 dias
        </p>
      </div>
    </div>
  );
}
