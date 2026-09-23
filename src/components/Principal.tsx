import React from 'react';
import { Clock3, Pencil, ShieldCheck, X } from 'lucide-react';
import type { AuthUser } from './LoginScreen';

interface PrincipalProps {
  currentUser: AuthUser;
  disciplinas: string[];
  onSaveProfile: (profile: { nome: string; disciplina: string }) => Promise<void>;
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

export default function Principal({ currentUser, disciplinas, onSaveProfile, children }: PrincipalProps) {
  const aprovado = String(currentUser.status || '').trim().toLowerCase() !== 'pending';
  const primeiroNome = (currentUser.nome || '').trim().split(/\s+/)[0] || 'Bem-vindo';
  const [perfilAberto, setPerfilAberto] = React.useState(false);
  const [nome, setNome] = React.useState(currentUser.apelido || currentUser.nome);
  const [disciplina, setDisciplina] = React.useState(currentUser.disciplina);
  const [salvando, setSalvando] = React.useState(false);

  const abrirPerfil = () => {
    setNome(currentUser.apelido || currentUser.nome);
    setDisciplina(currentUser.disciplina);
    setPerfilAberto(true);
  };
  const salvarPerfil = async () => {
    if (!nome.trim() || !disciplina) return;
    setSalvando(true);
    try { await onSaveProfile({ nome: nome.trim(), disciplina }); }
    finally { setSalvando(false); }
  };

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
      <div className="flex items-center gap-2"><h2 className="text-[26px] font-black leading-tight text-[#2D2D2D]">Olá, {primeiroNome}</h2><button type="button" onClick={abrirPerfil} title="Editar meu perfil" className="rounded-full p-1.5 text-[#64748B] hover:bg-[#FFF3EC] hover:text-[#F05D28]"><Pencil size={16} /></button></div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Dado icone={<ShieldCheck size={12} />} rotulo="Contrato" valor={currentUser.contrato} />
        <Dado rotulo="Status" valor={currentUser.role} />
      </div>

      {children && <div className="mt-7">{children}</div>}
      {perfilAberto && <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setPerfilAberto(false)}><form onSubmit={(event) => { event.preventDefault(); void salvarPerfil(); }} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-[17px] font-black text-[#2D2D2D]">Meu perfil</h3><button type="button" onClick={() => setPerfilAberto(false)} aria-label="Fechar" className="rounded-full p-1 text-[#64748B] hover:bg-[#F3F4F6]"><X size={18} /></button></div>
        <label className="mt-4 block text-[12px] font-bold text-[#64748B]">Como quer ser chamado<input autoFocus value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Ex.: Igor ou Igão" maxLength={60} className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-[14px] font-bold text-[#2D2D2D] outline-none focus:border-[#F05D28]" /></label>
        <label className="mt-3 block text-[12px] font-bold text-[#64748B]">Disciplina<select value={disciplina} onChange={(event) => setDisciplina(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-[14px] font-bold text-[#2D2D2D] outline-none focus:border-[#F05D28]">{disciplinas.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <p className="mt-3 text-[11px] text-[#94A3B8]">Seu e-mail continua único e não pode ser alterado. Ao salvar, entre novamente.</p>
        <button disabled={salvando || !nome.trim() || !disciplina} className="mt-4 h-11 w-full rounded-xl bg-[#F05D28] text-[13px] font-bold text-white hover:bg-[#D94E1F] disabled:opacity-60">{salvando ? 'Salvando...' : 'Salvar e sair'}</button>
      </form></div>}
    </div>
  );
}
