import { Loader2, Leaf } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#F8FAF9] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 bg-[#56B7A5] rounded-xl flex items-center justify-center">
          <Leaf size={24} className="text-white" />
        </div>
        <div className="flex items-center gap-2 text-sm text-[#808181]">
          <Loader2 size={16} className="animate-spin" />
          Carregando…
        </div>
      </div>
    </div>
  );
}
