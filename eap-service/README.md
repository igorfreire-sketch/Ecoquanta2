# Importação de EAP do Microsoft Project

Em **Planejamento → Atualização EAP**, selecione ou arraste um ou vários arquivos `.mpp`. O serviço autentica o usuário e usa MPXJ para extrair as 19 colunas da EAP. A conversão devolve dados à tela, sem gravar o `.mpp` no Firebase. O arquivo temporário é apagado após a leitura.

Cada arquivo tem uma OS própria, com opção de criar uma nova. A tela mostra a prévia em tabela. Ao clicar **OK, publicar EAPs conferidas**, envia somente as tarefas estruturadas em partes ao Firestore e publica uma versão por OS. A publicação do lote é sequencial: cada arquivo mostra sucesso ou erro individual; não há transação única entre todas as OS.

O serviço aceita `.mpp` de até 30 MB e 25.000 tarefas, abaixo do limite de [32 MiB por requisição HTTP/1 do Cloud Run](https://docs.cloud.google.com/run/quotas). O arquivo de exemplo `Arquivo Modelo_25_cidade da segurança.mpp` tem cerca de 10 MB.

## Configuração antes de publicar

1. Provisionar Cloud Run no mesmo projeto Firebase com conta de serviço dedicada e acesso mínimo ao Firestore. O Dockerfile inclui Python, Java 21 e MPXJ.
2. Definir `EAP_EDITOR_EMAILS` com os e-mails Google autorizados e `EAP_ALLOWED_ORIGINS` com a origem exata do site.
3. Publicar `firestore.rules` e definir `VITE_EAP_API_URL` com a URL HTTPS do serviço antes de reconstruir o frontend.
4. Configurar TTL para `eapPreviews.expiresAt` e limpeza das subcoleções `chunks` de prévias órfãs. O TTL do Firestore não apaga subcoleções automaticamente.
5. Validar em homologação: nova OS, OS existente, lote, arrastar e soltar, conta não autorizada, conflito de versão e releitura após publicação.

### Alternativa gratuita: Render

O `render.yaml` da raiz cria um Web Service Docker gratuito apenas para converter `.mpp`; a publicação usa a sessão Firebase do próprio usuário. Na primeira configuração, informe `EAP_EDITOR_EMAILS` no painel. O plano gratuito tem 512 MB e dorme após 15 minutos sem acesso; por isso o primeiro `.mpp` pode levar cerca de um minuto.

Exemplo de implantação, após configurar projeto, região e conta de serviço:

```powershell
gcloud run deploy ecoquanta-eap --source . --region REGIAO --project PROJETO --service-account CONTA_DE_SERVICO --allow-unauthenticated --memory 2Gi --concurrency 1 --timeout 900 --set-env-vars EAP_EDITOR_EMAILS=EMAIL_AUTORIZADO,EAP_ALLOWED_ORIGINS=https://ecoquanta2.pages.dev
```

`--allow-unauthenticated` libera a entrada HTTP do Cloud Run; cada operação ainda exige um ID token Firebase válido e um e-mail autorizado.

## Validação atual

O conversor local leu o arquivo `.mpp` de exemplo e extraiu 1.573 linhas de 19 colunas. O fluxo completo ainda precisa ser exercitado no Firebase de homologação. As séries históricas da Curva S não são recalculadas automaticamente.

Referências: [MPXJ e arquivos MPP](https://www.mpxj.org/howto-read-mpp/), [limites do Cloud Run](https://docs.cloud.google.com/run/quotas), [limite por documento Firestore](https://firebase.google.com/docs/firestore/quotas), [transações Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions).
