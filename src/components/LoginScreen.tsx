import React from 'react';
import { Mail, LockKeyhole, User, KeyRound, ArrowRight } from 'lucide-react';

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

type AuthMode = 'login' | 'register' | 'reset';

interface LoginScreenProps {
  onLogin: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  onRegister: (name: string, email: string, password: string) => Promise<string>;
  onForgotPassword: (email: string) => Promise<string>;
  onResetPassword: (email: string, code: string, newPassword: string) => Promise<string>;
}

export default function LoginScreen({
  onLogin,
  onRegister,
  onForgotPassword,
  onResetPassword,
}: LoginScreenProps) {
  const [mode, setMode] = React.useState<AuthMode>('login');
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');

  const [loginEmail, setLoginEmail] = React.useState('');
  const [loginPassword, setLoginPassword] = React.useState('');
  const [rememberMe, setRememberMe] = React.useState(true);

  const [registerName, setRegisterName] = React.useState('');
  const [registerEmail, setRegisterEmail] = React.useState('');
  const [registerPassword, setRegisterPassword] = React.useState('');

  const [resetEmail, setResetEmail] = React.useState('');
  const [resetCode, setResetCode] = React.useState('');
  const [resetPassword, setResetPasswordValue] = React.useState('');
  // Codigo e nova senha so destravam depois que o e-mail com o codigo sai.
  const [codigoEnviado, setCodigoEnviado] = React.useState(false);

  const clearFeedback = () => {
    setMessage('');
    setError('');
  };

  const switchMode = (nextMode: AuthMode) => {
    clearFeedback();
    setMode(nextMode);
  };

  const runAction = async (callback: () => Promise<void>) => {
    setLoading(true);
    clearFeedback();

    try {
      await callback();
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Ocorreu um erro ao processar a solicitação.';
      setError(errorMessage);
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
                title="E-mail corporativo"
                text="Contas @quantaconsultoria.com têm acesso imediato. Demais domínios aguardam aprovação do administrador."
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

        <div className="bg-[#F9FAFB] border-l border-[#E5E7EB] p-8 lg:p-10">
          <div className="bg-white border border-[#E5E7EB] rounded-[24px] p-7 lg:p-8 shadow-sm">
            <div className="flex flex-wrap gap-2 mb-8">
              <ModeButton active={mode === 'login'} onClick={() => switchMode('login')}>
                Entrar
              </ModeButton>
              <ModeButton active={mode === 'register'} onClick={() => switchMode('register')}>
                Cadastrar
              </ModeButton>
              <ModeButton active={mode === 'reset'} onClick={() => switchMode('reset')}>
                Esqueci a senha
              </ModeButton>
            </div>

            {message && (
              <div className="mb-5 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-3 text-[13px] font-medium text-[#047857]">
                {message}
              </div>
            )}

            {error && (
              <div className="mb-5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] font-medium text-[#B91C1C]">
                {error}
              </div>
            )}

            {mode === 'login' && (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void runAction(async () => {
                    await onLogin(loginEmail, loginPassword, rememberMe);
                  });
                }}
              >
                <HeaderTitle
                  title="Acessar plataforma"
                  subtitle="Entre com seu e-mail e sua senha."
                />

                <InputGroup label="E-mail" icon={<Mail size={18} className="text-[#757575]" />}>
                  <input
                    className="bentham-input !pl-11"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="nome@empresa.com"
                    required
                  />
                </InputGroup>

                <InputGroup label="Senha" icon={<LockKeyhole size={18} className="text-[#757575]" />}>
                  <input
                    className="bentham-input !pl-11"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    required
                  />
                </InputGroup>

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

                <PrimaryButton loading={loading}>Entrar no sistema</PrimaryButton>
              </form>
            )}

            {mode === 'register' && (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void runAction(async () => {
                    const msg = await onRegister(registerName, registerEmail, registerPassword);
                    setMessage(msg);
                    setRegisterName('');
                    setRegisterEmail('');
                    setRegisterPassword('');
                  });
                }}
              >
                <HeaderTitle
                  title="Solicitar acesso"
                  subtitle="Seu cadastro ficará pendente até aprovação de um administrador."
                />

                <InputGroup label="Nome completo" icon={<User size={18} className="text-[#757575]" />}>
                  <input
                    className="bentham-input !pl-11"
                    type="text"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    placeholder="Nome completo"
                    required
                  />
                </InputGroup>

                <InputGroup label="E-mail" icon={<Mail size={18} className="text-[#757575]" />}>
                  <input
                    className="bentham-input !pl-11"
                    type="email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    placeholder="nome@empresa.com"
                    required
                  />
                </InputGroup>

                <InputGroup label="Senha" icon={<LockKeyhole size={18} className="text-[#757575]" />}>
                  <input
                    className="bentham-input !pl-11"
                    type="password"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    placeholder="Mínimo de 6 caracteres"
                    required
                  />
                </InputGroup>

                <PrimaryButton loading={loading}>Enviar cadastro</PrimaryButton>
              </form>
            )}

            {mode === 'reset' && (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void runAction(async () => {
                    if (!codigoEnviado) {
                      const msg = await onForgotPassword(resetEmail);
                      setCodigoEnviado(true);
                      setMessage(msg);
                      return;
                    }
                    const msg = await onResetPassword(resetEmail, resetCode, resetPassword);
                    setMessage(msg);
                    setResetEmail('');
                    setResetCode('');
                    setResetPasswordValue('');
                    setCodigoEnviado(false);
                    setMode('login');
                  });
                }}
              >
                <HeaderTitle
                  title="Esqueci a senha"
                  subtitle={codigoEnviado
                    ? 'Informe o código que enviamos e defina uma nova senha.'
                    : 'Informe seu e-mail para receber o código de verificação.'}
                />

                <InputGroup label="E-mail" icon={<Mail size={18} className="text-[#757575]" />}>
                  <input
                    className="bentham-input !pl-11"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => { setResetEmail(e.target.value); setCodigoEnviado(false); }}
                    placeholder="nome@empresa.com"
                    required
                  />
                </InputGroup>

                <InputGroup label="Código" icon={<KeyRound size={18} className="text-[#757575]" />}>
                  <input
                    className="bentham-input !pl-11 disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF]"
                    type="text"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder={codigoEnviado ? 'Código de 6 dígitos' : 'Envie o código primeiro'}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    disabled={!codigoEnviado}
                    required={codigoEnviado}
                  />
                </InputGroup>

                <InputGroup label="Nova senha" icon={<LockKeyhole size={18} className="text-[#757575]" />}>
                  <input
                    className="bentham-input !pl-11 disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF]"
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPasswordValue(e.target.value)}
                    placeholder={codigoEnviado ? 'Nova senha' : 'Envie o código primeiro'}
                    minLength={6}
                    autoComplete="new-password"
                    disabled={!codigoEnviado}
                    required={codigoEnviado}
                  />
                </InputGroup>

                <PrimaryButton loading={loading}>
                  {codigoEnviado ? 'Salvar nova senha' : 'Enviar código para o e-mail'}
                </PrimaryButton>
              </form>
            )}
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

function InputGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="bentham-label">{label}</label>
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
          {icon}
        </div>
        {children}
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 px-4 rounded-xl text-[13px] transition-colors ${
        active
          ? 'bg-[#F05D28] text-white font-bold'
          : 'bg-[#F9FAFB] text-[#757575] border border-[#E5E7EB] font-medium hover:text-[#2D2D2D]'
      }`}
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  children,
  loading,
}: {
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full h-12 rounded-xl bg-[#F05D28] text-white text-[14px] font-bold hover:bg-[#D94E1F] transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
    >
      {children}
      {!loading && <ArrowRight size={17} />}
    </button>
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
