import { SignIn } from "@clerk/nextjs";
import { Leaf } from "lucide-react";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#F8FAF9] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-[#56B7A5] rounded-xl flex items-center justify-center mb-4 shadow-[0_4px_16px_rgba(86,183,165,0.3)]">
            <Leaf size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#030304]">ZNIT</h1>
          <p className="text-sm text-[#808181] mt-0.5">Plataforma ESG</p>
        </div>
        <SignIn />
      </div>
    </div>
  );
}
