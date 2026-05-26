// @ts-nocheck
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList,
  Settings,
  Users,
  Briefcase,
  AlertTriangle,
  Calendar,
  Bell,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Filter,
  LayoutDashboard,
  TrendingUp,
  LayoutGrid,
  ShieldCheck,
  Clipboard,
  CheckSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import RegistroDeAtividade from './components/RegistroDeAtividade';
import ControleEngenharia from './components/CoordenacaoEngenharia';
import ContratosSudeste from './components/ContratosSudeste';
import NaoConformidades from './components/NaoConformidade/Conformidade';
import Cronograma from './components/Cronograma';
import Projetista from './components/Projetista';

import Administracao, {
  AppTabKey,
  UserAccessRecord,
  DatabaseLinkRecord,
} from './components/Administracao';
import LoginScreen, { AuthUser } from './components/LoginScreen';
import { rtdb } from './firebase';
import { ref, get, set } from 'firebase/database';

// Chave do perfil no RTDB usando email sanitizado
const emailToKey = (email: string) => email.toLowerCase().trim().replace(/[.#$[\]]/g, '_');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyl1TyOHEuhWV-twFybZ3wQ1k7IOb4Ob-lvjNtODiK9rxgZB4TA4iVtFbRjXorhaK5G/exec';

// Domínio corporativo: usuários deste domínio são aprovados automaticamente
// mas sem nenhuma aba habilitada (admin atribuirá acessos depois se necessário)
const CORPORATE_DOMAIN = '@quantaconsultoria.com';
const isCorporateEmail = (email: string) => email.toLowerCase().trim().endsWith(CORPORATE_DOMAIN);

type AppTab = 'registro' | 'controle' | 'contratos' | 'nc' | 'cronograma' | 'projetista' | 'administracao';

interface AuthResponse {
  success: boolean;
  error?: string;
  message?: string;
  user?: any;
}

interface GenericResponse {
  success: boolean;
  error?: string;
  message?: string;
}

interface GlobalData {
  registro?: any;
  cronograma?: any;
  admin?: any;
}

// Session Storage
function getStorageKey() { return 'quanta_auth_user'; }
const CACHE_DATA_KEY = 'quanta_global_data_cache';

function saveSession(user: AuthUser, remember: boolean) {
  const key = getStorageKey();
  const serialized = JSON.stringify(user);
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
  if (remember) localStorage.setItem(key, serialized);
  else sessionStorage.setItem(key, serialized);
}

function readSession(): AuthUser | null {
  const key = getStorageKey();
  try {
    const local = localStorage.getItem(key);
    if (local) return JSON.parse(local) as AuthUser;
    const session = sessionStorage.getItem(key);
    if (session) return JSON.parse(session) as AuthUser;
  } catch (error) { console.error('Erro ao ler sessão:', error); }
  return null;
}

function clearSession() {
  const key = getStorageKey();
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
  localStorage.removeItem(CACHE_DATA_KEY);
}

function saveGlobalDataCache(data: GlobalData) {
  try { localStorage.setItem(CACHE_DATA_KEY, JSON.stringify(data)); } catch (e) { }
}

function getGlobalDataCache(): GlobalData | null {
  try {
    const cached = localStorage.getItem(CACHE_DATA_KEY);
    if (cached) return JSON.parse(cached);
  } catch (e) { }
  return null;
}

async function postToAppsScript<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST', body: JSON.stringify(payload),
  });
  
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('Servidor instável ou resposta inválida do Apps Script: ' + text.substring(0, 100));
  }
}

function normalizeUser(raw: any): AuthUser {
  if (!raw) throw new Error('Usuário inválido.');
  const abas = Array.isArray(raw.abas)
    ? raw.abas
    : String(raw.abas || '').split(',').map((item) => item.trim()).filter(Boolean);
  return {
    nome: raw.nome || '',
    email: raw.email || '',
    role: raw.role || '',
    disciplina: raw.disciplina || '',
    status: raw.status || '',
    abas,
    isAdmin: Boolean(raw.isAdmin),
    online: Boolean(raw.online),
  };
}

function getUserInitials(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map((parte) => parte[0]?.toUpperCase() || '').join('');
}

function userHasTabAccess(user: AuthUser, tab: AppTab) {
  if (tab === 'administracao') return Boolean(user.isAdmin);
  if (user.isAdmin) return true;
  if (tab === 'projetista') return true; // Enable by default so it appears on localhost
  return Array.isArray(user.abas) && user.abas.includes(tab);
}

const MOCK_DATA = [
  {
    id: 'MKE',
    nome: 'MKE',
    oss: [
      { id: 'OS 011', nome: 'PARQUE DAS ÁGUAS', disciplinas: ['Elétrica', 'PCI e Gás', 'Terraplanagem'] },
      { id: 'OS 013', nome: 'ORLA ARAÇATIBA', disciplinas: ['Estrutural', 'Hidrossanitário', 'Orçamento'] },
      { id: 'OS 022', nome: 'MERCADO MUNICIPAL', disciplinas: ['Elétrica', 'Estrutural', 'Hidrossanitário'] },
      { id: 'OS 032', nome: 'REURB', disciplinas: ['Terraplanagem', 'Orçamento'] },
      { id: 'OS 034', nome: 'CANAL CIDADE', disciplinas: ['Estrutural', 'Hidrossanitário'] },
      { id: 'OS 037', nome: 'POLO CULINÁRIO', disciplinas: ['Elétrica', 'PCI e Gás'] },
      { id: 'OS 043', nome: 'CANAL DA CIDADE - FASE 2', disciplinas: ['Estrutural', 'Hidrossanitário', 'Terraplanagem'] },
      { id: 'OS 049', nome: 'MASTERPLAN CENTRO MARICÁ', disciplinas: ['Terraplanagem', 'Orçamento'] }
    ]
  },
  {
    id: 'MRK',
    nome: 'MRK',
    oss: [
      { id: 'OS 050', nome: 'PROJETOS COMPLEMENTARES', disciplinas: ['Elétrica', 'PCI e Gás', 'Hidrossanitário'] },
      { id: 'OS 053', nome: 'MASTERPLAN ITAIPUAÇU', disciplinas: ['Terraplanagem', 'Orçamento'] }
    ]
  }
];

const APP_TABS_LIST: Array<{ key: AppTabKey; label: string }> = [
  { key: 'registro', label: 'Registro de Atividade' },
  { key: 'controle', label: 'Coordenação de Engenharia' },
  { key: 'contratos', label: 'Contratos Sudeste' },
  { key: 'nc', label: 'Não Conformidades' },
  { key: 'cronograma', label: 'Cronograma' },
  { key: 'projetista', label: 'Projetista' },
  { key: 'administracao', label: 'Administração' }
];

export default function App() {
  const [booting, setBooting] = useState(true);
  const [preloading, setPreloading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadText, setLoadText] = useState('Iniciando conexão...');
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const [activeTab, setActiveTab] = React.useState<AppTab>('registro');
  const [subTab, setSubTab] = React.useState<'dashboard' | 'alocacoes' | 'curva-s' | 'matrix'>('dashboard');
  const [ncSubTab, setNcSubTab] = React.useState<'dashboard' | 'preenchimento' | 'revisoes'>('dashboard');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [showFilters, setShowFilters] = React.useState(false);

  const [globalData, setGlobalData] = useState<GlobalData>({});

  // ADMIN
  const [usuarios, setUsuarios] = useState<UserAccessRecord[]>([]);
  const [disciplinas, setDisciplinas] = useState<string[]>([]);
  const [cargos, setCargos] = useState<string[]>([]);
  const [databaseLinks, setDatabaseLinks] = useState<DatabaseLinkRecord[]>([]);

  // Filter States (Dashboard/Tech Mock)
  const [filtrosAtivos, setFiltrosAtivos] = React.useState({ contrato: 'Todos', os: 'Todos', disciplina: 'Todos' });

  const contratos = MOCK_DATA;
  const ossDisponiveis = React.useMemo(() => contratos.flatMap(c => c.oss), [contratos]);
  const disciplinasDisponiveis = React.useMemo(() => {
    const all = contratos.flatMap(c => c.oss.flatMap(os => os.disciplinas));
    return Array.from(new Set(all));
  }, [contratos]);

  const loadGlobalEnvironment = async (user: AuthUser, isBackgroundSync = false) => {
    if (!isBackgroundSync) {
      const cachedData = getGlobalDataCache();
      if (cachedData && Object.keys(cachedData).length > 0) {
        setGlobalData(cachedData);
        if (cachedData.admin) {
          // Admin updates
          const ad = cachedData.admin;
          setUsuarios((ad.users || []).map((u: any) => ({
            id: u.id || u.email, nome: u.nome, email: u.email, online: Boolean(u.online), disciplina: u.disciplina || '',
            cargo: u.cargo || u.role || '', isAdmin: Boolean(u.isAdmin), status: u.status || 'pending',
            allowedTabs: ((u.allowedTabs || u.abas || []) as AppTabKey[]).filter(Boolean),
          })));
          setDisciplinas(ad.disciplinas || []); setCargos(ad.cargos || []); setDatabaseLinks(ad.databaseLinks || []);
        }
        setPreloading(false); setBooting(false);
        void loadGlobalEnvironment(user, true);
        return;
      }
    }

    let progressInterval: number | undefined;
    if (!isBackgroundSync) {
      setPreloading(true); setLoadProgress(0); setLoadText('Autenticando sessão...');
      let currentProgress = 0;
      progressInterval = window.setInterval(() => {
        currentProgress += Math.floor(Math.random() * 15) + 5;
        if (currentProgress > 90) currentProgress = 90;
        setLoadProgress(currentProgress);
        if (currentProgress > 20 && currentProgress <= 45) setLoadText('Baixando dados da EAP e Cronograma...');
        else if (currentProgress > 45 && currentProgress <= 75) setLoadText('Sincronizando atividades e status...');
        else if (currentProgress > 75) setLoadText('Quase lá, estruturando as informações...');
      }, 600);
    } else {
      setIsBackgroundSyncing(true);
    }

    try {
      // Leitura Direta do Firebase (Velocidade Extrema para Cloudflare Pages)
      const snap = await get(ref(rtdb, 'global_data'));
      if (snap.exists()) {
        const fullData = snap.val();
        
        // Converte o dicionário do Firebase de volta para o array esperado pelo sistema original
        if (fullData.admin && fullData.admin.usersByEmail) {
            fullData.admin.users = Object.values(fullData.admin.usersByEmail);
        }

        setGlobalData(fullData); 
        saveGlobalDataCache(fullData);
        if (fullData.admin) {
          const ad = fullData.admin;
          setUsuarios((ad.users || []).map((u: any) => ({
            id: u.id || u.email, nome: u.nome, email: u.email, online: Boolean(u.online), disciplina: u.disciplina || '',
            cargo: u.cargo || u.role || '', isAdmin: Boolean(u.isAdmin), status: u.status || 'pending',
            allowedTabs: ((u.allowedTabs || u.abas || []) as AppTabKey[]).filter(Boolean),
          })));
          setDisciplinas(ad.disciplinas || []); setCargos(ad.cargos || []); setDatabaseLinks(ad.databaseLinks || []);
        }
      }

      if (!isBackgroundSync && progressInterval) {
        clearInterval(progressInterval); setLoadProgress(100); setLoadText('Tudo pronto!');
        setTimeout(() => { setPreloading(false); setBooting(false); }, 500);
      }
    } catch (error) {
      if (!isBackgroundSync && progressInterval) {
        clearInterval(progressInterval); setLoadText('Ocorreu um erro ao carregar. Tente atualizar a página.');
        setTimeout(() => { setPreloading(false); setBooting(false); }, 2000);
      }
    } finally {
      if (isBackgroundSync) setIsBackgroundSyncing(false);
    }
  };

  useEffect(() => {
    const savedUser = readSession();
    if (savedUser) { 
      setCurrentUser(savedUser); 
      void loadGlobalEnvironment(savedUser); 
    } else { 
      const mockUser = {
        nome: 'Acesso Direto',
        email: 'dev@quantaconsultoria.com',
        role: 'Engenheiro',
        disciplina: 'Todas',
        status: 'active',
        abas: ['registro', 'controle', 'contratos', 'nc', 'cronograma', 'projetista', 'administracao'],
        isAdmin: true,
        online: true,
      };
      setCurrentUser(mockUser);
      void loadGlobalEnvironment(mockUser);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    if (!userHasTabAccess(currentUser, activeTab)) {
      if (userHasTabAccess(currentUser, 'registro')) setActiveTab('registro');
      else if (userHasTabAccess(currentUser, 'controle')) setActiveTab('controle');
      else if (userHasTabAccess(currentUser, 'contratos')) setActiveTab('contratos');
      else if (userHasTabAccess(currentUser, 'nc')) setActiveTab('nc');
      else if (userHasTabAccess(currentUser, 'cronograma')) setActiveTab('cronograma');
      else if (userHasTabAccess(currentUser, 'administracao')) setActiveTab('administracao');
    }
  }, [currentUser, activeTab]);

  useEffect(() => {
    if (!currentUser) return;
    const sendHeartbeat = async () => { try { await postToAppsScript<GenericResponse>({ action: 'heartbeat', email: currentUser.email }); } catch (e) { } };
    void sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 60000);
    return () => window.clearInterval(interval);
  }, [currentUser]);

  useEffect(() => {
    setShowFilters(false);
  }, [activeTab]);

  const loadAdminData = useCallback(async () => { if (currentUser) await loadGlobalEnvironment(currentUser, true); }, [currentUser]);

  const handleLogin = async (email: string, password: string, rememberMe: boolean) => {
    // 1. Apps Script valida credenciais e retorna perfil base
    const response = await postToAppsScript<AuthResponse>({ action: 'authUser', email, password });
    if (!response.success || !response.user) throw new Error(response.error || 'E-mail ou senha incorretos.');

    let userObj: any = response.user;
    const key = emailToKey(email);

    // 2. Firebase RTDB tem prioridade para dados de perfil (abas/cargo atualizados pelo admin)
    try {
      const snap = await get(ref(rtdb, `users_by_email/${key}`));
      if (snap.exists()) {
        // Mescla: mantém dados do RTDB (abas, cargo) mas atualiza lastSeen
        userObj = { ...userObj, ...snap.val() };
      } else {
        // Primeira vez: salva perfil no RTDB
        await set(ref(rtdb, `users_by_email/${key}`), userObj);
      }
    } catch (_) {
      // RTDB indisponível: usa dados do Apps Script (degraded mode)
    }

    const user = normalizeUser(userObj);
    saveSession(user, rememberMe);
    setCurrentUser(user);
    await loadGlobalEnvironment(user, false);

    if (Boolean(user.isAdmin)) setActiveTab('administracao');
    else if (user.abas.includes('registro')) setActiveTab('registro');
    else if (user.abas.includes('controle')) setActiveTab('controle');
    else if (user.abas.includes('contratos')) setActiveTab('contratos');
  };

  const handleLogout = () => { clearSession(); setCurrentUser(null); setGlobalData({}); };

  const handleRegister = async (name: string, email: string, password: string) => {
    // Apps Script registra o usuário e envia e-mail de confirmação
    const response = await postToAppsScript<GenericResponse>({ action: 'registerUser', name, email, password });
    if (!response.success) throw new Error(response.error || 'Falha ao registrar.');

    // Cria perfil inicial no RTDB (silencia erro se regras ainda não estiverem abertas)
    try {
      const isCorporate = isCorporateEmail(email);
      const key = emailToKey(email);
      await set(ref(rtdb, `users_by_email/${key}`), {
        nome: name, email, role: '', disciplina: '',
        status: isCorporate ? 'active' : 'pending',
        abas: [], isAdmin: false
      });
    } catch (_) { /* RTDB indisponível: Apps Script é fonte de verdade */ }

    return response.message || (isCorporateEmail(email)
      ? 'Acesso liberado! Entre com suas credenciais.'
      : 'Cadastro enviado. Aguarde aprovação do administrador.');
  };

  const handleForgotPassword = async (email: string) => {
    const response = await postToAppsScript<GenericResponse>({ action: 'forgotPassword', email });
    if (!response.success) throw new Error(response.error || 'Falha ao solicitar recuperação.');
    return 'Código enviado (se e-mail existir).';
  };

  const handleResetPassword = async (email: string, code: string, newPassword: string) => {
    const response = await postToAppsScript<GenericResponse>({ action: 'resetPassword', email, code, newPassword });
    if (!response.success) throw new Error(response.error || 'Falha ao redefinir.');
    return response.message || 'Senha redefinida.';
  };

  // Admin Hooks (abbreviated wrapper functions saving directly)
  const persistUser = useCallback(async (user: UserAccessRecord) => {
    await postToAppsScript<GenericResponse>({ action: 'saveUserAccess', email: user.email, name: user.nome, role: user.cargo, discipline: user.disciplina, isAdmin: user.isAdmin, status: user.status, allowedTabs: user.allowedTabs });
    await loadAdminData();
  }, [loadAdminData]);

  if (booting && !preloading) return null;

  if (!currentUser && !preloading) {
    return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} onForgotPassword={handleForgotPassword} onResetPassword={handleResetPassword} />;
  }

  if (preloading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center font-['Montserrat'] flex-col px-6">
        <img src="https://i.imgur.com/Net1yEQ.png" alt="Logo" className="h-12 object-contain mb-8 animate-pulse" referrerPolicy="no-referrer" />
        <div className="w-full max-w-[420px] bg-white rounded-3xl shadow-sm border border-[#E5E7EB] p-8 text-center">
          <h2 className="text-[20px] font-bold text-[#2D2D2D] mb-1">Preparando ambiente</h2>
          <p className="text-[13px] font-medium text-[#757575] mb-8 h-4">{loadText}</p>
          <div className="relative w-full h-3 bg-[#F3F4F6] rounded-full overflow-hidden">
            <div className="absolute top-0 left-0 h-full bg-[#F05D28] transition-all duration-[600ms] rounded-full" style={{ width: `${loadProgress}%` }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#F8F9FA] overflow-hidden font-['Montserrat']">
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 260, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ type: 'spring', damping: 20, stiffness: 100 }} className="h-full bg-white border-r border-[#E5E7EB] flex flex-col shrink-0 overflow-hidden">
            <div className="p-8 flex items-center justify-between">
              <img src="https://i.imgur.com/Net1yEQ.png" alt="Logo" className="h-10 object-contain" referrerPolicy="no-referrer" />
            </div>
            <div className="px-6 mt-4"><span className="text-[11px] font-medium text-[#757575] uppercase tracking-[1px]">MENU</span></div>
            <nav className="px-4 mt-2 flex-1 space-y-1 overflow-y-auto">
              {currentUser && userHasTabAccess(currentUser, 'registro') && <NavItem icon={<ClipboardList size={20} />} label="Registro de Atividade" active={activeTab === 'registro'} onClick={() => setActiveTab('registro')} />}
              {currentUser && userHasTabAccess(currentUser, 'controle') && <NavItem icon={<Settings size={20} />} label="Coordenação de Engenharia" active={activeTab === 'controle'} onClick={() => setActiveTab('controle')} />}
              {currentUser && userHasTabAccess(currentUser, 'contratos') && <NavItem icon={<Briefcase size={20} />} label="Contratos Sudeste" active={activeTab === 'contratos'} onClick={() => setActiveTab('contratos')} />}
              {currentUser && userHasTabAccess(currentUser, 'nc') && <NavItem icon={<AlertTriangle size={20} />} label="Não Conformidades" active={activeTab === 'nc'} onClick={() => setActiveTab('nc')} />}
              {currentUser && userHasTabAccess(currentUser, 'cronograma') && <NavItem icon={<Calendar size={20} />} label="Cronograma" active={activeTab === 'cronograma'} onClick={() => setActiveTab('cronograma')} />}
              {currentUser && userHasTabAccess(currentUser, 'projetista') && <NavItem icon={<LayoutGrid size={20} />} label="Projetista" active={activeTab === 'projetista'} onClick={() => setActiveTab('projetista')} />}
              {currentUser && currentUser.isAdmin && <NavItem icon={<ShieldCheck size={20} />} label="Administração" active={activeTab === 'administracao'} onClick={() => setActiveTab('administracao')} />}
            </nav>
            <div className="p-6 border-t border-[#E5E7EB] space-y-4">
              <div className="bg-[#F9FAFB] p-3 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F05D28]/10 flex items-center justify-center text-[#F05D28] font-bold text-sm">
                  {currentUser ? getUserInitials(currentUser.nome) : 'US'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#2D2D2D] truncate">{currentUser?.nome}</p>
                  <p className="text-xs text-[#757575] truncate">{currentUser?.role}</p>
                </div>
              </div>
              <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 text-[#757575] hover:text-[#EF4444] transition-colors w-full text-sm font-medium"><LogOut size={18} /> Sair</button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-24 bg-white border-b border-[#E5E7EB] flex items-center justify-between px-8 shrink-0 relative">
          <div className="flex items-center gap-6">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-[#757575] hover:bg-[#F4F5F7] rounded-lg transition-colors"><Menu size={24} /></button>
            <div className="flex flex-col shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-[18px] font-bold text-[#2D2D2D] leading-tight">
                  {activeTab === 'registro' ? 'Registro de Atividade' : activeTab === 'controle' ? 'Coordenação de Engenharia' : activeTab === 'contratos' ? 'Contratos Sudeste' : activeTab === 'nc' ? 'Não Conformidades' : activeTab === 'projetista' ? 'Quadro de Produção Técnica' : activeTab === 'administracao' ? 'Administração' : 'Cronograma'}
                </h2>
                {isBackgroundSyncing && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] text-[10px] font-bold">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                    Sincronizando...
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium text-[#757575] uppercase tracking-widest mt-1">EcoQuanta · Ecossistema Quanta</span>
            </div>
          </div>

          {activeTab === 'controle' && (
            <div className="flex items-center gap-1 bg-[#F8F9FA] p-1 rounded-xl border border-[#E5E7EB]">
              <HeaderTab active={subTab === 'dashboard'} onClick={() => setSubTab('dashboard')} icon={<LayoutDashboard size={16} />} label="Dashboard" />
              <HeaderTab active={subTab === 'alocacoes'} onClick={() => setSubTab('alocacoes')} icon={<Users size={16} />} label="Alocações" />
              <HeaderTab active={subTab === 'curva-s'} onClick={() => setSubTab('curva-s')} icon={<TrendingUp size={16} />} label="Curva S" />
              <HeaderTab active={subTab === 'matrix'} onClick={() => setSubTab('matrix')} icon={<LayoutGrid size={16} />} label="Matriz" />
            </div>
          )}

          {activeTab === 'nc' && (
            <div className="flex items-center gap-1 bg-[#F8F9FA] p-1 rounded-xl border border-[#E5E7EB]">
              <HeaderTab active={ncSubTab === 'dashboard'} onClick={() => setNcSubTab('dashboard')} icon={<LayoutGrid size={16} />} label="Dashboard" />
              <HeaderTab active={ncSubTab === 'preenchimento'} onClick={() => setNcSubTab('preenchimento')} icon={<Clipboard size={16} />} label="Preenchimento" />
              <HeaderTab active={ncSubTab === 'revisoes'} onClick={() => setNcSubTab('revisoes')} icon={<CheckSquare size={16} />} label="Revisões" />
            </div>
          )}

          <div className="flex items-center gap-4">
            <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border ${showFilters ? 'bg-[#F05D28] text-white border-[#F05D28]' : 'bg-white text-[#757575] border-[#E5E7EB] hover:bg-[#F9FAFB]'}`}><Filter size={18} /> Filtros</button>
            {showFilters && activeTab !== 'projetista' && (
              <div className="absolute top-[calc(100%-10px)] right-8 w-80 bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl p-6 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="space-y-4">
                  <select className="w-full h-10 px-3 bg-[#F8F9FA] border rounded-lg text-xs font-bold" value={filtrosAtivos.contrato} onChange={(e) => setFiltrosAtivos({ ...filtrosAtivos, contrato: e.target.value })}>
                    <option value="Todos">Todos os Contratos</option>{contratos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <button onClick={() => setShowFilters(false)} className="w-full mt-6 py-2.5 bg-[#F05D28] text-white rounded-xl text-xs font-bold uppercase hover:bg-[#D94D1A] transition-colors shadow-lg">Aplicar Filtros</button>
              </div>
            )}
            <div className="w-10 h-10 rounded-full border border-[#E5E7EB] bg-white flex items-center justify-center text-[#F05D28] font-bold text-sm hidden sm:flex">
              {currentUser ? getUserInitials(currentUser.nome) : ''}
            </div>
          </div>
        </header>

        <main className={`flex-1 overflow-y-auto ${activeTab === 'projetista' ? 'p-3' : 'p-8'} ${activeTab === 'registro' ? 'bg-white' : 'bg-[#F8F9FA]'}`}>
          {activeTab === 'registro' && currentUser && <RegistroDeAtividade currentUser={currentUser} preloadedData={globalData.registro} />}
          {activeTab === 'controle' && <ControleEngenharia filtrosAtivos={filtrosAtivos} subTab={subTab} onSubTabChange={setSubTab} />}
          {activeTab === 'contratos' && <ContratosSudeste />}
          {activeTab === 'nc' && <NaoConformidades activeTab={ncSubTab} onTabChange={setNcSubTab} />}
          {activeTab === 'cronograma' && <Cronograma />}
          {activeTab === 'projetista' && <Projetista isHeaderFiltersOpen={showFilters} onCloseHeaderFilters={() => setShowFilters(false)} />}
          {activeTab === 'administracao' && currentUser?.isAdmin && (
            <Administracao
              usuarios={usuarios} disciplinas={disciplinas} cargos={cargos} databaseLinks={databaseLinks} appTabs={APP_TABS_LIST} onRefresh={loadAdminData}
              onUpdateUsuario={async (id, patch) => { const u = usuarios.find(x => x.id === id); if (u) await persistUser({ ...u, ...patch }); }}
              onToggleAdmin={async (id, checked) => { const u = usuarios.find(x => x.id === id); if (u) await persistUser({ ...u, isAdmin: checked }); }}
              onToggleTabPermission={async (id, tab) => { const u = usuarios.find(x => x.id === id); if (u) { const tabs = u.allowedTabs.includes(tab) ? u.allowedTabs.filter(t => t !== tab) : [...u.allowedTabs, tab]; await persistUser({ ...u, allowedTabs: tabs }); } }}
              onAcceptUser={async () => { }} onBlockUser={async () => { }} onPasswordReset={async () => { }} onAddDisciplina={async () => { }} onRemoveDisciplina={async () => { }} onAddCargo={async () => { }} onRemoveCargo={async () => { }} onSaveDatabaseLink={async () => { }} onDeleteDatabaseLink={async () => { }}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void; }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all ${active ? 'bg-[#F05D28]/10 text-[#F05D28] text-[14px] font-bold' : 'text-[#757575] text-[14px] font-medium hover:bg-[#F4F5F7] hover:text-[#2D2D2D]'}`}>
      {icon} <span>{label}</span>
    </div>
  );
}

function HeaderTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-bold transition-all ${active ? 'bg-[#F05D28] text-white shadow-sm' : 'text-[#757575] hover:bg-[#F0F1F2] hover:text-[#2D2D2D]'}`}>
      {icon} {label}
    </button>
  );
}
