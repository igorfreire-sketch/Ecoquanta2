import React from 'react';
import { ChevronLeft, ClipboardList, Layers, Network, Search, StickyNote } from 'lucide-react';
import { getDisciplineDisplayName, getDisciplineIconInfo, buildActivitiesFromEap } from '../Atividades';
import Anotacoes, { type AnnotationSheet, type AnnotationTemplate } from './Anotacoes';
import MindMap from './MindMap';
import CronogramaResumo from './CronogramaResumo';

interface DisciplinasProps {
  disciplinas: string[];
  notes: AnnotationSheet[];
  osOptions: Array<{ codigo: string; nome: string; contratoCodigo?: string }>;
  currentUser: { nome: string; email: string; role?: string; isAdmin?: boolean };
  templates: AnnotationTemplate[];
  preloadedData?: any;
  // Area Tecnica: sem categoria Disciplinas nem Mapa Mental, notas de OS sempre publicas
  // e com a disciplina do proprio usuario (sem escolha).
  restrictToOs?: boolean;
  forcePublica?: boolean;
  autoDisciplinaOs?: string;
  authorDisciplinaByEmail?: Record<string, string>;
  onSaveNote: (sheet: AnnotationSheet) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onSaveTemplate: (template: AnnotationTemplate) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
}

type Category = 'disciplinas' | 'os' | 'notas' | 'mapa';
type DetailTab = 'anotacoes' | 'cronograma';

function normalizeText(value: string) {
  return value.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').trim().toLowerCase();
}

const iconButtonClass = 'flex w-[92px] flex-col items-center gap-2 text-center cursor-pointer';
const iconCircleClass = 'flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-[#F05D28] bg-white p-1 text-[#F05D28] shadow-[0_3px_8px_rgba(240,93,40,0.10)] transition-transform hover:-translate-y-[2px] hover:shadow-[0_6px_14px_rgba(240,93,40,0.20)]';
const landingTileClass = 'flex flex-col items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-6 text-center shadow-sm transition-all hover:-translate-y-[2px] hover:border-[#F7C7B7] hover:shadow-[0_6px_14px_rgba(240,93,40,0.14)] cursor-pointer';
const landingIconCircleClass = 'flex h-14 w-14 items-center justify-center rounded-full border border-[#F05D28] bg-white text-[#F05D28]';

export default function Disciplinas({ disciplinas, notes, osOptions, currentUser, templates, preloadedData, restrictToOs, forcePublica, autoDisciplinaOs, authorDisciplinaByEmail, onSaveNote, onDeleteNote, onSaveTemplate, onDeleteTemplate }: DisciplinasProps) {
  const [category, setCategory] = React.useState<Category | null>(null);
  const [search, setSearch] = React.useState('');
  const [contratoFiltro, setContratoFiltro] = React.useState('');
  const [selected, setSelected] = React.useState<string | null>(null);
  const [mindMapOpenSheet, setMindMapOpenSheet] = React.useState<AnnotationSheet | null>(null);
  const [detailTab, setDetailTab] = React.useState<DetailTab>('anotacoes');

  const allActivities = React.useMemo(
    () => buildActivitiesFromEap(preloadedData, currentUser),
    [preloadedData, currentUser]
  );

  const sortedDisciplinas = React.useMemo(
    () => Array.from(new Set(disciplinas)).sort((a, b) => getDisciplineDisplayName(a).localeCompare(getDisciplineDisplayName(b), 'pt-BR')),
    [disciplinas]
  );

  const sortedOs = React.useMemo(
    () => Array.from(new Map(osOptions.map((os) => [os.codigo, os])).values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [osOptions]
  );

  const filteredDisciplinas = React.useMemo(() => {
    const query = normalizeText(search);
    if (!query) return sortedDisciplinas;
    return sortedDisciplinas.filter((disciplina) => normalizeText(getDisciplineDisplayName(disciplina)).includes(query) || normalizeText(disciplina).includes(query));
  }, [sortedDisciplinas, search]);

  const contractOptions = React.useMemo(() => {
    const list = Array.isArray(preloadedData?.registro?.contracts) ? preloadedData.registro.contracts : [];
    return list
      .map((item: any) => ({ codigo: String(item?.codigo || '').trim(), nome: String(item?.nome || item?.codigo || '').trim() }))
      .filter((item: { codigo: string }) => item.codigo)
      .sort((a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [preloadedData]);

  const filteredOs = React.useMemo(() => {
    const query = normalizeText(search);
    return sortedOs.filter((os) => {
      const matchesContrato = !contratoFiltro || os.contratoCodigo === contratoFiltro;
      const matchesQuery = !query || normalizeText(os.codigo).includes(query) || normalizeText(os.nome).includes(query);
      return matchesContrato && matchesQuery;
    });
  }, [sortedOs, search, contratoFiltro]);

  // Nivel 3: detalhe de uma disciplina ou OS especifica, com as anotacoes e o cronograma.
  if (category && selected) {
    const osSelecionada = category === 'os' ? sortedOs.find((os) => os.codigo === selected) : null;
    const icon = category === 'disciplinas' ? getDisciplineIconInfo(selected) : null;
    const name = category === 'disciplinas' ? getDisciplineDisplayName(selected) : (osSelecionada?.nome || selected);
    const Icon = icon?.icon;
    const selectedDisciplineName = category === 'disciplinas' ? getDisciplineDisplayName(selected) : '';
    const relevantActivities = allActivities.filter((activity) => (
      category === 'disciplinas'
        ? activity.disciplinas.some((disciplina) => getDisciplineDisplayName(disciplina) === selectedDisciplineName)
        : activity.osCodigo === selected
    ));

    return (
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <button
          type="button"
          onClick={() => { setSelected(null); setDetailTab('anotacoes'); }}
          className="flex h-9 items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#F7C7B7] hover:text-[#F05D28] cursor-pointer"
        >
          <ChevronLeft size={14} />
          Voltar
        </button>

        <div className="mt-5 flex items-center gap-3">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#F05D28] bg-white p-1 text-[#F05D28] shadow-[0_3px_8px_rgba(240,93,40,0.10)]">
            {category === 'disciplinas'
              ? (icon?.imageSrc ? <img src={icon.imageSrc} alt={name} className="h-full w-full rounded-full object-cover" /> : Icon ? <Icon size={32} strokeWidth={2} /> : null)
              : <ClipboardList size={28} strokeWidth={2} />}
          </div>
          <h3 className="text-[18px] font-bold text-[#2D2D2D]">{name}</h3>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDetailTab('anotacoes')}
            className={`h-9 px-4 rounded-full text-[12px] font-bold transition-colors cursor-pointer ${detailTab === 'anotacoes' ? 'bg-[#F05D28] text-white' : 'border border-[#E5E7EB] bg-white text-[#64748B] hover:border-[#F7C7B7] hover:text-[#F05D28]'}`}
          >
            Anotações
          </button>
          <button
            type="button"
            onClick={() => setDetailTab('cronograma')}
            className={`h-9 px-4 rounded-full text-[12px] font-bold transition-colors cursor-pointer ${detailTab === 'cronograma' ? 'bg-[#F05D28] text-white' : 'border border-[#E5E7EB] bg-white text-[#64748B] hover:border-[#F7C7B7] hover:text-[#F05D28]'}`}
          >
            Cronograma
          </button>
        </div>

        <div className="mt-4">
          {detailTab === 'cronograma' ? (
            <CronogramaResumo activities={relevantActivities} contextLabel={category === 'disciplinas' ? 'os' : 'disciplina'} />
          ) : (
          <Anotacoes
            filter={category === 'disciplinas' ? { type: 'disciplina', value: selected } : { type: 'os', value: selected }}
            sheets={notes}
            osOptions={osOptions}
            disciplinaOptions={sortedDisciplinas}
            currentUser={currentUser}
            templates={templates}
            activities={allActivities}
            forcePublica={forcePublica}
            autoDisciplinaOs={autoDisciplinaOs}
            authorDisciplinaByEmail={authorDisciplinaByEmail}
            onSave={onSaveNote}
            onDelete={onDeleteNote}
            onSaveTemplate={onSaveTemplate}
            onDeleteTemplate={onDeleteTemplate}
          />
          )}
        </div>
      </div>
    );
  }

  // Notas: visao global, sem filtro de disciplina/OS - todas as suas notas + as publicas de outros.
  if (category === 'notas') {
    return (
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <button
          type="button"
          onClick={() => setCategory(null)}
          className="mb-5 flex h-9 items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#F7C7B7] hover:text-[#F05D28] cursor-pointer"
        >
          <ChevronLeft size={14} />
          Voltar
        </button>

        <h3 className="mb-4 text-[18px] font-bold text-[#2D2D2D]">Notas</h3>

        <Anotacoes
          filter={{ type: 'all' }}
          sheets={notes}
          osOptions={osOptions}
          disciplinaOptions={sortedDisciplinas}
          currentUser={currentUser}
          templates={templates}
          activities={allActivities}
          forcePublica={forcePublica}
          autoDisciplinaOs={autoDisciplinaOs}
            authorDisciplinaByEmail={authorDisciplinaByEmail}
          onSave={onSaveNote}
          onDelete={onDeleteNote}
          onSaveTemplate={onSaveTemplate}
          onDeleteTemplate={onDeleteTemplate}
        />
      </div>
    );
  }

  // Mapa Mental: grafo com todas as notas publicas + as privadas do proprio usuario.
  if (category === 'mapa') {
    return (
      <>
        <MindMap
          sheets={notes}
          currentUserEmail={currentUser.email}
          osOptions={sortedOs}
          onOpenNote={(sheet) => setMindMapOpenSheet(sheet)}
          onClose={() => { setCategory(null); setMindMapOpenSheet(null); }}
        />
        {mindMapOpenSheet && (
          <Anotacoes
            filter={{ type: 'disciplina', value: mindMapOpenSheet.disciplina }}
            sheets={notes}
            osOptions={osOptions}
            disciplinaOptions={sortedDisciplinas}
            currentUser={currentUser}
            templates={templates}
            activities={allActivities}
            onSave={onSaveNote}
            onDelete={onDeleteNote}
            onSaveTemplate={onSaveTemplate}
            onDeleteTemplate={onDeleteTemplate}
            controlledSheet={mindMapOpenSheet}
            onCloseControlled={() => setMindMapOpenSheet(null)}
          />
        )}
      </>
    );
  }

  // Nivel 2: grade de disciplinas ou de OS, dependendo da categoria escolhida.
  if (category) {
    return (
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <button
          type="button"
          onClick={() => { setCategory(null); setSearch(''); setContratoFiltro(''); }}
          className="mb-5 flex h-9 items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#F7C7B7] hover:text-[#F05D28] cursor-pointer"
        >
          <ChevronLeft size={14} />
          Voltar
        </button>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          {category === 'os' && (
            <select
              value={contratoFiltro}
              onChange={(event) => setContratoFiltro(event.target.value)}
              className="h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
            >
              <option value="">Todos os contratos</option>
              {contractOptions.map((contrato: { codigo: string; nome: string }) => (
                <option key={contrato.codigo} value={contrato.codigo}>{contrato.codigo} - {contrato.nome}</option>
              ))}
            </select>
          )}
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={category === 'disciplinas' ? 'Filtrar disciplinas...' : 'Filtrar OS...'}
              className="w-full h-11 rounded-xl border border-[#E5E7EB] bg-white pl-10 pr-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
            />
          </div>

          {category === 'os' && (
            <select
              value=""
              onChange={(event) => { if (event.target.value) setSelected(event.target.value); }}
              className="h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#2D2D2D] outline-none focus:border-[#F05D28]"
            >
              <option value="">Ir direto para uma OS...</option>
              {sortedOs.map((os) => (
                <option key={os.codigo} value={os.codigo}>{os.nome}</option>
              ))}
            </select>
          )}
        </div>

        {category === 'disciplinas' ? (
          sortedDisciplinas.length === 0 ? (
            <p className="text-[13px] text-[#757575]">Nenhuma disciplina cadastrada.</p>
          ) : filteredDisciplinas.length === 0 ? (
            <p className="text-[13px] text-[#757575]">Nenhuma disciplina encontrada para "{search}".</p>
          ) : (
            <div className="flex flex-wrap gap-5">
              {filteredDisciplinas.map((disciplina) => {
                const icon = getDisciplineIconInfo(disciplina);
                const name = getDisciplineDisplayName(disciplina);
                const Icon = icon.icon;
                return (
                  <button key={disciplina} type="button" onClick={() => setSelected(disciplina)} className={iconButtonClass}>
                    <div className={iconCircleClass} title={name}>
                      {icon.imageSrc ? <img src={icon.imageSrc} alt={name} className="h-full w-full rounded-full object-cover" /> : Icon ? <Icon size={40} strokeWidth={2} /> : null}
                    </div>
                    <p className="text-[11px] font-bold leading-tight text-[#2D2D2D]">{name}</p>
                  </button>
                );
              })}
            </div>
          )
        ) : (
          sortedOs.length === 0 ? (
            <p className="text-[13px] text-[#757575]">Nenhuma OS cadastrada.</p>
          ) : filteredOs.length === 0 ? (
            <p className="text-[13px] text-[#757575]">Nenhuma OS encontrada para "{search}".</p>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredOs.map((os) => (
                <button
                  key={os.codigo}
                  type="button"
                  onClick={() => setSelected(os.codigo)}
                  className="flex items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-left transition-colors hover:border-[#F7C7B7] hover:bg-[#FFF7F3] cursor-pointer"
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#F05D28] bg-white text-[#F05D28]">
                    <ClipboardList size={18} strokeWidth={2} />
                  </div>
                  <p className="truncate text-[13px] font-bold text-[#2D2D2D]">{os.nome}</p>
                </button>
              ))}
            </div>
          )
        )}
      </div>
    );
  }

  // Nivel 1: landing da aba Notes - tiles de entrada (Disciplinas, OS, Notas, Mapa Mental).
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
      <p className="mb-4 text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">Notas</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {!restrictToOs && (
          <button type="button" onClick={() => setCategory('disciplinas')} className={landingTileClass}>
            <div className={landingIconCircleClass}>
              <Layers size={22} strokeWidth={2} />
            </div>
            <span className="text-[13px] font-bold text-[#2D2D2D]">Disciplinas</span>
          </button>
        )}
        <button type="button" onClick={() => setCategory('os')} className={landingTileClass}>
          <div className={landingIconCircleClass}>
            <ClipboardList size={22} strokeWidth={2} />
          </div>
          <span className="text-[13px] font-bold text-[#2D2D2D]">Ordem de Serviço</span>
        </button>
        <button type="button" onClick={() => setCategory('notas')} className={landingTileClass}>
          <div className={landingIconCircleClass}>
            <StickyNote size={22} strokeWidth={2} />
          </div>
          <span className="text-[13px] font-bold text-[#2D2D2D]">Notas</span>
        </button>
        {!restrictToOs && (
          <button type="button" onClick={() => setCategory('mapa')} className={landingTileClass}>
            <div className={landingIconCircleClass}>
              <Network size={22} strokeWidth={2} />
            </div>
            <span className="text-[13px] font-bold text-[#2D2D2D]">Mapa Mental</span>
          </button>
        )}
      </div>
    </div>
  );
}
