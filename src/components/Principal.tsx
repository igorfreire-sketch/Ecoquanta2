import React from 'react';
import { Clock3, ShieldCheck } from 'lucide-react';
import type { AuthUser } from './LoginScreen';

interface PrincipalProps {
  currentUser: AuthUser;
  // Blocos extras da Principal (hoje o Kanban unificado Conformidade + notas): so pra quem ja foi aprovado.
  children?: React.ReactNode;
}

// Superficie unica do sistema: sem borda, so a sombra. Nunca aninhar uma dentro da outra.
const CARTAO = 'rounded-2xl bg-white shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]';

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">{children}</p>;
}

// Dado solto no fundo: sem caixa. O usuario nao quer balao dentro de balao.
// Dado no balao padrao (mesmo dos cartoes de nota): icone opcional pra remover o @ do Status.
function Dado({ icone, rotulo, valor }: { icone?: React.ReactNode; rotulo: string; valor: string }) {
  return (
    <div className={`min-w-0 flex-1 px-5 py-4 ${CARTAO}`}>
      <div className="flex items-center gap-1.5 text-[#94A3B8]">
        {icone}
        <p className="text-[10px] font-extrabold uppercase tracking-[0.7px]">{rotulo}</p>
      </div>
      <p className="mt-0.5 truncate text-[15px] font-black text-[#2D2D2D]" title={valor}>{valor || '—'}</p>
    </div>
  );
}

export default function Principal({ currentUser, children }: PrincipalProps) {
  const aprovado = String(currentUser.status || '').trim().toLowerCase() !== 'pending';
  const primeiroNome = (currentUser.nome || '').trim().split(/\s+/)[0] || 'Bem-vindo';

  if (!aprovado) {
    return (
      <div className={`mx-auto w-full max-w-lg px-8 py-10 text-center ${CARTAO}`}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFE7D9] text-[#B45309]">
          <Clock3 size={26} />
        </div>
        <h2 className="mt-4 text-[20px] font-black text-[#B45309]">Pendente de aprovação</h2>
        <p className="mt-2 text-[13px] font-medium text-[#92400E]">
          Seu cadastro foi recebido e está aguardando a liberação de um administrador.
          Assim que for aprovado, seus dados e as áreas do sistema aparecem aqui.
        </p>
      </div>
    );
  }

  return (
    // Sem cartao envolvendo a pagina: o conteudo assenta direto no fundo, sobre a folha.
    <div className="mx-auto w-full max-w-5xl">
      <Rotulo>EcoQuanta</Rotulo>
      <h2 className="text-[26px] font-black leading-tight text-[#2D2D2D]">Olá, {primeiroNome}</h2>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Dado icone={<ShieldCheck size={12} />} rotulo="Contrato" valor={currentUser.contrato} />
        <Dado rotulo="Status" valor={currentUser.role} />
      </div>

      {children && <div className="mt-7">{children}</div>}
    </div>
  );
}
