# Demandas Digitais: contrato e acesso

`feedbackReports` é uma coleção nova e independente. Ela não reutiliza nem altera
`cronogramas`, `solucoesDigitaisCronograma`, Project ou as telas antigas de
Soluções Digitais.

## Contrato seguro

Cada documento contém apenas:

- `kind`: `bug` ou `idea`;
- `route` (obrigatório, no máximo 500 caracteres);
- `targetToken` opcional, opaco e gerado pela aplicação (no máximo 200);
- `xRatio`/`yRatio` opcionais, números entre 0 e 1;
- `title` opcional (no máximo 200) e `body` opcional (no máximo 5.000);
- `status`: `new`, `triage`, `planned`, `doing`, `done` ou `archived`;
- `authorUid`, `authorEmail`, `createdAt` e `updatedAt`.

O seletor nunca deve enviar DOM, HTML, screenshot, texto de campos, cookies,
tokens, credenciais ou qualquer outro dado pessoal/secreto. As regras rejeitam
campos extras e limitam tipos/tamanhos, mas não conseguem detectar PII ou segredo
dentro de texto livre; essa validação continua sendo responsabilidade da UI e da
moderação.

## Regras de acesso

- usuário aprovado: cria e lê somente documentos cujo `authorUid` é o próprio UID;
- administrador: lê todos e pode alterar somente `status` e `updatedAt`;
- ninguém pelo cliente pode excluir um documento.

O bloqueio de aprovação usa `siteUsers/{uid}.status == "approved"` e também
respeita `banido`. Isso é uma escolha conservadora: o login legado mantém sua
lista em `appData/auth` (um snapshot com arrays/objetos), e o Firestore Rules não
tem uma operação segura para localizar e validar um usuário dentro desse formato.
Portanto, uma conta aprovada apenas no snapshot legado não terá acesso a esta nova
coleção até existir o respectivo `siteUsers/{uid}` aprovado. Não se deve interpretar
isso como prova de que todas as abas antigas estão protegidas pelas mesmas regras;
as regras legadas foram preservadas fora deste contrato.

## Usuários duplicados

`canonicalizeEmail` aplica somente `trim().toLowerCase()`, o mesmo critério básico
usado pelo app. `findDuplicateCanonicalEmails` é um diagnóstico somente leitura:
agrupa contas com a mesma chave e não escolhe, apaga ou altera nenhuma conta.
Não são aplicadas normalizações específicas de Gmail (pontos ou `+alias`), pois
elas podem unir contas legítimas. A decisão de consolidar duplicatas continua
manual/admin e não altera o armazenamento de autenticação nesta etapa.

## Serviço

`src/lib/feedbackReports.ts` expõe `createFeedbackReport`, `listFeedbackReports`
e `subscribeFeedbackReports` (também `create`, `list` e `subscribe`). O serviço
deriva UID/e-mail da sessão Firebase verificada e nunca aceita `authorUid` ou
`authorEmail` do formulário. A listagem comum usa filtro pelo próprio UID; a
listagem completa deve ser usada apenas pela tela administrativa. Como o helper
Firebase compartilhado não expõe `onSnapshot` com filtro, usuários comuns usam
polling de 30 segundos; administradores usam snapshot da coleção e as regras
continuam sendo a autoridade final.
