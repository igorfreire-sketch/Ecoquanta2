import SearchableSelect from './SearchableSelect';
﻿import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ChevronDown,
  Droplet,
  Droplets,
  FileText,
  Fan,
  Filter,
  House,
  Plus,
  Search,
  Waves,
  X
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { DEFAULT_DISCIPLINES, getUserDisciplineList, resolveDisciplineEntry } from '../lib/disciplineCatalog';

export type ProductionStatus =
  | 'Não iniciado'
  | 'Programado para a semana'
  | 'Em execução'
  | 'Em revisão'
  | 'Bloqueado'
  | 'Concluído'
  | 'Atrasado';

export type PriorityLevel = 'Normal' | 'Alta' | 'Contratual' | 'Emergencial';

export type TechnicalStep =
  | 'Inicial'
  | 'NF Início de Contrato'
  | 'Modelagem'
  | 'NF Intermediária'
  | 'Revisão'
  | 'NF Final';

export type LodLevel = 100 | 200 | 300 | 350 | 400;
export type LeaderActivityStatus = 'Bom' | 'Regular' | 'Problema' | '';
export type LeaderDifficulty = 'Difícil' | 'Regular' | 'Fácil' | '';

export interface EngineeringActivity {
  id: string;
  contractCode?: string;
  contratoCodigo: string;
  contratoNome: string;
  osCodigo: string;
  osNome: string;
  itemCodigo?: string;
  itemNome?: string;
  disciplina: string;
  disciplinas: string[];
  subdisciplina: string;
  responsavel: string;
  etapaTecnica: TechnicalStep;
  lodAtual: LodLevel;
  lodAlvoSemana: LodLevel;
  inicioPlanejado: string;
  terminoPlanejado: string;
  prioridade: PriorityLevel;
  status: ProductionStatus;
  percentualPrevisto: number;
  percentualRealizado: number;
  atividade: string;
  motivoBloqueio?: string;
  proximaAcao: string;
  observacoes: string;
  dataCriacao: string;
  origemItem?: string;
  edificio?: string;
  executadoPor: string[];
  statusDaAtividade: LeaderActivityStatus;
  dificuldadeAtividade: LeaderDifficulty;
  porcentagemAtividade: number | null;
  observacaoLider: string;
  leaderEdited: boolean;
  sourceType?: 'eap' | 'manual' | 'saved';
}

interface EapActivity {
  contrato: string;
  os: string;
  nome: string;
  disciplina: string;
  subdisciplina: string;
  item: string;
  nomeAtividade: string;
}

interface EapSourceRow {
  [key: string]: any;
  code: string;
  name: string;
  progress: number;
  duration: number;
  plannedStart: string;
  plannedEnd: string;
  predecessor: string;
  idealProgress: number;
  realStart: string;
  realEnd: string;
  baselineIdealProgress: number;
  disciplina?: string;
  disciplinas?: string[];
}

interface AtividadesProps {
  currentUser?: {
    nome?: string;
    email?: string;
    disciplina?: string;
    disciplinas?: string[];
    contrato?: string;
    onlyThirdParty?: boolean;
  } | null;
  preloadedData?: any;
  isHeaderFiltersOpen?: boolean;
  onCloseHeaderFilters?: () => void;
  showAllDisciplines?: boolean;
  filtersAlwaysVisible?: boolean;
  disciplineFilterEnabled?: boolean;
  autoSelectUserDisciplineFilter?: boolean;
  // Área Técnica: divide os cards de OS por disciplina (1 card por disciplina, OS repete).
  splitOsCardsByDiscipline?: boolean;
}

const STORAGE_KEY = 'quanta_producao_tecnica_cards';
const TODAY = new Date();
const RESPONSAVEIS = ['Vinicius', 'Beatriz', 'Carlos', 'Mariana', 'Rodrigo', 'Fernanda'];
const TECHNICAL_STEPS: TechnicalStep[] = ['Inicial', 'NF Início de Contrato', 'Modelagem', 'NF Intermediária', 'Revisão', 'NF Final'];
const PRIORITY_OPTIONS: PriorityLevel[] = ['Normal', 'Alta', 'Contratual', 'Emergencial'];
const STATUS_OPTIONS: ProductionStatus[] = ['Não iniciado', 'Programado para a semana', 'Em execução', 'Em revisão', 'Bloqueado', 'Concluído', 'Atrasado'];
const LOD_OPTIONS: LodLevel[] = [100, 200, 300, 350, 400];

const priorityColorMap: Record<PriorityLevel, { text: string; bg: string; border: string }> = {
  Normal: { text: 'text-[#0F4C81]', bg: 'bg-[#EEF6FD]', border: 'border-[#C9E1F7]' },
  Alta: { text: 'text-[#B45309]', bg: 'bg-[#FFF7E8]', border: 'border-[#F8D5A2]' },
  Contratual: { text: 'text-[#0F766E]', bg: 'bg-[#ECFDF5]', border: 'border-[#A7F3D0]' },
  Emergencial: { text: 'text-[#C66A4A]', bg: 'bg-[#FFF3EE]', border: 'border-[#F7C7B7]' }
};

const EAP_UNASSIGNED_ACTIVITIES = [
  {
    contrato: 'MKE',
    os: 'OS 011',
    nome: 'PARQUE DAS ÃGUAS',
    disciplina: 'Terraplanagem',
    subdisciplina: 'Drenagem',
    item: 'T-01',
    nomeAtividade: 'Estudo hidrolÃ³gico e escoamento de drenagem preliminar'
  },
  {
    contrato: 'MKE',
    os: 'OS 011',
    nome: 'PARQUE DAS ÃGUAS',
    disciplina: 'PCI e GÃ¡s',
    subdisciplina: 'SinalizaÃ§Ã£o',
    item: 'P-03',
    nomeAtividade: 'Projeto de sinalizaÃ§Ã£o de rotas de fuga e iluminaÃ§Ã£o de emergÃªncia'
  },
  {
    contrato: 'MKE',
    os: 'OS 013',
    nome: 'ORLA ARAÃ‡ATIBA',
    disciplina: 'Estrutural',
    subdisciplina: 'FundaÃ§Ã£o',
    item: 'E-02',
    nomeAtividade: 'Dimensionamento das estacas metÃ¡licas do deck flutuante'
  },
  {
    contrato: 'MKE',
    os: 'OS 022',
    nome: 'MERCADO MUNICIPAL',
    disciplina: 'ElÃ©trica',
    subdisciplina: 'LuminotÃ©cnica',
    item: 'EL-05',
    nomeAtividade: 'Memorial de cÃ¡lculo de luminotÃ©cnica e cargas elÃ©tricas'
  },
  {
    contrato: 'MRK',
    os: 'OS 053',
    nome: 'MASTERPLAN ITAIPUAÃ‡U',
    disciplina: 'OrÃ§amento',
    subdisciplina: 'Custos UnitÃ¡rios',
    item: 'OR-14',
    nomeAtividade: 'Estimativa de custos de movimentaÃ§Ã£o de terra e drenagem'
  }
] as EapActivity[];

const INITIAL_MOCK_ACTIVITIES = [
  {
    id: 'act-001',
    contratoCodigo: 'MKE',
    contratoNome: 'MKE',
    osCodigo: 'OS 011',
    osNome: 'PARQUE DAS ÃGUAS',
    disciplina: 'Terraplanagem',
    subdisciplina: 'Drenagem Superficial',
    responsavel: 'Vinicius',
    etapaTecnica: 'Modelagem',
    lodAtual: 200,
    lodAlvoSemana: 300,
    inicioPlanejado: '2026-05-18',
    terminoPlanejado: '2026-05-18',
    prioridade: 'Alta',
    status: 'Em execuÃ§Ã£o',
    percentualPrevisto: 65,
    percentualRealizado: 45,
    atividade: 'Desenvolver o modelo digital do terreno e consolidar o balanÃ§o de corte e aterro das bacias A e B.',
    proximaAcao: 'Fechar a compatibilizaÃ§Ã£o da drenagem preliminar e emitir revisÃ£o interna.',
    observacoes: 'Frente vinculada ao cronograma executivo semanal.',
    dataCriacao: '2026-05-15',
    origemItem: 'T-01'
  },
  {
    id: 'act-002',
    contratoCodigo: 'MKE',
    contratoNome: 'MKE',
    osCodigo: 'OS 011',
    osNome: 'PARQUE DAS ÃGUAS',
    disciplina: 'ElÃ©trica',
    subdisciplina: 'Infraestrutura Externa',
    responsavel: 'Beatriz',
    etapaTecnica: 'Modelagem',
    lodAtual: 300,
    lodAlvoSemana: 350,
    inicioPlanejado: '2026-05-19',
    terminoPlanejado: '2026-05-19',
    prioridade: 'Contratual',
    status: 'Em execuÃ§Ã£o',
    percentualPrevisto: 75,
    percentualRealizado: 65,
    atividade: 'Modelar as rotas de cabos de mÃ©dia e baixa tensÃ£o e posicionar postes externos do eixo principal.',
    proximaAcao: 'Concluir lanÃ§amento dos eletrodutos da praÃ§a central e revisar interferÃªncias.',
    observacoes: 'Entrega parcial alinhada com a frente de infraestrutura urbana.',
    dataCriacao: '2026-05-10',
    origemItem: 'EL-02'
  },
  {
    id: 'act-003',
    contratoCodigo: 'MKE',
    contratoNome: 'MKE',
    osCodigo: 'OS 013',
    osNome: 'ORLA ARAÃ‡ATIBA',
    disciplina: 'Estrutural',
    subdisciplina: 'FundaÃ§Ãµes',
    responsavel: 'Carlos',
    etapaTecnica: 'RevisÃ£o',
    lodAtual: 300,
    lodAlvoSemana: 350,
    inicioPlanejado: '2026-05-20',
    terminoPlanejado: '2026-05-20',
    prioridade: 'Emergencial',
    status: 'Bloqueado',
    percentualPrevisto: 90,
    percentualRealizado: 70,
    atividade: 'Revisar o cÃ¡lculo estrutural e o detalhamento das sapatas e pilares do pÃ³rtico de entrada.',
    motivoBloqueio: 'Aguardando sondagem complementar do terreno para ajustar a capacidade de carga do solo.',
    proximaAcao: 'Reprogramar anÃ¡lise assim que a sondagem complementar for liberada.',
    observacoes: 'Bloqueio com impacto direto no fechamento da semana.',
    dataCriacao: '2026-05-08',
    origemItem: 'E-02'
  },
  {
    id: 'act-004',
    contratoCodigo: 'MKE',
    contratoNome: 'MKE',
    osCodigo: 'OS 022',
    osNome: 'MERCADO MUNICIPAL',
    disciplina: 'HidrossanitÃ¡rio',
    subdisciplina: 'Esgoto SanitÃ¡rio',
    responsavel: 'Mariana',
    etapaTecnica: 'NF IntermediÃ¡ria',
    lodAtual: 200,
    lodAlvoSemana: 300,
    inicioPlanejado: '2026-05-21',
    terminoPlanejado: '2026-05-21',
    prioridade: 'Normal',
    status: 'Programado para a semana',
    percentualPrevisto: 35,
    percentualRealizado: 0,
    atividade: 'LanÃ§ar as tubulaÃ§Ãµes de esgoto sanitÃ¡rio comercial e as caixas de gordura em conformidade com as normas locais.',
    proximaAcao: 'Iniciar traÃ§ado base no pavimento tÃ©rreo e validar Ã¡reas tÃ©cnicas.',
    observacoes: 'Aguardando inÃ­cio da frente da semana.',
    dataCriacao: '2026-05-20',
    origemItem: 'H-04'
  },
  {
    id: 'act-005',
    contratoCodigo: 'MRK',
    contratoNome: 'MRK',
    osCodigo: 'OS 050',
    osNome: 'PROJETOS COMPLEMENTARES',
    disciplina: 'PCI e GÃ¡s',
    subdisciplina: 'Central de GLP',
    responsavel: 'Rodrigo',
    etapaTecnica: 'NF Final',
    lodAtual: 350,
    lodAlvoSemana: 400,
    inicioPlanejado: '2026-05-22',
    terminoPlanejado: '2026-05-22',
    prioridade: 'Alta',
    status: 'Em revisÃ£o',
    percentualPrevisto: 95,
    percentualRealizado: 90,
    atividade: 'Concluir o detalhamento executivo da central de GLP e o plano de combate a incÃªndio com cÃ¡lculo de hidrantes.',
    proximaAcao: 'Fechar comentÃ¡rios da coordenaÃ§Ã£o e preparar emissÃ£o final.',
    observacoes: 'Entrega em revisÃ£o tÃ©cnica com janela curta para emissÃ£o.',
    dataCriacao: '2026-05-12',
    origemItem: 'P-09'
  },
  {
    id: 'act-006',
    contratoCodigo: 'MRK',
    contratoNome: 'MRK',
    osCodigo: 'OS 053',
    osNome: 'MASTERPLAN ITAIPUAÃ‡U',
    disciplina: 'OrÃ§amento',
    subdisciplina: 'Planilhas AnalÃ­ticas',
    responsavel: 'Fernanda',
    etapaTecnica: 'NF Final',
    lodAtual: 400,
    lodAlvoSemana: 400,
    inicioPlanejado: '2026-05-23',
    terminoPlanejado: '2026-05-23',
    prioridade: 'Contratual',
    status: 'ConcluÃ­do',
    percentualPrevisto: 100,
    percentualRealizado: 100,
    atividade: 'Consolidar as planilhas orÃ§amentÃ¡rias sintÃ©ticas e analÃ­ticas de referÃªncia baseadas no SINAPI.',
    proximaAcao: 'Aguardar consolidaÃ§Ã£o da prÃ³xima OS para nova atualizaÃ§Ã£o.',
    observacoes: 'Marco concluÃ­do e publicado para a coordenaÃ§Ã£o.',
    dataCriacao: '2026-05-01',
    origemItem: 'OR-14'
  },
  {
    id: 'act-007',
    contratoCodigo: 'MKE',
    contratoNome: 'MKE',
    osCodigo: 'OS 032',
    osNome: 'REURB',
    disciplina: 'Terraplanagem',
    subdisciplina: 'Levantamento',
    responsavel: 'Vinicius',
    etapaTecnica: 'NF InÃ­cio de Contrato',
    lodAtual: 100,
    lodAlvoSemana: 200,
    inicioPlanejado: '2026-05-18',
    terminoPlanejado: '2026-05-19',
    prioridade: 'Normal',
    status: 'Atrasado',
    percentualPrevisto: 100,
    percentualRealizado: 40,
    atividade: 'Processar a nuvem de pontos LiDAR para gerar o plano cadastral planialtimÃ©trico de base.',
    proximaAcao: 'Retomar a limpeza da nuvem de pontos e fechar a superfÃ­cie principal.',
    observacoes: 'DependÃªncia direta da base topogrÃ¡fica para liberar as prÃ³ximas etapas.',
    dataCriacao: '2026-05-19',
    origemItem: 'TE-01'
  },
  {
    id: 'act-008',
    contratoCodigo: 'MKE',
    contratoNome: 'MKE',
    osCodigo: 'OS 034',
    osNome: 'CANAL CIDADE',
    disciplina: 'Estrutural',
    subdisciplina: 'Galerias e Aduelas',
    responsavel: 'Carlos',
    etapaTecnica: 'Modelagem',
    lodAtual: 200,
    lodAlvoSemana: 300,
    inicioPlanejado: '2026-05-21',
    terminoPlanejado: '2026-05-22',
    prioridade: 'Alta',
    status: 'Programado para a semana',
    percentualPrevisto: 40,
    percentualRealizado: 10,
    atividade: 'Modelar as aduelas de concreto armado do canal e validar os carregamentos rodoviÃ¡rios da travessia.',
    proximaAcao: 'Estruturar o modelo base e subir as seÃ§Ãµes crÃ­ticas para conferÃªncia.',
    observacoes: 'Entrega tÃ©cnica sequenciada com a frente de drenagem urbana.',
    dataCriacao: '2026-05-16',
    origemItem: 'ES-03'
  },
  {
    id: 'act-009',
    contratoCodigo: 'MKE',
    contratoNome: 'MKE',
    osCodigo: 'OS 037',
    osNome: 'POLO CULINÃRIO',
    disciplina: 'ElÃ©trica',
    subdisciplina: 'Quadros e ProteÃ§Ãµes',
    responsavel: 'Beatriz',
    etapaTecnica: 'Modelagem',
    lodAtual: 300,
    lodAlvoSemana: 350,
    inicioPlanejado: '2026-05-22',
    terminoPlanejado: '2026-05-23',
    prioridade: 'Normal',
    status: 'Em execuÃ§Ã£o',
    percentualPrevisto: 85,
    percentualRealizado: 80,
    atividade: 'Dimensionar luminÃ¡rias internas e painÃ©is elÃ©tricos com dispositivos DR e DPS para os boxes comerciais.',
    proximaAcao: 'Concluir a revisÃ£o dos quadros e emitir a versÃ£o compatibilizada.',
    observacoes: 'Acompanhamento semanal alinhado com a equipe de arquitetura.',
    dataCriacao: '2026-05-11',
    origemItem: 'EL-11'
  },
  {
    id: 'act-010',
    contratoCodigo: 'MKE',
    contratoNome: 'MKE',
    osCodigo: 'OS 043',
    osNome: 'CANAL DA CIDADE - FASE 2',
    disciplina: 'HidrossanitÃ¡rio',
    subdisciplina: 'Drenagem Pluvial',
    responsavel: 'Mariana',
    etapaTecnica: 'RevisÃ£o',
    lodAtual: 350,
    lodAlvoSemana: 350,
    inicioPlanejado: '2026-05-23',
    terminoPlanejado: '2026-05-23',
    prioridade: 'Contratual',
    status: 'Em revisÃ£o',
    percentualPrevisto: 100,
    percentualRealizado: 95,
    atividade: 'Validar a simulaÃ§Ã£o hidrÃ¡ulica do extravasamento pluvial das galerias e verificar pontos crÃ­ticos de alagamento.',
    proximaAcao: 'Encerrar o parecer tÃ©cnico e preparar o pacote para emissÃ£o contratual.',
    observacoes: 'Ãšltimos ajustes antes do fechamento semanal da OS.',
    dataCriacao: '2026-05-14',
    origemItem: 'H-12'
  },
  {
    id: 'act-011',
    contratoCodigo: 'MKE',
    contratoNome: 'MKE',
    osCodigo: 'OS 061',
    osNome: 'CEPT LOD 400 - 004 - Tecnologias, CiÃªncias, Cultura e Sociedade',
    disciplina: 'Arquitetura',
    subdisciplina: 'Tecnologias',
    responsavel: 'Fernanda',
    etapaTecnica: 'Modelagem',
    lodAtual: 300,
    lodAlvoSemana: 400,
    inicioPlanejado: '2026-05-22',
    terminoPlanejado: '2026-05-22',
    prioridade: 'Alta',
    status: 'Programado para a semana',
    percentualPrevisto: 65,
    percentualRealizado: 45,
    atividade: 'Teste de cartÃ£o com nome longo para validar a quebra e a leitura compacta.',
    proximaAcao: 'Acompanhar como a ocupaÃ§Ã£o de largura se comporta no quadro semanal.',
    observacoes: 'Card de validaÃ§Ã£o visual com texto grande no nome da OS.',
    dataCriacao: '2026-05-21',
    origemItem: 'AR-99'
  },
  {
    id: 'act-012',
    contratoCodigo: 'MKE',
    contratoNome: 'MKE',
    osCodigo: 'OS 064',
    osNome: 'CENTRO DE INOVAÃ‡ÃƒO URBANA',
    disciplina: 'Arquitetura',
    subdisciplina: 'CompatibilizaÃ§Ã£o',
    responsavel: 'Rodrigo',
    etapaTecnica: 'Modelagem',
    lodAtual: 200,
    lodAlvoSemana: 300,
    inicioPlanejado: '2026-05-18',
    terminoPlanejado: '2026-05-20',
    prioridade: 'Alta',
    status: 'Em execuÃ§Ã£o',
    percentualPrevisto: 55,
    percentualRealizado: 52,
    atividade: 'Card fictÃ­cio para apresentaÃ§Ã£o do quadro semanal.',
    proximaAcao: 'Atualizar compatibilizaÃ§Ã£o da arquitetura com instalaÃ§Ãµes.',
    observacoes: 'Exemplo fictÃ­cio para apresentaÃ§Ã£o.',
    dataCriacao: '2026-05-18',
    origemItem: 'AR-12'
  },
  {
    id: 'act-013',
    contratoCodigo: 'MRK',
    contratoNome: 'MRK',
    osCodigo: 'OS 066',
    osNome: 'ESCOLA TÃ‰CNICA DA ORLA',
    disciplina: 'Estrutural',
    subdisciplina: 'Superestrutura',
    responsavel: 'Carlos',
    etapaTecnica: 'Modelagem',
    lodAtual: 300,
    lodAlvoSemana: 350,
    inicioPlanejado: '2026-05-25',
    terminoPlanejado: '2026-05-26',
    prioridade: 'Contratual',
    status: 'Programado para a semana',
    percentualPrevisto: 40,
    percentualRealizado: 15,
    atividade: 'Card fictÃ­cio para apresentaÃ§Ã£o do quadro semanal.',
    proximaAcao: 'Subir revisÃ£o das vigas e pilares principais.',
    observacoes: 'Exemplo fictÃ­cio para apresentaÃ§Ã£o.',
    dataCriacao: '2026-05-23',
    origemItem: 'ES-21'
  },
  {
    id: 'act-014',
    contratoCodigo: 'MKE',
    contratoNome: 'MKE',
    osCodigo: 'OS 067',
    osNome: 'PARQUE TECNOLÃ“GICO COSTEIRO',
    disciplina: 'ElÃ©trica',
    subdisciplina: 'DistribuiÃ§Ã£o',
    responsavel: 'Beatriz',
    etapaTecnica: 'Modelagem',
    lodAtual: 300,
    lodAlvoSemana: 400,
    inicioPlanejado: '2026-05-27',
    terminoPlanejado: '2026-05-29',
    prioridade: 'Alta',
    status: 'Em execuÃ§Ã£o',
    percentualPrevisto: 70,
    percentualRealizado: 68,
    atividade: 'Card fictÃ­cio para apresentaÃ§Ã£o do quadro semanal.',
    proximaAcao: 'Fechar painÃ©is e quadros de distribuiÃ§Ã£o do bloco B.',
    observacoes: 'Exemplo fictÃ­cio para apresentaÃ§Ã£o.',
    dataCriacao: '2026-05-26',
    origemItem: 'EL-31'
  },
  {
    id: 'act-015',
    contratoCodigo: 'MRK',
    contratoNome: 'MRK',
    osCodigo: 'OS 068',
    osNome: 'PAVILHÃƒO DE PESQUISA APLICADA',
    disciplina: 'HidrossanitÃ¡rio',
    subdisciplina: 'Ãgua Fria',
    responsavel: 'Mariana',
    etapaTecnica: 'RevisÃ£o',
    lodAtual: 350,
    lodAlvoSemana: 350,
    inicioPlanejado: '2026-06-01',
    terminoPlanejado: '2026-06-02',
    prioridade: 'Normal',
    status: 'Em revisÃ£o',
    percentualPrevisto: 88,
    percentualRealizado: 84,
    atividade: 'Card fictÃ­cio para apresentaÃ§Ã£o do quadro semanal.',
    proximaAcao: 'Revisar shafts e pontos de consumo do pavimento tÃ©rreo.',
    observacoes: 'Exemplo fictÃ­cio para apresentaÃ§Ã£o.',
    dataCriacao: '2026-05-29',
    origemItem: 'HI-18'
  },
  {
    id: 'act-016',
    contratoCodigo: 'MKE',
    contratoNome: 'MKE',
    osCodigo: 'OS 069',
    osNome: 'TERMINAL MULTIMODAL LESTE',
    disciplina: 'Terraplanagem',
    subdisciplina: 'Geometria',
    responsavel: 'Vinicius',
    etapaTecnica: 'NF IntermediÃ¡ria',
    lodAtual: 100,
    lodAlvoSemana: 200,
    inicioPlanejado: '2026-06-03',
    terminoPlanejado: '2026-06-05',
    prioridade: 'Emergencial',
    status: 'Bloqueado',
    percentualPrevisto: 60,
    percentualRealizado: 20,
    atividade: 'Card fictÃ­cio para apresentaÃ§Ã£o do quadro semanal.',
    motivoBloqueio: 'Aguardando atualizaÃ§Ã£o topogrÃ¡fica da Ã¡rea externa.',
    proximaAcao: 'Reabrir o perfil longitudinal apÃ³s recebimento da nova base.',
    observacoes: 'Exemplo fictÃ­cio para apresentaÃ§Ã£o.',
    dataCriacao: '2026-06-01',
    origemItem: 'TE-41'
  },
  {
    id: 'act-017',
    contratoCodigo: 'MRK',
    contratoNome: 'MRK',
    osCodigo: 'OS 070',
    osNome: 'CAMPUS DE TECNOLOGIA SOCIAL',
    disciplina: 'Arquitetura',
    subdisciplina: 'Interiores',
    responsavel: 'Fernanda',
    etapaTecnica: 'Modelagem',
    lodAtual: 200,
    lodAlvoSemana: 300,
    inicioPlanejado: '2026-06-08',
    terminoPlanejado: '2026-06-10',
    prioridade: 'Normal',
    status: 'Programado para a semana',
    percentualPrevisto: 35,
    percentualRealizado: 0,
    atividade: 'Card fictÃ­cio para apresentaÃ§Ã£o do quadro semanal.',
    proximaAcao: 'Iniciar o detalhamento das salas multiuso e foyer.',
    observacoes: 'Exemplo fictÃ­cio para apresentaÃ§Ã£o.',
    dataCriacao: '2026-06-05',
    origemItem: 'AR-27'
  },
  {
    id: 'act-018',
    contratoCodigo: 'MKE',
    contratoNome: 'MKE',
    osCodigo: 'OS 071',
    osNome: 'HUB LOGÃSTICO METROPOLITANO',
    disciplina: 'PCI e GÃ¡s',
    subdisciplina: 'DetecÃ§Ã£o',
    responsavel: 'Rodrigo',
    etapaTecnica: 'NF Final',
    lodAtual: 350,
    lodAlvoSemana: 400,
    inicioPlanejado: '2026-06-11',
    terminoPlanejado: '2026-06-12',
    prioridade: 'Contratual',
    status: 'Em execuÃ§Ã£o',
    percentualPrevisto: 78,
    percentualRealizado: 81,
    atividade: 'Card fictÃ­cio para apresentaÃ§Ã£o do quadro semanal.',
    proximaAcao: 'Concluir a malha de detectores e emitir prancha executiva.',
    observacoes: 'Exemplo fictÃ­cio para apresentaÃ§Ã£o.',
    dataCriacao: '2026-06-09',
    origemItem: 'PG-14'
  },
  {
    id: 'act-019',
    contratoCodigo: 'MRK',
    contratoNome: 'MRK',
    osCodigo: 'OS 072',
    osNome: 'COMPLEXO CULTURAL DA BAÃA',
    disciplina: 'Estrutural',
    subdisciplina: 'Cobertura MetÃ¡lica',
    responsavel: 'Carlos',
    etapaTecnica: 'RevisÃ£o',
    lodAtual: 350,
    lodAlvoSemana: 400,
    inicioPlanejado: '2026-06-15',
    terminoPlanejado: '2026-06-16',
    prioridade: 'Alta',
    status: 'Em revisÃ£o',
    percentualPrevisto: 92,
    percentualRealizado: 89,
    atividade: 'Card fictÃ­cio para apresentaÃ§Ã£o do quadro semanal.',
    proximaAcao: 'Fechar a revisÃ£o dos nÃ³s metÃ¡licos da cobertura central.',
    observacoes: 'Exemplo fictÃ­cio para apresentaÃ§Ã£o.',
    dataCriacao: '2026-06-12',
    origemItem: 'ES-45'
  },
  {
    id: 'act-020',
    contratoCodigo: 'MKE',
    contratoNome: 'MKE',
    osCodigo: 'OS 073',
    osNome: 'CENTRO DE FORMAÃ‡ÃƒO AMBIENTAL',
    disciplina: 'ElÃ©trica',
    subdisciplina: 'Energia Solar',
    responsavel: 'Beatriz',
    etapaTecnica: 'Modelagem',
    lodAtual: 200,
    lodAlvoSemana: 300,
    inicioPlanejado: '2026-06-17',
    terminoPlanejado: '2026-06-19',
    prioridade: 'Normal',
    status: 'Em execuÃ§Ã£o',
    percentualPrevisto: 50,
    percentualRealizado: 47,
    atividade: 'Card fictÃ­cio para apresentaÃ§Ã£o do quadro semanal.',
    proximaAcao: 'LanÃ§ar os mÃ³dulos fotovoltaicos e revisar o quadro inversor.',
    observacoes: 'Exemplo fictÃ­cio para apresentaÃ§Ã£o.',
    dataCriacao: '2026-06-16',
    origemItem: 'EL-52'
  },
  {
    id: 'act-021',
    contratoCodigo: 'MRK',
    contratoNome: 'MRK',
    osCodigo: 'OS 074',
    osNome: 'PLATAFORMA DE EDUCAÃ‡ÃƒO CRIATIVA',
    disciplina: 'Arquitetura',
    subdisciplina: 'AuditÃ³rio',
    responsavel: 'Fernanda',
    etapaTecnica: 'NF Final',
    lodAtual: 400,
    lodAlvoSemana: 400,
    inicioPlanejado: '2026-06-22',
    terminoPlanejado: '2026-06-23',
    prioridade: 'Contratual',
    status: 'ConcluÃ­do',
    percentualPrevisto: 100,
    percentualRealizado: 100,
    atividade: 'Card fictÃ­cio para apresentaÃ§Ã£o do quadro semanal.',
    proximaAcao: 'Sem aÃ§Ã£o pendente, apenas registro de entrega final.',
    observacoes: 'Exemplo fictÃ­cio para apresentaÃ§Ã£o.',
    dataCriacao: '2026-06-20',
    origemItem: 'AR-61'
  }
];

const clampPercentage = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const safeGetLocalStorageValue = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetLocalStorageValue = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Mantemos a aba funcional mesmo se o storage estiver bloqueado.
  }
};

const parseDate = (value?: string) => {
  if (!value) return new Date(TODAY);
  if (/^\d{11,13}$/.test(String(value).trim())) {
    const timestamp = Number(value);
    const parsedTimestamp = new Date(timestamp);
    return Number.isNaN(parsedTimestamp.getTime()) ? new Date(TODAY) : parsedTimestamp;
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, (month || 1) - 1, day || 1);
  return Number.isNaN(parsed.getTime()) ? new Date(TODAY) : parsed;
};

const toIsoDate = (date: Date) => {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().split('T')[0];
};

const addDays = (date: Date, amount: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
};

const startOfWeek = (date: Date) => {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const formatDatePt = (value?: string) => {
  if (!value) return '-';
  return parseDate(value).toLocaleDateString('pt-BR');
};

const formatWeekLabel = (weekKey: string) => {
  const start = parseDate(weekKey);
  const end = addDays(start, 4);
  return `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
};

const getCurrentWeekKey = () => toIsoDate(startOfWeek(TODAY));

const getWeekKeyFromActivity = (activity: EngineeringActivity) => toIsoDate(startOfWeek(parseDate(activity.inicioPlanejado)));

const getPriorityRank = (priority: PriorityLevel) => {
  switch (priority) {
    case 'Contratual':
      return 0;
    case 'Emergencial':
      return 1;
    case 'Alta':
      return 2;
    default:
      return 3;
  }
};

const getPreviousLod = (lod: LodLevel): LodLevel => {
  const index = LOD_OPTIONS.indexOf(lod);
  return index > 0 ? LOD_OPTIONS[index - 1] : lod;
};

const inferCurrentLod = (target: LodLevel, progress: number): LodLevel => {
  if (progress >= 95) return target;
  if (progress >= 70) return getPreviousLod(target);
  if (progress >= 35) return getPreviousLod(getPreviousLod(target));
  return 100;
};

const normalizeText = (value?: string) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const splitMultiValue = (value: any) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(/[\n,;|]+/)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
};

const splitDisciplinas = (value: any) => {
  const list = splitMultiValue(value).filter(isMeaningfulDisciplineToken);
  return list.length > 0 ? list : ['Sem disciplina'];
};

const normalizeDisciplineLabel = (value: any) => {
  const list = splitMultiValue(value).filter(isMeaningfulDisciplineToken);
  return list.length > 0 ? list.join(' | ') : '';
};

const normalizeDisciplineToken = (value: any) => {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const isMeaningfulDisciplineToken = (value: any) => {
  const normalized = normalizeDisciplineToken(value);
  if (!normalized || normalized === 'sem disciplina' || normalized === 'ignorado') return false;
  if (/^\d+([.,]\d+)?$/.test(normalized)) return false;
  if (/^\d{11,13}$/.test(normalized)) return false;
  return /[a-z]/i.test(normalized);
};

const hasExplicitActivityDiscipline = (value: any) => {
  return splitDisciplinas(value).some(isMeaningfulDisciplineToken);
};

const addKnownDisciplineToken = (set: Set<string>, value: any) => {
  const token = normalizeDisciplineToken(value);
  if (token) set.add(token);
};

const buildKnownDisciplineTokens = (preloadedData: any, currentUser?: AtividadesProps['currentUser']) => {
  const registry = getUnifiedRegistryData(preloadedData);
  const known = new Set<string>();

  DEFAULT_DISCIPLINES.forEach((item) => {
    addKnownDisciplineToken(known, item.code);
    addKnownDisciplineToken(known, item.name);
    addKnownDisciplineToken(known, item.label);
    item.aliases.forEach((alias) => addKnownDisciplineToken(known, alias));
  });

  const registryDisciplines = registry?.professionalsByDisciplina && typeof registry.professionalsByDisciplina === 'object'
    ? Object.keys(registry.professionalsByDisciplina)
    : [];
  registryDisciplines.forEach((item) => addKnownDisciplineToken(known, item));

  const registrySettings = Array.isArray((registry as any)?.disciplineSettings)
    ? (registry as any).disciplineSettings
    : Array.isArray((registry as any)?.disciplinas)
      ? (registry as any).disciplinas
      : [];
  registrySettings.forEach((item: any) => addKnownDisciplineToken(known, item?.nome || item?.name || item));

  getUserDisciplineList(currentUser || {}).forEach((item) => addKnownDisciplineToken(known, item));

  return known;
};

const isRecognizedDisciplineToken = (value: any, knownDisciplines: Set<string>) => {
  const normalized = normalizeDisciplineToken(value);
  if (!isMeaningfulDisciplineToken(normalized)) return false;
  return knownDisciplines.size > 0 && knownDisciplines.has(normalized);
};

const hasRecognizedActivityDiscipline = (value: any, knownDisciplines: Set<string>) => {
  return splitMultiValue(value).some((item) => isRecognizedDisciplineToken(item, knownDisciplines));
};

const normalizePlannedDateValue = (value: any) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{11,13}$/.test(text)) return '';

  const isIso = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const isBr = /^\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}$/.test(text);
  if (!isIso && !isBr) return '';

  const parsed = parseDate(text);
  if (Number.isNaN(parsed.getTime())) return '';

  const iso = toIsoDate(parsed);
  if (isIso && iso !== text) return '';

  return iso;
};

const hasRenderableDateRange = (activity: Pick<EngineeringActivity, 'inicioPlanejado' | 'terminoPlanejado'>) => {
  const start = normalizePlannedDateValue(activity.inicioPlanejado);
  const end = normalizePlannedDateValue(activity.terminoPlanejado);
  if (!start || !end) return false;
  return parseDate(start).getTime() <= parseDate(end).getTime();
};

const pickReadableLabel = (...values: any[]) => {
  for (const value of values) {
    const candidate = Array.isArray(value)
      ? value.map((item) => String(item || '').trim()).filter(Boolean).join(' | ').trim()
      : String(value || '').trim();

    if (!candidate) continue;

    const normalized = normalizeDisciplineToken(candidate);
    if (!normalized || normalized === 'sem disciplina' || normalized === 'ignorado') continue;
    if (/^\d+([.,]\d+)?$/.test(normalized)) continue;
    if (/^\d{11,13}$/.test(normalized)) continue;
    if (!/[a-z]/i.test(normalized)) continue;
    return candidate;
  }

  return '';
};

const normalizeSheetProgressPercent = (value: unknown) => {
  const normalized = typeof value === 'number'
    ? value
    : Number(String(value || '').trim().replace('%', '').replace(',', '.'));

  if (!Number.isFinite(normalized)) return 0;
  if (normalized <= 1) return normalized * 100;
  return normalized;
};

const getHierarchyCodePrefix = (value: unknown, depth: number) => {
  const cleaned = String(value || '').trim();
  if (!cleaned) return '';

  const parts = cleaned.split('.').map((part) => part.trim()).filter(Boolean);
  if (parts.length <= depth) return cleaned;

  return parts.slice(0, depth).join('.');
};

const getActivitySourceCode = (activity: Partial<EngineeringActivity> & Record<string, unknown>) => {
  return String(
    activity.contratoCodigo ||
    (activity as any).contractCode ||
    activity.osCodigo ||
    (activity as any).osCode ||
    (activity as any).itemCodigo ||
    (activity as any).itemCode ||
    activity.origemItem ||
    ''
  ).trim();
};

const getActivityRenderableCode = (activity: any) => {
  return String(
    activity?.itemCodigo ||
    activity?.itemCode ||
    activity.origemItem ||
    ''
  ).trim();
};

const isManualActivity = (activity: any) => {
  return normalizeText(String(activity?.sourceType || '')) === 'manual';
};

const isLeafActivityCode = (code?: string) => {
  const cleaned = String(code || '').trim();
  if (!cleaned) return false;
  return cleaned.split('.').map((part) => part.trim()).filter(Boolean).length >= 3;
};

const getActivityContractCode = (activity: Partial<EngineeringActivity> & Record<string, unknown>) => {
  const sourceCode = getActivitySourceCode(activity);
  if (!sourceCode) return '';

  return getHierarchyCodePrefix(sourceCode, 1);
};

const getActivityOsCode = (activity: Partial<EngineeringActivity> & Record<string, unknown>) => {
  const sourceCode = String(
    activity.osCodigo ||
    (activity as any).osCode ||
    (activity as any).itemCodigo ||
    (activity as any).itemCode ||
    activity.origemItem ||
    activity.contratoCodigo ||
    (activity as any).contractCode ||
    ''
  ).trim();

  if (!sourceCode) return '';

  return getHierarchyCodePrefix(sourceCode, 2);
};

const sameContractCode = (first?: string, second?: string) => {
  return normalizeText(first) === normalizeText(second);
};

const getDisciplineAbbreviation = (value: string) => {
  const cleaned = splitDisciplinas(value)[0] || 'Sem disciplina';
  const compact = cleaned
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim();

  if (!compact || normalizeText(compact) === 'sem disciplina') return 'SD';

  const initials = compact
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] || '')
    .join('')
    .slice(0, 3)
    .toUpperCase();

  return initials || compact.slice(0, 2).toUpperCase();
};

const getDisciplineLabel = (value: string) => {
  const cleaned = splitDisciplinas(value)[0] || 'Sem disciplina';
  const label = cleaned
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return label || 'Sem disciplina';
};

const hasLodToken = (value?: string) => /\bLOD\b[^0-9]*\d+/i.test(String(value || ''));

const extractLodValue = (value?: string) => {
  const matches = String(value || '').match(/\bLOD\b[^0-9]*([0-9]{2,3})/i);
  const numberValue = matches ? Number(matches[1]) : NaN;
  return LOD_OPTIONS.includes(numberValue as LodLevel) ? (numberValue as LodLevel) : null;
};

const stripLodFromTitle = (value?: string, osCode?: string) => {
  const cleanedOsCode = String(osCode || '').trim();
  const escapedOsCode = cleanedOsCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return String(value || '')
    .replace(/\bLOD\b[^0-9]*\d+/gi, '')
    .replace(/^\s*\d+(?:\.\d+)+\s*-\s*/g, '')
    .replace(/^\s*\d+(?:\.\d+)+\s+/g, '')
    .replace(cleanedOsCode ? new RegExp(`^\\s*${escapedOsCode}\\s*-?\\s*`, 'i') : /^$/, '')
    .replace(/\s+-\s+-/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+-\s+$/g, '')
    .trim();
};

const extractVisualOsCode = (activity: Pick<EngineeringActivity, 'osCodigo' | 'osNome'>) => {
  const rawOsCode = String(activity.osCodigo || '').trim();
  if (/^OS\s*\d+/i.test(rawOsCode)) return rawOsCode;

  const titleMatch = String(activity.osNome || '').match(/\bOS\s*\d+\b/i);
  if (titleMatch) return titleMatch[0].trim().replace(/\s+/g, ' ');

  return rawOsCode;
};

const getActivityProjectLabel = (activity: Pick<EngineeringActivity, 'itemNome' | 'atividade'>) => {
  return String(activity.itemNome || activity.atividade || '').trim();
};

const extractProjectType = (osNome?: string): string => {
  const name = String(osNome || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/\bBASICO\b/.test(name)) return 'Básico';
  if (/\bEXECUTIVO\b/.test(name)) return 'Executivo';
  if (/\bCONCEITUAL\b/.test(name)) return 'Conceitual';
  if (/\bLEGAL\b/.test(name)) return 'Legal';
  if (/\bDETALHADO\b/.test(name)) return 'Detalhado';
  if (/\bANTEPROJETO\b/.test(name)) return 'Anteprojeto';
  return '';
};

const getNextLodValue = (lod: LodLevel): LodLevel => {
  const sorted = [...LOD_OPTIONS].sort((a, b) => a - b);
  const next = sorted.find((item) => item > lod);
  return (next || sorted[sorted.length - 1] || lod) as LodLevel;
};

const getLeaderPercentual = (activity: EngineeringActivity) => {
  if (typeof activity.porcentagemAtividade === 'number') return activity.porcentagemAtividade;
  return activity.percentualRealizado;
};

const hasLeaderInputs = (activity: EngineeringActivity) => {
  return Boolean(
    activity.leaderEdited ||
    activity.executadoPor.length > 0 ||
    activity.statusDaAtividade ||
    activity.dificuldadeAtividade ||
    String(activity.observacaoLider || '').trim() ||
    typeof activity.porcentagemAtividade === 'number'
  );
};

const getLeaderStatusLabel = (activity: EngineeringActivity) => {
  return hasLeaderInputs(activity) ? 'Executando' : 'Não iniciado';
};

const getUnifiedRegistryData = (preloadedData: any) => {
  return preloadedData?.eap?.data?.registro
    || preloadedData?.eap?.registro
    || preloadedData?.registro
    || preloadedData
    || {};
};

const buildProfessionalOptions = (
  preloadedData: any,
  currentUser?: AtividadesProps['currentUser'],
  showAllDisciplines = false,
) => {
  const registro = getUnifiedRegistryData(preloadedData);
  const professionalsByDisciplina = registro?.professionalsByDisciplina && typeof registro.professionalsByDisciplina === 'object'
    ? registro.professionalsByDisciplina
    : {};
  const currentDisciplines = getUserDisciplineList(currentUser || {}).map((item) => normalizeText(item)).filter(Boolean);
  const allProfessionals = Object.values(professionalsByDisciplina).flatMap((value) => (Array.isArray(value) ? value : []));
  const rawProfessionals = showAllDisciplines
    ? (allProfessionals.length > 0 ? allProfessionals : (Array.isArray(registro?.professionals) ? registro.professionals : []))
    : currentDisciplines.length > 0
      ? Object.entries(professionalsByDisciplina)
          .filter(([key]) => currentDisciplines.includes(normalizeText(key)))
          .flatMap(([, value]) => (Array.isArray(value) ? value : []))
      : Array.isArray(registro?.professionals) ? registro.professionals : [];

  const seen = new Set<string>();
  return rawProfessionals
    .map((item: any) => ({
      nome: String(item?.nome || item?.name || '').trim(),
      email: String(item?.email || '').trim().toLowerCase(),
      disciplina: String(item?.disciplina || currentUser?.disciplina || '').trim() || 'Sem disciplina'
    }))
    .filter((item: { nome: string; email: string }) => {
      const key = `${item.nome}|${item.email}`;
      if (!item.nome || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const buildEapMaps = (preloadedData: any) => {
  const registros = [
    preloadedData?.eap?.data?.registro,
    preloadedData?.eap?.registro,
    preloadedData?.registro,
    getUnifiedRegistryData(preloadedData),
  ].filter((item) => item && typeof item === 'object');
  const contracts = registros.flatMap((registro) => Array.isArray(registro.contracts) ? registro.contracts : []);
  const osOptions = registros.flatMap((registro) => Array.isArray(registro.osOptions) ? registro.osOptions : []);
  const itemOptions = registros.flatMap((registro) => Array.isArray(registro.itemOptions) ? registro.itemOptions : []);
  const hierarchyNodes = registros.flatMap((registro) => Array.isArray(registro.hierarchyNodes) ? registro.hierarchyNodes : []);

  const buildNameMap = (options: any[]) => {
    const map = new Map<string, string>();
    options.forEach((item: any) => {
      const code = String(item?.codigo || '').trim();
      const name = String(item?.nome || item?.codigo || '').trim();
      if (code && name && !map.has(code)) map.set(code, name);
    });
    return map;
  };

  const contractNameByCode = buildNameMap(contracts);
  const osNameByCode = buildNameMap(osOptions);
  const itemNameByCode = buildNameMap(itemOptions);
  const nodeByCode = new Map<string, any>(hierarchyNodes.map((item: any) => [String(item.codigo || '').trim(), item]));

  const edificioPorItem = [
    preloadedData?.eap?.edificioPorItem,
    preloadedData?.eap?.data?.edificioPorItem,
    preloadedData?.edificioPorItem,
  ].find((item) => item && typeof item === 'object') || {};
  const edificioByCode = new Map<string, string>(
    Object.entries(edificioPorItem)
      .map(([code, value]) => [String(code).trim(), String(value ?? '').trim()] as [string, string])
      .filter(([, value]) => value)
  );

  [
    preloadedData?.eap?.curvaS?.atual,
    preloadedData?.eap?.data?.curvaS?.atual,
    preloadedData?.curvaS?.atual,
  ].filter(Array.isArray).flat().forEach((row: any) => {
    const code = String(Array.isArray(row) ? row?.[0] : row?.codigo || row?.code || '').trim();
    const name = String(Array.isArray(row) ? row?.[1] : row?.nome || row?.name || '').trim();
    if (code && name) osNameByCode.set(code, name);
  });

  return { contractNameByCode, osNameByCode, itemNameByCode, nodeByCode, hierarchyNodes, edificioByCode };
};

const findLongestHierarchyMatch = (code: string, namesByCode: Map<string, string>) => {
  let bestMatch: { codigo: string; nome: string } | null = null;

  namesByCode.forEach((nome, codigo) => {
    if (code !== codigo && !code.startsWith(`${codigo}.`)) return;
    if (!bestMatch || codigo.length > bestMatch.codigo.length) {
      bestMatch = { codigo, nome };
    }
  });

  return bestMatch;
};

const resolveDisciplineLeaderName = (preloadedData: any, discipline?: string) => {
  const registry = getUnifiedRegistryData(preloadedData);
  const professionalsByDisciplina = registry?.professionalsByDisciplina && typeof registry.professionalsByDisciplina === 'object'
    ? registry.professionalsByDisciplina
    : {};
  const target = normalizeText(String(discipline || '').trim());
  if (!target) return '';

  const matchingEntry = Object.entries(professionalsByDisciplina).find(([key]) => normalizeText(String(key || '')) === target);
  const professionals = Array.isArray(matchingEntry?.[1]) ? matchingEntry![1] : [];
  if (professionals.length === 0) return '';

  const leader = professionals.find((item: any) => {
    const role = normalizeText(String(item?.cargo || item?.role || item?.funcao || ''));
    return role.includes('lider') || Boolean(item?.isLeader || item?.lider || item?.leader);
  });

  const candidate = leader || professionals[0];
  return String(candidate?.nome || candidate?.name || '').trim();
};

const getUnifiedEapRegistry = (preloadedData: any) => {
  return getUnifiedRegistryData(preloadedData);
};

export const buildActivitiesFromEap = (preloadedData: any, currentUser?: AtividadesProps['currentUser']): EngineeringActivity[] => {
  const { contractNameByCode, osNameByCode, itemNameByCode, edificioByCode } = buildEapMaps(preloadedData);
  const knownDisciplineTokens = buildKnownDisciplineTokens(preloadedData, currentUser);
  const rowSources = [
    preloadedData?.eap?.atual,
    preloadedData?.eap?.data?.atual,
    preloadedData?.cronograma,
    preloadedData?.eap?.cronograma,
    preloadedData?.eap?.data?.cronograma,
    preloadedData?.registro?.cronograma,
  ].filter(Array.isArray) as EapSourceRow[][];

  const selectedSourceRows = rowSources.find((source) => source.length > 0) || [];

  const readRowValue = (row: EapSourceRow, index: number, keys: string[]) => {
    if (Array.isArray(row)) {
      return String(row?.[index] || '').trim();
    }

    for (const key of keys) {
      const value = (row as Record<string, unknown>)?.[key];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }

    return '';
  };

  const activities = selectedSourceRows
    .map((row: EapSourceRow) => {
      const code = readRowValue(row, 0, ['code', 'codigo', 'itemCodigo', 'itemCode']);
      const rowName = readRowValue(row, 1, ['name', 'nome', 'itemNome', 'descricao', 'atividade']);
      const codeParts = code.split('.').filter(Boolean);
      const disciplinasSource = Array.isArray(row)
        ? row?.[7] || row?.[9] || ''
        : String((row as any).disciplina || (row as any).disciplinas || '').trim();
      const plannedStart = normalizePlannedDateValue(Array.isArray(row) ? row?.[4] : (row as any).plannedStart);
      const plannedEnd = normalizePlannedDateValue(Array.isArray(row) ? row?.[5] : (row as any).plannedEnd);
      const hasRenderableStructure = Boolean(
        code &&
        rowName &&
        codeParts.length >= 3 &&
        plannedStart &&
        plannedEnd &&
        parseDate(plannedStart).getTime() <= parseDate(plannedEnd).getTime() &&
        hasRecognizedActivityDiscipline(disciplinasSource, knownDisciplineTokens)
      );
      if (!hasRenderableStructure) return null;

      const disciplinas = splitDisciplinas(disciplinasSource);
      const disciplineForLeader = disciplinas[0] || '';

      const progressPercent = Math.max(0, normalizeSheetProgressPercent(Array.isArray(row) ? row?.[2] : row.progress));
      const percentualRealizado = Math.min(100, Math.floor(progressPercent));
      const lodAtual = extractLodValue(rowName) || inferCurrentLod(300, progressPercent);
      const matchedContract = findLongestHierarchyMatch(code, contractNameByCode);
      const matchedOs = findLongestHierarchyMatch(code, osNameByCode);
      const matchedEdificio = findLongestHierarchyMatch(code, edificioByCode);
      const contractCode = matchedContract?.codigo || getHierarchyCodePrefix(code, 1) || String(Array.isArray(row) ? row?.[11] : (row as any).contractCode || (row as any).contratoCodigo || '').trim() || codeParts[0] || code;
      const osCode = matchedOs?.codigo || String(Array.isArray(row) ? row?.[10] : (row as any).osCode || (row as any).osCodigo || '').trim() || getHierarchyCodePrefix(code, 2) || (codeParts.length >= 2 ? codeParts.slice(0, 2).join('.') : contractCode);
      const contractNome = contractNameByCode.get(contractCode) || String(Array.isArray(row) ? row?.[12] : (row as any).contractName || (row as any).contratoNome || contractCode).trim();
      const osNome = matchedOs?.nome || osNameByCode.get(osCode) || String(Array.isArray(row) ? '' : (row as any).osNome || osCode).trim() || osCode;
      const leaderDisplay = resolveDisciplineLeaderName(preloadedData, disciplineForLeader) || 'Não atribuído';
      const status = progressPercent >= 100
        ? 'Concluído'
        : progressPercent > 0
          ? 'Em execução'
          : 'Não iniciado';

      return {
        id: `eap-${code}`,
        itemCodigo: code,
        itemNome: itemNameByCode.get(code) || rowName,
        sourceType: 'eap',
        contractCode: contractCode || 'Sem contrato',
        contratoCodigo: contractCode || 'Sem contrato',
        contratoNome: contractNome || contractCode || 'Sem contrato',
        osCodigo: osCode || 'Sem OS',
        osNome: osNome || rowName,
        disciplina: disciplinas.join(' | '),
        disciplinas,
        subdisciplina: disciplinas[0] || 'Sem subdisciplina',
        responsavel: leaderDisplay || 'NÃ£o atribuÃ­do',
        etapaTecnica: 'Modelagem',
        lodAtual,
        lodAlvoSemana: getNextLodValue(lodAtual),
        inicioPlanejado: plannedStart,
        terminoPlanejado: plannedEnd,
        prioridade: 'Normal',
        status,
        percentualPrevisto: clampPercentage(
          typeof row === 'object' && !Array.isArray(row) && typeof row.idealProgress === 'number'
            ? row.idealProgress
            : Array.isArray(row)
              ? Number(row?.[6] || 0)
              : row.baselineIdealProgress
        ),
        percentualRealizado,
        atividade: '',
        motivoBloqueio: '',
        proximaAcao: 'Preencher os campos da atividade na abertura do card.',
        observacoes: 'Atividade derivada da EAP unificada.',
        dataCriacao: toIsoDate(TODAY),
        origemItem: code,
        edificio: matchedEdificio?.nome || '',
        executadoPor: [],
        statusDaAtividade: '',
        dificuldadeAtividade: '',
        porcentagemAtividade: null,
        observacaoLider: '',
        leaderEdited: false
      } as EngineeringActivity;
    })
    .filter(Boolean)
    .filter(hasBoardActivityDiscipline) as EngineeringActivity[];

  if (activities.length > 0) return activities.sort(compareActivities);

  const registro = preloadedData?.registro || preloadedData || {};
  const fallbackRows = Array.isArray(registro.activitiesList) && registro.activitiesList.length > 0
    ? registro.activitiesList
      : [
          ...(Array.isArray(registro.activeActivities) ? registro.activeActivities : []),
          ...(Array.isArray(registro.completedActivities) ? registro.completedActivities : []),
        ];

  if (fallbackRows.length === 0) return [];

  return normalizeActivityList(fallbackRows, knownDisciplineTokens)
    .filter(hasBoardActivityDiscipline)
    .sort(compareActivities);
};

const normalizeLegacyStatus = (value?: string): ProductionStatus => {
  switch (value) {
    case 'Entrada':
      return 'Não iniciado';
    case 'Programado para a Semana':
      return 'Programado para a semana';
    case 'Em Execução':
    case 'Em ExecuÃ§Ã£o':
      return 'Em execução';
    case 'Em Revisão/Validação':
    case 'Em RevisÃ£o/ValidaÃ§Ã£o':
      return 'Em revisão';
    case 'Bloqueado':
      return 'Bloqueado';
    case 'Concluído':
    case 'ConcluÃ­do':
      return 'Concluído';
    case 'Atrasado':
      return 'Atrasado';
    default:
      return 'Programado para a semana';
  }
};

const isProductionStatus = (value: unknown): value is ProductionStatus => {
  return STATUS_OPTIONS.includes(value as ProductionStatus);
};

const normalizeActivity = (raw: Partial<EngineeringActivity> & Record<string, unknown>): EngineeringActivity => {
  const target = (typeof raw.lodAlvoSemana === 'number' ? raw.lodAlvoSemana : raw.lod) as LodLevel | undefined;
  const lodAlvoSemana = LOD_OPTIONS.includes(target as LodLevel) ? (target as LodLevel) : 300;
  const percentualRealizado = clampPercentage(
    typeof raw.percentualRealizado === 'number' ? raw.percentualRealizado : typeof raw.avanco === 'number' ? raw.avanco : 0
  );
  const porcentagemAtividade = typeof raw.porcentagemAtividade === 'number'
    ? clampPercentage(raw.porcentagemAtividade)
    : typeof raw.leaderPercentual === 'number'
      ? clampPercentage(raw.leaderPercentual)
      : null;
  const leaderEdited = Boolean(
    raw.leaderEdited ||
    porcentagemAtividade !== null ||
    String(raw.observacaoLider || '').trim() ||
    (Array.isArray(raw.executadoPor) && raw.executadoPor.length > 0)
  );

  return {
    id: String(raw.id || `act-${Date.now()}`),
    contractCode: String(raw.contractCode || raw.contratoCodigo || ''),
    contratoCodigo: String(raw.contratoCodigo || ''),
    contratoNome: String(raw.contratoNome || raw.contratoCodigo || ''),
    osCodigo: String(raw.osCodigo || ''),
    osNome: String(raw.osNome || ''),
    itemNome: String((raw as any).itemNome || (raw as any).itemName || ''),
    disciplina: normalizeDisciplineLabel(raw.disciplinas || raw.disciplina || raw.criadoPorDisciplina || ''),
    disciplinas: splitDisciplinas(raw.disciplinas || raw.disciplina || raw.criadoPorDisciplina || '').filter(isMeaningfulDisciplineToken),
    subdisciplina: normalizeDisciplineLabel(raw.subdisciplina || ''),
    responsavel: String(raw.responsavel || 'NÃ£o atribuÃ­do'),
    etapaTecnica: (TECHNICAL_STEPS.includes(raw.etapaTecnica as TechnicalStep) ? raw.etapaTecnica : 'Modelagem') as TechnicalStep,
    lodAtual: LOD_OPTIONS.includes(raw.lodAtual as LodLevel) ? (raw.lodAtual as LodLevel) : inferCurrentLod(lodAlvoSemana, percentualRealizado),
    lodAlvoSemana,
    inicioPlanejado: String(raw.inicioPlanejado || raw.plannedStart || '').trim(),
    terminoPlanejado: String(raw.terminoPlanejado || raw.plannedEnd || '').trim(),
    prioridade: (PRIORITY_OPTIONS.includes(raw.prioridade as PriorityLevel) ? raw.prioridade : 'Normal') as PriorityLevel,
    status: normalizeLegacyStatus(String(raw.status || '')),
    percentualPrevisto: clampPercentage(typeof raw.percentualPrevisto === 'number' ? raw.percentualPrevisto : percentualRealizado),
    percentualRealizado,
    atividade: String(raw.atividade || raw.descricao || '').trim(),
    motivoBloqueio: String(raw.motivoBloqueio || raw.impedimentoMotivo || ''),
    proximaAcao: String(raw.proximaAcao || 'Atualizar frente conforme cronograma da semana.'),
    observacoes: String(raw.observacoes || 'VisualizaÃ§Ã£o operacional derivada do cronograma/EAP.'),
    dataCriacao: String(raw.dataCriacao || getCurrentWeekKey()),
    origemItem: String(raw.origemItem || ''),
    edificio: String(raw.edificio || ''),
    itemCodigo: String(raw.itemCodigo || raw.itemCode || raw.origemItem || ''),
    sourceType: normalizeText(String(raw.sourceType || '')) as EngineeringActivity['sourceType'],
    executadoPor: splitMultiValue(raw.executadoPor || raw.profissionais || []),
    statusDaAtividade: String(raw.statusDaAtividade || '') as LeaderActivityStatus,
    dificuldadeAtividade: String(raw.dificuldadeAtividade || '') as LeaderDifficulty,
    porcentagemAtividade,
    observacaoLider: String(raw.observacaoLider || ''),
    leaderEdited
  };
};

const normalizeActivityList = (rawList: unknown, knownDisciplineTokens = new Set<string>()) => {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .map((item) => normalizeActivity(item as Partial<EngineeringActivity> & Record<string, unknown>))
    .filter((activity) => {
      const disciplineValue = activity.disciplinas || activity.disciplina;
      const hasDiscipline = knownDisciplineTokens.size > 0
        ? hasRecognizedActivityDiscipline(disciplineValue, knownDisciplineTokens)
        : hasExplicitActivityDiscipline(disciplineValue);
      if (!hasDiscipline) return false;
      if (!hasRenderableDateRange(activity)) return false;
      if (isManualActivity(activity)) return true;
      return isLeafActivityCode(getActivityRenderableCode(activity));
    });
};

const mergeSavedActivitiesWithSource = (savedActivities: EngineeringActivity[], sourceActivities: EngineeringActivity[]) => {
  const savedById = new Map(savedActivities.map((activity) => [activity.id, activity]));
  return sourceActivities.map((activity) => {
    const saved = savedById.get(activity.id);
    if (!saved) return activity;

    return {
      ...activity,
      ...saved,
      disciplinas: Array.isArray(saved.disciplinas) && saved.disciplinas.length > 0 ? saved.disciplinas : activity.disciplinas,
      executadoPor: Array.isArray(saved.executadoPor) ? saved.executadoPor : activity.executadoPor,
      porcentagemAtividade: typeof saved.porcentagemAtividade === 'number' ? saved.porcentagemAtividade : activity.porcentagemAtividade,
      leaderEdited: Boolean(saved.leaderEdited || activity.leaderEdited)
    };
  });
};

const hasBoardActivityDiscipline = (activity: EngineeringActivity) => {
  if (!hasExplicitActivityDiscipline(activity.disciplinas || activity.disciplina)) return false;
  if (!hasRenderableDateRange(activity)) return false;
  if (isManualActivity(activity)) return true;
  return isLeafActivityCode(getActivityRenderableCode(activity));
};

const getEffectiveStatus = (activity: EngineeringActivity): ProductionStatus => {
  if (hasLeaderInputs(activity)) return 'Em execução';
  if (activity.status === 'Concluído' || activity.percentualRealizado >= 100) return 'Concluído';
  if (activity.status === 'Não iniciado') return 'Não iniciado';
  if (activity.status === 'Bloqueado') return 'Bloqueado';
  if (parseDate(activity.terminoPlanejado).getTime() < TODAY.getTime() && activity.percentualRealizado < 100) return 'Atrasado';
  return isProductionStatus(activity.status) ? activity.status : 'Programado para a semana';
};

const getProgressDelta = (activity: EngineeringActivity) => getLeaderPercentual(activity) - activity.percentualPrevisto;

const getLodStatus = (activity: EngineeringActivity) => {
  if (activity.lodAtual > activity.lodAlvoSemana) return 'Acima do alvo';
  if (activity.lodAtual === activity.lodAlvoSemana) return 'Atingido';
  if (getEffectiveStatus(activity) === 'Atrasado' || getProgressDelta(activity) < -15) return 'Atenção';
  return 'Em evoluÃ§Ã£o';
};

const compareActivities = (first: EngineeringActivity, second: EngineeringActivity) => {
  const contractualDiff = (first.prioridade === 'Contratual' ? 0 : 1) - (second.prioridade === 'Contratual' ? 0 : 1);
  if (contractualDiff !== 0) return contractualDiff;

  const overdueDiff = (getEffectiveStatus(first) === 'Atrasado' ? 0 : 1) - (getEffectiveStatus(second) === 'Atrasado' ? 0 : 1);
  if (overdueDiff !== 0) return overdueDiff;

  const dateDiff = parseDate(first.terminoPlanejado).getTime() - parseDate(second.terminoPlanejado).getTime();
  if (dateDiff !== 0) return dateDiff;

  const blockedDiff = (getEffectiveStatus(first) === 'Bloqueado' ? 0 : 1) - (getEffectiveStatus(second) === 'Bloqueado' ? 0 : 1);
  if (blockedDiff !== 0) return blockedDiff;

  const priorityDiff = getPriorityRank(first.prioridade) - getPriorityRank(second.prioridade);
  if (priorityDiff !== 0) return priorityDiff;

  return first.osCodigo.localeCompare(second.osCodigo);
};

const matchesUserDiscipline = (activity: EngineeringActivity, discipline?: string) => {
  const normalizedDiscipline = getUserDisciplineList({ disciplina: discipline }).map((item) => normalizeText(item)).filter(Boolean);
  if (!normalizedDiscipline.length) return true;
  const activityDisciplinas = splitDisciplinas(activity.disciplinas || activity.disciplina);
  if (!hasExplicitActivityDiscipline(activityDisciplinas)) return false;
  return activityDisciplinas.some((item) => normalizedDiscipline.includes(normalizeText(item)));
};

const isThirdPartyActivity = (activity: EngineeringActivity) => {
  const searchable = [
    activity.responsavel,
    activity.atividade,
    activity.observacoes,
    activity.motivoBloqueio,
    ...activity.executadoPor,
  ]
    .map((value) => normalizeText(String(value || '')))
    .join(' ');
  return searchable.includes('terceirizada');
};

function PriorityBadge({ priority }: { priority: PriorityLevel }) {
  const colors = priorityColorMap[priority];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.4px] ${colors.bg} ${colors.text} ${colors.border}`}>
      {priority}
    </span>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { label: string; value: string }>;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#757575]">{label}</label>
      <SearchableSelect
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none transition-colors focus:border-[#F05D28]"
      >
        {options.map((option) => (
          <option key={typeof option === 'string' ? option : option.value} value={typeof option === 'string' ? option : option.value}>
            {(() => {
              const optionValue = typeof option === 'string' ? option : option.value;
              const optionLabel = typeof option === 'string' ? option : option.label;
              return normalizeText(optionValue) === 'todos' || normalizeText(optionValue) === 'todas'
                ? 'Selecionar...'
                : optionLabel;
            })()}
          </option>
        ))}
      </SearchableSelect>
    </div>
  );
}

function FilterMultiSelectDropdown({
  label,
  value,
  options,
  placeholder,
  onChange
}: {
  label: string;
  value: string[];
  options: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const [search, setSearch] = useState('');
  const selectedLabels = options.filter((option) => value.includes(option));
  const filteredOptions = search
    ? options.filter((option) => normalizeText(getDisciplineFilterLabel(option)).includes(normalizeText(search)))
    : options;
  const toggleValue = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((item) => item !== option));
      return;
    }
    onChange([...value, option]);
  };

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#757575]">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="mt-1 flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-white px-3 text-left text-[13px] font-medium text-[#2D2D2D] outline-none transition-colors hover:border-[#F7C7B7] focus:border-[#F05D28]"
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {selectedLabels.length > 0 ? (
            selectedLabels.map((item) => (
              <span key={item} className="inline-flex max-w-full items-center rounded-full bg-[#EEF6FD] px-2.5 py-1 text-[11px] font-semibold text-[#0F4C81]">
                <span className="truncate">{getDisciplineFilterLabel(item)}</span>
              </span>
            ))
          ) : (
            <span className="text-[#94A3B8]">{placeholder}</span>
          )}
        </div>
        <ChevronDown size={16} className={`shrink-0 text-[#94A3B8] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_20px_48px_rgba(15,76,129,0.14)]"
        >
          <div className="border-b border-[#F1F5F9] p-2">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar..."
              className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] placeholder:text-[#94A3B8]"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto p-2">
            {options.length === 0 || filteredOptions.length === 0 ? (
              <div className="rounded-xl bg-[#F8FAFC] px-3 py-3 text-[12px] text-[#94A3B8]">
                Nenhuma disciplina encontrada.
              </div>
            ) : (
              filteredOptions.map((option) => {
                const checked = value.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleValue(option)}
                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-[#F8FAFC] ${checked ? 'bg-[#ECFEFF]' : ''}`}
                  >
                    <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${checked ? 'border-[#0F766E] bg-[#0F766E]' : 'border-[#CBD5E1] bg-white'}`}>
                      {checked ? <span className="text-[10px] font-black leading-none text-white">✓</span> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-[#2D2D2D]">{getDisciplineFilterLabel(option)}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-[10px] font-medium text-[#64748B]">
            Sem seleção, todas as disciplinas aparecem.
          </div>
        </motion.div>
      )}
    </div>
  );
}

function MultiCheckboxDropdown({
  label,
  value,
  options,
  placeholder,
  helperText,
  onChange
}: {
  label: string;
  value: string[];
  options: Array<{ nome: string; email: string; disciplina: string }>;
  placeholder: string;
  helperText: string;
  onChange: (next: string[]) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const [search, setSearch] = useState('');
  const selectedLabels = options
    .filter((option) => value.includes(option.nome))
    .map((option) => option.nome);
  const filteredOptions = search
    ? options.filter((option) => normalizeText(`${option.nome} ${option.email} ${option.disciplina}`).includes(normalizeText(search)))
    : options;

  const toggleValue = (nome: string) => {
    if (value.includes(nome)) {
      onChange(value.filter((item) => item !== nome));
      return;
    }

    onChange([...value, nome]);
  };

  return (
    <div ref={wrapperRef} className="relative col-span-2">
      <label className="bentham-label">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-left transition-colors hover:border-[#F7C7B7] focus:border-[#F05D28]"
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {selectedLabels.length > 0 ? (
            selectedLabels.map((name) => (
              <span key={name} className="inline-flex max-w-full items-center rounded-full bg-[#EEF6FD] px-2.5 py-1 text-[11px] font-semibold text-[#0F4C81]">
                <span className="truncate">{name}</span>
              </span>
            ))
          ) : (
            <span className="text-[13px] text-[#94A3B8]">{placeholder}</span>
          )}
        </div>
        <ChevronDown size={16} className={`shrink-0 text-[#94A3B8] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_20px_48px_rgba(15,76,129,0.14)]"
        >
          <div className="border-b border-[#F1F5F9] p-2">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por nome ou e-mail..."
              className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] text-[#2D2D2D] outline-none focus:border-[#F05D28] placeholder:text-[#94A3B8]"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto p-2">
            {options.length === 0 || filteredOptions.length === 0 ? (
              <div className="rounded-xl bg-[#F8FAFC] px-3 py-3 text-[12px] text-[#94A3B8]">
                Nenhuma pessoa encontrada neste setor.
              </div>
            ) : (
              filteredOptions.map((option) => {
                const checked = value.includes(option.nome);
                return (
                  <button
                    key={`${option.nome}-${option.email}`}
                    type="button"
                    onClick={() => toggleValue(option.nome)}
                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-[#F8FAFC] ${checked ? 'bg-[#ECFEFF]' : ''}`}
                  >
                    <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${checked ? 'border-[#0F766E] bg-[#0F766E]' : 'border-[#CBD5E1] bg-white'}`}>
                      {checked ? <span className="text-[10px] font-black leading-none text-white">✓</span> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-[#2D2D2D]">{option.nome}</span>
                      <span className="block truncate text-[10px] text-[#94A3B8]">{option.email}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-[10px] font-medium text-[#64748B]">
            {helperText}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function CompactStat({
  icon,
  label,
  value,
  tone,
  valueClassName = ''
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone: string;
  valueClassName?: string;
}) {
  return (
    <div className={`inline-flex min-w-0 items-center gap-2 rounded-[20px] border bg-white px-2 py-1.5 shadow-sm ${tone}`}>
      <div className="text-[#F05D28]">{icon}</div>
      <div className="min-w-0">
        <p className="text-[9px] font-extrabold uppercase tracking-[0.7px] text-[#94A3B8]">{label}</p>
        <p className={`text-[13px] font-black text-[#2D2D2D] ${valueClassName}`}>{value}</p>
      </div>
    </div>
  );
}

function ProgressComparison({ activity }: { activity: EngineeringActivity }) {
  const hasProgress = typeof activity.porcentagemAtividade === 'number';
  const leaderPercentual = hasProgress ? getLeaderPercentual(activity) : 0;
  const delta = leaderPercentual - activity.percentualPrevisto;
  const tone =
    !hasProgress
      ? 'border-[#E5E7EB] bg-[#F8FAFC]'
      : getEffectiveStatus(activity) === 'Bloqueado' || getEffectiveStatus(activity) === 'Atrasado'
      ? 'border-[#F7C7B7] bg-[#FFF8F5]'
      : delta < 0
        ? 'border-[#FDE68A] bg-[#FFFBEB]'
        : 'border-[#D1FAE5] bg-[#F0FDF4]';

  return (
    <div className={`rounded-2xl border p-3 ${tone}`}>
      <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.5px] text-[#64748B]">
        <span>Previsto x Realizado</span>
        <span className={delta < 0 ? 'text-[#B45309]' : 'text-[#0F766E]'}>
          {hasProgress ? (delta >= 0 ? `+${delta}` : delta) : 'Aguardando preenchimento'}{hasProgress ? ' pts' : ''}
        </span>
      </div>

      <div className="space-y-2">
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-[#475569]">
            <span>Previsto</span>
            <span>{activity.percentualPrevisto}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#E2E8F0]">
            <div className="h-full rounded-full bg-[#CBD5E1]" style={{ width: `${activity.percentualPrevisto}%` }} />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-[#475569]">
            <span>Realizado</span>
            <span>{hasProgress ? `${leaderPercentual}%` : '-'}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#E2E8F0]">
            <div className="h-full rounded-full bg-[#F05D28]" style={{ width: `${hasProgress ? leaderPercentual : 0}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-[#FCFCFD] p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.8px] text-[#94A3B8]">{label}</p>
      <div className="mt-1 text-[13px] font-semibold text-[#2D2D2D]">{value}</div>
    </div>
  );
}

const osAccentColorMap: Record<string, string> = {
  'OS 011': '#0F766E',
  'OS 013': '#166534',
  'OS 022': '#D97706',
  'OS 032': '#2563EB',
  'OS 034': '#7C3AED',
  'OS 037': '#0891B2',
  'OS 043': '#C66A4A',
  'OS 045': '#DB2777',
  'OS 050': '#EA580C',
  'OS 053': '#15803D'
};

const LINKED_DISCIPLINE_GROUPS: string[][] = [
  ['Estrutura Metálica', 'Estrutura de Concreto'],
];

const OS_COLOR_PALETTE = [
  '#0F766E', '#166534', '#D97706', '#2563EB', '#7C3AED',
  '#DB2777', '#DC2626', '#EA580C', '#65A30D', '#0284C7',
  '#9333EA', '#BE185D', '#B45309', '#0891B2', '#C66A4A'
];

const getOsAccentColor = (osCode: string): string => {
  if (osAccentColorMap[osCode]) return osAccentColorMap[osCode];
  let hash = 0;
  for (let i = 0; i < osCode.length; i++) {
    hash = (hash * 31 + osCode.charCodeAt(i)) & 0x7fffffff;
  }
  return OS_COLOR_PALETTE[hash % OS_COLOR_PALETTE.length];
};

const BUILDING_COLOR_PALETTE = [
  '#0EA5E9', '#F59E0B', '#84CC16', '#EC4899', '#8B5CF6',
  '#14B8A6', '#F43F5E', '#EAB308', '#6366F1', '#22C55E'
];

const getBuildingAccentColor = (edificio: string): string => {
  const n = parseInt(edificio, 10);
  if (Number.isFinite(n) && n > 0) return BUILDING_COLOR_PALETTE[(n - 1) % BUILDING_COLOR_PALETTE.length];
  let hash = 0;
  for (let i = 0; i < edificio.length; i++) {
    hash = (hash * 31 + edificio.charCodeAt(i)) & 0x7fffffff;
  }
  return BUILDING_COLOR_PALETTE[hash % BUILDING_COLOR_PALETTE.length];
};

const getUniqueEdificios = (activities: EngineeringActivity[]): string[] =>
  Array.from(new Set(activities.map((a) => a.edificio).filter((value): value is string => Boolean(value))));

function BuildingFlagStack({ edificios, compact = false }: { edificios: string[]; compact?: boolean }) {
  if (edificios.length === 0) return null;
  const width = compact ? 10 : 16;
  const height = compact ? 18 : 28;
  const triangle = compact ? 5 : 8;

  return (
    <div className="flex items-start" aria-hidden="true">
      {edificios.map((edificio, index) => (
        <div
          key={edificio}
          className="flex flex-col items-center"
          style={{ position: 'relative', marginLeft: index === 0 ? 0 : -Math.round(width / 2), zIndex: edificios.length - index }}
          title={`Edifício ${edificio}`}
        >
          <div style={{ height, width, backgroundColor: getBuildingAccentColor(edificio) }} />
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: `${triangle}px solid transparent`,
              borderRight: `${triangle}px solid transparent`,
              borderTop: `${triangle}px solid ${getBuildingAccentColor(edificio)}`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

const assigneeAccentColorMap: Record<string, string> = {
  'Hagata Oliveira': '#F59E0B',
  'Vinicius Delgado': '#2563EB',
  'Igor Freire': '#0F766E',
  'Gabriel Meure': '#C66A4A',
  Vinicius: '#2563EB',
  Beatriz: '#7C3AED',
  Carlos: '#0F766E',
  Mariana: '#D97706',
  Rodrigo: '#1D4ED8',
  Fernanda: '#C66A4A',
  'NÃ£o atribuÃ­do': '#94A3B8'
};

function EarthmovingDisciplineIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M4.1 14.1H15.8V9.2H11.2L10.4 5.4H6.1L5.4 9.2H4.8L4.1 14.1Z" fill="currentColor" />
      <path d="M6.5 5.4H10.1V9.2H5.8L6.5 5.4Z" fill="white" />
      <path d="M7.3 5.4H9.1V9.2H7.3V5.4Z" fill="currentColor" />
      <path d="M13.1 8.9V6.7C13.1 5.9 13.6 5.4 14.4 5.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M11.8 10.4H14.6" stroke="white" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M11.8 11.7H14.6" stroke="white" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M11.8 13H14.6" stroke="white" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M15.5 13.4L18.4 15.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.3 13.1L21.2 13.7C20.8 15.7 21.2 17.1 22 18.2H18.6C17.8 16.7 17.7 15.1 18.3 13.1Z" fill="currentColor" />
      <path d="M18.9 13.6C18.5 15.3 18.7 16.8 19.5 18.1" stroke="white" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M4.3 13.7H13.8C15.4 13.7 16.6 14.9 16.6 16.3C16.6 17.8 15.4 19 13.8 19H4.3C2.7 19 1.4 17.8 1.4 16.3C1.4 14.9 2.7 13.7 4.3 13.7Z" fill="currentColor" />
      <path d="M4.4 15.1H13.7C14.5 15.1 15.1 15.6 15.1 16.3C15.1 17 14.5 17.6 13.7 17.6H4.4C3.6 17.6 3 17 3 16.3C3 15.6 3.6 15.1 4.4 15.1Z" fill="white" />
      <circle cx="5" cy="16.3" r="0.85" fill="currentColor" />
      <circle cx="8" cy="16.3" r="0.85" fill="currentColor" />
      <circle cx="11" cy="16.3" r="0.85" fill="currentColor" />
      <circle cx="14" cy="16.3" r="0.85" fill="currentColor" />
    </svg>
  );
}

function ConcreteStructureDisciplineIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M4.1 19.5H19.9V21H4.1V19.5Z" fill="currentColor" />
      <path d="M5.7 11.2H7.4V19.5H5.7V11.2Z" fill="currentColor" />
      <path d="M11.15 8.1H12.85V19.5H11.15V8.1Z" fill="currentColor" />
      <path d="M16.6 11.2H18.3V19.5H16.6V11.2Z" fill="currentColor" />
      <path d="M4.5 14.55L12 12.45L19.5 14.55V16.15L12 14.15L4.5 16.15V14.55Z" fill="currentColor" />
      <path d="M4.5 10.1L12 6.65L19.5 10.1V11.8L12 8.45L4.5 11.8V10.1Z" fill="currentColor" />
      <path d="M5.7 7.9H7.4V10.75H5.7V7.9Z" fill="currentColor" />
      <path d="M11.15 4.25H12.85V7.55H11.15V4.25Z" fill="currentColor" />
      <path d="M16.6 7.9H18.3V10.75H16.6V7.9Z" fill="currentColor" />
      <path d="M5.95 7.85V5.25" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" />
      <path d="M6.55 7.85V4.85" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" />
      <path d="M7.15 7.85V5.45" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" />
      <path d="M11.4 4.25V2" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" />
      <path d="M12 4.25V1.6" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" />
      <path d="M12.6 4.25V2" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" />
      <path d="M16.85 7.85V5.25" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" />
      <path d="M17.45 7.85V4.85" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" />
      <path d="M18.05 7.85V5.45" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" />
    </svg>
  );
}

function StructuralDisciplineIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M4.5 19.25H19.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M6.25 18.95V10.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M12 18.95V8.15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M17.75 18.95V10.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M6.25 10.6L12 8.15L17.75 10.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.25 14.75L12 12.3L17.75 14.75" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.15 7.55V5.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M12 5.65V4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M14.85 7.55V5.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M10.55 18.95V13.2H13.45V18.95" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HydroSanitaryDisciplineIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 2.4C11.3 4.2 10.2 6.1 8.9 8.2C7.2 10.8 5.4 13.6 5.4 16.2C5.4 20 8.3 22.3 12 22.3C15.7 22.3 18.6 20 18.6 16.2C18.6 13.6 16.8 10.8 15.1 8.2C13.8 6.1 12.7 4.2 12 2.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

function AvacDisciplineIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="9.6" cy="12" r="2.2" fill="currentColor" />
      <path
        d="M8.2 9.6C6.8 7.8 6.2 5.2 7.8 4C9.4 2.7 12.5 3.7 13.2 5C13.8 6.1 12 7.1 11.2 9.7C10.2 9.2 9.1 9.2 8.2 9.6Z"
        fill="currentColor"
      />
      <path
        d="M7.1 12C7.1 13.1 7.6 14.1 8.5 14.7C7 16.5 4.7 18 3.3 16.7C1.8 15.4 2.2 12.2 3.4 11.4C4.4 10.7 5.4 12 7.1 12Z"
        fill="currentColor"
      />
      <path
        d="M10.7 14.9C11.7 14.6 12.4 13.9 12.8 12.9C14.9 13.6 17.4 15 16.9 16.9C16.4 18.8 13.4 19.9 12.1 19.1C11 18.5 11.6 16.9 10.7 14.9Z"
        fill="currentColor"
      />
      <path d="M13.2 9.4C15.1 8.1 16.7 8.2 18.2 8.6C19.4 8.9 20.6 8.8 21.7 7.7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M13.9 11.6C15.7 10.9 17.1 11.2 18.7 11.7C19.8 12.1 20.8 12.1 22 11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M15.7 14.2C17 15 18 15.6 19.4 15.6C20.4 15.6 21.2 15.3 22 14.6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function ElectricalSpdaDisciplineIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M7.3 3.1C7.3 2.5 7.8 2 8.4 2C9 2 9.5 2.5 9.5 3.1V6.2H7.3V3.1Z" fill="currentColor" />
      <path d="M14.5 3.1C14.5 2.5 15 2 15.6 2C16.2 2 16.7 2.5 16.7 3.1V6.2H14.5V3.1Z" fill="currentColor" />
      <path d="M5.5 6.8H18.5C19.1 6.8 19.6 7.3 19.6 7.9C19.6 8.5 19.1 9 18.5 9H17.9V13.1C17.9 15.3 16.5 17.1 14.5 17.8L12 18.7L9.5 17.8C7.5 17.1 6.1 15.3 6.1 13.1V9H5.5C4.9 9 4.4 8.5 4.4 7.9C4.4 7.3 4.9 6.8 5.5 6.8Z" fill="currentColor" />
      <path d="M12.2 9.5L9.3 14.3H11.7L10.4 18.9L14.8 12.7H12.5L14.1 9.5H12.2Z" fill="white" />
      <path d="M11.8 15.3L9.2 20H11.7L10.8 22L15 16.1H12.6L13.2 15.3H11.8Z" fill="currentColor" />
    </svg>
  );
}

function DrainageDisciplineIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M7.5 3.2C7.1 3.9 6.5 4.8 6.5 5.5C6.5 6.2 7.1 6.7 7.8 6.7C8.5 6.7 9.1 6.2 9.1 5.5C9.1 4.8 8.4 3.9 7.5 3.2Z" fill="currentColor" />
      <path d="M11.8 1.7C11.4 2.4 10.8 3.3 10.8 4C10.8 4.7 11.4 5.2 12.1 5.2C12.8 5.2 13.4 4.7 13.4 4C13.4 3.3 12.7 2.4 11.8 1.7Z" fill="currentColor" />
      <path d="M15.8 3.8C15.4 4.5 14.8 5.4 14.8 6.1C14.8 6.8 15.4 7.3 16.1 7.3C16.8 7.3 17.4 6.8 17.4 6.1C17.4 5.4 16.7 4.5 15.8 3.8Z" fill="currentColor" />
      <path d="M2.6 8.2C6.4 8.7 8.2 10.6 10.4 12.8C12 14.4 13.5 15.2 15 15.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M2 11.3C5.3 11.4 7.4 12.7 9.6 14C11.4 15.1 13 15.7 14.7 16" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M10.5 8.8C11.9 9.1 12.5 10.3 13.4 10.9C14.1 11.4 14.7 11.5 15.6 11.7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M14.7 11.05L16.2 11.85L14.65 12.4Z" fill="currentColor" />
      <path d="M12.3 11.55C13.6 11.9 14.2 13.1 15.1 13.6C15.8 14.1 16.4 14.2 17.3 14.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M16.4 13.85L17.9 14.7L16.3 15.2Z" fill="currentColor" />
      <path d="M14.9 15.1H19.6L18.7 21.6C18.6 22.1 18.2 22.4 17.7 22.4H16.1C15.6 22.4 15.2 22.1 15.1 21.6L14.2 15.1H14.9Z" stroke="currentColor" strokeWidth="1.05" strokeLinejoin="round" />
      <path d="M14 15H19.8" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" />
      <path d="M14.3 16.4H19.5" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" />
      <path d="M15.5 15.15V16.3M16.8 15.15V16.3M18.1 15.15V16.3M19.3 15.15V16.3" stroke="currentColor" strokeWidth="0.65" />
      <circle cx="16.9" cy="19.3" r="1.45" stroke="currentColor" strokeWidth="0.9" />
      <path d="M16.3 18.7H17.5M16.3 19.3H17.5M16.3 19.9H17.5" stroke="currentColor" strokeWidth="0.45" strokeLinecap="round" />
    </svg>
  );
}

function ArchitectureDisciplineIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M6.1 10.2L12.7 4.8L19.3 10.2" stroke="currentColor" strokeWidth="1.45" strokeLinecap="square" strokeLinejoin="miter" />
      <path d="M7 9.45V19.35H18.1V9.45" stroke="currentColor" strokeWidth="1.45" strokeLinecap="square" strokeLinejoin="miter" />
      <path d="M11.3 19.25V13.3H14.2V19.25" stroke="currentColor" strokeWidth="1.45" strokeLinecap="square" strokeLinejoin="miter" />
      <path d="M5.2 3.9V10.9" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
      <path d="M2.9 7H7.45" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
      <path d="M3.1 10.7L10.7 19.4H3.1V10.7Z" fill="white" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="miter" />
      <path d="M4.75 14.55L7.7 17.75H4.75V14.55Z" stroke="currentColor" strokeWidth="1.05" strokeLinejoin="miter" />
    </svg>
  );
}

function WaterproofingDisciplineIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2.6C11.5 3.4 10.7 4.6 10.7 5.5C10.7 6.5 11.3 7.2 12 7.2C12.8 7.2 13.4 6.5 13.4 5.5C13.4 4.6 12.6 3.4 12 2.6Z" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M7.9 4.8C7.5 5.4 7 6.1 7 6.7C7 7.4 7.4 7.9 7.9 7.9C8.5 7.9 8.9 7.4 8.9 6.7C8.9 6.1 8.3 5.4 7.9 4.8Z" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M16.1 5.2C15.7 5.8 15.2 6.5 15.2 7.1C15.2 7.8 15.6 8.3 16.1 8.3C16.7 8.3 17.1 7.8 17.1 7.1C17.1 6.5 16.5 5.8 16.1 5.2Z" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M6.9 9.8L11.9 14.3L17 9.8" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.6 11.8L11.9 14.3L19.4 11.8V13.2H4.6V11.8Z" stroke="currentColor" strokeWidth="1.05" strokeLinejoin="round" />
      <path d="M4.6 15.1C5.3 14.7 6 14.7 6.7 15.1C7.4 15.5 8.1 15.5 8.8 15.1C9.5 14.7 10.2 14.7 10.9 15.1C11.6 15.5 12.3 15.5 13 15.1C13.7 14.7 14.4 14.7 15.1 15.1C15.8 15.5 16.5 15.5 17.2 15.1C17.9 14.7 18.6 14.7 19.3 15.1" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" />
      <path d="M4.6 16.2H19.4V20.5H4.6V16.2Z" stroke="currentColor" strokeWidth="1.05" />
      <path d="M5.8 17.5H18.2M5.8 19H18.2" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" strokeDasharray="0.1 2.1" />
      <path d="M9.4 12.2L6.7 9.5" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" />
      <path d="M6.7 9.5L6.8 11.1M6.7 9.5L8.3 9.7" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" />
      <path d="M14.6 12.2L17.3 9.5" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" />
      <path d="M17.3 9.5L17.2 11.1M17.3 9.5L15.7 9.7" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" />
    </svg>
  );
}

export type DisciplineIconInfo = {
  match?: string[];
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  imageSrc?: string;
  label: string;
};

const disciplineImageModules = import.meta.glob('../../icones/*.png', { eager: true, import: 'default' }) as Record<string, string>;

function normalizeIconStem(value?: string) {
  return String(value || '')
    .replace(/\.[^.]+$/, '')
    .replace(/\(\d+\)$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .trim()
    .toLowerCase();
}

const disciplineImageEntries = Object.entries(disciplineImageModules).map(([filePath, src]) => {
  const rawName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
  const stem = rawName.replace(/\.[^.]+$/, '');
  return {
    src,
    rawName,
    normalizedStem: normalizeIconStem(stem),
  };
});

function findDisciplineImageSrc(cleaned: string, catalogEntry?: { code?: string; name?: string; label?: string }) {
  const candidates = Array.from(
    new Set(
      [
        cleaned,
        catalogEntry?.name,
        catalogEntry?.label,
        catalogEntry?.code,
        catalogEntry?.code && catalogEntry?.name ? `${catalogEntry.code}${catalogEntry.name}` : '',
        catalogEntry?.code && catalogEntry?.name ? `${catalogEntry.code}-${catalogEntry.name}` : '',
      ]
        .map((value) => normalizeIconStem(value))
        .filter(Boolean)
    )
  );

  for (const candidate of candidates) {
    const exact = disciplineImageEntries.find((entry) => entry.normalizedStem === candidate);
    if (exact) return exact.src;
  }

  for (const candidate of candidates) {
    const partial = disciplineImageEntries.find((entry) => entry.normalizedStem.includes(candidate) || candidate.includes(entry.normalizedStem));
    if (partial) return partial.src;
  }

  return undefined;
}

const disciplineIconMap: DisciplineIconInfo[] = [
  { match: ['terraplanagem', 'terr', 'topografia', 'movimentacao de terra'], icon: EarthmovingDisciplineIcon, label: 'Terraplanagem' },
  { match: ['estrutura de concreto', 'estrutura concreto', 'concreto armado', 'sco'], icon: ConcreteStructureDisciplineIcon, label: 'Estrutura de Concreto' },
  { match: ['estrutural', 'estrutura', 'fundacao', 'fundacoes', 'est'], icon: StructuralDisciplineIcon, label: 'Estrutural' },
  { match: ['impermeabilizacao', 'impe', 'vedacao', 'waterproof'], icon: WaterproofingDisciplineIcon, label: 'Impermeabilização' }
];

export function getDisciplineIconInfo(value?: string): DisciplineIconInfo {
  const cleaned = String(value || '').trim();
  const normalized = normalizeText(cleaned);
  const catalogEntry = DEFAULT_DISCIPLINES.find((entry) => (
    normalizeText(entry.code) === normalized
    || normalizeText(entry.name) === normalized
    || normalizeText(entry.label) === normalized
    || entry.aliases.some((alias) => normalizeText(alias) === normalized)
  ));
  const imageSrc = findDisciplineImageSrc(cleaned, catalogEntry);
  if (imageSrc) {
    return { imageSrc, label: catalogEntry?.name || cleaned || 'Sem disciplina' };
  }

  const match = disciplineIconMap.find((entry) => entry.match?.some((token) => normalized.includes(normalizeText(token))));
  return match || { icon: Droplets, label: catalogEntry?.name || cleaned || 'Sem disciplina' };
}

export function getDisciplineDisplayName(value?: string) {
  const cleaned = splitDisciplinas(value)[0] || 'Sem disciplina';
  const normalized = normalizeText(cleaned);
  const catalogEntry = DEFAULT_DISCIPLINES.find((entry) => (
    normalizeText(entry.code) === normalized
    || normalizeText(entry.name) === normalized
    || normalizeText(entry.label) === normalized
    || entry.aliases.some((alias) => normalizeText(alias) === normalized)
  ));

  if (catalogEntry) return catalogEntry.name;
  if (normalized === 'ter') return 'Terraplanagem';
  return getDisciplineIconInfo(cleaned).label || cleaned;
}

function getDisciplineFilterLabel(value?: string) {
  return getDisciplineDisplayName(value);
}

function getDisciplineDetailLabel(value?: string | string[]) {
  return Array.from(new Set(splitDisciplinas(value).map((item) => getDisciplineDisplayName(item)))).join(' | ');
}

function getAssigneeInitials(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return '--';

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return ((parts[0][0] || '') + (parts[parts.length - 1][0] || '')).toUpperCase();
}

function getAssigneeColor(name: string) {
  return assigneeAccentColorMap[name] || '#94A3B8';
}

function getActivityParticipants(activity: EngineeringActivity) {
  const names = Array.isArray(activity.executadoPor) ? activity.executadoPor : [];
  const cleaned = names.map((name) => String(name || '').trim()).filter(Boolean);
  if (cleaned.length > 0) return Array.from(new Set(cleaned));
  if (String(activity.responsavel || '').trim()) return [String(activity.responsavel).trim()];
  return [];
}

function getActivityItemKey(activity: EngineeringActivity) {
  return String(activity.origemItem || (activity as any).itemCodigo || (activity as any).itemCode || activity.id || '').trim();
}

const CARD_DESIGN_WIDTH = 491;
const CARD_DESIGN_HEIGHT = 218;
const OS_GROUP_CARD_DESIGN_HEIGHT = 240;
const BOARD_GAP = 8;

function useResponsiveCardScale() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateScale = () => {
      const width = host.clientWidth || CARD_DESIGN_WIDTH;
      const nextScale = Math.min(1, width / CARD_DESIGN_WIDTH);
      setScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(host);

    return () => observer.disconnect();
  }, []);

  return { hostRef, scale };
}

function ProductionCard({
  activity,
  tipoLicitacao,
  onClick
}: {
  activity: EngineeringActivity;
  tipoLicitacao: string;
  onClick: () => void;
}) {
  const { hostRef, scale } = useResponsiveCardScale();
  const leaderPercentual = getLeaderPercentual(activity);
  const isBehind = leaderPercentual < activity.percentualPrevisto;
  const valueTone = isBehind ? 'text-[#EF4444]' : 'text-[#166534]';
  const participants = getActivityParticipants(activity);
  const disciplineIcon = getDisciplineIconInfo(activity.disciplina || activity.disciplinas?.[0] || '');
  const disciplineDisplayName = getDisciplineDisplayName(activity.disciplina || activity.disciplinas?.[0] || '');
  const DisciplineIcon = disciplineIcon.icon;
  const visibleParticipants = participants.slice(0, 2);
  const extraParticipants = Math.max(0, participants.length - visibleParticipants.length);
  const displayCode = extractVisualOsCode(activity) || activity.osCodigo || getActivityRenderableCode(activity) || activity.origemItem;
  const displayTitle = stripLodFromTitle(activity.osNome, displayCode) || activity.osNome || activity.osCodigo;
  const workFrontText = getActivityProjectLabel(activity);

  return (
    <div ref={hostRef} className="relative w-full" style={{ height: `${CARD_DESIGN_HEIGHT * scale}px` }}>
      <button
        type="button"
        onClick={onClick}
        className="absolute left-0 top-0 block overflow-hidden rounded-[28px] border border-[#E7EDF4] bg-white px-4 py-3.5 text-left shadow-[0_9px_20px_rgba(45,45,45,0.22)] transition-[border-color,box-shadow] hover:-translate-y-[2px] hover:border-[#F7C7B7] hover:shadow-[0_14px_28px_rgba(240,93,40,0.14)] cursor-pointer"
        style={{
          width: `${CARD_DESIGN_WIDTH}px`,
          transform: scale !== null ? `scale(${scale})` : 'scale(1)',
          transformOrigin: 'top left',
          visibility: scale !== null ? 'visible' : 'hidden',
        }}
      >
        <div
          className="absolute right-[32px] top-0 flex flex-col items-center"
          aria-hidden="true"
          style={{ '--flag-color': getOsAccentColor(activity.osCodigo) } as React.CSSProperties}
        >
          <div
            className="h-[28px] w-4"
            style={{ backgroundColor: getOsAccentColor(activity.osCodigo) }}
          />
          <div
            className="h-0 w-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent"
            style={{ borderTopColor: getOsAccentColor(activity.osCodigo) }}
          />
        </div>
        {activity.edificio && (
          <div
            className="absolute right-[52px] top-0 flex flex-col items-center"
            aria-hidden="true"
            title={`Edifício ${activity.edificio}`}
          >
            <div
              className="h-[28px] w-4"
              style={{ backgroundColor: getBuildingAccentColor(activity.edificio) }}
            />
            <div
              className="h-0 w-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent"
              style={{ borderTopColor: getBuildingAccentColor(activity.edificio) }}
            />
          </div>
        )}

        <div className="flex min-h-[54px] items-center pr-8">
          <p className="text-[18px] font-medium leading-[1.18] text-[#111827]">
            {displayCode ? <span className="font-black text-[#F05D28]">{displayCode}</span> : null}
            {displayCode ? ' - ' : ''}
            {displayTitle}
          </p>
        </div>

        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_190px] gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-[12px] bg-[#F3F4F6] px-2.5 py-2">
            <div
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[#F05D28] bg-white p-[3px] text-[#F05D28] shadow-[0_3px_8px_rgba(240,93,40,0.10)]"
              title={disciplineDisplayName}
              aria-label={disciplineDisplayName}
            >
              {disciplineIcon.imageSrc ? (
                <img
                  src={disciplineIcon.imageSrc}
                  alt={disciplineDisplayName}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : DisciplineIcon ? (
                <DisciplineIcon size={30} className="scale-[1.05]" strokeWidth={2.2} />
              ) : null}
            </div>

            {visibleParticipants.map((person) => {
              const initials = getAssigneeInitials(person);
              const color = getAssigneeColor(person);
              return (
                <div
                  key={person}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#F05D28] bg-white text-[11px] font-black uppercase text-[#F05D28] shadow-[0_3px_8px_rgba(240,93,40,0.10)]"
                  style={{ boxShadow: `0 4px 12px ${color}20` }}
                  title={person}
                  aria-label={person}
                >
                  {initials}
                </div>
              );
            })}

            {extraParticipants > 0 && (
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#CBD5E1] bg-white text-[10px] font-black uppercase text-[#64748B] shadow-[0_3px_8px_rgba(100,116,139,0.10)]">
                +{extraParticipants}
              </div>
            )}
          </div>

          <div className="rounded-[12px] bg-[#DCF5E2] px-3 py-2">
            <div className="grid grid-cols-3 gap-1.5 text-center xl:gap-2">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.7px] text-[#7C8AA0]">LOD</p>
                <p className="mt-0.5 text-[15px] font-black leading-none text-[#2D2D2D]">{activity.lodAtual}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.7px] text-[#7C8AA0]">Exec</p>
                <p className={`mt-0.5 text-[15px] font-black leading-none ${valueTone}`}>{activity.percentualRealizado}%</p>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.7px] text-[#7C8AA0]">Prev</p>
                <p className={`mt-0.5 text-[15px] font-black leading-none ${valueTone}`}>{activity.percentualPrevisto}%</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-[12px] bg-[#F3F4F6] px-3 py-2">
          <div className="grid grid-cols-4 gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.7px] text-[#94A3B8]">Início</p>
              <p className="mt-1 text-[12px] font-bold text-[#2D2D2D]">{formatDatePt(activity.inicioPlanejado)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.7px] text-[#94A3B8]">Término</p>
              <p className="mt-1 text-[12px] font-bold text-[#2D2D2D]">{formatDatePt(activity.terminoPlanejado)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.7px] text-[#94A3B8]">Projeto</p>
              <p className="mt-1 text-[12px] font-bold text-[#2D2D2D]">{extractProjectType(activity.osNome) || 'Básico'}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.7px] text-[#94A3B8]">Licitação</p>
              <p className="mt-1 text-[12px] font-bold text-[#2D2D2D]">{tipoLicitacao || ''}</p>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

type OsActivityGroup = { key: string; osCodigo: string; osNome: string; disciplina?: string; edificio?: string; activities: EngineeringActivity[] };

const buildOsGroupsForColumn = (activities: EngineeringActivity[], splitByDiscipline = false): OsActivityGroup[] => {
  const groupMap = new Map<string, OsActivityGroup>();
  activities.forEach((activity) => {
    if (splitByDiscipline) {
      // Área Técnica: a OS se repete — um card por disciplina + edifício citados nela (cada LOD só tem 1 edifício).
      const rawList = Array.isArray(activity.disciplinas) && activity.disciplinas.length > 0
        ? activity.disciplinas
        : splitDisciplinas(activity.disciplina);
      const meaningful = rawList.filter(isMeaningfulDisciplineToken);
      const disciplinas = meaningful.length > 0 ? meaningful : [activity.disciplina || 'Sem disciplina'];
      const edificio = activity.edificio || '';
      const seenForActivity = new Set<string>();
      disciplinas.forEach((disc) => {
        const discKey = normalizeText(disc);
        const groupKey = `${discKey}|${normalizeText(edificio)}`;
        if (seenForActivity.has(groupKey)) return;
        seenForActivity.add(groupKey);
        const key = `${normalizeText(activity.osCodigo)}|${groupKey}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, { key, osCodigo: activity.osCodigo, osNome: activity.osNome, disciplina: disc, edificio, activities: [] });
        }
        groupMap.get(key)!.activities.push(activity);
      });
      return;
    }
    const key = normalizeText(activity.osCodigo);
    if (!groupMap.has(key)) groupMap.set(key, { key, osCodigo: activity.osCodigo, osNome: activity.osNome, activities: [] });
    groupMap.get(key)!.activities.push(activity);
  });
  return Array.from(groupMap.values());
};

function OsGroupCard({ group, tipoLicitacao, onClick }: { group: OsActivityGroup; tipoLicitacao: string; onClick: () => void }) {
  const { hostRef, scale } = useResponsiveCardScale();
  const avgExec = Math.round(group.activities.reduce((s, a) => s + a.percentualRealizado, 0) / group.activities.length);
  const avgPrev = Math.round(group.activities.reduce((s, a) => s + a.percentualPrevisto, 0) / group.activities.length);
  const isBehind = avgExec < avgPrev;
  const valueTone = isBehind ? 'text-[#EF4444]' : 'text-[#166534]';
  const earliestStart = group.activities.reduce((m, a) => a.inicioPlanejado < m ? a.inicioPlanejado : m, group.activities[0].inicioPlanejado);
  const latestEnd = group.activities.reduce((m, a) => a.terminoPlanejado > m ? a.terminoPlanejado : m, group.activities[0].terminoPlanejado);
  const displayCode = extractVisualOsCode(group.activities[0]) || group.osCodigo;
  const displayTitle = stripLodFromTitle(group.osNome, displayCode) || group.osNome;
  // Área Técnica (group.disciplina definido): 1 card = 1 edifício só, sem empilhar.
  // Coordenação de Engenharia / Planejamento / Contrato (sem split): sem bandeira no card —
  // agregaria a OS inteira (dezenas de itens/edifícios) num leque sem sentido.
  const groupEdificios = group.disciplina !== undefined
    ? (group.edificio ? [group.edificio] : [])
    : [];

  const uniqueDisciplines = useMemo(() => {
    // Modo Área Técnica: o card representa uma única disciplina da OS.
    if (group.disciplina) {
      return [{ disciplina: group.disciplina, lodAtual: group.activities[0].lodAtual }];
    }
    const seen = new Map<string, { disciplina: string; lodAtual: LodLevel }>();
    group.activities.forEach((a) => {
      const key = normalizeText(a.disciplina || a.disciplinas?.[0] || '');
      if (!seen.has(key)) seen.set(key, { disciplina: a.disciplina || a.disciplinas?.[0] || '', lodAtual: a.lodAtual });
    });
    return Array.from(seen.values());
  }, [group.activities, group.disciplina]);

  const MAX_VISIBLE = 5;
  const visibleDiscs = uniqueDisciplines.slice(0, MAX_VISIBLE);
  const extraCount = Math.max(0, uniqueDisciplines.length - MAX_VISIBLE);

  return (
    <div ref={hostRef} className="relative w-full" style={{ height: `${OS_GROUP_CARD_DESIGN_HEIGHT * scale}px` }}>
      <button
        type="button"
        onClick={onClick}
        className="absolute left-0 top-0 block overflow-hidden rounded-[28px] border border-[#E7EDF4] bg-white px-4 py-3.5 text-left shadow-[0_9px_20px_rgba(45,45,45,0.22)] transition-[border-color,box-shadow] hover:-translate-y-[2px] hover:border-[#F7C7B7] hover:shadow-[0_14px_28px_rgba(240,93,40,0.14)] cursor-pointer"
        style={{ width: `${CARD_DESIGN_WIDTH}px`, transform: scale !== null ? `scale(${scale})` : 'scale(1)', transformOrigin: 'top left', visibility: scale !== null ? 'visible' : 'hidden' }}
      >
        <div className="absolute right-[32px] top-0 flex flex-col items-center" aria-hidden="true">
          <div className="h-[28px] w-4" style={{ backgroundColor: getOsAccentColor(group.osCodigo) }} />
          <div className="h-0 w-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent" style={{ borderTopColor: getOsAccentColor(group.osCodigo) }} />
        </div>
        {groupEdificios.length > 0 && (
          <div className="absolute right-[52px] top-0">
            <BuildingFlagStack edificios={groupEdificios} />
          </div>
        )}

        <div className="flex min-h-[54px] items-center pr-8">
          <p className="text-[18px] font-medium leading-[1.18] text-[#111827]">
            {displayCode ? <span className="font-black text-[#F05D28]">{displayCode}</span> : null}
            {displayCode ? ' - ' : ''}{displayTitle}
          </p>
        </div>

        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_190px] gap-2">
          <div className="flex min-w-0 items-center gap-2 rounded-[12px] bg-[#F3F4F6] px-2.5 py-2">
            {visibleDiscs.map((disc) => {
              const icon = getDisciplineIconInfo(disc.disciplina);
              const name = getDisciplineDisplayName(disc.disciplina);
              const DIcon = icon.icon;
              return (
                <div key={disc.disciplina} className="flex flex-shrink-0 flex-col items-center gap-0.5">
                  <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[#F05D28] bg-white p-[2px] text-[#F05D28] shadow-[0_3px_8px_rgba(240,93,40,0.10)]" title={name}>
                    {icon.imageSrc ? <img src={icon.imageSrc} alt={name} className="h-full w-full rounded-full object-cover" /> : DIcon ? <DIcon size={26} strokeWidth={2.2} /> : null}
                  </div>
                  <p className="text-[7px] font-black uppercase tracking-[0.5px] text-[#7C8AA0]">LOD</p>
                  <p className="text-[11px] font-black leading-none text-[#2D2D2D]">{disc.lodAtual}</p>
                </div>
              );
            })}
            {extraCount > 0 && (
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[#CBD5E1] bg-white text-[10px] font-black text-[#64748B] shadow-[0_3px_8px_rgba(100,116,139,0.10)]">
                +{extraCount}
              </div>
            )}
          </div>

          <div className="flex flex-col justify-between rounded-[12px] bg-[#DCF5E2] px-3 py-2">
            <p className="text-[8px] font-black uppercase tracking-[0.5px] text-[#166534]">% de avanço da OS</p>
            <div className="grid grid-cols-2 gap-1 text-center">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.7px] text-[#7C8AA0]">Exec</p>
                <p className={`mt-0.5 text-[15px] font-black leading-none ${valueTone}`}>{avgExec}%</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.7px] text-[#7C8AA0]">Prev</p>
                <p className={`mt-0.5 text-[15px] font-black leading-none ${valueTone}`}>{avgPrev}%</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-[12px] bg-[#F3F4F6] px-3 py-2">
          <div className="grid grid-cols-4 gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.7px] text-[#94A3B8]">Início</p>
              <p className="mt-1 text-[12px] font-bold text-[#2D2D2D]">{formatDatePt(earliestStart)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.7px] text-[#94A3B8]">Término</p>
              <p className="mt-1 text-[12px] font-bold text-[#2D2D2D]">{formatDatePt(latestEnd)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.7px] text-[#94A3B8]">Projeto</p>
              <p className="mt-1 text-[12px] font-bold text-[#2D2D2D]">{extractProjectType(group.osNome) || 'Básico'}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.7px] text-[#94A3B8]">Licitação</p>
              <p className="mt-1 text-[12px] font-bold text-[#2D2D2D]">{tipoLicitacao || ''}</p>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

export default function Atividades({
  currentUser,
  preloadedData,
  isHeaderFiltersOpen = false,
  onCloseHeaderFilters,
  showAllDisciplines = false,
  filtersAlwaysVisible = false,
  disciplineFilterEnabled = true,
  autoSelectUserDisciplineFilter = false,
  splitOsCardsByDiscipline = false,
}: AtividadesProps) {
  const sourceActivities = useMemo(() => buildActivitiesFromEap(preloadedData, currentUser), [preloadedData, currentUser]);
  const eapRegistry = useMemo(() => getUnifiedEapRegistry(preloadedData), [preloadedData]);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const boardTrackRef = useRef<HTMLDivElement | null>(null);
  const scrollbarDragRef = useRef(false);
  const autoScrolledToTodayRef = useRef(false);
  const [boardScrollLeft, setBoardScrollLeft] = useState(0);
  const [boardScrollMax, setBoardScrollMax] = useState(0);
  const [boardTrackWidth, setBoardTrackWidth] = useState(0);
  const [boardZoomPercent, setBoardZoomPercent] = useState(() => {
    try {
      const cached = localStorage.getItem('atividades_boardZoom');
      const val = cached ? parseInt(cached, 10) : 65;
      return [65, 90, 120].includes(val) ? val : 65;
    } catch {
      return 65;
    }
  });
  const [activities, setActivities] = useState<EngineeringActivity[]>(() => {
    return sourceActivities;
  });
  const [searchText, setSearchText] = useState('');
  const [filterSemana, setFilterSemana] = useState(getCurrentWeekKey());
  const [filterContrato, setFilterContrato] = useState('Todos');
  const [filterOs, setFilterOs] = useState('Todos');
  const [filterDisciplinas, setFilterDisciplinas] = useState<string[]>([]);
  const [showFiltersInternal, setShowFiltersInternal] = useState(false);
  const [filterEtapa, setFilterEtapa] = useState('Todos');
  const [filterLod, setFilterLod] = useState('Todos');
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [filterPrioridade, setFilterPrioridade] = useState('Todos');
  const [filterShowCompleted, setFilterShowCompleted] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedOsGroup, setSelectedOsGroup] = useState<OsActivityGroup | null>(null);
  const [selectedActivitySourceGroup, setSelectedActivitySourceGroup] = useState<OsActivityGroup | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedEapIndex, setSelectedEapIndex] = useState<number | null>(null);
  const [importResponsavel, setImportResponsavel] = useState(RESPONSAVEIS[0]);
  const [importPrioridade, setImportPrioridade] = useState<PriorityLevel>('Normal');
  const [importLodAlvo, setImportLodAlvo] = useState<LodLevel>(300);
  const [importEtapa, setImportEtapa] = useState<TechnicalStep>('Modelagem');
  const [importInicio, setImportInicio] = useState(getCurrentWeekKey());
  const [importTermino, setImportTermino] = useState(getCurrentWeekKey());
  const knownDisciplineTokens = useMemo(() => buildKnownDisciplineTokens(preloadedData, currentUser), [preloadedData, currentUser]);
  const activitiesWithDiscipline = useMemo(
    () => activities.filter((activity) => {
      const disciplineValue = activity.disciplinas || activity.disciplina;
      if (!hasRecognizedActivityDiscipline(disciplineValue, knownDisciplineTokens)) return false;
      if (!hasRenderableDateRange(activity)) return false;
      if (isManualActivity(activity)) return true;
      return isLeafActivityCode(getActivityRenderableCode(activity));
    }),
    [activities, knownDisciplineTokens]
  );

  const selectedActivity = useMemo(
    () => activitiesWithDiscipline.find((activity) => activity.id === selectedActivityId) || null,
    [activitiesWithDiscipline, selectedActivityId]
  );
  const selectedActivityDisplayCode = useMemo(
    () => (selectedActivity ? extractVisualOsCode(selectedActivity) || selectedActivity.osCodigo || getActivityRenderableCode(selectedActivity) || selectedActivity.origemItem || '' : ''),
    [selectedActivity]
  );
  const selectedActivityDisplayTitle = useMemo(
    () => (selectedActivity ? stripLodFromTitle(selectedActivity.osNome, selectedActivityDisplayCode) || '' : ''),
    [selectedActivity, selectedActivityDisplayCode]
  );
  const selectedActivityDisciplineIcon = useMemo(
    () => (selectedActivity ? getDisciplineIconInfo(selectedActivity.disciplina || selectedActivity.disciplinas?.[0] || '') : null),
    [selectedActivity]
  );
  const selectedActivityDisciplineName = useMemo(
    () => (selectedActivity ? getDisciplineDisplayName(selectedActivity.disciplina || selectedActivity.disciplinas?.[0] || '') : ''),
    [selectedActivity]
  );

  const disciplineScopedActivities = useMemo(
    () => (showAllDisciplines
      ? activitiesWithDiscipline
      : activitiesWithDiscipline.filter((activity) => matchesUserDiscipline(activity, [currentUser?.disciplina, ...(currentUser?.disciplinas || [])].filter(Boolean).join(' | ')))),
    [activitiesWithDiscipline, currentUser?.disciplina, currentUser?.disciplinas, showAllDisciplines]
  );

  useEffect(() => {
    setActivities(sourceActivities);
  }, [sourceActivities]);

  useEffect(() => {
    if (filterContrato !== 'Todos' && filterOs !== 'Todos') {
      setFilterOs('Todos');
    }
  }, [filterContrato, filterOs]);

  const contratosDisponiveis = useMemo(() => {
    const contractMap = new Map<string, { value: string; label: string; count: number }>();
    const registryContracts = Array.isArray(eapRegistry.contracts) ? eapRegistry.contracts : [];

    if (registryContracts.length > 0) {
      registryContracts.forEach((item: any) => {
        const value = String(item?.codigo || '').trim();
        if (!value) return;
        const label = String(item?.nome || item?.codigo || '').trim();
        const key = normalizeText(value);
        const current = contractMap.get(key);
        contractMap.set(key, {
          value,
          label: label || value,
          count: (current?.count || 0) + 1,
        });
      });
    } else {
      activitiesWithDiscipline.forEach((activity) => {
        const contractCode = getActivityContractCode(activity);
        if (!contractCode) return;
        const key = normalizeText(contractCode);
        const current = contractMap.get(key);
        contractMap.set(key, {
          value: contractCode,
          label: contractCode,
          count: (current?.count || 0) + 1,
        });
      });
    }

    const options = Array.from(contractMap.values())
      .sort((first, second) => first.value.localeCompare(second.value))
      .map((item) => ({
        value: item.value,
        label: item.label,
      }));

    return ['Todos', ...options];
  }, [activitiesWithDiscipline, eapRegistry.contracts]);

  const osDisponiveis = useMemo(() => {
    const osMap = new Map<string, { value: string; label: string; count: number }>();
    const registryOsOptions = Array.isArray(eapRegistry.osOptions) ? eapRegistry.osOptions : [];

    if (registryOsOptions.length > 0) {
      registryOsOptions
        .filter((item: any) => filterContrato === 'Todos' || String(item?.contratoCodigo || '').trim() === filterContrato)
        .forEach((item: any) => {
          const value = String(item?.codigo || '').trim();
          if (!value) return;
          const label = String(item?.nome || item?.codigo || '').trim();
          const key = normalizeText(value);
          const current = osMap.get(key);
          osMap.set(key, {
            value,
            label: label || value,
            count: (current?.count || 0) + 1,
          });
        });
    } else {
      const sourceActivities = filterContrato === 'Todos'
        ? activitiesWithDiscipline
        : activitiesWithDiscipline.filter((activity) => sameContractCode(getActivityContractCode(activity), filterContrato));

      sourceActivities.forEach((activity) => {
        const osCode = getActivityOsCode(activity);
        if (!osCode) return;
        const key = normalizeText(osCode);
        const current = osMap.get(key);
        osMap.set(key, {
          value: osCode,
          label: osCode,
          count: (current?.count || 0) + 1,
        });
      });
    }

    const options = Array.from(osMap.values())
      .sort((first, second) => first.value.localeCompare(second.value))
      .map((item) => ({
        value: item.value,
        label: item.label,
      }));

    return ['Todos', ...options];
  }, [activitiesWithDiscipline, eapRegistry.osOptions, filterContrato]);

  const disciplinasDisponiveis = useMemo(() => {
    const adminData = preloadedData?.admin;
    if (adminData) {
      const settingsSource = Array.isArray(adminData.disciplineSettings)
        ? adminData.disciplineSettings
        : Array.isArray(adminData.disciplinas)
          ? adminData.disciplinas
          : null;
      if (settingsSource) {
        const names = (settingsSource as any[])
          .map((item) => (typeof item === 'string' ? item.trim() : String(item?.nome || item?.name || '').trim()))
          .filter(Boolean);
        if (names.length > 0) return names;
      }
    }
    const collected = new Set<string>();
    activitiesWithDiscipline.forEach((activity) => {
      splitDisciplinas(activity.disciplinas || activity.disciplina).forEach((item) => collected.add(item));
    });
    return Array.from(collected);
  }, [preloadedData?.admin, activitiesWithDiscipline]);

  // Disciplinas que sempre devem ser marcadas juntas no filtro (ex: Estrutura Metálica e
  // Estrutura de Concreto costumam ser olhadas em conjunto pelo coordenador).
  const handleFilterDisciplinasChange = (next: string[]) => {
    const addedItem = next.find((item) => !filterDisciplinas.includes(item));
    const linkedGroup = addedItem
      ? LINKED_DISCIPLINE_GROUPS.find((group) => group.some((item) => resolveDisciplineEntry(item) === resolveDisciplineEntry(addedItem)))
      : undefined;
    if (!linkedGroup) { setFilterDisciplinas(next); return; }
    const linkedKeys = new Set(linkedGroup.map(resolveDisciplineEntry));
    const toAdd = disciplinasDisponiveis.filter((option) => linkedKeys.has(resolveDisciplineEntry(option)) && !next.includes(option));
    setFilterDisciplinas([...next, ...toAdd]);
  };

  const disciplineAutoMatchedRef = useRef(false);
  useEffect(() => {
    disciplineAutoMatchedRef.current = false;
    if (autoSelectUserDisciplineFilter) setFilterDisciplinas([]);
  }, [currentUser?.email, autoSelectUserDisciplineFilter]);
  useEffect(() => {
    if (!autoSelectUserDisciplineFilter) return;
    if (disciplineAutoMatchedRef.current) return;
    if (!disciplinasDisponiveis.length) return;
    const userDisciplines = getUserDisciplineList(currentUser || {});
    if (!userDisciplines.length) return;
    const matched = disciplinasDisponiveis.filter((d) =>
      userDisciplines.some((ud) => resolveDisciplineEntry(d) === resolveDisciplineEntry(ud))
    );
    if (matched.length > 0) {
      setFilterDisciplinas(matched);
      disciplineAutoMatchedRef.current = true;
    }
  }, [autoSelectUserDisciplineFilter, disciplinasDisponiveis, currentUser]);

  const etapasDisponiveis = useMemo(() => ['Todos', ...TECHNICAL_STEPS], []);

  const osSettingsMap = useMemo(() => {
    const items = Array.isArray(preloadedData?.osSettings) ? preloadedData.osSettings : [];
    const map: Record<string, string> = {};
    items.forEach((item: any) => {
      const code = String(item?.osCodigo || item?.id || '').trim();
      const tipo = String(item?.tipoLicitacao || '').trim();
      if (code) map[code] = tipo;
    });
    return map;
  }, [preloadedData?.osSettings]);
  const lodsDisponiveis = useMemo(() => ['Todos', ...LOD_OPTIONS.map(String)], []);
  const statusDisponiveis = useMemo(() => ['Todos', ...STATUS_OPTIONS], []);
  const prioridadesDisponiveis = useMemo(() => ['Todos', ...PRIORITY_OPTIONS], []);

  const weekOptions = useMemo(() => {
    const keys = new Set<string>([getCurrentWeekKey()]);
    activitiesWithDiscipline.forEach((activity) => keys.add(getWeekKeyFromActivity(activity)));

    return Array.from(keys)
      .sort((first, second) => parseDate(first).getTime() - parseDate(second).getTime())
      .map((key) => ({ value: key, label: `${key} | ${formatWeekLabel(key)}` }));
  }, [activitiesWithDiscipline]);

  const weekStart = useMemo(() => parseDate(filterSemana), [filterSemana]);
  const weekEnd = useMemo(() => addDays(weekStart, 4), [weekStart]);

  const filteredActivities = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    const weekStartClear = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
    const weekEndClear = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate(), 23, 59, 59, 999);

    return disciplineScopedActivities
      .filter((activity) => {
        const matchesSearch =
          !normalizedSearch ||
          activity.atividade.toLowerCase().includes(normalizedSearch) ||
          activity.osCodigo.toLowerCase().includes(normalizedSearch) ||
          activity.osNome.toLowerCase().includes(normalizedSearch) ||
          activity.responsavel.toLowerCase().includes(normalizedSearch) ||
          activity.origemItem?.toLowerCase().includes(normalizedSearch);

        const matchesContrato = filterContrato === 'Todos' || sameContractCode(getActivityContractCode(activity), filterContrato);
        const matchesOs = filterOs === 'Todos' || activity.osCodigo === filterOs;
        const activityDisciplinas = splitDisciplinas(activity.disciplinas || activity.disciplina);
        const matchesDisciplina = !disciplineFilterEnabled
          || filterDisciplinas.length === 0
          || filterDisciplinas.some((fd) => activityDisciplinas.some((ad) => resolveDisciplineEntry(ad) === resolveDisciplineEntry(fd)));
        const matchesEtapa = filterEtapa === 'Todos' || activity.etapaTecnica === filterEtapa;
        const matchesLod = filterLod === 'Todos' || String(activity.lodAtual) === filterLod || String(activity.lodAlvoSemana) === filterLod;
        const matchesStatus = filterStatus === 'Todos' || getEffectiveStatus(activity) === filterStatus;
        const matchesPrioridade = filterPrioridade === 'Todos' || activity.prioridade === filterPrioridade;
        const matchesCompleted = filterShowCompleted || Number(activity.percentualRealizado || 0) < 100;

        const actStart = parseDate(activity.inicioPlanejado);
        const actEnd = parseDate(activity.terminoPlanejado);
        const matchesDateRange = actStart <= weekEndClear && actEnd >= weekStartClear;

        return (
          matchesSearch &&
          matchesContrato &&
          matchesOs &&
          matchesDisciplina &&
          matchesEtapa &&
          matchesLod &&
          matchesStatus &&
          matchesPrioridade &&
          matchesCompleted &&
          matchesDateRange
        );
      })
      .sort(compareActivities);
  }, [
    disciplineScopedActivities,
    filterContrato,
    filterEtapa,
    filterLod,
    filterOs,
    filterPrioridade,
    filterStatus,
    filterDisciplinas,
    disciplineFilterEnabled,
    filterShowCompleted,
    searchText,
    weekStart,
    weekEnd,
  ]);

  const boardActivities = useMemo(() => {
    const seen = new Set<string>();
    return filteredActivities.filter((activity) => {
      const key = getActivityItemKey(activity);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredActivities]);

  const kpis = useMemo(() => {
    const total = boardActivities.length;
    const emExecucao = boardActivities.filter((activity) => getEffectiveStatus(activity) === 'Em execução').length;
    const bloqueadas = boardActivities.filter((activity) => getEffectiveStatus(activity) === 'Bloqueado').length;
    const atrasadas = boardActivities.filter((activity) => getEffectiveStatus(activity) === 'Atrasado').length;
    const concluidas = boardActivities.filter((activity) => Number(activity.percentualRealizado || 0) >= 100).length;
    return { total, emExecucao, bloqueadas, atrasadas, concluidas };
  }, [boardActivities]);

  const boardColumns = useMemo(() => {
    const dayLabels = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];
    const shortLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];

    const columns = Array.from({ length: 5 }, (_, index) => ({
      index,
      shortLabel: shortLabels[index],
      label: dayLabels[index],
      date: addDays(weekStart, index),
      activities: [] as EngineeringActivity[]
    }));

    columns.forEach((column) => {
      const dayStart = new Date(column.date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(column.date);
      dayEnd.setHours(23, 59, 59, 999);
      const seen = new Set<string>();

      column.activities = filteredActivities.filter((activity) => {
        const activityStart = parseDate(activity.inicioPlanejado);
        const activityEnd = parseDate(activity.terminoPlanejado);
        const overlapsDay = activityStart <= dayEnd && activityEnd >= dayStart;
        if (!overlapsDay) return false;

        const key = getActivityItemKey(activity);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

    return columns;
  }, [filteredActivities, weekStart]);

  const todayIso = toIsoDate(TODAY);
  const isCurrentWeekBoard = filterSemana === getCurrentWeekKey();
  const boardZoomScale = boardZoomPercent / 100;
  const boardColumnMinWidth = Math.max(240, Math.round((CARD_DESIGN_WIDTH + 16) * boardZoomScale));
  const boardMinWidth = (boardColumnMinWidth * 5) + (BOARD_GAP * 4) + 20;

  const handleResetBoard = () => {
    if (window.confirm('Redefinir o quadro semanal para os dados padrão? As alterações locais serão perdidas.')) {
      setActivities(sourceActivities);
      setSelectedActivityId(null);
    }
  };

  const handleImportActivity = () => {
    if (selectedEapIndex === null) return;

    const selectedItem = EAP_UNASSIGNED_ACTIVITIES[selectedEapIndex];
  const newActivity: EngineeringActivity = {
    id: `act-imported-${Date.now()}`,
    itemCodigo: selectedItem.item,
    sourceType: 'manual',
    contractCode: selectedItem.contrato,
    contratoCodigo: selectedItem.contrato,
    contratoNome: selectedItem.contrato,
      osCodigo: selectedItem.os,
      osNome: selectedItem.nome,
      disciplina: selectedItem.disciplina,
      subdisciplina: selectedItem.subdisciplina,
      responsavel: importResponsavel,
      etapaTecnica: importEtapa,
      lodAtual: getPreviousLod(importLodAlvo),
      lodAlvoSemana: importLodAlvo,
      inicioPlanejado: importInicio,
      terminoPlanejado: importTermino,
      prioridade: importPrioridade,
      status: 'Não iniciado',
      percentualPrevisto: 25,
      percentualRealizado: 0,
      atividade: `${selectedItem.item} - ${selectedItem.nomeAtividade}`,
      proximaAcao: `Iniciar frente de ${importEtapa.toLowerCase()} e avançar até LOD ${importLodAlvo}.`,
      observacoes: 'Atividade vinculada localmente a partir do cronograma/EAP para acompanhamento semanal.',
      dataCriacao: toIsoDate(TODAY),
      origemItem: selectedItem.item,
      executadoPor: [importResponsavel],
      statusDaAtividade: '',
      dificuldadeAtividade: '',
      porcentagemAtividade: null,
      observacaoLider: '',
      leaderEdited: false,
      disciplinas: splitDisciplinas(selectedItem.disciplina)
    };

    setActivities((previous) => [...previous, newActivity]);
    setIsImportModalOpen(false);
    setSelectedEapIndex(null);
    setSelectedActivityId(newActivity.id);
  };

  const selectedEffectiveStatus = selectedActivity ? getLeaderStatusLabel(selectedActivity) : null;
  const executadoPorOptions = useMemo(() => buildProfessionalOptions(preloadedData, currentUser, showAllDisciplines), [currentUser, preloadedData, showAllDisciplines]);

  const updateSelectedActivity = (patch: Partial<EngineeringActivity>) => {
    if (!selectedActivity) return;

    setActivities((previous) => previous.map((activity) => {
      if (activity.id !== selectedActivity.id) return activity;
      const next = { ...activity, ...patch };
      const touched = Boolean(
        next.leaderEdited ||
        (Array.isArray(next.executadoPor) && next.executadoPor.length > 0) ||
        String(next.statusDaAtividade || '').trim() ||
        String(next.dificuldadeAtividade || '').trim() ||
        String(next.observacaoLider || '').trim() ||
        typeof next.porcentagemAtividade === 'number'
      );

      return {
        ...next,
        status: touched ? 'Em execução' : 'Não iniciado',
        leaderEdited: touched
      };
    }));
  };

  useEffect(() => {
    autoScrolledToTodayRef.current = false;
  }, [filterSemana]);

  useEffect(() => {
    const el = boardScrollRef.current;
    if (!el) return;

    const syncScrollMetrics = () => {
      setBoardScrollLeft(el.scrollLeft);
      setBoardScrollMax(Math.max(0, el.scrollWidth - el.clientWidth));
      setBoardTrackWidth(boardTrackRef.current?.clientWidth || 0);
    };

    syncScrollMetrics();

    const onScroll = () => setBoardScrollLeft(el.scrollLeft);
    el.addEventListener('scroll', onScroll, { passive: true });

    const observer = new ResizeObserver(syncScrollMetrics);
    observer.observe(el);
    if (boardTrackRef.current) observer.observe(boardTrackRef.current);

    const board = el.firstElementChild as HTMLElement | null;
    if (board) observer.observe(board);

    window.addEventListener('resize', syncScrollMetrics);

    return () => {
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
      window.removeEventListener('resize', syncScrollMetrics);
    };
  }, []);

  useEffect(() => {
    if (!isCurrentWeekBoard || autoScrolledToTodayRef.current || boardScrollMax <= 0) return;

    const el = boardScrollRef.current;
    if (!el) return;

    const board = el.firstElementChild as HTMLElement | null;
    if (!board) return;

    const todayIndex = Math.max(0, Math.min(boardColumns.length - 1, TODAY.getDay() - 1));
    const column = board.children.item(todayIndex) as HTMLElement | null;
    if (!column) return;

    const raf = window.requestAnimationFrame(() => {
      const targetLeft = Math.max(
        0,
        Math.min(
          boardScrollMax,
          column.offsetLeft - ((el.clientWidth - column.clientWidth) / 2)
        )
      );

      el.scrollLeft = targetLeft;
      setBoardScrollLeft(targetLeft);
      autoScrolledToTodayRef.current = true;
    });

    return () => window.cancelAnimationFrame(raf);
  }, [boardColumns, boardScrollMax, isCurrentWeekBoard]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();

      if (selectedActivityId) {
        const idx = boardActivities.findIndex((a) => a.id === selectedActivityId);
        if (e.key === 'ArrowLeft' && idx > 0) setSelectedActivityId(boardActivities[idx - 1].id);
        if (e.key === 'ArrowRight' && idx < boardActivities.length - 1) setSelectedActivityId(boardActivities[idx + 1].id);
      } else {
        const wIdx = weekOptions.findIndex((opt) => opt.value === filterSemana);
        if (e.key === 'ArrowLeft' && wIdx > 0) setFilterSemana(weekOptions[wIdx - 1].value);
        if (e.key === 'ArrowRight' && wIdx < weekOptions.length - 1) setFilterSemana(weekOptions[wIdx + 1].value);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedActivityId, boardActivities, weekOptions, filterSemana]);

  const scrollBoardTo = (nextScrollLeft: number) => {
    const el = boardScrollRef.current;
    if (!el) return;

    const clamped = Math.max(0, Math.min(boardScrollMax, nextScrollLeft));
    el.scrollLeft = clamped;
    setBoardScrollLeft(clamped);
  };

  const updateScrollFromClientX = (clientX: number) => {
    const track = boardTrackRef.current;
    if (!track || boardScrollMax <= 0) return;

    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    scrollBoardTo(boardScrollMax * ratio);
  };

  const handleScrollbarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    scrollbarDragRef.current = true;
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    updateScrollFromClientX(event.clientX);
    event.preventDefault();
  };

  const handleScrollbarPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrollbarDragRef.current) return;
    updateScrollFromClientX(event.clientX);
  };

  const handleScrollbarPointerUp = () => {
    scrollbarDragRef.current = false;
  };

  const getScrollbarThumbWidth = () => {
    if (!boardScrollRef.current || boardTrackWidth <= 0) return 56;
    const el = boardScrollRef.current;
    const ratio = el.clientWidth / Math.max(el.scrollWidth, 1);
    return Math.max(56, Math.min(boardTrackWidth, boardTrackWidth * ratio));
  };

  const scrollbarThumbWidth = getScrollbarThumbWidth();
  const scrollbarThumbLeft = boardScrollMax > 0 && boardTrackWidth > scrollbarThumbWidth
    ? ((boardTrackWidth - scrollbarThumbWidth) * boardScrollLeft) / boardScrollMax
    : 0;

  return (
    <div className="flex w-full flex-col gap-3 font-['Montserrat'] animate-in fade-in duration-500">
      {(filtersAlwaysVisible || isHeaderFiltersOpen || showFiltersInternal) && (
        <motion.section
          initial={filtersAlwaysVisible ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className={filtersAlwaysVisible
            ? 'rounded-2xl border border-[#E5E7EB] bg-white px-4 py-4 shadow-sm'
            : 'fixed right-8 top-[92px] z-50 w-[min(92vw,980px)] rounded-2xl border border-[#E5E7EB] bg-white px-4 py-4 shadow-[0_18px_42px_rgba(15,76,129,0.12)]'}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.7px] text-[#94A3B8]">Filtros</p>
              <p className="mt-1 text-[13px] font-semibold text-[#475569]">Busca rápida, semana, contrato, OS, disciplina, concluídos e terceirizada.</p>
            </div>
            {!filtersAlwaysVisible && (
              <button
                type="button"
                onClick={() => { onCloseHeaderFilters?.(); setShowFiltersInternal(false); }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#E5E7EB] text-[#64748B] transition-colors hover:border-[#F7C7B7] hover:text-[#F05D28]"
                aria-label="Fechar filtros"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#757575]">Busca rápida</label>
              <div className="mt-1 flex h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 focus-within:border-[#F05D28]">
                <Search size={15} className="text-[#94A3B8]" />
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="OS, atividade ou responsável"
                  className="h-full w-full border-0 bg-transparent text-[13px] font-medium text-[#2D2D2D] outline-none placeholder:text-[#94A3B8]"
                />
              </div>
            </div>

            <FilterSelect label="Semana" value={filterSemana} onChange={setFilterSemana} options={weekOptions} />
            <FilterSelect label="Contrato" value={filterContrato} onChange={setFilterContrato} options={contratosDisponiveis} />
            <FilterSelect label="OS" value={filterOs} onChange={setFilterOs} options={osDisponiveis} />
            <label className="flex h-full cursor-pointer items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] font-semibold text-[#334155] transition-colors hover:border-[#F7C7B7]">
              <input
                type="checkbox"
                checked={filterShowCompleted}
                onChange={(event) => setFilterShowCompleted(event.target.checked)}
                className="h-4 w-4 rounded border-[#CBD5E1] text-[#F05D28] focus:ring-[#F05D28]"
              />
              <span>Marcar concluidos</span>
            </label>
            {disciplineFilterEnabled && (
              <FilterMultiSelectDropdown
                label="Disciplina"
                value={filterDisciplinas}
                options={disciplinasDisponiveis}
                placeholder="Selecionar..."
                onChange={handleFilterDisciplinasChange}
              />
            )}
          </div>
        </motion.section>
      )}

      <section className="overflow-hidden rounded-[34px] border border-[#E5E7EB] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] p-2.5 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 md:grid-cols-3 xl:max-w-[900px] xl:grid-cols-[1.35fr_0.75fr_0.75fr_0.75fr_0.75fr_0.95fr]">
            <div className="inline-flex min-w-0 items-center gap-1 rounded-[20px] border border-[#E5E7EB] bg-white px-2 py-1.5 shadow-sm">
              <button
                type="button"
                aria-label="Semana anterior"
                disabled={weekOptions.findIndex((o) => o.value === filterSemana) <= 0}
                onClick={() => { const i = weekOptions.findIndex((o) => o.value === filterSemana); if (i > 0) setFilterSemana(weekOptions[i - 1].value); }}
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F3F4F6] disabled:opacity-30 cursor-pointer disabled:cursor-default"
              >
                <ChevronLeft size={14} />
              </button>
              <div className="min-w-0 text-center">
                <p className="text-[9px] font-extrabold uppercase tracking-[0.7px] text-[#94A3B8]">Semana</p>
                <p className="text-[13px] font-black whitespace-nowrap text-[#2D2D2D]">{formatWeekLabel(filterSemana)}</p>
              </div>
              <button
                type="button"
                aria-label="Próxima semana"
                disabled={weekOptions.findIndex((o) => o.value === filterSemana) >= weekOptions.length - 1}
                onClick={() => { const i = weekOptions.findIndex((o) => o.value === filterSemana); if (i < weekOptions.length - 1) setFilterSemana(weekOptions[i + 1].value); }}
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F3F4F6] disabled:opacity-30 cursor-pointer disabled:cursor-default"
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <CompactStat icon={<Activity size={14} />} label="Atividades" value={kpis.total} tone="border-[#C9E1F7]" />
            <CompactStat icon={<Clock size={14} />} label="Em execução" value={kpis.emExecucao} tone="border-[#DBEAFE]" />
            <CompactStat icon={<AlertTriangle size={14} />} label="Bloqueadas" value={kpis.bloqueadas} tone="border-[#F7C7B7]" />
            <CompactStat icon={<CheckCircle2 size={14} />} label="Concluídas" value={kpis.concluidas} tone="border-[#BBF7D0]" />
            <div className="inline-flex min-w-0 items-center gap-2 rounded-[20px] border border-[#F7C7B7] bg-white px-2 py-1.5 shadow-sm">
              <div className="text-[#F05D28]"><Activity size={14} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-extrabold uppercase tracking-[0.7px] text-[#94A3B8]">Escala</p>
                <div className="mt-1 flex items-center gap-1">
                  {(['P', 'M', 'G'] as const).map((label) => {
                    const value = label === 'P' ? 65 : label === 'M' ? 90 : 120;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => { setBoardZoomPercent(value); try { localStorage.setItem('atividades_boardZoom', String(value)); } catch {} }}
                        className={`rounded-md px-2 py-0.5 text-[11px] font-black transition-colors ${boardZoomPercent === value ? 'bg-[#F05D28] text-white' : 'bg-[#F3F4F6] text-[#2D2D2D] hover:bg-[#F7C7B7]'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          {!filtersAlwaysVisible && (
            <button
              type="button"
              onClick={() => setShowFiltersInternal((prev) => !prev)}
              className={`inline-flex flex-shrink-0 items-center gap-2 rounded-[20px] border px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.7px] shadow-sm transition-colors ${showFiltersInternal || isHeaderFiltersOpen ? 'border-[#F05D28] bg-[#F05D28] text-white' : 'border-[#E5E7EB] bg-white text-[#94A3B8] hover:border-[#F7C7B7] hover:text-[#F05D28]'}`}
            >
              <Filter size={13} />
              Filtros
            </button>
          )}
        </div>

        <div className="mb-3">
          <div
            ref={boardTrackRef}
            className="relative h-2 rounded-full bg-[#E5E7EB]"
            role="scrollbar"
            aria-label="Rolar quadro para os lados"
            aria-valuemin={0}
            aria-valuemax={boardScrollMax}
            aria-valuenow={boardScrollLeft}
            aria-orientation="horizontal"
            onPointerDown={handleScrollbarPointerDown}
            onPointerMove={handleScrollbarPointerMove}
            onPointerUp={handleScrollbarPointerUp}
            onPointerCancel={handleScrollbarPointerUp}
            style={{ touchAction: 'none', cursor: 'ew-resize' }}
          >
            <div
              data-scrollbar-thumb="true"
              className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#94A3B8]"
              style={{
                left: `${scrollbarThumbLeft}px`,
                width: `${scrollbarThumbWidth}px`,
                cursor: 'ew-resize'
              }}
            />
          </div>
        </div>

        <div ref={boardScrollRef} className="w-full overflow-x-auto pb-2">
          <div
            className="grid w-max gap-2"
            style={{ gridTemplateColumns: `repeat(5, minmax(${boardColumnMinWidth}px, 1fr))`, minWidth: `${boardMinWidth}px` }}
          >
            {boardColumns.map((column) => (
              <div
                key={column.shortLabel}
                data-board-day-index={column.index}
                data-board-is-today={toIsoDate(column.date) === todayIso ? 'true' : undefined}
                className={`rounded-[28px] border p-2 transition-colors ${
                  toIsoDate(column.date) === todayIso
                    ? 'border-[#F7C7B7] bg-[linear-gradient(180deg,#FFF7F3_0%,#FFFFFF_100%)] shadow-[0_8px_22px_rgba(240,93,40,0.06)]'
                    : 'border-[#E5E7EB] bg-[linear-gradient(180deg,#F9FBFD_0%,#FFFFFF_100%)]'
                }`}
              >
                <div className={`rounded-[22px] border px-3.5 py-3 shadow-sm ${
                  toIsoDate(column.date) === todayIso
                    ? 'border-[#F7C7B7] bg-[#FFFDFB]'
                    : 'border-[#E7EEF6] bg-white'
                }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className={`text-[16px] font-black ${toIsoDate(column.date) === todayIso ? 'text-[#D15B2C]' : 'text-[#2D2D2D]'}`}>{column.label}</h3>
                    </div>
                    <div className="text-right">
                      <p className={`text-[11px] font-bold ${toIsoDate(column.date) === todayIso ? 'text-[#D15B2C]' : 'text-[#0F4C81]'}`}>{column.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</p>
                      <p className="mt-1 text-[10px] font-semibold text-[#94A3B8]">{column.activities.length} card(s)</p>
                    </div>
                  </div>
                </div>

                <div className="mt-2 space-y-0">
                  {column.activities.length === 0 ? (
                    <div className="flex min-h-[220px] items-center justify-center rounded-[24px] border border-dashed border-[#D5DFEA] bg-[#FCFDFE] px-4 py-8 text-center">
                      <p className="max-w-[180px] text-[12px] font-semibold leading-relaxed text-[#94A3B8]">
                        Sem atividade posicionada para este dia na semana filtrada.
                      </p>
                    </div>
                  ) : showAllDisciplines ? (
                    buildOsGroupsForColumn(column.activities, splitOsCardsByDiscipline).map((group) => (
                      <React.Fragment key={group.key}>
                        <OsGroupCard
                          group={group}
                          tipoLicitacao={osSettingsMap[group.osCodigo] || ''}
                          onClick={() => setSelectedOsGroup(group)}
                        />
                      </React.Fragment>
                    ))
                  ) : (
                    column.activities.map((activity) => (
                      <React.Fragment key={activity.id}>
                        <ProductionCard activity={activity} tipoLicitacao={osSettingsMap[activity.osCodigo] || ''} onClick={() => setSelectedActivityId(activity.id)} />
                      </React.Fragment>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <AnimatePresence>
        {selectedActivity && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setSelectedActivityId(null); setSelectedActivitySourceGroup(null); }}
              className="fixed inset-0 z-40 bg-[#2D2D2D]/35 backdrop-blur-[1px]"
            />

            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
              {(() => {
                const idx = boardActivities.findIndex((a) => a.id === selectedActivityId);
                return (
                  <>
                    <button
                      type="button"
                      aria-label="Atividade anterior"
                      disabled={idx <= 0}
                      onClick={() => { if (idx > 0) setSelectedActivityId(boardActivities[idx - 1].id); }}
                      className="absolute left-2 top-1/2 z-[51] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#2D2D2D] shadow-lg transition-all hover:bg-white hover:shadow-xl disabled:opacity-25 cursor-pointer disabled:cursor-default"
                    >
                      <ChevronLeft size={22} />
                    </button>
                    <button
                      type="button"
                      aria-label="Próxima atividade"
                      disabled={idx >= boardActivities.length - 1}
                      onClick={() => { if (idx < boardActivities.length - 1) setSelectedActivityId(boardActivities[idx + 1].id); }}
                      className="absolute right-2 top-1/2 z-[51] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#2D2D2D] shadow-lg transition-all hover:bg-white hover:shadow-xl disabled:opacity-25 cursor-pointer disabled:cursor-default"
                    >
                      <ChevronRight size={22} />
                    </button>
                  </>
                );
              })()}
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 14 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex max-h-[88vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[28px] border border-[#E5E7EB] bg-white shadow-2xl"
              >
              <div className="sticky top-0 z-10 border-b border-[#E5E7EB] bg-white px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    {selectedActivityDisciplineIcon ? (
                      <div
                        className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#F05D28] bg-white p-[4px] shadow-[0_4px_12px_rgba(240,93,40,0.12)]"
                        title={selectedActivityDisciplineName}
                        aria-label={selectedActivityDisciplineName}
                      >
                        {selectedActivityDisciplineIcon.imageSrc ? (
                          <img src={selectedActivityDisciplineIcon.imageSrc} alt={selectedActivityDisciplineName} className="h-full w-full rounded-full object-cover" />
                        ) : selectedActivityDisciplineIcon.icon ? (
                          <selectedActivityDisciplineIcon.icon size={36} className="scale-[1.05] text-[#F05D28]" />
                        ) : null}
                      </div>
                    ) : null}
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.9px] text-[#F05D28]">Detalhamento operacional</p>
                      <h3 className="mt-1 text-[17px] font-black text-[#2D2D2D] leading-snug">
                        {selectedActivityDisplayCode}
                        {selectedActivityDisplayTitle ? ` · ${selectedActivityDisplayTitle}` : ''}
                      </h3>
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-2">
                    {selectedActivitySourceGroup && (
                      <button
                        type="button"
                        onClick={() => { setSelectedOsGroup(selectedActivitySourceGroup); setSelectedActivitySourceGroup(null); setSelectedActivityId(null); }}
                        className="flex h-9 items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#F7C7B7] hover:text-[#F05D28] cursor-pointer"
                      >
                        <ChevronLeft size={14} />
                        Voltar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setSelectedActivityId(null); setSelectedActivitySourceGroup(null); }}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E5E7EB] text-[#64748B] transition-colors hover:bg-[#F8FAFC] cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="space-y-5">
                {false && (
                <div className="rounded-[24px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.8px] text-[#F05D28]">Preenchimento do líder</p>
                      <p className="mt-1 text-[12px] text-[#64748B]">Esses campos entram antes do detalhamento técnico e ficam salvos localmente.</p>
                    </div>
                    <span className="rounded-full border border-[#F7C7B7] bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.5px] text-[#D15B2C]">
                      Campos obrigatórios
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <MultiCheckboxDropdown
                      label="Executado Por *"
                      value={selectedActivity.executadoPor}
                      options={executadoPorOptions}
                      placeholder="Selecione uma ou mais pessoas"
                      helperText="Seleção múltipla restrita aos cadastrados da disciplina do usuário atual."
                      onChange={(next) => updateSelectedActivity({ executadoPor: next, leaderEdited: true, status: 'Em execução' })}
                    />

                    <div>
                      <label className="bentham-label">Status da atividade *</label>
                      <SearchableSelect
                        value={selectedActivity.statusDaAtividade}
                        onChange={(event) => updateSelectedActivity({ statusDaAtividade: event.target.value as LeaderActivityStatus, leaderEdited: true, status: 'Em execução' })}
                        className="bentham-select h-10 text-[13px]"
                      >
                        <option value="">Selecione</option>
                        <option value="Bom">Bom</option>
                        <option value="Regular">Regular</option>
                        <option value="Problema">Problema</option>
                      </SearchableSelect>
                    </div>

                    <div>
                      <label className="bentham-label">Dificuldade da atividade *</label>
                      <SearchableSelect
                        value={selectedActivity.dificuldadeAtividade}
                        onChange={(event) => updateSelectedActivity({ dificuldadeAtividade: event.target.value as LeaderDifficulty, leaderEdited: true, status: 'Em execução' })}
                        className="bentham-select h-10 text-[13px]"
                      >
                        <option value="">Selecione</option>
                        <option value="Difícil">Difícil</option>
                        <option value="Regular">Regular</option>
                        <option value="Fácil">Fácil</option>
                      </SearchableSelect>
                    </div>

                    <div>
                      <label className="bentham-label">Porcentagem da atividade % *</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={selectedActivity.porcentagemAtividade ?? ''}
                        onChange={(event) => {
                          const parsed = event.target.value === '' ? null : clampPercentage(Number(event.target.value));
                          updateSelectedActivity({ porcentagemAtividade: parsed, leaderEdited: true, status: 'Em execução' });
                        }}
                        className="bentham-input h-10 text-[13px]"
                        placeholder="0 - 100"
                      />
                    </div>

                    <div>
                      <label className="bentham-label">Observação *</label>
                      <textarea
                        minLength={30}
                        value={selectedActivity.observacaoLider}
                        onChange={(event) => updateSelectedActivity({ observacaoLider: event.target.value, leaderEdited: true, status: 'Em execução' })}
                        className={`bentham-input min-h-[110px] w-full resize-none py-2 text-[13px] ${selectedActivity.observacaoLider.trim().length > 0 && selectedActivity.observacaoLider.trim().length < 30 ? 'border-[#F59E0B]' : ''}`}
                        placeholder="Descreva a observação com pelo menos 30 caracteres"
                      />
                      <p className={`mt-1 text-[10px] font-medium ${selectedActivity.observacaoLider.trim().length > 0 && selectedActivity.observacaoLider.trim().length < 30 ? 'text-[#B45309]' : 'text-[#94A3B8]'}`}>
                        Mínimo de 30 caracteres.
                      </p>
                    </div>
                  </div>
                </div>
                )}

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <DetailField label="OS" value={selectedActivityDisplayCode || selectedActivity.osNome || selectedActivity.osCodigo} />
                  <DetailField label="Contrato" value={selectedActivity.contratoNome || selectedActivity.contratoCodigo} />
                  <DetailField label="ID" value={selectedActivity.origemItem || selectedActivity.itemCodigo || '-'} />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <DetailField label="Disciplina" value={getDisciplineDetailLabel(selectedActivity.disciplinas || selectedActivity.disciplina)} />
                  <DetailField label="Responsável" value={selectedActivity.responsavel} />
                  <DetailField label="Prioridade" value={<PriorityBadge priority={selectedActivity.prioridade} />} />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <DetailField
                    label="Status atual"
                    value={
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.4px] ${selectedEffectiveStatus === 'Executando' ? 'border-[#99F6E4] bg-[#ECFEFF] text-[#0F766E]' : 'border-[#CBD5E1] bg-[#F8FAFC] text-[#64748B]'}`}>
                        {selectedEffectiveStatus}
                      </span>
                    }
                  />
                  <DetailField label="Início planejado" value={formatDatePt(selectedActivity.inicioPlanejado)} />
                  <DetailField label="Término planejado" value={formatDatePt(selectedActivity.terminoPlanejado)} />
                </div>

                <ProgressComparison activity={selectedActivity} />

                <DetailField label="Motivo de bloqueio" value={selectedActivity.motivoBloqueio || 'Sem bloqueio registrado para esta atividade.'} />
                <DetailField label="Observações" value={' '} />
                </div>
              </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D2D2D]/55 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="flex w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] bg-[#F8FAFC] px-6 py-5">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.9px] text-[#F05D28]">Cronograma / EAP</p>
                  <h3 className="mt-2 text-[17px] font-black text-[#2D2D2D]">Vincular atividade ao quadro semanal do projetista</h3>
                  <p className="mt-2 text-[12px] text-[#64748B]">
                    Importe uma frente do cronograma e prepare os campos operacionais da semana.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setSelectedEapIndex(null);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E5E7EB] text-[#64748B] transition-colors hover:bg-white cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid gap-6 p-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <label className="bentham-label">Itens pendentes do cronograma</label>
                  <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-3xl border border-[#E5E7EB] bg-[#F8FAFC] p-2 custom-scrollbar">
                    {EAP_UNASSIGNED_ACTIVITIES.map((item, index) => {
                      const isSelected = selectedEapIndex === index;

                      return (
                        <button
                          key={item.item}
                          type="button"
                          onClick={() => setSelectedEapIndex(index)}
                          className={`block w-full rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-[#F7C7B7] bg-white shadow-sm ring-1 ring-[#FAD9C8]'
                              : 'border-[#E5E7EB] bg-white hover:border-[#CBD5E1]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[10px] font-extrabold uppercase tracking-[0.6px] text-[#F05D28]">
                              {item.contrato} · {item.os}
                            </span>
                            <span className="rounded-full bg-[#EEF6FD] px-2 py-1 text-[10px] font-bold text-[#0F4C81]">
                              {item.disciplina}
                            </span>
                          </div>
                          <p className="mt-2 text-[12px] font-extrabold text-[#2D2D2D]">{item.item}</p>
                          <p className="mt-1 text-[12px] leading-relaxed text-[#64748B]">{item.nomeAtividade}</p>
                          <p className="mt-2 text-[11px] font-medium text-[#94A3B8]">{item.subdisciplina}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="bentham-label">Configuração operacional</label>

                  {selectedEapIndex !== null ? (
                    <div className="space-y-4 rounded-3xl border border-[#FAD9C8] bg-[#FFF8F5] p-4">
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.7px] text-[#F05D28]">Item selecionado</p>
                        <p className="mt-2 text-[13px] font-bold text-[#2D2D2D]">
                          {EAP_UNASSIGNED_ACTIVITIES[selectedEapIndex].item} - {EAP_UNASSIGNED_ACTIVITIES[selectedEapIndex].nomeAtividade}
                        </p>
                      </div>

                      <div>
                        <label className="bentham-label">Responsável</label>
                        <SearchableSelect value={importResponsavel} onChange={(event) => setImportResponsavel(event.target.value)} className="bentham-select">
                          {RESPONSAVEIS.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </SearchableSelect>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="bentham-label">Etapa técnica</label>
                          <SearchableSelect value={importEtapa} onChange={(event) => setImportEtapa(event.target.value as TechnicalStep)} className="bentham-select">
                            {TECHNICAL_STEPS.map((step) => (
                              <option key={step} value={step}>
                                {step}
                              </option>
                            ))}
                          </SearchableSelect>
                        </div>

                        <div>
                          <label className="bentham-label">Prioridade</label>
                          <SearchableSelect value={importPrioridade} onChange={(event) => setImportPrioridade(event.target.value as PriorityLevel)} className="bentham-select">
                            {PRIORITY_OPTIONS.map((priority) => (
                              <option key={priority} value={priority}>
                                {priority}
                              </option>
                            ))}
                          </SearchableSelect>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="bentham-label">LOD alvo da semana</label>
                          <SearchableSelect value={importLodAlvo} onChange={(event) => setImportLodAlvo(Number(event.target.value) as LodLevel)} className="bentham-select">
                            {LOD_OPTIONS.map((lod) => (
                              <option key={lod} value={lod}>
                                LOD {lod}
                              </option>
                            ))}
                          </SearchableSelect>
                        </div>

                        <div className="rounded-2xl border border-[#D6EEEA] bg-[#F4FBFA] p-3">
                          <p className="text-[10px] font-extrabold uppercase tracking-[0.6px] text-[#0F766E]">LOD inicial sugerido</p>
                          <p className="mt-2 text-[24px] font-black text-[#0F766E]">{getPreviousLod(importLodAlvo)}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                        <label className="bentham-label">Início planejado</label>
                          <input
                            type="date"
                            value={importInicio}
                            onChange={(event) => setImportInicio(event.target.value)}
                            className="w-full h-11 rounded-xl border border-[#E5E7EB] px-3 text-[13px] text-[#2D2D2D] focus:border-[#F05D28] focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="bentham-label">Término planejado</label>
                          <input
                            type="date"
                            value={importTermino}
                            onChange={(event) => setImportTermino(event.target.value)}
                            className="w-full h-11 rounded-xl border border-[#E5E7EB] px-3 text-[13px] text-[#2D2D2D] focus:border-[#F05D28] focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-6 text-center">
                      <FileText size={32} className="text-[#94A3B8]" />
                      <p className="mt-4 text-[13px] font-bold text-[#475569]">Selecione um item do cronograma</p>
                      <p className="mt-2 max-w-[240px] text-[12px] leading-relaxed text-[#94A3B8]">
                        Assim que um item for escolhido, os campos operacionais da semana ficam disponíveis para o vínculo local.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#E5E7EB] bg-[#F8FAFC] px-6 py-5">
                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setSelectedEapIndex(null);
                  }}
                  className="h-10 rounded-xl border border-[#E5E7EB] bg-white px-4 text-[12px] font-bold text-[#64748B] transition-colors hover:bg-[#FCFCFD] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={selectedEapIndex === null}
                  onClick={handleImportActivity}
                  className="h-10 rounded-xl bg-[#F05D28] px-4 text-[12px] font-bold text-white shadow-lg shadow-[#F05D28]/15 transition-colors hover:bg-[#D94E1F] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  Vincular e inserir no quadro
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedOsGroup && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedOsGroup(null)}
              className="fixed inset-0 z-40 bg-[#2D2D2D]/35 backdrop-blur-[1px]"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 14 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex max-h-[88vh] w-full max-w-[680px] flex-col overflow-hidden rounded-[28px] border border-[#E5E7EB] bg-white shadow-2xl"
              >
                <div className="sticky top-0 z-10 border-b border-[#E5E7EB] bg-white px-6 py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.9px] text-[#F05D28]">Ordem de Serviço</p>
                      <h3 className="mt-2 text-[18px] font-black text-[#2D2D2D]">
                        <span className="text-[#F05D28]">{extractVisualOsCode(selectedOsGroup.activities[0]) || selectedOsGroup.osCodigo}</span>
                        {' - '}
                        {stripLodFromTitle(selectedOsGroup.osNome, extractVisualOsCode(selectedOsGroup.activities[0]) || selectedOsGroup.osCodigo) || selectedOsGroup.osNome}
                      </h3>
                      <p className="mt-1 text-[12px] text-[#64748B]">{selectedOsGroup.activities.length} atividade(s) — agrupadas por disciplina. Clique para ver detalhes.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedOsGroup(null)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E5E7EB] text-[#64748B] transition-colors hover:bg-[#F8FAFC] cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                  <div className="space-y-2">
                    {(() => {
                      const discMap = new Map<string, { disciplina: string; activities: EngineeringActivity[] }>();
                      selectedOsGroup.activities.forEach((a) => {
                        const key = normalizeText(a.disciplina || a.disciplinas?.[0] || '');
                        if (!discMap.has(key)) discMap.set(key, { disciplina: a.disciplina || a.disciplinas?.[0] || '', activities: [] });
                        discMap.get(key)!.activities.push(a);
                      });
                      return Array.from(discMap.values()).map((discGroup) => {
                        const repActivity = discGroup.activities[0];
                        const icon = getDisciplineIconInfo(discGroup.disciplina);
                        const name = getDisciplineDisplayName(discGroup.disciplina);
                        const DIcon = icon.icon;
                        const avgExecDisc = Math.round(discGroup.activities.reduce((s, a) => s + a.percentualRealizado, 0) / discGroup.activities.length);
                        const avgPrevDisc = Math.round(discGroup.activities.reduce((s, a) => s + a.percentualPrevisto, 0) / discGroup.activities.length);
                        const maxLod = discGroup.activities.reduce((m, a) => a.lodAtual > m ? a.lodAtual : m, discGroup.activities[0].lodAtual);
                        const behind = avgExecDisc < avgPrevDisc;
                        const tone = behind ? 'text-[#EF4444]' : 'text-[#166534]';
                        const discEdificios = getUniqueEdificios(discGroup.activities);
                        return (
                          <button
                            key={discGroup.disciplina}
                            type="button"
                            onClick={() => { setSelectedActivitySourceGroup(selectedOsGroup); setSelectedOsGroup(null); setSelectedActivityId(repActivity.id); }}
                            className="flex w-full items-center gap-3 rounded-[16px] border border-[#E5E7EB] bg-white px-4 py-3 text-left transition-colors hover:border-[#F7C7B7] hover:bg-[#FFF7F3] cursor-pointer"
                          >
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#F05D28] bg-white p-[3px] text-[#F05D28] shadow-sm">
                              {icon.imageSrc ? <img src={icon.imageSrc} alt={name} className="h-full w-full rounded-full object-cover" /> : DIcon ? <DIcon size={28} strokeWidth={2.2} /> : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-bold text-[#2D2D2D]">{name}</p>
                              {discGroup.activities.length > 1 && (
                                <p className="text-[11px] text-[#94A3B8]">{discGroup.activities.length} atividades</p>
                              )}
                            </div>
                            {discEdificios.length > 0 && <BuildingFlagStack edificios={discEdificios} compact />}
                            <div className="flex flex-shrink-0 items-center gap-3 text-right">
                              <div>
                                <p className="text-[9px] font-black uppercase tracking-[0.5px] text-[#94A3B8]">LOD</p>
                                <p className="text-[14px] font-black text-[#2D2D2D]">{maxLod}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-black uppercase tracking-[0.5px] text-[#94A3B8]">Exec</p>
                                <p className={`text-[14px] font-black ${tone}`}>{avgExecDisc}%</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-black uppercase tracking-[0.5px] text-[#94A3B8]">Prev</p>
                                <p className={`text-[14px] font-black ${tone}`}>{avgPrevDisc}%</p>
                              </div>
                            </div>
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

