import React from 'react';
import { ChevronDown, ChevronRight, Database, FileJson, Loader2, RefreshCw } from 'lucide-react';
import { fetchFirebaseCollection, isFirebaseConfigured } from '../lib/firebaseDb';

// O SDK web do Firestore nao lista colecoes (isso e do admin SDK), entao a lista vem
// do firestore.rules - que e a fonte de verdade do que o app usa.
const COLECOES: Array<{ nome: string; descricao: string }> = [
  { nome: 'appData', descricao: 'Blocos únicos do app: notas, admin, auth, disciplinas...' },
  { nome: 'registroAtividades', descricao: 'Atividades de engenharia lançadas.' },
  { nome: 'registroAtividadesHistorico', descricao: 'Histórico de alterações das atividades.' },
  { nome: 'nc2Records', descricao: 'Registros de não conformidade.' },
  { nome: 'planningTodos', descricao: 'Pendências do planejamento.' },
  { nome: 'contractPriorities', descricao: 'Prioridades por contrato.' },
  { nome: 'contractInterferences', descricao: 'Interferências por contrato.' },
  { nome: 'resolvedAlerts', descricao: 'Alertas já resolvidos.' },
  { nome: 'osSettings', descricao: 'Configurações por Ordem de Serviço.' },
  { nome: 'emergencies', descricao: 'Emergências abertas.' },
  { nome: 'emergencyMessages', descricao: 'Mensagens das emergências.' },
  { nome: 'emergencyReadMarkers', descricao: 'Marcadores de leitura das emergências.' },
];

// Campos como bancosJson guardam JSON dentro de uma string: exibir cru esconderia a estrutura.
function tentarParsearJson(valor: unknown) {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  if (!limpo.startsWith('{') && !limpo.startsWith('[')) return null;
  try {
    return JSON.parse(limpo);
  } catch {
    return null;
  }
}

function rotuloTipo(valor: unknown) {
  if (valor === null) return 'null';
  if (Array.isArray(valor)) return `array(${valor.length})`;
  return typeof valor;
}

function No({ nome, valor, nivel }: { key?: string; nome: string; valor: unknown; nivel: number }) {
  const [aberto, setAberto] = React.useState(nivel < 1);
  const embutido = tentarParsearJson(valor);
  const alvo = embutido ?? valor;
  const ramo = alvo !== null && typeof alvo === 'object';

  if (!ramo) {
    return (
      <div className="flex gap-2 py-0.5" style={{ paddingLeft: nivel * 14 }}>
        <span className="shrink-0 font-mono text-[12px] font-bold text-[#0F4C81]">{nome}:</span>
        <span className="min-w-0 break-all font-mono text-[12px] text-[#374151]">
          {typeof alvo === 'string' ? `"${alvo}"` : String(alvo)}
        </span>
      </div>
    );
  }

  const filhos = Array.isArray(alvo)
    ? alvo.map((item, i) => [String(i), item] as const)
    : Object.entries(alvo as Record<string, unknown>);

  return (
    <div style={{ paddingLeft: nivel * 14 }}>
      <button
        type="button"
        onClick={() => setAberto((prev) => !prev)}
        className="flex items-center gap-1 py-0.5 text-left hover:text-[#F05D28]"
      >
        {aberto ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="font-mono text-[12px] font-bold text-[#0F4C81]">{nome}</span>
        <span className="font-mono text-[11px] text-[#94A3B8]">
          {rotuloTipo(alvo)}{embutido ? ' · JSON em string' : ''}
        </span>
      </button>
      {aberto && filhos.map(([chave, item]) => (
        <No key={chave} nome={chave} valor={item} nivel={nivel + 1} />
      ))}
    </div>
  );
}

export default function FirebaseExplorer() {
  const [colecao, setColecao] = React.useState<string>('');
  const [docs, setDocs] = React.useState<Array<Record<string, unknown>>>([]);
  const [docSelecionado, setDocSelecionado] = React.useState<string>('');
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState('');

  const carregar = async (nome: string) => {
    setColecao(nome);
    setDocSelecionado('');
    setDocs([]);
    setErro('');
    if (!isFirebaseConfigured()) { setErro('Firebase não configurado neste ambiente.'); return; }
    setCarregando(true);
    try {
      setDocs(await fetchFirebaseCollection(nome));
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível ler esta coleção.');
    } finally {
      setCarregando(false);
    }
  };

  const doc = docs.find((item) => String((item as any).id) === docSelecionado);

  return (
    <div className="font-['Montserrat']">
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-2.5">
        <Database size={15} className="shrink-0 text-[#B45309]" />
        <p className="text-[12px] font-semibold text-[#B45309]">
          Somente leitura — esta tela apenas exibe o que está gravado no Firebase. Nada aqui altera dados.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_240px_1fr]">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-3">
          <p className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-wide text-[#94A3B8]">Coleções</p>
          <div className="flex flex-col gap-0.5">
            {COLECOES.map((item) => (
              <button
                key={item.nome}
                type="button"
                onClick={() => void carregar(item.nome)}
                title={item.descricao}
                className={`rounded-lg px-3 py-2 text-left text-[12px] transition-colors ${
                  colecao === item.nome ? 'bg-[#F05D28]/10 font-bold text-[#F05D28]' : 'font-medium text-[#374151] hover:bg-[#F3F4F6]'
                }`}
              >
                <span className="block truncate font-mono">{item.nome}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#94A3B8]">Documentos</p>
            {colecao && (
              <button
                type="button"
                onClick={() => void carregar(colecao)}
                title="Recarregar"
                className="text-[#94A3B8] hover:text-[#F05D28]"
              >
                <RefreshCw size={12} />
              </button>
            )}
          </div>
          {!colecao ? (
            <p className="px-1 text-[12px] text-[#94A3B8]">Escolha uma coleção.</p>
          ) : carregando ? (
            <p className="flex items-center gap-2 px-1 text-[12px] text-[#94A3B8]">
              <Loader2 size={12} className="animate-spin" /> Lendo...
            </p>
          ) : erro ? (
            <p className="px-1 text-[12px] text-[#DC2626]">{erro}</p>
          ) : docs.length === 0 ? (
            <p className="px-1 text-[12px] text-[#94A3B8]">Coleção vazia.</p>
          ) : (
            <div className="flex max-h-[60vh] flex-col gap-0.5 overflow-auto">
              {docs.map((item) => {
                const id = String((item as any).id ?? '');
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDocSelecionado(id)}
                    className={`rounded-lg px-3 py-2 text-left font-mono text-[11px] transition-colors ${
                      docSelecionado === id ? 'bg-[#F05D28]/10 font-bold text-[#F05D28]' : 'text-[#374151] hover:bg-[#F3F4F6]'
                    }`}
                  >
                    <span className="block truncate">{id}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
          <div className="mb-2 flex items-center gap-2">
            <FileJson size={14} className="text-[#F05D28]" />
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#94A3B8]">
              {doc ? `${colecao}/${docSelecionado}` : 'Campos'}
            </p>
          </div>
          {!doc ? (
            <p className="text-[12px] text-[#94A3B8]">Escolha um documento para ver os campos.</p>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              {Object.entries(doc).map(([chave, valor]) => (
                <No key={chave} nome={chave} valor={valor} nivel={0} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
