import Cronogramas from '../../src/components/Cronogramas';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Anotacoes, { NoteProjectsContext, novaNotaBase, copiarNota, type AnnotationSheet } from '../../src/components/CoordenacaoEngenharia/Anotacoes';
import SolucoesDigitais from '../../src/components/SolucoesDigitais';
import type { CronogramaDoc } from '../../src/components/CronogramaGrid';
import { criarLinhaVazia } from '../../src/lib/cronoRow';
import { nextCronogramaTimestamp } from '../../src/lib/cronoRevision';
import '../../src/index.css';
const user = { nome: 'Fixture', email: 'fixture@example.test', isAdmin: true, disciplinas: ['BI - Solucoes Digitais'] };
const initial: CronogramaDoc = { id: 'fixture-project', titulo: 'Project local', autorEmail: user.email, autorNome: user.nome, publica: true, colunasCustom: [], rows: [1,2,3].map(n => ({ ...criarLinhaVazia(n), id: `row-${n}`, nome: `Tarefa ${n}` })), createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' };
const otherProject = { ...initial, id: 'fixture-other', titulo: 'Outro Project' };
function Fixture() {
 const [project, setProject] = useState<CronogramaDoc>(() => JSON.parse(localStorage.getItem('r4-project') || 'null') || initial);
 const [notes, setNotes] = useState<AnnotationSheet[]>(() => JSON.parse(localStorage.getItem('r4-notes') || 'null') || [{ ...novaNotaBase(user), id: 'fixture-note', titulo: 'Nota local', projectId: initial.id, linkedNoteIds: ['fixture-note-2'] }, { ...novaNotaBase(user), id: 'fixture-note-2', titulo: 'Nota vizinha', projectId: initial.id }]);
 const [mode, setMode] = useState('');
 const [projectSaveNotifications, setProjectSaveNotifications] = useState(0);
 const [newProject, setNewProject] = useState<CronogramaDoc | null>(null);
 const [note, setNote] = useState<AnnotationSheet | null>(null);
 async function save(doc: CronogramaDoc) {
   const current = JSON.parse(localStorage.getItem('r4-project') || 'null') || project;
   const saved = { ...doc, updatedAt: nextCronogramaTimestamp(doc.updatedAt, current.id === doc.id ? current.updatedAt : undefined, current.id !== doc.id, current.id === doc.id) };
   localStorage.setItem('r4-project', JSON.stringify(saved)); setProject(saved); return saved;
 }
 async function saveNote(sheet: AnnotationSheet) { setNotes(prev => { const next = [...prev.filter(n => n.id !== sheet.id), sheet]; localStorage.setItem('r4-notes', JSON.stringify(next)); return next; }); }
 const loadProject = React.useCallback(async (id: string) => {
   const stored = JSON.parse(localStorage.getItem('r4-project') || 'null') || project;
   if (id === otherProject.id) return otherProject;
   if (stored.id !== id) throw new Error('Project nao encontrado.');
   setProject(stored); return stored;
 }, [project.id]);
 return <NoteProjectsContext.Provider value={{ projects: [project, otherProject], onLoadProject: loadProject, onSaveProject: save, onCreateProject: async title => { const created = { ...initial, titulo: title }; setProject(created); return created; } }}>
   <button onClick={() => { setNote(notes[0]); setMode('note'); }}>Abrir nota fixture</button>
   <button onClick={() => { setNewProject(null); setMode('cronograma'); }}>Abrir cronograma fixture</button>
   <button onClick={() => { setNote(notes[1]); setMode('note'); }}>Abrir outra nota fixture</button>
   <button onClick={() => { setNote(copiarNota(notes[0], user)); setMode('note'); }}>Copiar nota fixture</button>
   <button onClick={() => { const newer = { ...project, updatedAt: new Date().toISOString(), rows: [...project.rows, { ...criarLinhaVazia(99), id: 'external', nome: 'Edição externa' }] }; localStorage.setItem('r4-project', JSON.stringify(newer)); setProject(newer); }}>Simular edição externa</button>
   <button onClick={() => { setNewProject({ ...initial, id: 'fixture-new', rows: [] }); setMode('cronograma'); }}>Novo cronograma fixture</button>
   <button onClick={() => { localStorage.setItem('r4-project', JSON.stringify(project)); setMode('cronogramas-screen'); }}>Tela Cronogramas fixture</button>
   <output aria-label="Atualizações do cache">{projectSaveNotifications}</output>
   {mode !== 'cronograma' && mode !== 'cronogramas-screen' && <Anotacoes filter={{ type: 'all' }} sheets={notes} osOptions={[]} disciplinaOptions={[]} currentUser={user} usuarios={[user]} onSave={saveNote} onDelete={async () => {}} controlledSheet={note} onCloseControlled={() => { setNote(null); setMode(''); }} />}
   {mode === 'cronogramas-screen' && <Cronogramas currentUser={user} usuarios={[user]} notes={notes} onProjectSaved={(saved) => { setProject(saved); setProjectSaveNotifications(value => value + 1); }} />}
   {mode === 'cronograma' && <SolucoesDigitais cronograma={newProject || project} currentUser={user} usuarios={[user]} notes={notes} onSaveNote={saveNote} onSaveProject={save} onVoltar={() => setMode('')} />}
 </NoteProjectsContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
