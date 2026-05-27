import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ChevronDown,
  FileText,
  Plus,
  Search,
  X
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { getUserDisciplineList } from '../lib/disciplineCatalog';

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
  contratoCodigo: string;
  contratoNome: string;
  osCodigo: string;
  osNome: string;
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
  executadoPor: string[];
  statusDaAtividade: LeaderActivityStatus;
  dificuldadeAtividade: LeaderDifficulty;
  porcentagemAtividade: number | null;
  observacaoLider: string;
  leaderEdited: boolean;
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
  const list = splitMultiValue(value);
  return list.length > 0 ? list : ['Sem disciplina'];
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

const hasLodToken = (value?: string) => /\bLOD[\s_\-]*\d+/i.test(String(value || ''));

const extractLodValue = (value?: string) => {
  const matches = String(value || '').match(/\bLOD[\s_\-]*([0-9]{2,3})\b/i);
  const numberValue = matches ? Number(matches[1]) : NaN;
  return LOD_OPTIONS.includes(numberValue as LodLevel) ? (numberValue as LodLevel) : null;
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

const buildProfessionalOptions = (
  preloadedData: any,
  currentUser?: AtividadesProps['currentUser'],
  showAllDisciplines = false,
) => {
  const registro = preloadedData?.registro || preloadedData || {};
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
  const registro = preloadedData?.registro || preloadedData || {};
  const contracts = Array.isArray(registro.contracts) ? registro.contracts : [];
  const osOptions = Array.isArray(registro.osOptions) ? registro.osOptions : [];
  const itemOptions = Array.isArray(registro.itemOptions) ? registro.itemOptions : [];
  const hierarchyNodes = Array.isArray(registro.hierarchyNodes) ? registro.hierarchyNodes : [];

  const contractNameByCode = new Map<string, string>(contracts.map((item: any) => [String(item.codigo || '').trim(), String(item.nome || item.codigo || '').trim()]));
  const osNameByCode = new Map<string, string>(osOptions.map((item: any) => [String(item.codigo || '').trim(), String(item.nome || item.codigo || '').trim()]));
  const itemNameByCode = new Map<string, string>(itemOptions.map((item: any) => [String(item.codigo || '').trim(), String(item.nome || item.codigo || '').trim()]));
  const nodeByCode = new Map<string, any>(hierarchyNodes.map((item: any) => [String(item.codigo || '').trim(), item]));

  return { contractNameByCode, osNameByCode, itemNameByCode, nodeByCode, hierarchyNodes };
};

const getUnifiedEapRegistry = (preloadedData: any) => {
  return preloadedData?.eap?.data?.registro
    || preloadedData?.eap?.registro
    || preloadedData?.registro
    || {};
};

const buildActivitiesFromEap = (preloadedData: any, currentUser?: AtividadesProps['currentUser']): EngineeringActivity[] => {
  const { contractNameByCode, osNameByCode, itemNameByCode, nodeByCode } = buildEapMaps(preloadedData);
  const rawRows = [
    preloadedData?.cronograma,
    preloadedData?.eap?.data?.cronograma,
    preloadedData?.eap?.cronograma,
    preloadedData?.registro?.cronograma,
  ].find(Array.isArray) || [];

  const activities = rawRows
    .map((row: EapSourceRow) => {
      const code = String(row?.code || '').trim();
      const rowName = String(row?.name || '').trim();
      const node = nodeByCode.get(code);
      const isItem = !node || node.tipo === 'item';
      if (!code || !rowName || !isItem || !hasLodToken(rowName)) return null;

      const lodAtual = extractLodValue(rowName);
      if (!lodAtual) return null;

      const contractCode = String(node?.contratoCodigo || code.split('.')[0] || '').trim();
      const osCode = String(node?.osCodigo || code.split('.').slice(0, 2).join('.') || '').trim();
      const contractNome = contractNameByCode.get(contractCode) || String(node?.contratoNome || contractCode || '').trim();
      const osNome = osNameByCode.get(osCode) || String(node?.nome || itemNameByCode.get(code) || rowName || '').trim();
      const disciplinas = splitDisciplinas(row.disciplina || row.disciplinas || node?.disciplina || '');
      const leaderDisplay = String(currentUser?.nome || '').trim();

      return {
        id: `eap-${code}`,
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
        inicioPlanejado: String(row.plannedStart || row.realStart || getCurrentWeekKey()),
        terminoPlanejado: String(row.plannedEnd || row.realEnd || getCurrentWeekKey()),
        prioridade: 'Normal',
        status: 'Não iniciado',
        percentualPrevisto: clampPercentage(typeof row.idealProgress === 'number' ? row.idealProgress : row.baselineIdealProgress),
        percentualRealizado: 0,
        atividade: rowName,
        motivoBloqueio: '',
        proximaAcao: 'Preencher os campos da atividade na abertura do card.',
        observacoes: 'Atividade derivada da EAP unificada.',
        dataCriacao: toIsoDate(TODAY),
        origemItem: code,
        executadoPor: [],
        statusDaAtividade: '',
        dificuldadeAtividade: '',
        porcentagemAtividade: null,
        observacaoLider: '',
        leaderEdited: false
      } as EngineeringActivity;
    })
    .filter(Boolean) as EngineeringActivity[];

  if (activities.length > 0) return activities.sort(compareActivities);
  return [];
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
    contratoCodigo: String(raw.contratoCodigo || ''),
    contratoNome: String(raw.contratoNome || raw.contratoCodigo || ''),
    osCodigo: String(raw.osCodigo || ''),
    osNome: String(raw.osNome || ''),
    disciplina: String(raw.disciplina || ''),
    disciplinas: splitDisciplinas(raw.disciplinas || raw.disciplina || ''),
    subdisciplina: String(raw.subdisciplina || raw.disciplina || 'Sem subdisciplina'),
    responsavel: String(raw.responsavel || 'NÃ£o atribuÃ­do'),
    etapaTecnica: (TECHNICAL_STEPS.includes(raw.etapaTecnica as TechnicalStep) ? raw.etapaTecnica : 'Modelagem') as TechnicalStep,
    lodAtual: LOD_OPTIONS.includes(raw.lodAtual as LodLevel) ? (raw.lodAtual as LodLevel) : inferCurrentLod(lodAlvoSemana, percentualRealizado),
    lodAlvoSemana,
    inicioPlanejado: String(raw.inicioPlanejado || raw.prazo || getCurrentWeekKey()),
    terminoPlanejado: String(raw.terminoPlanejado || raw.prazo || getCurrentWeekKey()),
    prioridade: (PRIORITY_OPTIONS.includes(raw.prioridade as PriorityLevel) ? raw.prioridade : 'Normal') as PriorityLevel,
    status: normalizeLegacyStatus(String(raw.status || '')),
    percentualPrevisto: clampPercentage(typeof raw.percentualPrevisto === 'number' ? raw.percentualPrevisto : percentualRealizado),
    percentualRealizado,
    atividade: String(raw.atividade || raw.descricao || 'Atividade operacional sem descriÃ§Ã£o detalhada.'),
    motivoBloqueio: String(raw.motivoBloqueio || raw.impedimentoMotivo || ''),
    proximaAcao: String(raw.proximaAcao || 'Atualizar frente conforme cronograma da semana.'),
    observacoes: String(raw.observacoes || 'VisualizaÃ§Ã£o operacional derivada do cronograma/EAP.'),
    dataCriacao: String(raw.dataCriacao || getCurrentWeekKey()),
    origemItem: String(raw.origemItem || ''),
    executadoPor: splitMultiValue(raw.executadoPor || raw.profissionais || []),
    statusDaAtividade: String(raw.statusDaAtividade || '') as LeaderActivityStatus,
    dificuldadeAtividade: String(raw.dificuldadeAtividade || '') as LeaderDifficulty,
    porcentagemAtividade,
    observacaoLider: String(raw.observacaoLider || ''),
    leaderEdited
  };
};

const normalizeActivityList = (rawList: unknown) => {
  if (!Array.isArray(rawList)) return [];
  return rawList.map((item) => normalizeActivity(item as Partial<EngineeringActivity> & Record<string, unknown>));
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
  const hasExplicitDiscipline = activityDisciplinas.some((item) => normalizeText(item) !== 'sem disciplina');
  if (!hasExplicitDiscipline) return true;
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
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none transition-colors focus:border-[#F05D28]"
      >
        {options.map((option) => (
          <option key={typeof option === 'string' ? option : option.value} value={typeof option === 'string' ? option : option.value}>
            {typeof option === 'string' ? option : option.label}
          </option>
        ))}
      </select>
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

  const selectedLabels = options.filter((option) => value.includes(option));
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
                <span className="truncate">{item}</span>
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
          <div className="max-h-[280px] overflow-y-auto p-2">
            {options.length === 0 ? (
              <div className="rounded-xl bg-[#F8FAFC] px-3 py-3 text-[12px] text-[#94A3B8]">
                Nenhuma disciplina encontrada.
              </div>
            ) : (
              options.map((option) => {
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
                      <span className="block truncate text-[13px] font-semibold text-[#2D2D2D]">{option}</span>
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

  const selectedLabels = options
    .filter((option) => value.includes(option.nome))
    .map((option) => option.nome);

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
          <div className="max-h-[280px] overflow-y-auto p-2">
            {options.length === 0 ? (
              <div className="rounded-xl bg-[#F8FAFC] px-3 py-3 text-[12px] text-[#94A3B8]">
                Nenhuma pessoa encontrada neste setor.
              </div>
            ) : (
              options.map((option) => {
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
  'OS 034': '#0F4C81',
  'OS 037': '#14B8A6',
  'OS 043': '#C66A4A',
  'OS 050': '#1D4ED8',
  'OS 053': '#0F766E'
};

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

function getUniqueActivityKey(activity: EngineeringActivity) {
  return [
    activity.id,
    activity.origemItem,
    activity.osCodigo,
    activity.atividade,
    activity.inicioPlanejado,
    activity.terminoPlanejado
  ].map((value) => String(value || '').trim()).join('|');
}

function ProductionCard({
  activity,
  onClick
}: {
  activity: EngineeringActivity;
  onClick: () => void;
}) {
  const leaderPercentual = getLeaderPercentual(activity);
  const isBehind = leaderPercentual < activity.percentualPrevisto;
  const valueTone = isBehind ? 'text-[#EF4444]' : 'text-[#166534]';
  const participants = getActivityParticipants(activity);
  const disciplineLabel = getDisciplineLabel(activity.disciplina || activity.disciplinas?.[0] || '');

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative block w-full min-h-[252px] overflow-hidden rounded-[24px] border border-[#E7EDF4] bg-white p-3 text-left shadow-[0_8px_24px_rgba(15,76,129,0.06)] transition-all hover:-translate-y-[2px] hover:border-[#F7C7B7] hover:shadow-[0_16px_34px_rgba(240,93,40,0.10)] cursor-pointer"
    >
      <div
        className="absolute right-2 top-2 flex flex-col items-center"
        aria-hidden="true"
      >
        <div
          className="h-5 w-3 rounded-t-[4px]"
          style={{ backgroundColor: osAccentColorMap[activity.osCodigo] || '#F05D28' }}
        />
        <div
          className="h-0 w-0 border-l-[6px] border-r-[6px] border-t-[7px] border-l-transparent border-r-transparent"
          style={{ borderTopColor: osAccentColorMap[activity.osCodigo] || '#F05D28' }}
        />
      </div>

      <div className="pr-5">
        <p className="text-[11px] font-black uppercase tracking-[0.45px] text-[#F05D28] leading-snug">
          {activity.osCodigo} - <span className="text-[#2D2D2D]">{activity.osNome}</span>
        </p>
      </div>

      <div className="mt-3 rounded-xl px-2 py-1.5 bg-[#F0FDF4]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.5px] text-[#166534]">Participantes</p>
            <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.45px] text-[#166534]">
              EXEC <span className="ml-1 text-[12px] leading-none">{leaderPercentual}%</span>
            </p>
          </div>

          <div className="flex items-center -space-x-2 pl-1">
            {participants.slice(0, 4).map((person) => {
              const initials = getAssigneeInitials(person);
              const color = getAssigneeColor(person);
              return (
                <div
                  key={person}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[9px] font-black uppercase text-white shadow-[0_4px_12px_rgba(15,76,129,0.14)]"
                  style={{ backgroundColor: color }}
                  title={person}
                  aria-label={person}
                >
                  {initials}
                </div>
              );
            })}
            {participants.length > 4 && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#E2E8F0] text-[9px] font-black text-[#475569] shadow-[0_4px_12px_rgba(15,76,129,0.10)]">
                +{participants.length - 4}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-[#F8FAFC] px-2 py-2 text-[10px] font-semibold text-[#64748B] 2xl:hidden">
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <span className="block font-extrabold uppercase tracking-[0.5px] text-[#94A3B8]">Início:</span>
            <span className="mt-1 block font-bold text-[#475569]">{formatDatePt(activity.inicioPlanejado)}</span>
          </div>
          <div className="min-w-0">
            <span className="block font-extrabold uppercase tracking-[0.5px] text-[#94A3B8]">Término:</span>
            <span className="mt-1 block font-bold text-[#475569]">{formatDatePt(activity.terminoPlanejado)}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 hidden rounded-2xl bg-[#F8FAFC] px-2 py-1.5 text-[10px] font-semibold text-[#64748B] 2xl:block">
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <span className="block font-extrabold uppercase tracking-[0.5px] text-[#94A3B8]">Início:</span>
            <span className="mt-1 block font-bold text-[#475569]">{formatDatePt(activity.inicioPlanejado)}</span>
          </div>
          <div className="min-w-0">
            <span className="block font-extrabold uppercase tracking-[0.5px] text-[#94A3B8]">Término:</span>
            <span className="mt-1 block font-bold text-[#475569]">{formatDatePt(activity.terminoPlanejado)}</span>
          </div>
        </div>
      </div>

      <div className="mt-2 flex justify-center">
        <span className="inline-flex min-w-[92px] items-center justify-center rounded-full border border-[#DBEAFE] bg-[#EFF6FF] px-3 py-1 text-[10px] font-black uppercase tracking-[0.7px] text-[#0F4C81] shadow-sm">
          {disciplineLabel}
        </span>
      </div>

    </button>
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
}: AtividadesProps) {
  const sourceActivities = useMemo(() => buildActivitiesFromEap(preloadedData, currentUser), [preloadedData, currentUser]);
  const [activities, setActivities] = useState<EngineeringActivity[]>(() => {
    return sourceActivities;
  });

  const [searchText, setSearchText] = useState('');
  const [filterSemana, setFilterSemana] = useState(getCurrentWeekKey());
  const [filterContrato, setFilterContrato] = useState('Todos');
  const [filterOs, setFilterOs] = useState('Todos');
  const [filterDisciplinas, setFilterDisciplinas] = useState<string[]>([]);
  const [filterTerceirizada, setFilterTerceirizada] = useState(false);
  const [filterEtapa, setFilterEtapa] = useState('Todos');
  const [filterLod, setFilterLod] = useState('Todos');
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [filterPrioridade, setFilterPrioridade] = useState('Todos');
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedEapIndex, setSelectedEapIndex] = useState<number | null>(null);
  const [importResponsavel, setImportResponsavel] = useState(RESPONSAVEIS[0]);
  const [importPrioridade, setImportPrioridade] = useState<PriorityLevel>('Normal');
  const [importLodAlvo, setImportLodAlvo] = useState<LodLevel>(300);
  const [importEtapa, setImportEtapa] = useState<TechnicalStep>('Modelagem');
  const [importInicio, setImportInicio] = useState(getCurrentWeekKey());
  const [importTermino, setImportTermino] = useState(getCurrentWeekKey());

  const selectedActivity = useMemo(
    () => activities.find((activity) => activity.id === selectedActivityId) || null,
    [activities, selectedActivityId]
  );

  const disciplineScopedActivities = useMemo(
    () => (showAllDisciplines
      ? activities
      : activities.filter((activity) => matchesUserDiscipline(activity, [currentUser?.disciplina, ...(currentUser?.disciplinas || [])].filter(Boolean).join(' | ')))),
    [activities, currentUser?.disciplina, currentUser?.disciplinas, showAllDisciplines]
  );

  useEffect(() => {
    setActivities(sourceActivities);
  }, [sourceActivities]);

  const contratosDisponiveis = useMemo(() => {
    const registry = getUnifiedEapRegistry(preloadedData);
    const contracts = Array.isArray(registry.contracts) ? registry.contracts : [];
    const options = contracts
      .map((item: any) => ({
        value: String(item?.codigo || '').trim(),
        label: item?.codigo && item?.nome && String(item.nome).trim() !== String(item.codigo).trim()
          ? `${String(item.codigo).trim()} - ${String(item.nome).trim()}`
          : String(item?.nome || item?.codigo || '').trim(),
      }))
      .filter((item: { value: string; label: string }) => Boolean(item.value));

    if (options.length > 0) return ['Todos', ...options];
    return ['Todos', ...Array.from(new Set(activities.map((activity) => activity.contratoCodigo))).filter(Boolean)];
  }, [activities, preloadedData]);

  const osDisponiveis = useMemo(() => {
    const registry = getUnifiedEapRegistry(preloadedData);
    const osOptions = Array.isArray(registry.osOptions) ? registry.osOptions : [];
    const source = filterContrato === 'Todos'
      ? osOptions
      : osOptions.filter((item: any) => String(item?.contratoCodigo || '').trim() === filterContrato);

    const options = source
      .map((item: any) => ({
        value: String(item?.codigo || '').trim(),
        label: item?.codigo && item?.nome && String(item.nome).trim() !== String(item.codigo).trim()
          ? `${String(item.codigo).trim()} - ${String(item.nome).trim()}`
          : String(item?.nome || item?.codigo || '').trim(),
      }))
      .filter((item: { value: string; label: string }) => Boolean(item.value));

    if (options.length > 0) return ['Todos', ...options];

    const fallbackActivities = filterContrato === 'Todos'
      ? activities
      : activities.filter((activity) => activity.contratoCodigo === filterContrato);
    return ['Todos', ...Array.from(new Set(fallbackActivities.map((activity) => activity.osCodigo))).filter(Boolean)];
  }, [activities, filterContrato, preloadedData]);

  const disciplinasDisponiveis = useMemo(() => {
    const collected = new Set<string>();
    activities.forEach((activity) => {
      splitDisciplinas(activity.disciplinas || activity.disciplina).forEach((item) => collected.add(item));
    });
    return Array.from(collected);
  }, [activities]);

  const etapasDisponiveis = useMemo(() => ['Todos', ...TECHNICAL_STEPS], []);
  const lodsDisponiveis = useMemo(() => ['Todos', ...LOD_OPTIONS.map(String)], []);
  const statusDisponiveis = useMemo(() => ['Todos', ...STATUS_OPTIONS], []);
  const prioridadesDisponiveis = useMemo(() => ['Todos', ...PRIORITY_OPTIONS], []);

  const weekOptions = useMemo(() => {
    const keys = new Set<string>([getCurrentWeekKey()]);
    activities.forEach((activity) => keys.add(getWeekKeyFromActivity(activity)));

    return Array.from(keys)
      .sort((first, second) => parseDate(first).getTime() - parseDate(second).getTime())
      .map((key) => ({ value: key, label: `${key} | ${formatWeekLabel(key)}` }));
  }, [activities]);

  const weekStart = useMemo(() => parseDate(filterSemana), [filterSemana]);
  const weekEnd = useMemo(() => addDays(weekStart, 4), [weekStart]);

  const filteredActivities = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return disciplineScopedActivities
      .filter((activity) => {
        const matchesSearch =
          !normalizedSearch ||
          activity.atividade.toLowerCase().includes(normalizedSearch) ||
          activity.osCodigo.toLowerCase().includes(normalizedSearch) ||
          activity.osNome.toLowerCase().includes(normalizedSearch) ||
          activity.responsavel.toLowerCase().includes(normalizedSearch) ||
          activity.origemItem?.toLowerCase().includes(normalizedSearch);

        const matchesContrato = filterContrato === 'Todos' || activity.contratoCodigo === filterContrato;
        const matchesOs = filterOs === 'Todos' || activity.osCodigo === filterOs;
        const activityDisciplinas = splitDisciplinas(activity.disciplinas || activity.disciplina);
        const matchesDisciplina = !disciplineFilterEnabled
          || filterDisciplinas.length === 0
          || filterDisciplinas.some((discipline) => activityDisciplinas.includes(discipline));
        const matchesTerceirizada = !filterTerceirizada || isThirdPartyActivity(activity);
        const matchesEtapa = filterEtapa === 'Todos' || activity.etapaTecnica === filterEtapa;
        const matchesLod = filterLod === 'Todos' || String(activity.lodAtual) === filterLod || String(activity.lodAlvoSemana) === filterLod;
        const matchesStatus = filterStatus === 'Todos' || getEffectiveStatus(activity) === filterStatus;
        const matchesPrioridade = filterPrioridade === 'Todos' || activity.prioridade === filterPrioridade;

        return (
          matchesSearch &&
          matchesContrato &&
          matchesOs &&
          matchesDisciplina &&
          matchesTerceirizada &&
          matchesEtapa &&
          matchesLod &&
          matchesStatus &&
          matchesPrioridade
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
    filterTerceirizada,
    disciplineFilterEnabled,
    searchText,
  ]);

  const boardActivities = useMemo(() => {
    const seen = new Set<string>();
    return filteredActivities.filter((activity) => {
      const key = getUniqueActivityKey(activity);
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

      column.activities = filteredActivities.filter((activity) => {
        const activityStart = parseDate(activity.inicioPlanejado);
        const activityEnd = parseDate(activity.terminoPlanejado);
        return activityStart <= dayEnd && activityEnd >= dayStart;
      });
    });

    return columns;
  }, [filteredActivities, weekStart]);

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

  return (
    <div className="flex w-full flex-col gap-3 font-['Montserrat'] animate-in fade-in duration-500">
      {(filtersAlwaysVisible || isHeaderFiltersOpen) && (
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
              <p className="mt-1 text-[13px] font-semibold text-[#475569]">Busca rápida, semana, contrato, OS, disciplina e terceirizada.</p>
            </div>
            {!filtersAlwaysVisible && (
              <button
                type="button"
                onClick={onCloseHeaderFilters}
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
            {disciplineFilterEnabled && (
              <FilterMultiSelectDropdown
                label="Disciplina"
                value={filterDisciplinas}
                options={disciplinasDisponiveis}
                placeholder="Todas"
                onChange={setFilterDisciplinas}
              />
            )}
            <div className="flex items-end">
              <label className={`inline-flex h-11 w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-[12px] font-semibold transition-colors ${
                filterTerceirizada
                  ? 'border-[#F05D28] bg-[#FFF7ED] text-[#C2410C]'
                  : 'border-[#E5E7EB] bg-white text-[#2D2D2D]'
              }`}>
                <input
                  type="checkbox"
                  checked={filterTerceirizada}
                  onChange={(event) => setFilterTerceirizada(event.target.checked)}
                  className="h-4 w-4 accent-[#F05D28]"
                />
                Terceirizada
              </label>
            </div>
          </div>
        </motion.section>
      )}

      <section className="rounded-[34px] border border-[#E5E7EB] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] p-2.5 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 md:grid-cols-3 xl:max-w-[760px] xl:grid-cols-[1.35fr_0.75fr_0.75fr_0.75fr_0.75fr]">
            <CompactStat icon={<Calendar size={14} />} label="Semana" value={formatWeekLabel(filterSemana)} tone="border-[#E5E7EB]" valueClassName="whitespace-nowrap" />
            <CompactStat icon={<Activity size={14} />} label="Atividades" value={kpis.total} tone="border-[#C9E1F7]" />
            <CompactStat icon={<Clock size={14} />} label="Em execução" value={kpis.emExecucao} tone="border-[#DBEAFE]" />
            <CompactStat icon={<AlertTriangle size={14} />} label="Bloqueadas" value={kpis.bloqueadas} tone="border-[#F7C7B7]" />
            <CompactStat icon={<CheckCircle2 size={14} />} label="Concluídas" value={kpis.concluidas} tone="border-[#BBF7D0]" />
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-[#E5E7EB] bg-white px-3 py-2 text-[11px] font-semibold text-[#64748B] xl:shrink-0 xl:self-center">
            <span>Clique no cartão para abrir os detalhes</span>
          </div>
        </div>

        <div className="w-full">
          <div className="grid w-full gap-2 lg:grid-cols-5">
            {boardColumns.map((column) => (
              <div
                key={column.shortLabel}
                className="rounded-[28px] border border-[#E5E7EB] bg-[linear-gradient(180deg,#F9FBFD_0%,#FFFFFF_100%)] p-2"
              >
                <div className="rounded-[22px] border border-[#E7EEF6] bg-white px-3.5 py-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-[16px] font-black text-[#2D2D2D]">{column.label}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-bold text-[#0F4C81]">{column.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</p>
                      <p className="mt-1 text-[10px] font-semibold text-[#94A3B8]">{column.activities.length} card(s)</p>
                    </div>
                  </div>
                </div>

                <div className="mt-2 space-y-2">
                  {column.activities.length === 0 ? (
                    <div className="flex min-h-[220px] items-center justify-center rounded-[24px] border border-dashed border-[#D5DFEA] bg-[#FCFDFE] px-4 py-8 text-center">
                      <p className="max-w-[180px] text-[12px] font-semibold leading-relaxed text-[#94A3B8]">
                        Sem atividade posicionada para este dia na semana filtrada.
                      </p>
                    </div>
                  ) : (
                    column.activities.map((activity) => (
                      <React.Fragment key={activity.id}>
                        <ProductionCard activity={activity} onClick={() => setSelectedActivityId(activity.id)} />
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
              onClick={() => setSelectedActivityId(null)}
              className="fixed inset-0 z-40 bg-[#2D2D2D]/35 backdrop-blur-[1px]"
            />

            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 14 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex max-h-[88vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[28px] border border-[#E5E7EB] bg-white shadow-2xl"
              >
              <div className="sticky top-0 z-10 border-b border-[#E5E7EB] bg-white px-6 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.9px] text-[#F05D28]">Detalhamento operacional</p>
                    <h3 className="mt-2 text-[18px] font-black text-[#2D2D2D]">{selectedActivity.osCodigo} · {selectedActivity.osNome}</h3>
                    <p className="mt-2 text-[12px] leading-relaxed text-[#64748B]">
                      Painel lateral com os dados técnicos e operacionais da atividade selecionada.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedActivityId(null)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E5E7EB] text-[#64748B] transition-colors hover:bg-[#F8FAFC] cursor-pointer"
                  >
                    <X size={16} />
                  </button>
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
                      <select
                        value={selectedActivity.statusDaAtividade}
                        onChange={(event) => updateSelectedActivity({ statusDaAtividade: event.target.value as LeaderActivityStatus, leaderEdited: true, status: 'Em execução' })}
                        className="bentham-select h-10 text-[13px]"
                      >
                        <option value="">Selecione</option>
                        <option value="Bom">Bom</option>
                        <option value="Regular">Regular</option>
                        <option value="Problema">Problema</option>
                      </select>
                    </div>

                    <div>
                      <label className="bentham-label">Dificuldade da atividade *</label>
                      <select
                        value={selectedActivity.dificuldadeAtividade}
                        onChange={(event) => updateSelectedActivity({ dificuldadeAtividade: event.target.value as LeaderDifficulty, leaderEdited: true, status: 'Em execução' })}
                        className="bentham-select h-10 text-[13px]"
                      >
                        <option value="">Selecione</option>
                        <option value="Difícil">Difícil</option>
                        <option value="Regular">Regular</option>
                        <option value="Fácil">Fácil</option>
                      </select>
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

                <div className="grid grid-cols-2 gap-3">
                  <DetailField label="OS" value={selectedActivity.osCodigo} />
                  <DetailField label="Contrato" value={selectedActivity.contratoCodigo} />
                  <DetailField label="Projeto / Objeto" value={selectedActivity.osNome} />
                  <DetailField label="Disciplina" value={selectedActivity.disciplina} />
                  <DetailField label="Subdisciplina" value={selectedActivity.subdisciplina} />
                  <DetailField label="Responsável" value={selectedActivity.responsavel} />
                  <DetailField label="Etapa técnica" value={selectedActivity.etapaTecnica} />
                  <DetailField label="Prioridade" value={<PriorityBadge priority={selectedActivity.prioridade} />} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <DetailField label="LOD atual" value={<span className="text-[22px] font-black text-[#0F766E]">{selectedActivity.lodAtual}</span>} />
                  <DetailField label="LOD alvo" value={<span className="text-[22px] font-black text-[#D15B2C]">{selectedActivity.lodAlvoSemana}</span>} />
                  <DetailField label="Status LOD" value={getLodStatus(selectedActivity)} />
                  <DetailField
                    label="Status atual"
                    value={
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.4px] ${selectedEffectiveStatus === 'Executando' ? 'border-[#99F6E4] bg-[#ECFEFF] text-[#0F766E]' : 'border-[#CBD5E1] bg-[#F8FAFC] text-[#64748B]'}`}>
                        {selectedEffectiveStatus}
                      </span>
                    }
                  />
                </div>

                <DetailField label="Atividade completa" value={<p className="leading-relaxed text-[#334155]">{selectedActivity.atividade}</p>} />

                <div className="grid grid-cols-2 gap-3">
                  <DetailField label="Início planejado" value={formatDatePt(selectedActivity.inicioPlanejado)} />
                  <DetailField label="Término planejado" value={formatDatePt(selectedActivity.terminoPlanejado)} />
                  <DetailField label="Percentual previsto" value={`${selectedActivity.percentualPrevisto}%`} />
                  <DetailField label="Percentual realizado" value={typeof selectedActivity.porcentagemAtividade === 'number' ? `${getLeaderPercentual(selectedActivity)}%` : '-'} />
                  <DetailField
                    label="Diferença previsto x realizado"
                    value={
                      <span className={typeof selectedActivity.porcentagemAtividade === 'number' ? (getProgressDelta(selectedActivity) < 0 ? 'text-[#B45309]' : 'text-[#0F766E]') : 'text-[#94A3B8]'}>
                        {typeof selectedActivity.porcentagemAtividade === 'number'
                          ? `${getProgressDelta(selectedActivity) >= 0 ? `+${getProgressDelta(selectedActivity)}` : getProgressDelta(selectedActivity)} pontos`
                          : '-'}
                      </span>
                    }
                  />
                  <DetailField label="Origem EAP" value={selectedActivity.origemItem || 'Sem código informado'} />
                </div>

                <ProgressComparison activity={selectedActivity} />

                <DetailField label="Motivo de bloqueio" value={selectedActivity.motivoBloqueio || 'Sem bloqueio registrado para esta atividade.'} />
                <DetailField label="Próxima ação" value={selectedActivity.proximaAcao} />
                <DetailField label="Observações" value={selectedActivity.observacaoLider || selectedActivity.observacoes} />
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
                        <select value={importResponsavel} onChange={(event) => setImportResponsavel(event.target.value)} className="bentham-select">
                          {RESPONSAVEIS.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="bentham-label">Etapa técnica</label>
                          <select value={importEtapa} onChange={(event) => setImportEtapa(event.target.value as TechnicalStep)} className="bentham-select">
                            {TECHNICAL_STEPS.map((step) => (
                              <option key={step} value={step}>
                                {step}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="bentham-label">Prioridade</label>
                          <select value={importPrioridade} onChange={(event) => setImportPrioridade(event.target.value as PriorityLevel)} className="bentham-select">
                            {PRIORITY_OPTIONS.map((priority) => (
                              <option key={priority} value={priority}>
                                {priority}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="bentham-label">LOD alvo da semana</label>
                          <select value={importLodAlvo} onChange={(event) => setImportLodAlvo(Number(event.target.value) as LodLevel)} className="bentham-select">
                            {LOD_OPTIONS.map((lod) => (
                              <option key={lod} value={lod}>
                                LOD {lod}
                              </option>
                            ))}
                          </select>
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
    </div>
  );
}

