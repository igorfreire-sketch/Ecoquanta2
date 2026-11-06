# R5 — inventário antes da alteração

## Chat removido

- `src/components/NaoConformidade2/ncStore.ts`: `hasUnreadNc2Chat` e `markNc2ChatSeen` usam `localStorage`; `observacoesHistorico` permanece apenas como dado legado.
- `src/components/NaoConformidade2/Revisoes.tsx`: estado/envio do chat, indicador `MessageCircle` e painel "Chat do card".
- `src/components/NaoConformidade2/Kanban.tsx`: estado/envio do chat, indicador, modal e marcação de leitura.
- `src/components/NaoConformidade2/Preenchimento.tsx`: edição de históricos do fluxo antigo deixa de ser oferecida na nova entrada manual.

## Integração Qualidade x setor removida

- `src/components/NaoConformidade2/Preenchimento.tsx`: cálculo de `correcaoOrigem`, `statusCorrecao`, `revisado` e encaminhamento para terceiro/conformidade.
- `src/components/NaoConformidade2/Revisoes.tsx`: confirmar/reabrir correção, textos de `correcaoOrigem`/`correcaoSetor` e ações por setor.
- `src/components/NaoConformidade2/Kanban.tsx`: seleção de itens de `outro_setor`, movimentação/conclusão por item e escrita em `nc2Records`.
- `src/components/NaoConformidade2/ncStore.ts`: helpers de transição continuam dispensáveis depois da troca das telas.
- `src/lib/bim360Import.ts`: importador legado grava `correcaoOrigem`; não será chamado pela nova tela ACC.

## Dados preservados

- Nenhum documento de `nc2Records` será apagado ou reescrito.
- Campos legados (`observacoesHistorico`, `correcaoOrigem`, `correcaoSetor`, `statusCorrecao`, C/T e Kanban) ficam intactos nos documentos antigos.
- Registros antigos continuam visíveis e contabilizados no Dashboard por uma conversão somente leitura para o modelo de Qualidade.
- Novas entradas são gravadas exclusivamente em `qualidadeManual`; issues importadas são somente leitura em `accOs`.
