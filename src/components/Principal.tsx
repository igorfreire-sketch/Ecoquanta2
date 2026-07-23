import React from 'react';
import { Bell, BellOff, Clock3, Eye, ShieldCheck, Sparkles, X } from 'lucide-react';
import { getDisciplineDisplayName } from './Atividades';
import SearchableSelect from './SearchableSelect';
import type { AuthUser } from './LoginScreen';
import type { Acessibilidade } from '../lib/theme';
import type { PermissaoNotificacao } from '../lib/desktopNotify';

interface PrincipalProps {
  currentUser: AuthUser;
  citadasDisciplina: number;
  citadasVoce: number;
  onVerDisciplina: () => void;
  onVerCitado: () => void;
  // Area do usuario: vive aqui no Principal, nao ha mais painel na barra lateral.
  acessibilidade: Acessibilidade;
  onAlternarAcessibilidade: () => void;
  versaoLabel: string;
  onVerNovidades: () => void;
  permissaoNotificacao: PermissaoNotificacao;
  onPedirNotificacao: () => void;
  disciplinasDisponiveis: string[];
  minhasDisciplinas: string[];
  pedidoPendente: string[] | null;
  // Primeira escolha entra direto; as trocas seguintes viram pedido pro admin.
  onDefinirDisciplinas: (disciplinas: string[]) => void;
}

// Superficie unica do sistema: sem borda, so a sombra. Nunca aninhar uma dentro da outra.
const CARTAO = 'rounded-2xl bg-white shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]';

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#94A3B8]">{children}</p>;
}

function Contagem({ valor, titulo, descricao, onClick }: { valor: number; titulo: string; descricao: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-shadow hover:shadow-[0_16px_36px_-20px_rgba(15,23,42,0.5)] ${CARTAO}`}>
      <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#FFF3EC] text-[20px] font-black text-[#F05D28]">
        {valor}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-black text-[#2D2D2D]">{titulo}</span>
        <span className="block truncate text-[12px] font-medium text-[#94A3B8]">{descricao}</span>
      </span>
    </button>
  );
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

function Acao({ icone, titulo, descricao, onClick }: { icone: React.ReactNode; titulo: string; descricao: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-2.5 px-4 py-3 text-left transition-shadow hover:shadow-[0_16px_36px_-20px_rgba(15,23,42,0.5)] ${CARTAO}`}>
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#FFF3EC] text-[#F05D28]">{icone}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-black text-[#2D2D2D]">{titulo}</span>
        <span className="block truncate text-[11px] font-medium text-[#94A3B8]">{descricao}</span>
      </span>
    </button>
  );
}

export default function Principal({
  currentUser, citadasDisciplina, citadasVoce, onVerDisciplina, onVerCitado,
  acessibilidade, onAlternarAcessibilidade, versaoLabel, onVerNovidades,
  permissaoNotificacao, onPedirNotificacao,
  disciplinasDisponiveis, minhasDisciplinas, pedidoPendente, onDefinirDisciplinas,
}: PrincipalProps) {
  const [selecionadas, setSelecionadas] = React.useState<string[]>([]);
  const primeiraEscolha = minhasDisciplinas.length === 0;
  const outrasDisciplinas = disciplinasDisponiveis.filter((item) => !minhasDisciplinas.includes(item));
  const aprovado = String(currentUser.status || '').trim().toLowerCase() !== 'pending';
  const primeiroNome = (currentUser.nome || '').trim().split(/\s+/)[0] || 'Bem-vindo';

  const descricaoNotificacao = permissaoNotificacao === 'granted' ? 'Ligadas neste navegador'
    : permissaoNotificacao === 'denied' ? 'Bloqueadas no navegador'
    : permissaoNotificacao === 'indisponivel' ? 'Sem suporte aqui'
    : 'Desligados — ativar';

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

      <div className="mt-7 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Contagem
            valor={citadasDisciplina}
            titulo="Notas da sua disciplina"
            descricao={citadasDisciplina === 0 ? 'Nada novo por aqui' : 'Publicadas por quem divide a disciplina com você'}
            onClick={onVerDisciplina}
          />
          <Contagem
            valor={citadasVoce}
            titulo="Notas que citam você"
            descricao={citadasVoce === 0 ? 'Ninguém te marcou ainda' : 'Você foi vinculado nessas notas'}
            onClick={onVerCitado}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Acao
              icone={<Eye size={16} />}
              titulo="Daltônico"
              descricao={acessibilidade === 'daltonico' ? 'Ligado' : 'Desligado'}
              onClick={onAlternarAcessibilidade}
            />
            <Acao
              icone={permissaoNotificacao === 'granted' ? <Bell size={16} /> : <BellOff size={16} />}
              titulo="Avisos"
              descricao={descricaoNotificacao}
              onClick={onPedirNotificacao}
            />
            <Acao icone={<Sparkles size={16} />} titulo="Novidades" descricao={versaoLabel} onClick={onVerNovidades} />
          </div>
        </div>

        <div className={`flex flex-col justify-center px-5 py-5 ${CARTAO}`}>
          <h3 className="text-[18px] font-black text-[#2D2D2D]">Disciplina</h3>
          <p className="mt-1 text-[12px] font-medium text-[#94A3B8]">
            {minhasDisciplinas.length > 0
              ? minhasDisciplinas.map((item) => getDisciplineDisplayName(item)).join(', ')
              : 'Escolha sua disciplina para começar — a primeira escolha entra na hora.'}
          </p>

          {pedidoPendente ? (
            <p className="mt-4 rounded-xl bg-[#FFF7ED] px-3 py-2.5 text-[11px] font-medium text-[#B45309]">
              Pedido pendente: {pedidoPendente.join(', ')} — aguardando aprovação do administrador.
            </p>
          ) : outrasDisciplinas.length === 0 ? (
            <p className="mt-4 text-[11px] font-medium text-[#94A3B8]">Você já está em todas as disciplinas cadastradas.</p>
          ) : (
            <>
              <SearchableSelect
                value=""
                onChange={(event) => {
                  if (event.target.value) setSelecionadas((prev) => [...prev, event.target.value]);
                }}
                searchPlaceholder="Buscar disciplina..."
                className="mt-4 h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
              >
                <option value="">Selecione uma disciplina...</option>
                {outrasDisciplinas.filter((item) => !selecionadas.includes(item)).map((item) => (
                  <option key={item} value={item}>{getDisciplineDisplayName(item)}</option>
                ))}
              </SearchableSelect>

              {selecionadas.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selecionadas.map((item) => (
                    <span key={item} className="inline-flex items-center gap-1 rounded-full bg-[#FFF3EE] py-1 pl-2.5 pr-1.5 text-[11px] font-medium text-[#F05D28]">
                      {getDisciplineDisplayName(item)}
                      <button
                        type="button"
                        onClick={() => setSelecionadas((prev) => prev.filter((d) => d !== item))}
                        className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                        aria-label={`Remover ${getDisciplineDisplayName(item)}`}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={selecionadas.length === 0}
                onClick={() => { onDefinirDisciplinas(selecionadas); setSelecionadas([]); }}
                className="mt-3 h-10 w-full rounded-xl bg-[#F05D28] text-[13px] font-bold text-white transition-colors hover:bg-[#D94E1F] disabled:opacity-50"
              >
                {primeiraEscolha ? 'Definir minha disciplina' : 'Pedir alteração de disciplina'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
