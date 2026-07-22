import React from 'react';
import { AtSign, Clock3, Layers, ShieldCheck } from 'lucide-react';
import { getDisciplineDisplayName } from './Atividades';
import type { AuthUser } from './LoginScreen';

interface PrincipalProps {
  currentUser: AuthUser;
  citadasDisciplina: number;
  citadasVoce: number;
  onVerDisciplina: () => void;
  onVerCitado: () => void;
}

function Dado({ icone, rotulo, valor }: { icone: React.ReactNode; rotulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 text-[#94A3B8]">
        {icone}
        <p className="text-[10px] font-extrabold uppercase tracking-[0.7px]">{rotulo}</p>
      </div>
      <p className="mt-1 truncate text-[15px] font-black text-[#2D2D2D]" title={valor}>{valor || '—'}</p>
    </div>
  );
}

export default function Principal({
  currentUser, citadasDisciplina, citadasVoce, onVerDisciplina, onVerCitado,
}: PrincipalProps) {
  const aprovado = String(currentUser.status || '').trim().toLowerCase() !== 'pending';
  const primeiroNome = (currentUser.nome || '').trim().split(/\s+/)[0] || 'Bem-vindo';
  const disciplina = (currentUser.disciplinas && currentUser.disciplinas.length > 0
    ? currentUser.disciplinas.map((item) => getDisciplineDisplayName(item)).join(', ')
    : getDisciplineDisplayName(currentUser.disciplina)) || 'Sem disciplina';

  return (
    <div className="relative min-h-[calc(100vh-160px)] overflow-hidden rounded-[34px] border border-[#E5E7EB] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)]">
      {/* Logo de fundo: decorativa, nao clicavel e fora do leitor de tela. */}
      <img
        src="https://i.imgur.com/Net1yEQ.png"
        alt=""
        aria-hidden
        referrerPolicy="no-referrer"
        className="pointer-events-none absolute left-1/2 top-1/2 w-[min(46%,460px)] -translate-x-1/2 -translate-y-1/2 select-none opacity-90"
      />

      <div className="relative flex flex-col items-center justify-center px-6 py-14">
        {!aprovado ? (
          <div className="w-full max-w-lg rounded-3xl border border-[#FED7AA] bg-[#FFF7ED] px-8 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFE7D9] text-[#B45309]">
              <Clock3 size={26} />
            </div>
            <h2 className="mt-4 text-[20px] font-black text-[#B45309]">Pendente de aprovação</h2>
            <p className="mt-2 text-[13px] font-medium text-[#92400E]">
              Seu cadastro foi recebido e está aguardando a liberação de um administrador.
              Assim que for aprovado, seus dados e as áreas do sistema aparecem aqui.
            </p>
          </div>
        ) : (
          <>
            <p className="text-[11px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">EcoQuanta</p>
            <h2 className="mt-1 text-center text-[30px] font-black leading-tight text-[#2D2D2D]">
              Olá, {primeiroNome}
            </h2>

            <div className="mt-7 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
              <Dado icone={<Layers size={12} />} rotulo="Disciplina" valor={disciplina} />
              <Dado icone={<ShieldCheck size={12} />} rotulo="Contrato" valor={currentUser.contrato} />
              <Dado icone={<AtSign size={12} />} rotulo="Status" valor={currentUser.role} />
            </div>

            {/* Duas contagens, numero grande primeiro: da pra ler de relance sem abrir nada. */}
            <div className="mt-4 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={onVerDisciplina}
                className="group flex items-center gap-4 rounded-2xl border border-[#E5E7EB] bg-white px-5 py-4 text-left transition-colors hover:border-[#F7C7B7] hover:bg-white"
              >
                <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-[#FFF3EC] text-[22px] font-black text-[#F05D28]">
                  {citadasDisciplina}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-black text-[#2D2D2D]">Notas da sua disciplina</span>
                  <span className="block text-[12px] font-medium text-[#94A3B8]">
                    {citadasDisciplina === 0 ? 'Nada novo por aqui' : 'Publicadas por quem divide a disciplina com você'}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={onVerCitado}
                className="group flex items-center gap-4 rounded-2xl border border-[#E5E7EB] bg-white px-5 py-4 text-left transition-colors hover:border-[#F7C7B7] hover:bg-white"
              >
                <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-[#FFF3EC] text-[22px] font-black text-[#F05D28]">
                  {citadasVoce}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-black text-[#2D2D2D]">Notas que citam você</span>
                  <span className="block text-[12px] font-medium text-[#94A3B8]">
                    {citadasVoce === 0 ? 'Ninguém te marcou ainda' : 'Você foi vinculado nessas notas'}
                  </span>
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
