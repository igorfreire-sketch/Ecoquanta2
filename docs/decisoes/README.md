# Decisoes de arquitetura (ADR)

Registro das decisoes que o proximo agente/sessao herda. Sem isso, a mesma decisao e re-litigada do zero.

Regras (contrato: vault `Sistema/Protocolo de Engenharia.md` §3):
- Arquivo: `NNNN-titulo-kebab.md`. Numeracao sequencial e **imutavel**.
- ADR nunca e editado para mudar a conclusao. Reverter = ADR novo com `Status: Supersedes NNNN`.
- A secao **Consequencias** tem que dizer o que **piorou**. ADR que so lista vantagem e propaganda.
- Formato: MADR compacto (contexto, drivers, opcoes, decisao, consequencias, confirmacao).

| # | Titulo | Status | Impacto |
|---|---|---|---|
| [0001](0001-cept-acompanhamento-entregas-firestore.md) | CEPT — Acompanhamento de Entregas: porte do Apps Script para Firestore | Proposed | Collections `ceptComponentes` / `ceptValidacoes` / `appData/ceptResponsaveis`; alerta e rollup derivados no cliente; sem Cloud Function |
