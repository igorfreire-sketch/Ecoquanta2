# ACC: snapshot por OS e resumo agregado

Cada OS tem um snapshot em `accOs/{os}` com `os`, hash SHA-256 do JSON
normalizado, `updatedAt`, `sourceFile` (nome, messageId, data do email) e `json`
como string compacta. Isso evita uma escrita por problema e permite cache por
hash. A OS061 real gera 909.275 bytes de JSON; gravar issues individuais gastaria
1.298 escritas, em vez de um snapshot com poucos chunks.

Acima de 900.000 bytes de documento serializado, o documento vira um ponteiro
`chunked`, `chunkCount`, `byteLength`; `chunks/00000`, etc. contêm `index`, `value`,
`updatedAt`. Concatenar `value` e fazer JSON.parse recupera **o objeto completo**
do snapshot (e depois JSON.parse em `json` recupera os problemas). É o padrão de
`mutateFirebaseAppData`: chunks e ponteiro publicados atomicamente, com remoção
dos chunks obsoletos. O resumo usa a mesma representação quando necessário.

`accResumo/atual` guarda `osVersions`, empresas distintas e `totais` como mapa
`JSON.stringify([os,setor,tipo,empresa,status,mes]) -> quantidade`. A dimensão mês
vem de `criadoEm` em UTC. Cada combinação mantém todas as dimensões juntas, para
permitir filtros cruzados sem baixar todos os snapshots. Cadastro de empresas é
consultado em cada execução; sua classificação integra o hash dos problemas.
O contrato não fornece um campo de contrato separado: o consumidor resolve a
relação contrato/OS. Manual e cadastro ficam em coleções separadas.

Snapshot e resumo são publicados no mesmo commit REST. Hash igual não regrava
o snapshot; avisos ou erros novos ainda atualizam `ultimaImportacao` no resumo.
A versão mais recente por data do email prevalece, inclusive entre páginas do
histórico e retomadas. Linhas inválidas ficam na lista de erros; as demais são
importadas. Header obrigatório ausente rejeita o arquivo inteiro. `Coordination`
e `Design` são categorias conhecidas excluídas; valores desconhecidos e arquivos
sem Quality geram `ultimaImportacao.avisos`. Sem linhas válidas, preserva-se a OS
anterior. Códigos de setor desconhecidos são preservados e reportados.
O sufixo `(Removed)` é removido do nome de quem criou o problema.

## Datas verificadas

Os XLSX usam serial Excel 1900 com fração de dia. Não incluem timezone.
Dos pares Quality com fechamento, 1.026/1.039 na OS061 e 94/96 na OS068 têm
`Fechado - Atualizado` entre 3h e 3h+1s; os demais pares representam atualizações
distintas e não são usados para inferir offset. A linha 29 da OS068 tem diferença
de 3h+764ms. A decisão é interpretar fechamento como UTC e os demais timestamps
como UTC-03:00, emitindo ISO UTC. A fração de segundo do fechamento é preservada.
Essa é uma inferência dos valores exportados, não um timezone declarado no XML.

## Instalação pelo coordenador

Adicionar apenas `appsscript/ImportAcc.gs` ao projeto existente, preservando o
AgrupadorMRK original. O novo arquivo chama suas funções `extrairOs_`,
`extrairLinksDownload_` e `buscarDownloadAutodesk_`; não copia código ou destinatários.
Não muda marcadores nem dispara emails. Requer as autorizações Gmail, requisições
externas, propriedades e triggers do Apps Script.

Configurar `ACC_FIREBASE_SA` nas Script Properties com o JSON da conta de serviço.
Nunca copiar a credencial para o repositório. `ACC_DRY_RUN` ausente significa `true`;
somente o valor literal `false` permite escrita. `accTesteSimulacao()` força dry-run
e processa um lote do email mais recente, sem alterar Properties, triggers ou
Firestore. A consulta padrão exige assunto MRK e "was shared with you".
`ACC_GMAIL_QUERY` opcional restringe a busca; a diária usa últimos dois
dias. Histórico pagina todo o resultado. `ACC_MAX_WRITES` limita cada execução
(padrão 100, máximo 450, incluindo chunks e remoções); manter a agenda dentro da
cota diária do projeto. Não há instalação de agenda diária automática.
O coordenador deve agendar o trigger diário do importador **pelo menos uma hora
antes ou depois do trigger do agrupador original**.

`accImportarDiario()` inicia o lote diário; `accCargaHistorica()` inicia histórico;
`accContinuar_()` retoma a fila. `accStatus()` informa modo, fila e último resultado.
O importador não adquire o script lock compartilhado com o agrupador de emails.
`ACC_RUNNING` guarda timestamp e token da execução, com expiração de dez minutos;
esse sinalizador por propriedade é uma proteção cooperativa, não uma operação
atômica de mutex. Execução ocupada reagenda sem lançar erro. Só o dono remove seu
token. A continuação é recriada no `finally` sempre que há trabalho pendente e
não é ACC_DRY_RUN, inclusive após falhas de autenticação, leitura ou persistência.
Fila fragmentada em Script Properties, gravada em lote com `setProperties`, respeita
9 KB por valor, busca em páginas pequenas, prazo de processamento de 4 minutos
reserva tempo para persistência, três tentativas por item e trigger temporário
de um minuto, removido na retomada. Links repetidos usam um download por execução.
Erros resumidos ficam em `ACC_LAST`; relatório completo (contagens, tamanhos,
setores e tempos) fica no log. Limites muito baixos de escrita podem rejeitar uma
OS grande depois de três tentativas; aumentar o limite e reiniciar a carga.
Downloads são validados como XLSX antes do parser; o blob recebe `application/zip`
antes de `Utilities.unzip`. HTML, ZIP inválido e outros formatos retornam uma
mensagem de possível link Autodesk expirado.

O check local aceita os dois caminhos XLSX, sem copiar os arquivos. Com
`REQUIRE_SAMPLES=1`, ausência de qualquer amostra ou dos dois argumentos falha;
sem essa variável, amostras ausentes são explicitamente puladas.

Regras versionadas permitem leitura autenticada e vedam escrita cliente nos
snapshots e seus chunks. Nenhuma regra foi publicada, conta configurada,
execução remota feita, mensagem enviada ou dado de produção gravado nesta entrega.
As regras de `accEdicoes` permitem leitura/escrita autenticadas para os ajustes
da tela; o importador não lê nem grava essa coleção e os checks garantem isso.
