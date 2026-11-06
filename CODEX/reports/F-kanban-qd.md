# STATUS

CONCLUÍDO LOCALMENTE. Cards originados no Quanta-Dash recebem destaque azul-bebê e tag; o kanban exibe KPIs de total, Ecoquanta e Quanta-Dash considerando somente cards não arquivados. Commit criado; push pendente por falta de autenticação GitHub neste PC.

# FILES_CHANGED

- `src/lib/feedbackReports.ts`: helper `isQuantaDashReport`.
- `src/lib/feedbackReports.check.ts`: casos de trim, caixa e origem Ecoquanta.
- `src/components/DemandasDigitais.tsx`: KPIs, destaque e tag Quanta-Dash.
- `CODEX/reports/kanban-qd.png`: evidência visual com fixture local, sem Firebase.
- `CODEX/reports/F-kanban-qd.md`: este relatório.

# DECISIONS

- Sem filtros existentes no kanban, os KPIs usam todos os cards não arquivados; demandas vindas de notas contam como Ecoquanta.
- Cores Quanta-Dash: fundo `#DBEEFF`, borda `#9CCBF2`; textos usados no fundo azul passam contraste WCAG AA (menor razão medida: 5,44:1).
- Fixture visual foi temporária e removida; nenhuma escrita no Firestore ou alteração de rules.
- Checks: `node --import tsx src/lib/feedbackReports.check.ts`, `npm run lint`, `node scripts/firestoreRules.check.mjs`, `npm run build` e `git diff --check` passaram; LOOK aprovado.

# BLOCKERS

`git push -u origin feat/kanban-quantadash-kpi` falhou porque o Git Credential Manager não possui credencial utilizável em modo não interativo; `gh` também está sem login e não há chave SSH local.
