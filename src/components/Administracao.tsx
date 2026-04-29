import React from 'react';
import {
  Check,
  ShieldCheck,
  ShieldOff,
  RefreshCcw,
  Ban,
  Plus,
  Trash2,
  Users,
  UserCheck,
  Lock,
  Search,
  Database,
  ExternalLink,
  Save,
} from 'lucide-react';

export type AppTabKey =
  | 'registro'
  | 'controle'
  | 'alocacoes'
  | 'contratos'
  | 'nc'
  | 'cronograma'
  | 'administracao';

export type UserStatus = 'pending' | 'approved' | 'blocked';
export type DisciplinaOption = string;
export type CargoOption = string;

export interface UserAccessRecord {
  id: string;
  nome: string;
  email: string;
  online: boolean;
  disciplina: string;
  cargo: string;
  isAdmin: boolean;
  status: UserStatus;
  allowedTabs: AppTabKey[];
}

export interface DatabaseLinkRecord {
  id: string;
  nome: string;
  link: string;
  descricao: string;
  atualizadoEm?: string;
}

interface AdministracaoProps {
  usuarios: UserAccessRecord[];
  disciplinas: DisciplinaOption[];
  cargos: CargoOption[];
  databaseLinks: DatabaseLinkRecord[];
  appTabs: Array<{ key: AppTabKey; label: string }>;
  onRefresh: () => Promise<void>;
  onUpdateUsuario: (userId: string, patch: Partial<UserAccessRecord>) => void;
  onToggleAdmin: (userId: string, checked: boolean) => void;
  onToggleTabPermission: (userId: string, tabKey: AppTabKey) => void;
  onAcceptUser: (userId: string) => Promise<void>;
  onBlockUser: (userId: string) => Promise<void>;
  onPasswordReset: (user: UserAccessRecord) => Promise<void>;
  onAddDisciplina: (value: string) => Promise<void>;
  onRemoveDisciplina: (value: string) => Promise<void>;
  onAddCargo: (value: string) => Promise<void>;
  onRemoveCargo: (value: string) => Promise<void>;
  onSaveDatabaseLink: (payload: Omit<DatabaseLinkRecord, 'id'> & { id?: string }) => Promise<void>;
  onDeleteDatabaseLink: (id: string) => Promise<void>;
}

function statusLabel(status: UserStatus) {
  switch (status) {
    case 'pending':
      return 'Pendente';
    case 'approved':
      return 'Ativo';
    case 'blocked':
      return 'Bloqueado';
    default:
      return 'Pendente';
  }
}

function statusClasses(status: UserStatus) {
  switch (status) {
    case 'pending':
      return 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]';
    case 'approved':
      return 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]';
    case 'blocked':
      return 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]';
    default:
      return 'bg-[#F9FAFB] text-[#757575] border-[#E5E7EB]';
  }
}

function getUserInitials(nome: string) {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() || '')
    .join('');
}

function StatusOnline({ online }: { online: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-[#10B981]' : 'bg-[#EF4444]'}`}></span>
      <span className={`text-[12px] font-bold ${online ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
        {online ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}

function MultiTabSelector({
  user,
  appTabs,
  onToggle,
}: {
  user: UserAccessRecord;
  appTabs: Array<{ key: AppTabKey; label: string }>;
  onToggle: (tabKey: AppTabKey) => void;
}) {
  return (
    <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3 max-h-[170px] overflow-y-auto">
      <div className="space-y-2">
        {appTabs
          .filter((tab) => (user.isAdmin ? true : tab.key !== 'administracao'))
          .map((tab) => {
            const checked = user.allowedTabs.includes(tab.key);

            return (
              <label
                key={tab.key}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-white transition-colors cursor-pointer"
              >
                <span className="text-[12px] font-medium text-[#2D2D2D] leading-tight">{tab.label}</span>

                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(tab.key)}
                  className="w-4 h-4 accent-[#F05D28] cursor-pointer"
                />
              </label>
            );
          })}
      </div>
    </div>
  );
}

function InlineListManager({
  title,
  subtitle,
  items,
  placeholder,
  onAdd,
  onRemove,
}: {
  title: string;
  subtitle: string;
  items: string[];
  placeholder: string;
  onAdd: (value: string) => Promise<void>;
  onRemove: (value: string) => Promise<void>;
}) {
  const [novoValor, setNovoValor] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleAdd = async () => {
    const limpo = novoValor.trim();
    if (!limpo) return;
    setLoading(true);
    try {
      await onAdd(limpo);
      setNovoValor('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm p-6 flex flex-col gap-5">
      <div>
        <h3 className="text-[16px] font-bold text-[#2D2D2D]">{title}</h3>
        <p className="text-[13px] text-[#757575] mt-1">{subtitle}</p>
      </div>

      <div className="flex gap-3">
        <input
          value={novoValor}
          onChange={(e) => setNovoValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleAdd();
            }
          }}
          className="bentham-input"
          placeholder={placeholder}
        />

        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={loading}
          className="h-11 px-5 rounded-xl bg-[#F05D28] text-white text-[13px] font-bold hover:bg-[#D94E1F] transition-colors inline-flex items-center gap-2 shrink-0 disabled:opacity-70"
        >
          <Plus size={16} />
          Adicionar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.length === 0 && (
          <span className="text-[13px] text-[#757575]">Nenhum item cadastrado.</span>
        )}

        {items.map((item) => (
          <div
            key={item}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB]"
          >
            <span className="text-[13px] font-medium text-[#2D2D2D]">{item}</span>

            <button
              type="button"
              onClick={() => void onRemove(item)}
              className="text-[#757575] hover:text-[#EF4444] transition-colors"
              title={`Remover ${item}`}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DatabaseForm({
  onSave,
}: {
  onSave: (payload: { nome: string; link: string; descricao: string }) => Promise<void>;
}) {
  const [nome, setNome] = React.useState('');
  const [link, setLink] = React.useState('');
  const [descricao, setDescricao] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !link.trim()) return;

    setLoading(true);
    try {
      await onSave({
        nome: nome.trim(),
        link: link.trim(),
        descricao: descricao.trim().slice(0, 100),
      });
      setNome('');
      setLink('');
      setDescricao('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm p-6">
      <div className="mb-5">
        <h3 className="text-[16px] font-bold text-[#2D2D2D]">Cadastrar Banco de Dados</h3>
        <p className="text-[13px] text-[#757575] mt-1">
          Crie atalhos rápidos para planilhas importantes usadas pela equipe.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div>
          <label className="bentham-label">Nome da Planilha</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="bentham-input"
            placeholder="Ex.: Banco de OS"
          />
        </div>

        <div>
          <label className="bentham-label">Link da Planilha</label>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="bentham-input"
            placeholder="Cole o link aqui"
          />
        </div>

        <div>
          <label className="bentham-label">Descrição</label>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="bentham-input"
            maxLength={100}
            placeholder="Resumo rápido do que é esse banco"
          />
        </div>

        <div className="xl:col-span-3 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="h-11 px-5 rounded-xl bg-[#F05D28] text-white text-[13px] font-bold hover:bg-[#D94E1F] transition-colors inline-flex items-center gap-2 shrink-0 disabled:opacity-70"
          >
            <Save size={16} />
            Salvar Banco
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Administracao({
  usuarios,
  disciplinas,
  cargos,
  databaseLinks,
  appTabs,
  onRefresh,
  onUpdateUsuario,
  onToggleAdmin,
  onToggleTabPermission,
  onAcceptUser,
  onBlockUser,
  onPasswordReset,
  onAddDisciplina,
  onRemoveDisciplina,
  onAddCargo,
  onRemoveCargo,
  onSaveDatabaseLink,
  onDeleteDatabaseLink,
}: AdministracaoProps) {
  const [search, setSearch] = React.useState('');
  const [disciplinaFiltro, setDisciplinaFiltro] = React.useState('Todas');
  const [cargoFiltro, setCargoFiltro] = React.useState('Todos');

  const totalUsuarios = usuarios.length;
  const usuariosOnline = usuarios.filter((user) => user.online).length;
  const pendentes = usuarios.filter((user) => user.status === 'pending').length;
  const bloqueados = usuarios.filter((user) => user.status === 'blocked').length;

  const usuariosFiltrados = React.useMemo(() => {
    return usuarios.filter((user) => {
      const termo = search.trim().toLowerCase();

      const matchesSearch =
        !termo ||
        user.nome.toLowerCase().includes(termo) ||
        user.email.toLowerCase().includes(termo);

      const matchesDisciplina =
        disciplinaFiltro === 'Todas' || user.disciplina === disciplinaFiltro;

      const matchesCargo =
        cargoFiltro === 'Todos' || user.cargo === cargoFiltro;

      return matchesSearch && matchesDisciplina && matchesCargo;
    });
  }, [usuarios, search, disciplinaFiltro, cargoFiltro]);

  return (
    <div className="space-y-8">
      <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <p className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">
              Gestão de acesso
            </p>
            <h1 className="text-[24px] font-bold text-[#2D2D2D] mt-2">Administração de Usuários</h1>
            <p className="text-[14px] text-[#757575] mt-2 max-w-[840px] leading-relaxed">
              Nesta área o administrador libera acessos, define disciplina, cargo, status de administrador,
              permissões de visualização das abas e executa ações como aceite, bloqueio e reset de senha.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard icon={<Users size={18} className="text-[#F05D28]" />} label="Usuários" value={String(totalUsuarios)} />
            <MetricCard icon={<UserCheck size={18} className="text-[#10B981]" />} label="Online" value={String(usuariosOnline)} />
            <MetricCard icon={<ShieldCheck size={18} className="text-[#C2410C]" />} label="Pendentes" value={String(pendentes)} />
            <MetricCard icon={<Lock size={18} className="text-[#B91C1C]" />} label="Bloqueados" value={String(bloqueados)} />
          </div>
        </div>
      </section>

      <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm p-6">
        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_220px_220px_auto] gap-4 items-end">
          <div>
            <label className="bentham-label">Pesquisar usuário</label>
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#757575]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bentham-input !pl-11"
                placeholder="Pesquisar por nome ou e-mail"
              />
            </div>
          </div>

          <div>
            <label className="bentham-label">Filtrar disciplina</label>
            <select
              value={disciplinaFiltro}
              onChange={(e) => setDisciplinaFiltro(e.target.value)}
              className="bentham-select"
            >
              <option value="Todas">Todas</option>
              {disciplinas.map((disciplina) => (
                <option key={disciplina} value={disciplina}>
                  {disciplina}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="bentham-label">Filtrar cargo</label>
            <select
              value={cargoFiltro}
              onChange={(e) => setCargoFiltro(e.target.value)}
              className="bentham-select"
            >
              <option value="Todos">Todos</option>
              {cargos.map((cargo) => (
                <option key={cargo} value={cargo}>
                  {cargo}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void onRefresh()}
            className="h-11 px-4 rounded-xl border border-[#E5E7EB] bg-white text-[#2D2D2D] text-[13px] font-bold hover:border-[#F05D28] hover:text-[#F05D28] transition-colors inline-flex items-center justify-center gap-2"
          >
            <RefreshCcw size={16} />
            Atualizar
          </button>
        </div>
      </section>

      <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-[#E5E7EB]">
          <h2 className="text-[18px] font-bold text-[#2D2D2D]">Lista de Usuários Cadastrados</h2>
          <p className="text-[13px] text-[#757575] mt-1">
            Usuários pendentes aguardam aceite do administrador. Usuários bloqueados perdem acesso ao app.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {usuariosFiltrados.map((user) => (
            <div key={user.id} className="border border-[#E5E7EB] rounded-2xl bg-[#F9FAFB] p-5">
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(220px,1.2fr)_110px_180px_180px_120px_1.1fr_280px] gap-4 items-start">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-[#F05D28]/10 flex items-center justify-center text-[#F05D28] font-bold text-sm shrink-0">
                      {getUserInitials(user.nome)}
                    </div>

                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-[#2D2D2D] truncate">{user.nome}</p>
                      <p className="text-[12px] text-[#757575] truncate">{user.email}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-bold ${statusClasses(user.status)}`}>
                      {statusLabel(user.status)}
                    </span>

                    {user.isAdmin ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C] text-[11px] font-bold">
                        <ShieldCheck size={12} />
                        ADM
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#E5E7EB] bg-white text-[#757575] text-[11px] font-bold">
                        <ShieldOff size={12} />
                        USUÁRIO
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="bentham-label">Status</label>
                  <div className="h-11 px-3 rounded-xl border border-[#E5E7EB] bg-white flex items-center">
                    <StatusOnline online={user.online} />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="bentham-label">Disciplina</label>
                  <select
                    className="bentham-select"
                    value={user.disciplina}
                    onChange={(e) => onUpdateUsuario(user.id, { disciplina: e.target.value })}
                  >
                    <option value="">Selecionar</option>
                    {disciplinas.map((disciplina) => (
                      <option key={disciplina} value={disciplina}>
                        {disciplina}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="bentham-label">Cargo</label>
                  <select
                    className="bentham-select"
                    value={user.cargo}
                    onChange={(e) => onUpdateUsuario(user.id, { cargo: e.target.value })}
                  >
                    <option value="">Selecionar</option>
                    {cargos.map((cargo) => (
                      <option key={cargo} value={cargo}>
                        {cargo}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="bentham-label">Administrador</label>
                  <label className="h-11 px-3 rounded-xl border border-[#E5E7EB] bg-white flex items-center justify-between cursor-pointer">
                    <span className="text-[13px] font-medium text-[#2D2D2D]">
                      {user.isAdmin ? 'Sim' : 'Não'}
                    </span>
                    <input
                      type="checkbox"
                      checked={user.isAdmin}
                      onChange={(e) => onToggleAdmin(user.id, e.target.checked)}
                      className="w-4 h-4 accent-[#F05D28] cursor-pointer"
                    />
                  </label>
                </div>

                <div className="flex flex-col gap-1.5 min-w-0">
                  <label className="bentham-label">Abas permitidas</label>
                  <MultiTabSelector
                    user={user}
                    appTabs={appTabs}
                    onToggle={(tabKey) => onToggleTabPermission(user.id, tabKey)}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="bentham-label">Ações</label>

                  <button
                    type="button"
                    onClick={() => void onPasswordReset(user)}
                    className="h-11 px-4 rounded-xl border border-[#E5E7EB] bg-white text-[#2D2D2D] text-[13px] font-bold hover:border-[#F05D28] hover:text-[#F05D28] transition-colors flex items-center justify-center gap-2"
                  >
                    <RefreshCcw size={16} />
                    Password Reset
                  </button>

                  {user.status === 'pending' ? (
                    <button
                      type="button"
                      onClick={() => void onAcceptUser(user.id)}
                      className="h-11 px-4 rounded-xl bg-[#F05D28] text-white text-[13px] font-bold hover:bg-[#D94E1F] transition-colors flex items-center justify-center gap-2"
                    >
                      <Check size={16} />
                      Aceitar
                    </button>
                  ) : (
                    <div className="h-11 px-4 rounded-xl border border-dashed border-[#E5E7EB] text-[#9CA3AF] text-[12px] font-medium flex items-center justify-center">
                      Usuário já analisado
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void onBlockUser(user.id)}
                    className="h-11 px-4 rounded-xl bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA] text-[13px] font-bold hover:bg-[#FEE2E2] transition-colors flex items-center justify-center gap-2"
                  >
                    <Ban size={16} />
                    Bloquear
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <InlineListManager
          title="Gerenciar Cargos"
          subtitle="Adicione ou remova os cargos disponíveis para seleção no cadastro administrativo."
          items={cargos}
          placeholder="Novo cargo"
          onAdd={onAddCargo}
          onRemove={onRemoveCargo}
        />

        <InlineListManager
          title="Gerenciar Disciplinas"
          subtitle="Adicione ou remova as disciplinas que aparecerão nas cascatas do sistema."
          items={disciplinas}
          placeholder="Nova disciplina"
          onAdd={onAddDisciplina}
          onRemove={onRemoveDisciplina}
        />
      </section>

      <DatabaseForm onSave={onSaveDatabaseLink} />

      <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-3">
            <Database size={18} className="text-[#F05D28]" />
            <h2 className="text-[18px] font-bold text-[#2D2D2D]">Bancos de Dados Vinculados</h2>
          </div>
          <p className="text-[13px] text-[#757575] mt-1">
            Atalhos rápidos para planilhas importantes do ambiente administrativo.
          </p>
        </div>

        <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
          {databaseLinks.length === 0 && (
            <div className="text-[13px] text-[#757575]">Nenhum banco de dados cadastrado ainda.</div>
          )}

          {databaseLinks.map((item) => (
            <div
              key={item.id}
              className="border border-[#E5E7EB] rounded-2xl bg-[#F9FAFB] p-5 flex flex-col gap-4"
            >
              <div>
                <h3 className="text-[15px] font-bold text-[#2D2D2D]">{item.nome}</h3>
                <p className="text-[13px] text-[#757575] mt-1">{item.descricao || 'Sem descrição.'}</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="h-10 px-4 rounded-xl bg-[#F05D28] text-white text-[13px] font-bold hover:bg-[#D94E1F] transition-colors inline-flex items-center gap-2"
                >
                  <ExternalLink size={15} />
                  Abrir Planilha
                </a>

                <button
                  type="button"
                  onClick={() => void onDeleteDatabaseLink(item.id)}
                  className="h-10 px-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C] text-[13px] font-bold hover:bg-[#FEE2E2] transition-colors inline-flex items-center gap-2"
                >
                  <Trash2 size={15} />
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-[120px] bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="w-9 h-9 rounded-xl bg-white border border-[#E5E7EB] flex items-center justify-center">
          {icon}
        </span>
        <span className="text-[20px] font-bold text-[#2D2D2D]">{value}</span>
      </div>

      <p className="text-[12px] text-[#757575] mt-3">{label}</p>
    </div>
  );
}