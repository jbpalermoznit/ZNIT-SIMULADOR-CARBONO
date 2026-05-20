import Link from "next/link";
import { Leaf } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F8FAF9] flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-[#56B7A5] rounded-xl flex items-center justify-center mb-4">
            <Leaf size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#030304]">404</h1>
          <p className="text-sm text-[#808181] mt-1">Página não encontrada</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E0E4E3] p-6">
          <p className="text-sm text-[#404040] mb-4">
            O endereço que você acessou não existe ou foi removido.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center w-full h-10 bg-[#56B7A5] text-white text-sm font-semibold rounded-lg hover:bg-[#3EA08E] transition-colors"
          >
            Voltar para o início
          </Link>
        </div>
      </div>
    </div>
  );
}
