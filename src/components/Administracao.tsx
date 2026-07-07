import SearchableSelect from './SearchableSelect';
import SearchableMultiSelect from './SearchableMultiSelect';
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
  ChevronRight,
  X,
  Mail,
} from 'lucide-react';
import TerceirizadasCadastro from './TerceirizadasCadastro';

export type AppTabKey =
  | 'registro'
  | 'controle'
  | 'planejamento'
  | 'contrato'
  | 'alocacoes'
  | 'nc'
  | 'nc2'
  | 'cronograma'
  | 'administracao';

export type UserStatus = 'pending' | 'approved' | 'blocked';
export type DisciplinaOption = string;
export type CargoOption = string;
export type RoleTabPermissions = Record<string, AppTabKey[]>;

export interface DisciplineSettingRecord {
  nome: string;
  showInCharts: boolean;
}

export interface UserAccessRecord {
  id: string;
  nome: string;
  email: string;
  online: boolean;
  disciplina: string;
  disciplinas: string[];
  cargo: string;
  alocacao: string;
  contrato: string;
  isAdmin: boolean;
  showInCharts: boolean;
  onlyThirdParty: boolean;
  status: UserStatus;
  allowedTabs: AppTabKey[];
  sessionVersion?: string;
}

export interface DatabaseLinkRecord {
  id: string;
  nome: string;
  link: string;
  descricao: string;
  atualizadoEm?: string;
}

export interface TerceirizadaRecord {
  id: string;
  nome: string;
  disciplina: string;
}

export interface PreRegistrationRecord {
  email: string;
  cargo: string;
  disciplina: string;
  alocacao: string;
  contrato: string;
  allowedTabs: AppTabKey[];
}

interface AdministracaoProps {
  usuarios: UserAccessRecord[];
  disciplinas: DisciplinaOption[];
  disciplineSettings: DisciplineSettingRecord[];
  cargos: CargoOption[];
  alocacoes: string[];
  terceirizadas: TerceirizadaRecord[];
  contratos: Array<{ id: string; nome: string }>;
  roleTabPermissions: RoleTabPermissions;
  databaseLinks: DatabaseLinkRecord[];
  appTabs: Array<{ key: AppTabKey; label: string }>;
  activeSection?: 'usuarios' | 'terceirizadas' | 'gerenciamento' | 'pre-cadastro';
  onRefresh: () => Promise<void>;
  onUpdateUsuario: (userId: string, patch: Partial<UserAccessRecord>) => void;
  onToggleAdmin: (userId: string, checked: boolean) => void;
  onToggleTabPermission: (userId: string, tabKey: AppTabKey) => void;
  dirtyUserIds: string[];
  pendingTerceirizadaIds: string[];
  onAcceptUser: (userId: string) => Promise<void>;
  onBlockUser: (userId: string) => Promise<void>;
  onDeleteUsuario: (userId: string) => Promise<void>;
  onPasswordReset: (user: UserAccessRecord) => Promise<void>;
  onAddDisciplina: (value: string) => Promise<void>;
  onRemoveDisciplina: (value: string) => Promise<void>;
  onToggleDisciplineCharts: (value: string, checked: boolean) => Promise<void>;
  onAddCargo: (value: string) => Promise<void>;
  onRemoveCargo: (value: string) => Promise<void>;
  onAddAlocacao: (value: string) => Promise<void>;
  onRemoveAlocacao: (value: string) => Promise<void>;
  onSaveTerceirizada: (payload: Omit<TerceirizadaRecord, 'id'> & { id?: string }) => Promise<void>;
  onDeleteTerceirizada: (id: string) => Promise<void>;
  onToggleRoleTabPermission: (cargo: string, tabKey: AppTabKey) => Promise<void>;
  onSaveDatabaseLink: (payload: Omit<DatabaseLinkRecord, 'id'> & { id?: string }) => Promise<void>;
  onDeleteDatabaseLink: (id: string) => Promise<void>;
  onSaveChanges: () => Promise<void>;
  hasPendingChanges: boolean;
  isSavingChanges: boolean;
  preRegistrations: PreRegistrationRecord[];
  onAddPreRegistration: (record: PreRegistrationRecord) => void;
  onRemovePreRegistration: (email: string) => void;
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

function DisciplineMultiSelect({
  value,
  options,
  onChange,
}: {
  value: string[];
  options: string[];
  onChange: (nextValue: string[]) => void;
}) {
  return (
    <SearchableMultiSelect
      value={Array.isArray(value) ? value : []}
      options={options}
      onChange={onChange}
      placeholder="Selecionar"
      emptyMessage="Nenhuma disciplina disponivel."
      className="w-full h-11 px-3 rounded-xl border border-[#E5E7EB] bg-white text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28] placeholder:text-[#9CA3AF]"
    />
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
            const checked = user.isAdmin || user.allowedTabs.includes(tab.key);

            return (
              <label
                key={tab.key}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-white transition-colors cursor-pointer"
              >
                <span className="text-[12px] font-medium text-[#2D2D2D] leading-tight">{tab.label}</span>

                <input
                  type="checkbox"
                  checked={checked}
                  disabled={user.isAdmin}
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

      <div className="space-y-3">
        {items.length === 0 && (
          <span className="text-[13px] text-[#757575]">Nenhum item cadastrado.</span>
        )}

        {items.map((item) => (
          <div
            key={item}
            className="flex items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-4"
          >
            <span className="text-[14px] font-bold text-[#2D2D2D]">{item}</span>

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

function ManagementLauncherCard({
  title,
  subtitle,
  badge,
  onOpen,
}: {
  title: string;
  subtitle: string;
  badge: string;
  onOpen: () => void;
}) {
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm p-6 flex flex-col gap-5">
      <div className="space-y-2">
        <div className="inline-flex items-center px-2.5 py-1 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] text-[#757575] text-[11px] font-bold w-fit">
          {badge}
        </div>
        <h3 className="text-[16px] font-bold text-[#2D2D2D]">{title}</h3>
        <p className="text-[13px] text-[#757575] leading-relaxed">{subtitle}</p>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="h-11 px-5 rounded-xl bg-[#F05D28] text-white text-[13px] font-bold hover:bg-[#D94E1F] transition-colors inline-flex items-center justify-center gap-2 w-fit"
      >
        {title}
      </button>
    </div>
  );
}

function DisciplineSettingsManager({
  items,
  settings,
  onAdd,
  onRemove,
  onToggleCharts,
}: {
  items: string[];
  settings: DisciplineSettingRecord[];
  onAdd: (value: string) => Promise<void>;
  onRemove: (value: string) => Promise<void>;
  onToggleCharts: (value: string, checked: boolean) => Promise<void>;
}) {
  const [novoValor, setNovoValor] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [savingByName, setSavingByName] = React.useState<Record<string, boolean>>({});

  const itemsWithSettings = React.useMemo(() => items.map((item) => {
    const setting = settings.find((entry) => entry.nome === item);
    return {
      nome: item,
      showInCharts: setting?.showInCharts !== false,
    };
  }), [items, settings]);

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

  const handleToggle = async (nome: string, checked: boolean) => {
    setSavingByName((prev) => ({ ...prev, [nome]: true }));
    try {
      await onToggleCharts(nome, checked);
    } finally {
      setSavingByName((prev) => ({ ...prev, [nome]: false }));
    }
  };

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm p-6 flex flex-col gap-5">
      <div>
        <h3 className="text-[16px] font-bold text-[#2D2D2D]">Gerenciar Disciplinas</h3>
        <p className="text-[13px] text-[#757575] mt-1">
          Adicione ou remova disciplinas e defina quais delas aparecem nos graficos.
        </p>
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
          placeholder="Nova disciplina"
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

      <div className="space-y-3">
        {itemsWithSettings.length === 0 && (
          <span className="text-[13px] text-[#757575]">Nenhuma disciplina cadastrada.</span>
        )}

        {itemsWithSettings.map((item) => (
          <div
            key={item.nome}
            className="flex flex-col gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-bold text-[#2D2D2D]">{item.nome}</span>

              <button
                type="button"
                onClick={() => void onRemove(item.nome)}
                className="text-[#757575] hover:text-[#EF4444] transition-colors"
                title={`Remover ${item.nome}`}
              >
                <Trash2 size={16} />
              </button>
            </div>

            <label className="min-h-11 px-3 rounded-xl border border-[#E5E7EB] bg-white flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-[13px] font-medium text-[#2D2D2D]">Aparecer em graficos</span>
              <input
                type="checkbox"
                checked={item.showInCharts}
                disabled={Boolean(savingByName[item.nome])}
                onChange={(e) => void handleToggle(item.nome, e.target.checked)}
                className="w-4 h-4 accent-[#F05D28] cursor-pointer"
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function FadeModal({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [shouldRender, setShouldRender] = React.useState(open);
  const [visible, setVisible] = React.useState(open);

  React.useEffect(() => {
    if (open) {
      setShouldRender(true);
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setVisible(false);
    const timeout = window.setTimeout(() => setShouldRender(false), 220);
    return () => window.clearTimeout(timeout);
  }, [open]);

  React.useEffect(() => {
    if (!shouldRender) return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [shouldRender, onClose]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center p-4 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      aria-modal="true"
      role="dialog"
    >
      <button
        type="button"
        aria-label="Fechar janela"
        onClick={onClose}
        className="absolute inset-0 bg-[#111827]/45 backdrop-blur-[2px]"
      />

      <div
        className={`relative z-[81] w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-[28px] border border-[#E5E7EB] bg-white shadow-2xl shadow-black/20 transition-all duration-200 ${visible ? 'translate-y-0 scale-100' : 'translate-y-3 scale-[0.98]'}`}
      >
        <div className="px-6 md:px-8 py-5 border-b border-[#E5E7EB] flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-bold text-[#2D2D2D]">{title}</h2>
            <p className="text-[13px] text-[#757575] mt-1">{subtitle}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-xl border border-[#E5E7EB] bg-white text-[#757575] hover:text-[#2D2D2D] hover:border-[#F05D28] transition-colors inline-flex items-center justify-center shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 md:p-8 overflow-y-auto max-h-[calc(85vh-88px)] bg-[#FCFCFD]">
          {children}
        </div>
      </div>
    </div>
  );
}

function RoleTabPermissionsManager({
  cargos,
  appTabs,
  roleTabPermissions,
  onToggle,
}: {
  cargos: string[];
  appTabs: Array<{ key: AppTabKey; label: string }>;
  roleTabPermissions: RoleTabPermissions;
  onToggle: (cargo: string, tabKey: AppTabKey) => Promise<void>;
}) {
  const visibleTabs = appTabs.filter((tab) => tab.key !== 'administracao');

  return (
    <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden">
      <div className="px-8 py-6 border-b border-[#E5E7EB]">
        <h2 className="text-[18px] font-bold text-[#2D2D2D]">Abas por Cargo</h2>
        <p className="text-[13px] text-[#757575] mt-1">
          Esta matriz agora funciona somente como pre-selecao. Quando um usuario recebe um cargo, essas abas sao marcadas automaticamente em "Abas permitidas".
        </p>
      </div>

      <div className="p-6 space-y-4">
        {cargos.length === 0 && (
          <div className="text-[13px] text-[#757575]">Cadastre cargos para liberar esta matriz.</div>
        )}

        {cargos.map((cargo) => {
          const allowed = roleTabPermissions[cargo] || [];

          return (
            <details key={cargo} className="group border border-[#E5E7EB] bg-[#F9FAFB] rounded-2xl overflow-hidden">
              <summary className="min-h-[60px] px-5 py-3 flex items-center gap-3 cursor-pointer list-none hover:bg-white transition-colors [&::-webkit-details-marker]:hidden">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-[#2D2D2D] truncate">{cargo}</p>
                  <p className="text-[12px] text-[#757575]">
                    {allowed.length} aba(s) liberada(s)
                  </p>
                </div>

                <ChevronRight size={20} className="shrink-0 text-[#757575] transition-transform group-open:rotate-90" />
              </summary>

              <div className="border-t border-[#E5E7EB] p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {visibleTabs.map((tab) => {
                    const checked = allowed.includes(tab.key);

                    return (
                      <label
                        key={`${cargo}-${tab.key}`}
                        className="min-h-11 px-3 py-2 rounded-xl border border-[#E5E7EB] bg-white flex items-center justify-between gap-3 cursor-pointer hover:border-[#F05D28] transition-colors"
                      >
                        <span className="text-[12px] font-medium text-[#2D2D2D] leading-tight">{tab.label}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => void onToggle(cargo, tab.key)}
                          className="w-4 h-4 accent-[#F05D28] cursor-pointer shrink-0"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
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

function TerceirizadasManager({
  terceirizadas,
  disciplinas,
  onSave,
  onDelete,
  pendingIds,
}: {
  terceirizadas: TerceirizadaRecord[];
  disciplinas: string[];
  onSave: (payload: Omit<TerceirizadaRecord, 'id'> & { id?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  pendingIds: string[];
}) {
  const [nome, setNome] = React.useState('');
  const [disciplina, setDisciplina] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = nome.trim();
    const cleanDisciplina = disciplina.trim();
    if (!cleanName || !cleanDisciplina) return;

    setLoading(true);
    try {
      await onSave({ nome: cleanName, disciplina: cleanDisciplina });
      setNome('');
      setDisciplina('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden">
      <div className="px-8 py-6 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-3">
          <Users size={18} className="text-[#F05D28]" />
          <h2 className="text-[18px] font-bold text-[#2D2D2D]">Terceirizadas por Disciplina</h2>
        </div>
        <p className="text-[13px] text-[#757575] mt-1">
          Empresas cadastradas aparecem junto dos profissionais no registro de atividades, respeitando o filtro de disciplina.
        </p>
      </div>

      <div className="p-6 space-y-5">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,260px)_auto] gap-4 items-end">
          <div>
            <label className="bentham-label">Nome da terceirizada</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="bentham-input"
              placeholder="Ex.: Empresa parceira"
            />
          </div>

          <div>
            <label className="bentham-label">Disciplina</label>
            <SearchableSelect
              value={disciplina}
              onChange={(e) => setDisciplina(e.target.value)}
              className="bentham-select"
            >
              <option value="">Selecionar</option>
              {disciplinas.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SearchableSelect>
          </div>

          <button
            type="submit"
            disabled={loading || !nome.trim() || !disciplina.trim()}
            className="h-11 px-5 rounded-xl bg-[#F05D28] text-white text-[13px] font-bold hover:bg-[#D94E1F] transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-70"
          >
            <Plus size={16} />
            Registrar
          </button>
        </form>

        <div className="space-y-4">
          {terceirizadas.length === 0 && (
            <p className="text-[13px] text-[#757575]">Nenhuma terceirizada cadastrada.</p>
          )}

          {terceirizadas.map((item) => (
            <details key={item.id} className="group border border-[#E5E7EB] rounded-2xl bg-[#F9FAFB] overflow-hidden">
              <summary className="min-h-[64px] px-5 py-3 flex items-center gap-3 cursor-pointer list-none hover:bg-white transition-colors [&::-webkit-details-marker]:hidden">
                <div className="w-10 h-10 rounded-full bg-[#F05D28]/10 flex items-center justify-center text-[#F05D28] font-bold text-sm shrink-0">
                  {getUserInitials(item.nome)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-[#2D2D2D] truncate">{item.nome}</p>
                  <p className="text-[12px] text-[#757575] truncate">{item.disciplina}</p>
                </div>

                <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-[#E5E7EB] bg-white text-[#757575] text-[11px] font-bold shrink-0">
                  TERCEIRIZADA
                </span>

                {pendingIds.includes(item.id) && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C] text-[11px] font-bold shrink-0">
                    Alteracoes pendentes
                  </span>
                )}

                <ChevronRight size={20} className="shrink-0 text-[#757575] transition-transform group-open:rotate-90" />
              </summary>

              <div className="border-t border-[#E5E7EB] p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                  <div className="flex flex-col gap-1.5">
                    <label className="bentham-label">Disciplina</label>
                    <div className="h-11 px-3 rounded-xl border border-[#E5E7EB] bg-white flex items-center text-[13px] font-medium text-[#2D2D2D]">
                      {item.disciplina}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="bentham-label">Ações</label>
                    <button
                      type="button"
                      onClick={() => void onDelete(item.id)}
                      className="h-11 px-4 rounded-xl bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA] text-[13px] font-bold hover:bg-[#FEE2E2] transition-colors inline-flex items-center justify-center gap-2 w-fit"
                    >
                      <Trash2 size={16} />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Administracao({
  usuarios,
  disciplinas,
  disciplineSettings,
  cargos,
  alocacoes,
  terceirizadas,
  contratos,
  roleTabPermissions,
  databaseLinks,
  appTabs,
  activeSection = 'usuarios',
  onRefresh,
  onUpdateUsuario,
  onToggleAdmin,
  onToggleTabPermission,
  dirtyUserIds,
  pendingTerceirizadaIds,
  onAcceptUser,
  onBlockUser,
  onDeleteUsuario,
  onPasswordReset,
  onAddDisciplina,
  onRemoveDisciplina,
  onToggleDisciplineCharts,
  onAddCargo,
  onRemoveCargo,
  onAddAlocacao,
  onRemoveAlocacao,
  onSaveTerceirizada,
  onDeleteTerceirizada,
  onToggleRoleTabPermission,
  onSaveDatabaseLink,
  onDeleteDatabaseLink,
  onSaveChanges,
  hasPendingChanges,
  isSavingChanges,
  preRegistrations,
  onAddPreRegistration,
  onRemovePreRegistration,
}: AdministracaoProps) {
  const [search, setSearch] = React.useState('');
  const deferredSearch = React.useDeferredValue(search);
  const [disciplinaFiltro, setDisciplinaFiltro] = React.useState('Todas');
  const [cargoFiltro, setCargoFiltro] = React.useState('Todos');
  const [activeManagementModal, setActiveManagementModal] = React.useState<null | 'cargos' | 'disciplinas' | 'alocacoes'>(null);
  const [deliveryNoticeCount, setDeliveryNoticeCount] = React.useState(0);
  const [deliveryNoticeOpen, setDeliveryNoticeOpen] = React.useState(false);
  const wasSavingRef = React.useRef(false);

  const [preRegEmail, setPreRegEmail] = React.useState('');
  const [preRegCargo, setPreRegCargo] = React.useState('');
  const [preRegDisciplina, setPreRegDisciplina] = React.useState('');
  const [preRegAlocacao, setPreRegAlocacao] = React.useState('');
  const [preRegContrato, setPreRegContrato] = React.useState('');
  const [preRegAllowedTabs, setPreRegAllowedTabs] = React.useState<AppTabKey[]>([]);

  const totalUsuarios = usuarios.length;
  const usuariosOnline = usuarios.filter((user) => user.online).length;
  const pendentes = usuarios.filter((user) => user.status === 'pending').length;
  const bloqueados = usuarios.filter((user) => user.status === 'blocked').length;

  const usuariosFiltrados = React.useMemo(() => {
    return usuarios.filter((user) => {
      const termo = deferredSearch.trim().toLowerCase();

      const matchesSearch =
        !termo ||
        user.nome.toLowerCase().includes(termo) ||
        user.email.toLowerCase().includes(termo);

      const matchesDisciplina =
        disciplinaFiltro === 'Todas' ||
        user.disciplina === disciplinaFiltro ||
        (Array.isArray(user.disciplinas) && user.disciplinas.includes(disciplinaFiltro));

      const matchesCargo =
        cargoFiltro === 'Todos' || user.cargo === cargoFiltro;

      return matchesSearch && matchesDisciplina && matchesCargo;
    });
  }, [usuarios, deferredSearch, disciplinaFiltro, cargoFiltro]);

  React.useEffect(() => {
    if (isSavingChanges) {
      wasSavingRef.current = true;
      return;
    }

    if (wasSavingRef.current && !hasPendingChanges) {
      setDeliveryNoticeCount(1);
      setDeliveryNoticeOpen(false);
    }

    wasSavingRef.current = false;
  }, [hasPendingChanges, isSavingChanges]);

  return (
    <div className="space-y-6 max-w-full pb-24 md:pb-28">
      {deliveryNoticeCount > 0 && (
        <div className="fixed top-4 right-4 md:top-6 md:right-6 z-[70]">
          <div className="relative">
            <button
              type="button"
              onClick={() => setDeliveryNoticeOpen((prev) => !prev)}
              className="relative w-12 h-12 rounded-2xl border border-[#E5E7EB] bg-white text-[#F05D28] shadow-xl shadow-black/10 hover:border-[#F05D28] transition-colors inline-flex items-center justify-center"
              aria-label="Abrir notificacao de envio"
              title="Notificacao de envio"
            >
              <Mail size={18} />
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[#F05D28] text-white text-[10px] font-bold inline-flex items-center justify-center">
                {deliveryNoticeCount}
              </span>
            </button>

            {deliveryNoticeOpen && (
              <div className="absolute top-14 right-0 w-[320px] rounded-2xl border border-[#E5E7EB] bg-white shadow-2xl shadow-black/15 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-bold text-[#2D2D2D]">Aviso de atualizacao</p>
                    <p className="text-[12px] text-[#757575] mt-2 leading-relaxed">
                      As atualizacoes e informacoes preenchidas no site podem demorar ate 5 minutos para atualizar, pois o site e criptografado e esse processo pode levar um pouco mais de tempo.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryNoticeOpen(false);
                      setDeliveryNoticeCount((prev) => {
                        const next = Math.max(0, prev - 1);
                        return next;
                      });
                    }}
                    className="w-8 h-8 rounded-lg text-[#757575] hover:text-[#2D2D2D] hover:bg-[#F9FAFB] transition-colors inline-flex items-center justify-center shrink-0"
                    aria-label="Fechar notificacao"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50">
        <button
          type="button"
          onClick={() => void onSaveChanges()}
          disabled={!hasPendingChanges || isSavingChanges}
          aria-label="Enviar informacoes"
          title={hasPendingChanges ? 'Enviar informacoes' : 'Nenhuma alteracao pendente'}
          className="h-16 px-8 rounded-2xl bg-[#F05D28] text-white text-[15px] font-bold shadow-2xl shadow-black/20 hover:bg-[#D94E1F] transition-colors inline-flex items-center gap-3 disabled:opacity-70"
        >
          {isSavingChanges ? <RefreshCcw size={18} className="animate-spin" /> : <Save size={18} />}
          Enviar informacoes
        </button>
      </div>

      {activeSection === 'usuarios' && (
        <>
      <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm p-6 lg:p-8">
        <div className="space-y-6">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard icon={<Users size={18} className="text-[#F05D28]" />} label="Usuários" value={String(totalUsuarios)} />
            <MetricCard icon={<UserCheck size={18} className="text-[#10B981]" />} label="Online" value={String(usuariosOnline)} />
            <MetricCard icon={<ShieldCheck size={18} className="text-[#C2410C]" />} label="Pendentes" value={String(pendentes)} />
            <MetricCard icon={<Lock size={18} className="text-[#B91C1C]" />} label="Bloqueados" value={String(bloqueados)} />
          </div>
        </div>
      </section>

      <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm p-5 lg:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-[minmax(280px,1.2fr)_minmax(180px,220px)_minmax(180px,220px)_auto] gap-4 items-end">
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
            <SearchableSelect
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
            </SearchableSelect>
          </div>

          <div>
            <label className="bentham-label">Filtrar cargo</label>
            <SearchableSelect
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
            </SearchableSelect>
          </div>

          <button
            type="button"
            onClick={() => {
              if (hasPendingChanges && !window.confirm('Existem alteracoes sem enviar. Atualizar vai descarta-las. Deseja continuar?')) return;
              void onRefresh();
            }}
            className="h-11 px-4 rounded-xl border border-[#E5E7EB] bg-white text-[#2D2D2D] text-[13px] font-bold hover:border-[#F05D28] hover:text-[#F05D28] transition-colors inline-flex items-center justify-center gap-2"
          >
            <RefreshCcw size={16} />
            Atualizar
          </button>

          <p className="text-[12px] text-[#C2410C] mt-2">
            O cargo agora apenas preenche automaticamente as abas permitidas. O acesso real depende somente das abas marcadas para cada usuario.
          </p>
        </div>
      </section>

      <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 lg:px-8 py-6 border-b border-[#E5E7EB]">
          <h2 className="text-[18px] font-bold text-[#2D2D2D]">Lista de Usuários Cadastrados</h2>
          <p className="text-[13px] text-[#757575] mt-1">
            Usuários pendentes aguardam aceite do administrador. Usuários bloqueados perdem acesso ao app.
          </p>
        </div>

        <div className="p-4 lg:p-6 space-y-4">
          {usuariosFiltrados.map((user) => (
            <details key={user.id} className="group border border-[#E5E7EB] rounded-2xl bg-[#F9FAFB] overflow-hidden">
              <summary className="min-h-[64px] px-5 py-3 flex items-center gap-3 cursor-pointer list-none hover:bg-white transition-colors [&::-webkit-details-marker]:hidden">
                <div className="w-10 h-10 rounded-full bg-[#F05D28]/10 flex items-center justify-center text-[#F05D28] font-bold text-sm shrink-0">
                  {getUserInitials(user.nome)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-[#2D2D2D] truncate">{user.nome}</p>
                  <p className="text-[12px] text-[#757575] truncate">{user.email}</p>
                </div>

                <ChevronRight size={20} className="shrink-0 text-[#757575] transition-transform group-open:rotate-90" />
              </summary>

              <div className="border-t border-[#E5E7EB] p-5">
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(260px,1fr)_minmax(0,1.5fr)] gap-5 items-start">
                  <div className="min-w-0">
                    <p className="text-[12px] text-[#757575] truncate">{user.email}</p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-bold ${statusClasses(user.status)}`}>
                      {statusLabel(user.status)}
                    </span>

                    {dirtyUserIds.includes(user.id) && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C] text-[11px] font-bold">
                        Alteracoes pendentes
                      </span>
                    )}

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

                <div className="min-w-0 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="bentham-label">Status</label>
                  <div className="h-11 px-3 rounded-xl border border-[#E5E7EB] bg-white flex items-center">
                    <StatusOnline online={user.online} />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="bentham-label">Disciplina</label>
                  <DisciplineMultiSelect
                    value={user.disciplinas || (user.disciplina ? [user.disciplina] : [])}
                    options={disciplinas}
                    onChange={(nextValue) => onUpdateUsuario(user.id, {
                      disciplina: nextValue[0] || '',
                      disciplinas: nextValue,
                    })}
                  />
                  <p className="text-[11px] text-[#757575] leading-relaxed">
                    {Array.isArray(user.disciplinas) && user.disciplinas.length > 0
                      ? user.disciplinas.join(' | ')
                      : user.disciplina || 'Nenhuma disciplina selecionada'}
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="bentham-label">Cargo</label>
                  <SearchableSelect
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
                  </SearchableSelect>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="bentham-label">Alocação</label>
                  <SearchableSelect
                    className="bentham-select"
                    value={user.alocacao}
                    onChange={(e) => onUpdateUsuario(user.id, { alocacao: e.target.value })}
                  >
                    <option value="">Selecionar</option>
                    {alocacoes.map((alocacao) => (
                      <option key={alocacao} value={alocacao}>
                        {alocacao}
                      </option>
                    ))}
                  </SearchableSelect>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="bentham-label">Contrato</label>
                  <SearchableSelect
                    className="bentham-select"
                    value={user.contrato}
                    onChange={(e) => onUpdateUsuario(user.id, { contrato: e.target.value })}
                  >
                    <option value="">Sem limite</option>
                    {contratos.map((contrato) => (
                      <option key={contrato.id} value={contrato.id}>
                        {contrato.nome}
                      </option>
                    ))}
                  </SearchableSelect>
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

                <div className="flex flex-col gap-1.5">
                  <label className="bentham-label">Mostrar em graficos</label>
                  <label className="h-11 px-3 rounded-xl border border-[#E5E7EB] bg-white flex items-center justify-between cursor-pointer">
                    <span className="text-[13px] font-medium text-[#2D2D2D]">
                      {user.showInCharts !== false ? 'Sim' : 'Nao'}
                    </span>
                    <input
                      type="checkbox"
                      checked={user.showInCharts !== false}
                      onChange={(e) => onUpdateUsuario(user.id, { showInCharts: e.target.checked })}
                      className="w-4 h-4 accent-[#F05D28] cursor-pointer"
                    />
                  </label>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="bentham-label">Somente terceirizados</label>
                  <label className="h-11 px-3 rounded-xl border border-[#E5E7EB] bg-white flex items-center justify-between cursor-pointer">
                    <span className="text-[13px] font-medium text-[#2D2D2D]">
                      {user.onlyThirdParty ? 'Sim' : 'Nao'}
                    </span>
                    <input
                      type="checkbox"
                      checked={user.onlyThirdParty}
                      onChange={(e) => onUpdateUsuario(user.id, { onlyThirdParty: e.target.checked })}
                      className="w-4 h-4 accent-[#F05D28] cursor-pointer"
                    />
                  </label>
                </div>

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
                  <div className="flex flex-wrap gap-3">
                  {user.status === 'pending' ? (
                    <button
                      type="button"
                      onClick={() => void onAcceptUser(user.id)}
                      className="h-11 px-4 rounded-xl bg-[#F05D28] text-white text-[13px] font-bold hover:bg-[#D94E1F] transition-colors inline-flex items-center justify-center gap-2"
                    >
                      <Check size={16} />
                      Aceitar
                    </button>
                  ) : (
                    <div className="h-11 px-4 rounded-xl border border-dashed border-[#E5E7EB] text-[#9CA3AF] text-[12px] font-medium inline-flex items-center justify-center">
                      Usuário já analisado
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void onBlockUser(user.id)}
                    className="h-11 px-4 rounded-xl bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA] text-[13px] font-bold hover:bg-[#FEE2E2] transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <Ban size={16} />
                    Bloquear
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Excluir definitivamente o usuário ${user.nome || user.email}? Essa ação não pode ser desfeita.`)) {
                        void onDeleteUsuario(user.id);
                      }
                    }}
                    className="h-11 px-4 rounded-xl bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA] text-[13px] font-bold hover:bg-[#FEE2E2] transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <Trash2 size={16} />
                    Excluir
                  </button>
                  </div>
                </div>
                </div>
              </div>
              </div>
            </details>
          ))}
        </div>
      </section>
        </>
      )}

      {activeSection === 'terceirizadas' && (
      <TerceirizadasCadastro
        terceirizadas={terceirizadas}
        disciplinas={disciplinas}
        onSave={onSaveTerceirizada}
        onDelete={onDeleteTerceirizada}
        pendingIds={pendingTerceirizadaIds}
      />
      )}

      {activeSection === 'pre-cadastro' && (
        <section className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm p-6 lg:p-8 space-y-6">
          <div>
            <p className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">Pré-cadastro</p>
            <h1 className="text-[24px] font-bold text-[#2D2D2D] mt-2">Pré-cadastro de Usuários</h1>
            <p className="text-[14px] text-[#757575] mt-2 max-w-[840px] leading-relaxed">
              Pré-configure o e-mail, cargo e disciplina de um usuário. Quando ele se cadastrar com esse e-mail, o acesso será aprovado automaticamente com as configurações definidas aqui.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-[#757575]">E-mail</label>
              <input
                type="email"
                value={preRegEmail}
                onChange={(e) => setPreRegEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                className="w-full h-11 px-3 rounded-xl border border-[#E5E7EB] bg-white text-[13px] font-medium text-[#2D2D2D] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#F05D28] transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[12px] font-medium text-[#757575]">Cargo</label>
              <SearchableSelect
                value={preRegCargo}
                onChange={(e) => setPreRegCargo(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-[#E5E7EB] bg-white text-[13px] font-medium text-[#2D2D2D] focus:outline-none focus:border-[#F05D28] transition-colors"
              >
                <option value="">Selecionar cargo</option>
                {cargos.map((c) => <option key={c} value={c}>{c}</option>)}
              </SearchableSelect>
            </div>

            <div className="space-y-1">
              <label className="text-[12px] font-medium text-[#757575]">Disciplina</label>
              <SearchableSelect
                value={preRegDisciplina}
                onChange={(e) => setPreRegDisciplina(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-[#E5E7EB] bg-white text-[13px] font-medium text-[#2D2D2D] focus:outline-none focus:border-[#F05D28] transition-colors"
              >
                <option value="">Selecionar disciplina</option>
                {disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}
              </SearchableSelect>
            </div>

            <div className="space-y-1">
              <label className="text-[12px] font-medium text-[#757575]">Alocação (opcional)</label>
              <SearchableSelect
                value={preRegAlocacao}
                onChange={(e) => setPreRegAlocacao(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-[#E5E7EB] bg-white text-[13px] font-medium text-[#2D2D2D] focus:outline-none focus:border-[#F05D28] transition-colors"
              >
                <option value="">Nenhuma</option>
                {alocacoes.map((a) => <option key={a} value={a}>{a}</option>)}
              </SearchableSelect>
            </div>

            <div className="space-y-1">
              <label className="text-[12px] font-medium text-[#757575]">Contrato (opcional)</label>
              <SearchableSelect
                value={preRegContrato}
                onChange={(e) => setPreRegContrato(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-[#E5E7EB] bg-white text-[13px] font-medium text-[#2D2D2D] focus:outline-none focus:border-[#F05D28] transition-colors"
              >
                <option value="">Nenhum</option>
                {contratos.map((c) => <option key={c.id} value={c.id}>{c.nome || c.id}</option>)}
              </SearchableSelect>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                disabled={!preRegEmail.trim() || !preRegCargo || !preRegDisciplina}
                onClick={() => {
                  const email = preRegEmail.trim().toLowerCase();
                  if (!email || !preRegCargo || !preRegDisciplina) return;
                  onAddPreRegistration({ email, cargo: preRegCargo, disciplina: preRegDisciplina, alocacao: preRegAlocacao, contrato: preRegContrato, allowedTabs: preRegAllowedTabs });
                  setPreRegEmail('');
                  setPreRegCargo('');
                  setPreRegDisciplina('');
                  setPreRegAlocacao('');
                  setPreRegContrato('');
                  setPreRegAllowedTabs([]);
                }}
                className="h-11 px-6 rounded-xl bg-[#F05D28] text-white text-[13px] font-bold hover:bg-[#D94E1F] transition-colors inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Plus size={15} />
                Adicionar
              </button>
            </div>
          </div>

          {appTabs.filter((t) => t.key !== 'administracao').length > 0 && (
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-[#757575]">Abas liberadas ao registrar</label>
              <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3 flex flex-wrap gap-x-4 gap-y-2">
                {appTabs.filter((t) => t.key !== 'administracao').map((tab) => (
                  <label key={tab.key} className="flex items-center gap-2 cursor-pointer text-[12px] font-medium text-[#2D2D2D]">
                    <input
                      type="checkbox"
                      checked={preRegAllowedTabs.includes(tab.key)}
                      onChange={() => setPreRegAllowedTabs((prev) =>
                        prev.includes(tab.key) ? prev.filter((k) => k !== tab.key) : [...prev, tab.key]
                      )}
                      className="w-4 h-4 accent-[#F05D28]"
                    />
                    {tab.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {preRegistrations.length > 0 && (
            <div className="space-y-3">
              <p className="text-[13px] font-bold text-[#2D2D2D]">{preRegistrations.length} e-mail(s) pré-cadastrado(s)</p>
              <div className="rounded-2xl border border-[#E5E7EB] overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                      <th className="text-left px-4 py-3 font-semibold text-[#757575]">E-mail</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#757575]">Cargo</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#757575]">Disciplina</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#757575]">Alocação</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#757575]">Contrato</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#757575]">Abas</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {preRegistrations.map((reg) => (
                      <tr key={reg.email} className="border-b border-[#E5E7EB] last:border-0 hover:bg-[#F9FAFB] transition-colors">
                        <td className="px-4 py-3 font-medium text-[#2D2D2D]">{reg.email}</td>
                        <td className="px-4 py-3 text-[#757575]">{reg.cargo || '—'}</td>
                        <td className="px-4 py-3 text-[#757575]">{reg.disciplina || '—'}</td>
                        <td className="px-4 py-3 text-[#757575]">{reg.alocacao || '—'}</td>
                        <td className="px-4 py-3 text-[#757575]">{reg.contrato || '—'}</td>
                        <td className="px-4 py-3 text-[#757575]">
                          {Array.isArray(reg.allowedTabs) && reg.allowedTabs.length > 0
                            ? reg.allowedTabs.map((k) => appTabs.find((t) => t.key === k)?.label || k).join(', ')
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => onRemovePreRegistration(reg.email)}
                            className="w-8 h-8 rounded-lg border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C] hover:bg-[#FEE2E2] transition-colors inline-flex items-center justify-center"
                            title="Remover pré-cadastro"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preRegistrations.length === 0 && (
            <div className="text-center py-10 text-[#9CA3AF] text-[13px]">
              Nenhum pré-cadastro configurado ainda.
            </div>
          )}
        </section>
      )}

      {activeSection === 'gerenciamento' && (
        <>
      <section className="grid grid-cols-1 2xl:grid-cols-3 gap-6">
        <ManagementLauncherCard
          title="Gerenciar Cargos"
          subtitle="Visualize os cargos cadastrados e abra o balão para editar a lista."
          badge={`${cargos.length} cadastrado(s)`}
          onOpen={() => setActiveManagementModal('cargos')}
        />

        <ManagementLauncherCard
          title="Gerenciar Disciplinas"
          subtitle="Visualize as disciplinas cadastradas e abra o balão para editar e controlar os graficos."
          badge={`${disciplinas.length} cadastrada(s)`}
          onOpen={() => setActiveManagementModal('disciplinas')}
        />

        <ManagementLauncherCard
          title="Gerenciar Alocacao"
          subtitle="Visualize as alocacoes cadastradas e abra o balão para manter tudo padronizado."
          badge={`${alocacoes.length} cadastrada(s)`}
          onOpen={() => setActiveManagementModal('alocacoes')}
        />
      </section>

      <FadeModal
        open={activeManagementModal === 'cargos'}
        title="Gerenciar Cargos"
        subtitle="Visualize tudo o que ja esta cadastrado e ajuste os cargos em um unico lugar."
        onClose={() => setActiveManagementModal(null)}
      >
        <InlineListManager
          title="Gerenciar Cargos"
          subtitle="Adicione ou remova os cargos disponiveis para selecao no cadastro administrativo."
          items={cargos}
          placeholder="Novo cargo"
          onAdd={onAddCargo}
          onRemove={onRemoveCargo}
        />
      </FadeModal>

      <FadeModal
        open={activeManagementModal === 'disciplinas'}
        title="Gerenciar Disciplinas"
        subtitle="Visualize as disciplinas cadastradas, ajuste a exibicao em graficos e remova o que nao serve mais."
        onClose={() => setActiveManagementModal(null)}
      >
        <DisciplineSettingsManager
          items={disciplinas}
          settings={disciplineSettings}
          onAdd={onAddDisciplina}
          onRemove={onRemoveDisciplina}
          onToggleCharts={onToggleDisciplineCharts}
        />
      </FadeModal>

      <FadeModal
        open={activeManagementModal === 'alocacoes'}
        title="Gerenciar Alocacao"
        subtitle="Visualize as alocacoes cadastradas e mantenha a lista padronizada."
        onClose={() => setActiveManagementModal(null)}
      >
        <InlineListManager
          title="Gerenciar Alocacao"
          subtitle="Adicione ou remova as opcoes de alocacao disponiveis para os usuarios."
          items={alocacoes}
          placeholder="Nova alocacao"
          onAdd={onAddAlocacao}
          onRemove={onRemoveAlocacao}
        />
      </FadeModal>

      {false && (
      <section className="grid grid-cols-1 2xl:grid-cols-3 gap-6">
        <InlineListManager
          title="Gerenciar Cargos"
          subtitle="Adicione ou remova os cargos disponíveis para seleção no cadastro administrativo."
          items={cargos}
          placeholder="Novo cargo"
          onAdd={onAddCargo}
          onRemove={onRemoveCargo}
        />

        <DisciplineSettingsManager
          items={disciplinas}
          settings={disciplineSettings}
          onAdd={onAddDisciplina}
          onRemove={onRemoveDisciplina}
          onToggleCharts={onToggleDisciplineCharts}
        />
        <InlineListManager
          title="Gerenciar Alocação"
          subtitle="Adicione ou remova as opcoes de alocacao disponiveis para os usuarios."
          items={alocacoes}
          placeholder="Nova alocação"
          onAdd={onAddAlocacao}
          onRemove={onRemoveAlocacao}
        />
      </section>
      )}

      <RoleTabPermissionsManager
        cargos={cargos}
        appTabs={appTabs}
        roleTabPermissions={roleTabPermissions}
        onToggle={onToggleRoleTabPermission}
      />

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
        </>
      )}

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
    <div className="min-w-0 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="w-9 h-9 rounded-xl bg-white border border-[#E5E7EB] flex items-center justify-center shrink-0">
          {icon}
        </span>
        <span className="text-[20px] font-bold text-[#2D2D2D] truncate">{value}</span>
      </div>

      <p className="text-[12px] text-[#757575] mt-3 truncate">{label}</p>
    </div>
  );
}
