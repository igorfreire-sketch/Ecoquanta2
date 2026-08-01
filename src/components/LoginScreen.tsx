import React from 'react';

export interface AuthUser {
  nome: string;
  email: string;
  role: string;
  disciplina: string;
  disciplinas?: string[];
  contrato: string;
  status: string;
  abas: string[];
  isAdmin: boolean;
  onlyThirdParty?: boolean;
  online?: boolean;
  sessionVersion?: string;
}

interface LoginScreenProps {
  onGoogleLogin: (rememberMe: boolean) => Promise<void>;
}

export default function LoginScreen({ onGoogleLogin }: LoginScreenProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [rememberMe, setRememberMe] = React.useState(true);

  const entrarComGoogle = async () => {
    setLoading(true);
    setError('');
    try {
      await onGoogleLogin(rememberMe);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro ao processar a solicitação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-['Montserrat'] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-[1160px] grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] bg-white border border-[#E5E7EB] rounded-[28px] shadow-sm overflow-hidden">
        <div className="bg-white p-10 lg:p-14 flex flex-col justify-between">
          <div>
            <img
              src="https://i.imgur.com/Net1yEQ.png"
              alt="QUANTA Logo"
              className="h-11 object-contain"
              referrerPolicy="no-referrer"
            />

            <div className="mt-14 max-w-[520px]">
              <p className="text-[11px] font-medium text-[#757575] uppercase tracking-[1.5px]">
                Acesso ao ecossistema
              </p>
              <h1 className="text-[34px] leading-tight font-bold text-[#2D2D2D] mt-3">
                Bem-vindo ao EcoQuanta.
              </h1>
              <p className="text-[15px] text-[#757575] mt-5 leading-relaxed">
                Grandes obras não nascem de mãos solitárias, nascem da força de quem constrói junto.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10 max-w-[560px]">
              <FeatureCard
                title="Conta Google corporativa"
                text="Entre com a conta Google já cadastrada no EcoQuanta. Novo acesso é liberado por um administrador."
              />
              <FeatureCard
                title="Sessão persistente"
                text="Com Manter logado, o acesso continua salvo até o logout."
              />
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-[#E5E7EB]">
            <p className="text-[12px] text-[#757575]">
              EcoQuanta • Ecossistema interno Quanta Consultoria
            </p>
          </div>
        </div>

        <div className="bg-[#F9FAFB] border-l border-[#E5E7EB] p-8 lg:p-10 flex items-center">
          <div className="w-full bg-white border border-[#E5E7EB] rounded-[24px] p-7 lg:p-8 shadow-sm space-y-5">
            <HeaderTitle
              title="Acessar plataforma"
              subtitle="Entre com sua conta Google corporativa."
            />

            {error && (
              <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] font-medium text-[#B91C1C]">
                {error}
              </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 accent-[#F05D28]"
              />
              <span className="text-[13px] font-medium text-[#2D2D2D]">
                Manter logado até o logout
              </span>
            </label>

            <button
              type="button"
              disabled={loading}
              onClick={() => void entrarComGoogle()}
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-[#E5E7EB] bg-white py-3 text-[14px] font-semibold text-[#2D2D2D] hover:bg-[#F9FAFB] disabled:opacity-60"
            >
              <GoogleIcon />
              Entrar com Google
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeaderTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-1">
      <h2 className="text-[22px] font-bold text-[#2D2D2D]">{title}</h2>
      <p className="text-[13px] text-[#757575] mt-2 leading-relaxed">{subtitle}</p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

function FeatureCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-5">
      <h3 className="text-[15px] font-bold text-[#2D2D2D]">{title}</h3>
      <p className="text-[13px] text-[#757575] mt-2 leading-relaxed">{text}</p>
    </div>
  );
}
