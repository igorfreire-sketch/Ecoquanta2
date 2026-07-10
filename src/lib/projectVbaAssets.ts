// Conteúdo dos dois arquivos disponibilizados no botão "Baixar Configuração Project"
// (aba Administração > Gerenciamento). Mantenha PROJECT_VBA_SCRIPT sincronizado com
// Project/code.txt sempre que o script VBA for alterado.

import JSZip from 'jszip';

export const PROJECT_VBA_SCRIPT = String.raw`' ============================================================================
' PublicarEapNoFirebase.bas
' Macro do Microsoft Project que publica as tarefas do arquivo aberto
' diretamente no Firestore (appData/eap), sem passar pela planilha Google
' "eapunificada" e sem passar pelo Apps Script.
'
' IMPORTANTE: o documento appData/eap hoje e gravado pelo Apps Script no
' formato "chunked" (o JSON e grande demais pra caber em um unico campo do
' Firestore, entao ele e dividido em pedacos de texto salvos em
' appData/eap/chunks/00000, 00001, ...). Este script LE e ESCREVE nesse
' mesmo formato, pra continuar 100% compativel com o que o site ja le hoje
' (ver src/lib/firebaseDb.ts, readChunkedAppData). Nao mude esse formato sem
' atualizar o site tambem.
'
' O que este script faz:
'   1. Le todas as tarefas do arquivo Project aberto. O codigo EAP (ex.
'      "1.2.3") vem do campo customizado CAMPO_CODIGO_EAP, NAO do numero
'      de topico (OutlineNumber) do Project. Motivo: o OutlineNumber e
'      calculado pela posicao da tarefa dentro do arquivo ABERTO — se cada
'      pessoa publica so a OS dela (sem as demais OS/contratos do arquivo),
'      o Project renumera a partir de 1 e o codigo gerado nao bate mais com
'      o esquema oficial contrato.OS.item. Um campo customizado preenchido
'      manualmente com o codigo fixo nao tem esse problema.
'   2. Baixa o appData/eap atual (reconstruindo os chunks).
'   3. No campo "atual" do payload, remove APENAS as OS que aparecem neste
'      arquivo (contrato.OS, ex. "1.2") e adiciona as tarefas deste arquivo
'      no lugar. OS de outros arquivos Project (de outras pessoas) ficam
'      intocadas.
'   4. Reescreve o documento (chunked) no Firestore.
'
' ESCOPO REAL (importante entender antes de usar):
' O documento appData/eap tem DOIS campos de linhas, e eles NAO sao a mesma
' coisa: "atual" (~850 linhas, uma por item/tarefa) e "cronograma" (~10 mil
' linhas, arvore completa com nos mensais tipo "Mes 1", baseline,
' predecessor — usada pelo Cronograma, pela Curva S e pelo seletor de
' OS/contrato do site). Este script SO toca em "atual". "cronograma" fica
' 100% intocado de proposito: sobrescreve-lo com as linhas simples do
' Project destruiria a arvore mensal/baseline de todo mundo.
' Efeito pratico: a aba Atividades (cards de atividade, LOD, progresso)
' passa a refletir o que foi publicado por aqui. O seletor de OS/contrato,
' o Cronograma e a Curva S continuam vindo de "cronograma" — nao mudam
' ate alguem migrar aquela parte tambem (e essa parte tem logica bem mais
' complexa no Apps Script, nao foi reimplementada aqui).
' Fora do escopo tambem: "idealProgress" de cada tarefa fica em branco (nao
' ha campo nativo equivalente no Project mapeado ainda), edificioPorItem,
' reajustado — nenhum desses e tocado.
'
' DEPENDENCIA OBRIGATORIA: modulo VBA-JSON (JsonConverter.bas), de
' https://github.com/VBA-tools/VBA-JSON — copie o arquivo desse repositorio
' como um modulo novo chamado "JsonConverter" no mesmo projeto VBA. Sem
' isso, ParseJson/ConvertToJson (usados abaixo) nao existem.
'
' Referencias necessarias (Editor VBA > Ferramentas > Referencias):
'   - Microsoft Scripting Runtime
'   - Microsoft WinHTTP Services, version 5.1
'
' Veja TUTORIAL-PublicarEapNoFirebase.txt para o passo a passo de instalacao, configuracao e testes.
' ============================================================================

Option Explicit

' ---- CONFIGURACAO ----------------------------------------------------------
Const FIREBASE_API_KEY As String = "AIzaSyCGJ4UHPGyaf1GqayvTXUhvn3eLdu9ZW9g"
Const FIREBASE_PROJECT_ID As String = "ecoquanta-c2720"
Const CHUNK_SIZE As Long = 750000   ' igual ao FIREBASE_APPDATA_CHUNK_SIZE do Apps Script
' Campo customizado do Project usado para a disciplina de cada tarefa.
' Troque para o campo que sua equipe usa (Text1, Text2, Number1, etc).
Const CAMPO_DISCIPLINA As String = "Text1"
' Campo customizado do Project que guarda o codigo EAP FIXO de cada tarefa
' (ex. "1.4.2"), preenchido manualmente pela equipe. OBRIGATORIO quando o
' arquivo Project contem so uma parte das OS (nao a arvore inteira) — nesse
' caso o numero de topico do Project nao pode ser usado como codigo (ver
' comentario no topo do arquivo). Use um campo de texto ainda nao ocupado
' pela disciplina (CAMPO_DISCIPLINA acima).
Const CAMPO_CODIGO_EAP As String = "Text2"
' -----------------------------------------------------------------------------

Sub PublicarEapNoFirebase()
    On Error GoTo TratarErro

    Dim linhas As Collection
    Dim puladasSemCodigo As Long
    Set linhas = ColetarLinhasDoProject(puladasSemCodigo)

    If linhas.Count = 0 Then
        If puladasSemCodigo > 0 Then
            MsgBox puladasSemCodigo & " tarefa(s) tem nome preenchido mas nao tem o campo '" & _
                CAMPO_CODIGO_EAP & "' com o codigo EAP (ex: 1.4.2). Preencha o codigo em cada " & _
                "tarefa antes de publicar.", vbExclamation
        Else
            MsgBox "Nenhuma tarefa com codigo EAP valido foi encontrada neste arquivo.", vbExclamation
        End If
        Exit Sub
    End If

    Application.StatusBar = BarraDeProgresso(25, "Autenticando no Firebase...")
    Dim idToken As String
    idToken = AutenticarAnonimo()

    Application.StatusBar = BarraDeProgresso(50, "Baixando appData/eap atual...")
    Dim payloadAtual As Object
    Set payloadAtual = BaixarPayloadEap(idToken)

    Dim chunkCountAntigo As Long
    chunkCountAntigo = ContarChunksAtuais(idToken)

    Application.StatusBar = BarraDeProgresso(75, "Mesclando linhas (" & linhas.Count & " tarefas)...")
    Dim mesclado As Object
    Set mesclado = MesclarLinhas(payloadAtual, linhas)

    Application.StatusBar = BarraDeProgresso(90, "Salvando no Firebase...")
    Dim jsonTexto As String
    jsonTexto = JsonConverter.ConvertToJson(mesclado)
    PublicarPayloadChunked idToken, jsonTexto, chunkCountAntigo

    Application.StatusBar = BarraDeProgresso(100, "Concluido - " & linhas.Count & " tarefa(s) publicada(s).")
    Dim mensagemFinal As String
    mensagemFinal = linhas.Count & " tarefa(s) publicada(s) em appData/eap com sucesso."
    If puladasSemCodigo > 0 Then
        mensagemFinal = mensagemFinal & vbCrLf & vbCrLf & "Aviso: " & puladasSemCodigo & _
            " tarefa(s) com nome preenchido foram IGNORADAS por nao terem codigo EAP no campo '" & _
            CAMPO_CODIGO_EAP & "'."
    End If
    MsgBox mensagemFinal, vbInformation
    Application.StatusBar = False
    Exit Sub

TratarErro:
    Application.StatusBar = False
    MsgBox "Falha ao publicar no Firebase:" & vbCrLf & Err.Description, vbCritical
End Sub

' Monta uma barra de progresso em texto (ex: "[■■■■■■■■■■----------] 50%  Baixando...")
' pra exibir na Application.StatusBar do Project — nao ha controle nativo de barra
' de progresso grafica no VBA do Project sem depender de um OCX extra (fragil de
' instalar em maquinas diferentes), entao a barra em texto e a forma mais simples
' e portavel de dar feedback visual claro do andamento.
Function BarraDeProgresso(percentual As Long, texto As String) As String
    Const TOTAL_BLOCOS As Long = 20
    Dim preenchidos As Long
    preenchidos = CLng(TOTAL_BLOCOS * percentual / 100)
    Dim barra As String
    barra = String(preenchidos, ChrW(9632)) & String(TOTAL_BLOCOS - preenchidos, "-")
    BarraDeProgresso = "[" & barra & "] " & percentual & "%  " & texto
End Function

' ---- 1) COLETA DAS TAREFAS DO PROJECT ---------------------------------------
' Cada linha vira uma Collection posicional identica ao formato que o Apps
' Script ja publica: [codigo, nome, progress, duration, plannedStart,
' plannedEnd, idealProgress, disciplina]. idealProgress fica em branco (v1).

' puladasSemCodigo (ByRef) conta tarefas com nome preenchido mas sem o campo
' CAMPO_CODIGO_EAP preenchido — usado pra avisar o usuario no final, em vez
' de essas tarefas simplesmente sumirem sem explicacao.
Function ColetarLinhasDoProject(ByRef puladasSemCodigo As Long) As Collection
    Dim resultado As New Collection
    Dim tsk As Task
    puladasSemCodigo = 0

    For Each tsk In ActiveProject.Tasks
        If Not tsk Is Nothing Then
            Dim codigo As String
            codigo = Trim(ObterCampoTexto(tsk, CAMPO_CODIGO_EAP))
            Dim temNome As Boolean
            temNome = Len(Trim(tsk.Name)) > 0

            If Len(codigo) > 0 And temNome Then
                Dim linha As New Collection
                linha.Add codigo                                  ' 1: codigo
                linha.Add tsk.Name                                 ' 2: nome
                linha.Add Round(tsk.PercentComplete / 100, 4)      ' 3: progress
                ' Assume calendario padrao de 8h/dia. Ajuste o divisor (480
                ' minutos) se o calendario do projeto usar outra jornada.
                linha.Add Round(tsk.Duration / 480, 2)             ' 4: duration
                linha.Add Format(tsk.Start, "yyyy-mm-dd")          ' 5: plannedStart
                linha.Add Format(tsk.Finish, "yyyy-mm-dd")         ' 6: plannedEnd
                linha.Add ""                                        ' 7: idealProgress (fora de escopo v1)
                linha.Add ObterCampoTexto(tsk, CAMPO_DISCIPLINA)   ' 8: disciplina

                resultado.Add linha
            ElseIf Len(codigo) = 0 And temNome Then
                puladasSemCodigo = puladasSemCodigo + 1
            End If
        End If
    Next tsk

    Set ColetarLinhasDoProject = resultado
End Function

Function ObterCampoTexto(tsk As Task, nomeCampo As String) As String
    On Error Resume Next
    ObterCampoTexto = CStr(CallByName(tsk, nomeCampo, VbGet))
    If Err.Number <> 0 Then ObterCampoTexto = ""
    On Error GoTo 0
End Function

' FERRAMENTA DE DESCOBERTA (rode uma vez, nao faz parte da publicacao):
' clique numa linha do Gantt cujo codigo EAP voce ja conhece (ex: a coluna
' "D" mostrando "2.2") e rode esta macro. Ela mostra o valor de todos os
' campos de texto customizados (Text1 a Text30) daquela tarefa, pra voce
' identificar qual campo tecnico corresponde a coluna "D" e usar esse nome
' na constante CAMPO_CODIGO_EAP no topo do modulo.
Sub DescobrirCampoDoCodigoEap()
    On Error Resume Next
    Dim qtdSelecionadas As Long
    qtdSelecionadas = ActiveSelection.Tasks.Count
    On Error GoTo 0

    If qtdSelecionadas = 0 Then
        MsgBox "Selecione (clique) uma linha de tarefa no Gantt antes de rodar esta macro.", vbExclamation
        Exit Sub
    End If

    Dim tsk As Task
    Set tsk = ActiveSelection.Tasks(1)

    Dim resultado As String
    resultado = "Tarefa selecionada: " & tsk.Name & vbCrLf & vbCrLf & _
        "Campos de texto customizados com valor preenchido:" & vbCrLf

    Dim i As Integer
    Dim encontrouAlgum As Boolean
    For i = 1 To 30
        Dim nomeCampo As String
        nomeCampo = "Text" & i
        Dim valor As String
        valor = ObterCampoTexto(tsk, nomeCampo)
        If Len(valor) > 0 Then
            resultado = resultado & nomeCampo & " = " & valor & vbCrLf
            encontrouAlgum = True
        End If
    Next i

    If Not encontrouAlgum Then
        resultado = resultado & "(nenhum campo Text1-Text30 preenchido nesta tarefa)"
    End If

    MsgBox resultado, vbInformation
End Sub

' Retorna "contrato.OS" (os dois primeiros segmentos do codigo).
Function CodigoParaOs(codigo As String) As String
    Dim partes() As String
    partes = Split(codigo, ".")
    If UBound(partes) >= 1 Then
        CodigoParaOs = partes(0) & "." & partes(1)
    Else
        CodigoParaOs = codigo
    End If
End Function

' ---- 2) AUTENTICACAO ANONIMA -------------------------------------------------

Function AutenticarAnonimo() As String
    Dim url As String
    url = "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" & FIREBASE_API_KEY

    Dim resposta As String
    Dim status As Long
    resposta = EnviarRequisicaoHttp("POST", url, "{""returnSecureToken"":true}", "", status)

    Dim json As Object
    Set json = JsonConverter.ParseJson(resposta)
    AutenticarAnonimo = json("idToken")
End Function

' ---- 3) LEITURA DO DOCUMENTO ATUAL (formato chunked) ------------------------

' Baixa e reconstroi o payload atual (Dictionary/Collection do VBA-JSON).
' Se o documento nao existir ainda, devolve um Dictionary vazio.
Function BaixarPayloadEap(idToken As String) As Object
    Dim urlDoc As String
    urlDoc = "https://firestore.googleapis.com/v1/projects/" & FIREBASE_PROJECT_ID & _
             "/databases/(default)/documents/appData/eap"

    Dim status As Long
    Dim resposta As String
    resposta = EnviarRequisicaoHttp("GET", urlDoc, "", idToken, status)

    If status = 404 Then
        Set BaixarPayloadEap = CreateObject("Scripting.Dictionary")
        Exit Function
    End If

    Dim doc As Object
    Set doc = JsonConverter.ParseJson(resposta)

    If Not doc.Exists("fields") Then
        Set BaixarPayloadEap = CreateObject("Scripting.Dictionary")
        Exit Function
    End If

    Dim campos As Object
    Set campos = doc("fields")

    Dim textoJson As String

    If campos.Exists("chunked") Then
        textoJson = BaixarTextoDosChunks(idToken)
    ElseIf campos.Exists("dataJson") Then
        textoJson = campos("dataJson")("stringValue")
    ElseIf campos.Exists("data") Then
        Err.Raise vbObjectError + 2, , _
            "appData/eap esta no formato 'data' (objeto), que este script nao le. " & _
            "Publique uma vez pelo Apps Script antes de usar esta macro, ou peça ajuste do script."
    Else
        textoJson = "{}"
    End If

    If Len(Trim(textoJson)) = 0 Then textoJson = "{}"
    Set BaixarPayloadEap = JsonConverter.ParseJson(textoJson)
End Function

Function BaixarTextoDosChunks(idToken As String) As String
    Dim url As String
    url = "https://firestore.googleapis.com/v1/projects/" & FIREBASE_PROJECT_ID & _
          "/databases/(default)/documents/appData/eap/chunks"

    Dim status As Long
    Dim resposta As String
    resposta = EnviarRequisicaoHttp("GET", url, "", idToken, status)

    If status = 404 Then
        BaixarTextoDosChunks = "{}"
        Exit Function
    End If

    Dim corpo As Object
    Set corpo = JsonConverter.ParseJson(resposta)

    If Not corpo.Exists("documents") Then
        BaixarTextoDosChunks = "{}"
        Exit Function
    End If

    ' Os nomes dos documentos (.../chunks/00000, 00001, ...) ja ordenam
    ' corretamente em ordem alfabetica por causa do zero-padding.
    Dim nomes() As String
    Dim valores As Object
    Set valores = CreateObject("Scripting.Dictionary")

    Dim d As Variant
    Dim listaNomes As New Collection
    For Each d In corpo("documents")
        Dim nomeCompleto As String
        nomeCompleto = d("name")
        valores.Add nomeCompleto, d("fields")("value")("stringValue")
        listaNomes.Add nomeCompleto
    Next d

    Dim arranjo() As String
    ReDim arranjo(listaNomes.Count - 1)
    Dim i As Long
    For i = 1 To listaNomes.Count
        arranjo(i - 1) = listaNomes(i)
    Next i
    OrdenarTexto arranjo

    Dim textoFinal As String
    For i = 0 To UBound(arranjo)
        textoFinal = textoFinal & valores(arranjo(i))
    Next i

    BaixarTextoDosChunks = textoFinal
End Function

Sub OrdenarTexto(arr() As String)
    Dim i As Long, j As Long
    Dim temp As String
    For i = LBound(arr) To UBound(arr) - 1
        For j = i + 1 To UBound(arr)
            If arr(j) < arr(i) Then
                temp = arr(i): arr(i) = arr(j): arr(j) = temp
            End If
        Next j
    Next i
End Sub

Function ContarChunksAtuais(idToken As String) As Long
    Dim url As String
    url = "https://firestore.googleapis.com/v1/projects/" & FIREBASE_PROJECT_ID & _
          "/databases/(default)/documents/appData/eap/chunks"

    Dim status As Long
    Dim resposta As String
    resposta = EnviarRequisicaoHttp("GET", url, "", idToken, status)

    If status = 404 Then
        ContarChunksAtuais = 0
        Exit Function
    End If

    Dim corpo As Object
    Set corpo = JsonConverter.ParseJson(resposta)
    If corpo.Exists("documents") Then
        ContarChunksAtuais = corpo("documents").Count
    Else
        ContarChunksAtuais = 0
    End If
End Function

' ---- 4) MESCLA: substitui so as OS presentes neste arquivo, preserva o resto -

Function MesclarLinhas(payloadAtual As Object, novasLinhas As Collection) As Object
    Dim osNesteArquivo As Object
    Set osNesteArquivo = CreateObject("Scripting.Dictionary")

    Dim linha As Variant
    For Each linha In novasLinhas
        osNesteArquivo(CodigoParaOs(linha(1))) = True
    Next linha

    Dim atualMesclado As New Collection
    If payloadAtual.Exists("atual") Then
        Dim linhaExistente As Variant
        For Each linhaExistente In payloadAtual("atual")
            If Not osNesteArquivo.Exists(CodigoParaOs(linhaExistente(1))) Then
                atualMesclado.Add linhaExistente
            End If
        Next linhaExistente
    End If

    For Each linha In novasLinhas
        atualMesclado.Add linha
    Next linha

    ' Preserva qualquer outro campo que ja exista no documento (curvaS,
    ' timeline, reajustado, registro, edificioPorItem etc.) e so
    ' sobrescreve atual/cronograma/dates/latestEap*.
    Dim resultado As Object
    Set resultado = CreateObject("Scripting.Dictionary")
    Dim chave As Variant
    For Each chave In payloadAtual.Keys
        resultado.Add chave, payloadAtual(chave)
    Next chave

    ' So mexe em "atual". NAO tocar em "cronograma": e uma arvore bem mais
    ' rica (inclui nos mensais tipo "Mes 1", baseline, predecessor) usada
    ' pelo Cronograma/Curva S e pelo seletor de OS/contrato do site, e
    ' sobrescreve-la com as linhas simples do Project destruiria dados de
    ' todo mundo. Ver TUTORIAL-PublicarEapNoFirebase.txt.
    resultado("atual") = atualMesclado

    Dim datas As Object
    If resultado.Exists("dates") Then
        Set datas = resultado("dates")
    Else
        Set datas = New Collection
    End If
    Dim hoje As String
    hoje = Format(Now, "yyyy-mm-dd")
    Dim jaTemHoje As Boolean
    jaTemHoje = False
    Dim d As Variant
    For Each d In datas
        If d = hoje Then jaTemHoje = True
    Next d
    If Not jaTemHoje Then datas.Add hoje
    resultado("dates") = datas
    resultado("latestEapDate") = hoje
    resultado("latestEapPublishedAt") = hoje & "T" & Format(Now, "hh:mm:ss")
    resultado("latestEapSheet") = "MS Project (VBA)"

    Set MesclarLinhas = resultado
End Function

' ---- 5) ESCRITA NO FIRESTORE (formato chunked) ------------------------------

Sub PublicarPayloadChunked(idToken As String, jsonTexto As String, chunkCountAntigo As Long)
    Dim chunks As Collection
    Set chunks = DividirEmPedacos(jsonTexto, CHUNK_SIZE)

    ' 1) grava cada chunk novo
    Dim i As Long
    For i = 1 To chunks.Count
        GravarChunk idToken, i - 1, chunks(i)
    Next i

    ' 2) apaga chunks antigos que sobraram (payload novo ficou menor)
    For i = chunks.Count To chunkCountAntigo - 1
        ApagarChunk idToken, i
    Next i

    ' 3) atualiza o documento principal
    Dim url As String
    url = "https://firestore.googleapis.com/v1/projects/" & FIREBASE_PROJECT_ID & _
          "/databases/(default)/documents/appData/eap" & _
          "?updateMask.fieldPaths=chunked&updateMask.fieldPaths=chunkCount" & _
          "&updateMask.fieldPaths=byteLength&updateMask.fieldPaths=source" & _
          "&updateMask.fieldPaths=updatedAt"

    Dim corpo As Object
    Set corpo = CreateObject("Scripting.Dictionary")
    Dim campos As Object
    Set campos = CreateObject("Scripting.Dictionary")
    campos.Add "chunked", CampoBooleano(True)
    campos.Add "chunkCount", CampoNumero(chunks.Count)
    campos.Add "byteLength", CampoNumero(Len(jsonTexto))
    campos.Add "source", CampoTexto("MSProjectVBA")
    campos.Add "updatedAt", CampoTimestamp()
    corpo.Add "fields", campos

    Dim status As Long
    EnviarRequisicaoHttp "PATCH", url, JsonConverter.ConvertToJson(corpo), idToken, status
End Sub

Function DividirEmPedacos(texto As String, tamanho As Long) As Collection
    Dim resultado As New Collection
    Dim i As Long
    If Len(texto) = 0 Then
        resultado.Add ""
    Else
        For i = 1 To Len(texto) Step tamanho
            resultado.Add Mid(texto, i, tamanho)
        Next i
    End If
    Set DividirEmPedacos = resultado
End Function

Sub GravarChunk(idToken As String, indice As Long, texto As String)
    Dim docId As String
    docId = Right("00000" & indice, 5)

    Dim url As String
    url = "https://firestore.googleapis.com/v1/projects/" & FIREBASE_PROJECT_ID & _
          "/databases/(default)/documents/appData/eap/chunks/" & docId

    Dim corpo As Object
    Set corpo = CreateObject("Scripting.Dictionary")
    Dim campos As Object
    Set campos = CreateObject("Scripting.Dictionary")
    campos.Add "index", CampoNumero(indice)
    campos.Add "value", CampoTexto(texto)
    campos.Add "updatedAt", CampoTimestamp()
    corpo.Add "fields", campos

    Dim status As Long
    EnviarRequisicaoHttp "PATCH", url, JsonConverter.ConvertToJson(corpo), idToken, status
End Sub

Sub ApagarChunk(idToken As String, indice As Long)
    On Error Resume Next
    Dim docId As String
    docId = Right("00000" & indice, 5)
    Dim url As String
    url = "https://firestore.googleapis.com/v1/projects/" & FIREBASE_PROJECT_ID & _
          "/databases/(default)/documents/appData/eap/chunks/" & docId
    Dim status As Long
    EnviarRequisicaoHttp "DELETE", url, "", idToken, status
    On Error GoTo 0
End Sub

' ---- Helpers de campo tipado do Firestore (so os tipos que usamos aqui) ----

Function CampoTexto(v As String) As Object
    Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
    d.Add "stringValue", v
    Set CampoTexto = d
End Function

Function CampoNumero(v As Double) As Object
    Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
    d.Add "doubleValue", v
    Set CampoNumero = d
End Function

Function CampoBooleano(v As Boolean) As Object
    Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
    d.Add "booleanValue", v
    Set CampoBooleano = d
End Function

Function CampoTimestamp() As Object
    Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
    d.Add "timestampValue", Format(Now, "yyyy-mm-ddTHH:mm:ss") & "Z"
    Set CampoTimestamp = d
End Function

' ---- 6) HTTP -----------------------------------------------------------------

Function EnviarRequisicaoHttp(metodo As String, url As String, corpo As String, _
    Optional idToken As String = "", Optional ByRef statusOut As Long = 0) As String

    Dim http As Object
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")

    http.Open metodo, url, False
    http.SetRequestHeader "Content-Type", "application/json"
    If Len(idToken) > 0 Then http.SetRequestHeader "Authorization", "Bearer " & idToken

    If Len(corpo) > 0 Then
        http.Send corpo
    Else
        http.Send
    End If

    statusOut = http.Status

    If http.Status >= 200 And http.Status < 300 Then
        EnviarRequisicaoHttp = http.ResponseText
    ElseIf http.Status = 404 Then
        EnviarRequisicaoHttp = http.ResponseText
    Else
        Err.Raise vbObjectError + 1, , "HTTP " & http.Status & ": " & http.ResponseText
    End If
End Function
`;

export const PROJECT_VBA_TUTORIAL = String.raw`TUTORIAL DE INSTALAÇÃO E USO — PUBLICAÇÃO DA EAP DO MS PROJECT NO FIREBASE
============================================================================
Sistema: EcoQuanta | Recurso: Macro VBA "PublicarEapNoFirebase"
Arquivo complementar necessário: PublicarEapNoFirebase.txt (contém o código
do script, referido a seguir apenas como "o script").

------------------------------------------------------------------------
1. OBJETIVO DESTE DOCUMENTO
------------------------------------------------------------------------
Este documento tem como finalidade orientar, de forma detalhada e sem
margem para dúvidas, a instalação e a utilização de uma macro (script)
desenvolvida para o Microsoft Project. Essa macro permite publicar as
tarefas do arquivo de cronograma diretamente no banco de dados do sistema
EcoQuanta (Firebase), eliminando a necessidade de copiar e colar dados na
planilha "eapunificada".

Ao final da instalação, sua equipe passará a atualizar a aba "Atividades"
do sistema EcoQuanta com um único clique, diretamente a partir do
Microsoft Project.

------------------------------------------------------------------------
2. ANTES DE COMEÇAR — LEIA COM ATENÇÃO
------------------------------------------------------------------------
Este script foi revisado e testado manualmente na comunicação com o banco
de dados (leitura e gravação no formato utilizado pelo sistema funcionam
corretamente). No entanto, a etapa que lê as tarefas diretamente de dentro
do Microsoft Project não pôde ser validada em ambiente real de uso.

RECOMENDAÇÃO OBRIGATÓRIA: antes de utilizar este script em um arquivo de
Project de produção, realize um teste em uma cópia do arquivo (ou em um
arquivo de teste) e confira o resultado no site do EcoQuanta antes de
repetir o procedimento com o arquivo definitivo. O item 8 deste documento
descreve como testar com segurança, sem gravar nada de forma definitiva.

------------------------------------------------------------------------
3. O QUE ESTE SCRIPT FAZ (E O QUE NÃO FAZ)
------------------------------------------------------------------------
3.1. O que faz:
   a) Lê todas as tarefas do arquivo do Microsoft Project que estiver
      aberto no momento da execução, identificando cada uma pelo seu
      código EAP (número de tópico, por exemplo "1.2.3").
   b) Autentica-se automaticamente no Firebase, da mesma forma que o
      próprio site do EcoQuanta faz.
   c) Localiza, dentro das tarefas do arquivo aberto, quais Ordens de
      Serviço (OS) estão presentes.
   d) Substitui, no banco de dados, apenas as tarefas pertencentes a essas
      OS. As tarefas de OS de outros arquivos (isto é, de outras pessoas
      da equipe) permanecem intactas.
   e) Grava o resultado de volta no Firebase, preservando o restante do
      documento.

3.2. O que NÃO faz (limitação intencional, decidida em conjunto com a
      equipe responsável pelo sistema):
   O documento do sistema que armazena a EAP possui dois conjuntos de
   dados distintos:
     - "atual": lista simples de aproximadamente 850 linhas, uma por
       tarefa/item. É este conjunto que o script atualiza.
     - "cronograma": estrutura muito mais complexa, com cerca de 10 mil
       linhas organizadas em uma árvore mensal (por exemplo, "Mês 1"),
       contendo linha de base ("baseline") e predecessoras. É esse
       conjunto que alimenta as telas de Cronograma, Curva S e o seletor
       de OS/contrato do sistema.

   Por decisão consciente, o script NÃO altera o conjunto "cronograma".
   Substituí-lo pelas linhas simples do Project apagaria a estrutura
   mensal e a linha de base de todos os contratos, o que é considerado
   inaceitável.

   Na prática, isso significa:
     - A aba "Atividades" (cartões de atividade, LOD, progresso) passará
       a refletir exatamente o que for publicado por este script. Este é
       o problema que o script resolve.
     - O seletor de OS/contrato, a tela de Cronograma e a Curva S
       continuarão sendo alimentados pelo conjunto "cronograma" e NÃO
       serão alterados pelo uso deste script.
     - O campo "idealProgress" (progresso ideal) de cada tarefa é
       publicado em branco, pois ainda não existe um campo padronizado no
       Microsoft Project mapeado para essa informação.
     - Os campos "edificioPorItem" e "reajustado" não são, em nenhuma
       hipótese, alterados por este script.

------------------------------------------------------------------------
4. PRÉ-REQUISITOS
------------------------------------------------------------------------
   a) Microsoft Project instalado (com suporte a macros VBA).
   b) Conexão com a internet no momento da execução da macro.
   c) O arquivo complementar "PublicarEapNoFirebase.txt", contendo o
      código-fonte do script.
   d) O módulo gratuito "VBA-JSON", detalhado no próximo item.

------------------------------------------------------------------------
5. PASSO A PASSO DE INSTALAÇÃO
------------------------------------------------------------------------

PASSO 1 — Abrir o Editor de VBA
   1.1. Abra o Microsoft Project.
   1.2. Pressione as teclas ALT + F11 para abrir o Editor do Visual Basic
        for Applications (VBA).

PASSO 2 — Instalar o módulo obrigatório VBA-JSON
   O script depende de um módulo auxiliar chamado "VBA-JSON", responsável
   por interpretar e montar textos no formato JSON. Sem ele, o script não
   funcionará.
   2.1. Acesse, em um navegador de internet, o endereço:
        https://github.com/VBA-tools/VBA-JSON
   2.2. Localize e baixe o arquivo "JsonConverter.cls" (utilize sempre a
        versão mais recente disponível no repositório).
   2.3. De volta ao Editor de VBA, acesse o menu Arquivo > Importar
        Arquivo... e selecione o arquivo baixado no passo anterior.
   2.4. Confirme que um novo módulo chamado "JsonConverter" foi adicionado
        à lista de módulos do projeto.

PASSO 3 — Ativar as referências necessárias
   3.1. No Editor de VBA, acesse o menu Ferramentas > Referências.
   3.2. Localize e marque as seguintes opções:
        [ x ] Microsoft Scripting Runtime
        [ x ] Microsoft WinHTTP Services, version 5.1
   3.3. Clique em OK para confirmar.
   Observação: caso "Microsoft WinHTTP Services" não apareça na lista,
   procure pelo arquivo "winhttp.dll", normalmente já presente no Windows.
   Caso persista a dificuldade, entre em contato com o suporte técnico.

PASSO 4 — Inserir o código do script
   4.1. No Editor de VBA, acesse o menu Inserir > Módulo.
   4.2. Abra o arquivo "PublicarEapNoFirebase.txt" (baixado em conjunto
        com este tutorial) em um editor de texto simples (por exemplo, o
        Bloco de Notas do Windows).
   4.3. Copie todo o conteúdo do arquivo.
   4.4. Cole o conteúdo dentro do módulo recém-criado no Editor de VBA.
   4.5. Salve o arquivo do Microsoft Project em um formato que preserve
        macros (por exemplo, ".mpp" com macros habilitadas).

PASSO 5 — Configurar as constantes no início do script
   No topo do código colado no Passo 4, existe um bloco identificado como
   "CONFIGURAÇÃO". Revise cada item:
   5.1. FIREBASE_API_KEY e FIREBASE_PROJECT_ID: já vêm preenchidos com os
        dados do projeto Firebase do EcoQuanta (ecoquanta-c2720). Não
        altere esses valores, a menos que seja orientado a fazê-lo pela
        equipe responsável pelo sistema.
   5.2. CAMPO_DISCIPLINA: informe qual campo personalizado do Microsoft
        Project sua equipe utiliza para registrar a disciplina de cada
        tarefa (por exemplo, "Text1"). Caso sua equipe ainda não utilize
        nenhum campo para essa finalidade, mantenha o valor padrão — o
        campo de disciplina simplesmente será publicado em branco, sem
        gerar erros.
   5.3. CAMPO_CODIGO_EAP: informe qual campo personalizado do Microsoft
        Project irá armazenar o código EAP fixo de cada tarefa (por
        exemplo, "Text2" — utilize um campo diferente do informado em
        CAMPO_DISCIPLINA). Ao contrário de CAMPO_DISCIPLINA, este campo é
        de preenchimento OBRIGATÓRIO. Veja o motivo e o modo de
        preenchimento no Passo 6, a seguir.
   5.4. Caso sua equipe já mantenha, por prática própria, uma coluna
        preenchida manualmente com o código da tarefa (por exemplo, uma
        coluna intitulada "D — Nº item", utilizada justamente para não
        perder a ordem e a hierarquia da EAP), NÃO crie um campo novo:
        reaproveite esse campo já existente. Para descobrir o nome técnico
        desse campo (Text1, Text2 etc.), sem necessidade de localizá-lo
        em nenhum menu de configuração, siga o procedimento abaixo:
        a) Clique sobre uma linha do cronograma cujo código você já
           conheça (por exemplo, uma tarefa em que a coluna em questão
           exiba o valor "2.2").
        b) Pressione ALT+F8, selecione a macro
           "DescobrirCampoDoCodigoEap" e clique em "Executar".
        c) Será exibida uma janela listando os campos de texto
           preenchidos para aquela tarefa (por exemplo: "Text3 = 2.2").
           Utilize esse nome de campo (no exemplo, "Text3") no valor da
           constante CAMPO_CODIGO_EAP.

PASSO 6 — Preencher o código EAP em cada tarefa (etapa obrigatória)
   6.1. Por que este passo é obrigatório: o número de tópico do Microsoft
        Project ("Outline Number", por exemplo "1.1.1") é calculado
        automaticamente com base na posição da tarefa dentro do arquivo
        que está aberto no momento. Como cada arquivo, a partir de agora,
        contém apenas as Ordens de Serviço (OS) de uma pessoa específica —
        e não mais a estrutura completa de todos os contratos e OS —, essa
        numeração automática deixa de corresponder ao código EAP oficial.
        Por exemplo: uma tarefa que pertence oficialmente à OS "1.4" pode
        receber, dentro de um arquivo que contenha apenas essa OS, o
        número de tópico "1.1", simplesmente por ser a primeira (e única)
        OS presente naquele arquivo. Se esse número fosse utilizado como
        código, a tarefa seria publicada no lugar errado, e os dados da
        OS "1.1" (pertencente a outra pessoa) poderiam ser apagados
        indevidamente.
   6.2. Por esse motivo, o código EAP de cada tarefa deve ser digitado
        manualmente no campo personalizado definido em CAMPO_CODIGO_EAP,
        utilizando o mesmo código já adotado hoje na planilha
        "eapunificada" (formato "contrato.OS.item", por exemplo,
        "12.3.1"). Esse código é fixo e não depende de quais outras OS
        estão ou não presentes no arquivo.
   6.3. Caso uma tarefa possua nome preenchido mas o campo
        CAMPO_CODIGO_EAP esteja vazio, ela NÃO será publicada. O script
        informa, ao final da execução, quantas tarefas foram ignoradas por
        esse motivo (ver item 7.4 deste documento), permitindo corrigir e
        publicar novamente.
   6.4. Dúvidas sobre qual é o código EAP oficial de uma tarefa devem ser
        esclarecidas com a equipe responsável pelo sistema antes da
        publicação — não estime ou improvise o código.

------------------------------------------------------------------------
6. CRIANDO UM BOTÃO DE ACESSO RÁPIDO "FIREBASE" (RECOMENDADO)
------------------------------------------------------------------------
Para evitar a necessidade de repetir o procedimento ALT+F8 a cada
utilização, recomenda-se cadastrar um botão fixo na Barra de Ferramentas
de Acesso Rápido do Microsoft Project. Este procedimento é nativo do
Microsoft Office, não exige nenhuma linha adicional de código e deve ser
realizado uma única vez por computador/usuário.

   6.1. Acesse o menu Arquivo > Opções > Barra de Ferramentas de Acesso
        Rápido.
   6.2. No campo "Escolher comandos em:", selecione a opção "Macros".
   6.3. Na lista à esquerda, selecione "PublicarEapNoFirebase" e clique no
        botão "Adicionar >>".
   6.4. Com o item já posicionado na coluna da direita, clique no botão
        "Modificar...".
   6.5. Escolha um ícone de sua preferência e, no campo "Nome para
        exibição", digite: Firebase
   6.6. Clique em OK e, em seguida, novamente em OK para confirmar.
   6.7. O botão "Firebase" passará a ser exibido permanentemente na parte
        superior da janela do Microsoft Project. A partir de então, basta
        um único clique para executar a publicação.

------------------------------------------------------------------------
7. COMO EXECUTAR A PUBLICAÇÃO
------------------------------------------------------------------------
   7.1. Abra, no Microsoft Project, o arquivo que contenha exclusivamente
        as Ordens de Serviço (OS) que você deseja publicar.
   7.2. Execute a macro por um dos dois caminhos:
        a) Clique no botão "Firebase", caso já tenha sido configurado
           conforme o item 6 deste documento; ou
        b) Pressione ALT+F8, selecione "PublicarEapNoFirebase" na lista e
           clique em "Executar".
   7.3. Acompanhe o andamento pela barra de status, localizada na parte
        inferior esquerda da janela do Microsoft Project. Ela exibirá uma
        barra de progresso em formato de texto, semelhante ao exemplo
        abaixo, avançando progressivamente até atingir 100%:

        [■■■■■■■■■■----------] 50%  Baixando appData/eap atual...

        As etapas exibidas, em sequência, são: autenticação (25%),
        download dos dados atuais (50%), mesclagem das tarefas (75%),
        gravação no Firebase (90%) e conclusão (100%).
   7.4. Ao final do processamento, será exibida uma mensagem informando
        quantas tarefas foram publicadas com sucesso. Essa mensagem
        confirma a conclusão da operação. Caso alguma tarefa com nome
        preenchido não possuísse o código EAP no campo CAMPO_CODIGO_EAP
        (ver item 6 deste documento), a mesma mensagem exibirá um aviso
        informando quantas tarefas foram ignoradas por esse motivo — nesse
        caso, preencha o código nas tarefas indicadas e execute a
        publicação novamente.

------------------------------------------------------------------------
8. COMO TESTAR COM SEGURANÇA, SEM RISCO DE GRAVAÇÃO DEFINITIVA
------------------------------------------------------------------------
Antes de utilizar o script contra o ambiente definitivo (produção),
recomenda-se fortemente uma das duas alternativas a seguir:

   Alternativa A — Ambiente isolado de teste:
      Solicite à equipe responsável pelo sistema a criação de um
      documento de teste (por exemplo, "appData/eap_teste") e o ajuste
      temporário dos caminhos utilizados pelo script para apontar a esse
      documento. Execute a macro nesse ambiente isolado antes de utilizá-
      la no ambiente real.

   Alternativa B — Simulação sem gravação:
      No Editor de VBA, localize a linha que contém a chamada
      "PublicarPayloadChunked ..." dentro da rotina
      "PublicarEapNoFirebase" e, temporariamente, substitua-a por um
      comando "MsgBox jsonTexto". Dessa forma, será exibida na tela
      exatamente a informação que seria enviada ao Firebase, sem que
      nenhuma gravação definitiva ocorra. Após a conferência, desfaça essa
      alteração antes de utilizar o script normalmente.

------------------------------------------------------------------------
9. COMO CONFERIR O RESULTADO APÓS A PUBLICAÇÃO
------------------------------------------------------------------------
   9.1. Acesse o site do EcoQuanta.
   9.2. Navegue até Coordenação de Engenharia > Atividades. É nessa aba,
        e somente nela, que o resultado da publicação deve ser conferido
        (a tela de Dashboard/seletor de OS não é afetada por este script,
        conforme explicado no item 3.2 deste documento).
   9.3. Como prova adicional de que a mesclagem por OS está funcionando
        corretamente, é recomendável publicar, em seguida, um segundo
        arquivo de Project contendo Ordens de Serviço diferentes e
        confirmar que as OS publicadas anteriormente continuam presentes
        e não foram apagadas.

------------------------------------------------------------------------
10. SOLUÇÃO DE PROBLEMAS
------------------------------------------------------------------------
   10.1. Erro de autenticação / HTTP 400 na etapa "signUp":
         Verifique se a autenticação anônima está habilitada no Firebase
         Console, em Authentication > Sign-in method > Anonymous. Como o
         próprio site já depende desse recurso, ele normalmente já está
         habilitado. Caso o erro persista, entre em contato com a equipe
         responsável pelo sistema.

   10.2. Mensagem "appData/eap está no formato 'data' (objeto)...":
         Esse formato é incomum (o Apps Script grava, em condições
         normais, sempre no formato "chunked"). Caso essa mensagem
         apareça, interrompa a operação e entre em contato com a equipe
         responsável pelo sistema antes de prosseguir.

   10.3. Erro HTTP 403 (permission-denied):
         Confirme, junto à equipe responsável pelo sistema, que as regras
         de segurança do Firestore continuam autorizando leitura e
         gravação autenticadas em "appData/{documento}" e
         "appData/{documento}/chunks/{chunk}". Essas regras já existem no
         ambiente atual e não precisam ser alteradas para o funcionamento
         deste script; caso o erro ocorra, pode indicar uma alteração não
         planejada nessas regras.

   10.4. Nenhuma tarefa é publicada / mensagem "Nenhuma tarefa com código
         EAP válido foi encontrada":
         Verifique se o arquivo realmente está ativo (em primeiro plano)
         no Microsoft Project no momento da execução da macro e se as
         tarefas possuem nome preenchido.

   10.5. Mensagem "X tarefa(s) tem nome preenchido mas não tem o campo
         [...] com o código EAP" ou aviso de tarefas ignoradas ao final da
         publicação:
         Isso significa que uma ou mais tarefas com nome preenchido não
         possuem o código EAP digitado no campo personalizado definido em
         CAMPO_CODIGO_EAP (ver item 6 deste documento). Abra as tarefas
         indicadas, preencha o código EAP oficial de cada uma e execute a
         publicação novamente. Este comportamento é intencional: evita que
         uma tarefa seja publicada com código incorreto e substitua dados
         de outra Ordem de Serviço.

   10.6. Para qualquer erro não listado acima:
         Anote a mensagem de erro exibida na tela (o texto completo) e
         encaminhe-a à equipe responsável pelo sistema para análise.

------------------------------------------------------------------------
11. RESUMO DO ESCOPO — O QUE MUDA E O QUE NÃO MUDA
------------------------------------------------------------------------
   MUDA (passa a ser atualizado por este script):
      - Aba Atividades: cartões de atividade, LOD e progresso.

   NÃO MUDA (continua vindo exclusivamente da planilha/Apps Script, até
   que uma eventual etapa futura de migração seja planejada):
      - Seletor de OS/contrato.
      - Tela de Cronograma.
      - Curva S.
      - Campo "idealProgress" (permanece em branco).
      - Campos "edificioPorItem" e "reajustado".

============================================================================
FIM DO DOCUMENTO
============================================================================
`;

export async function downloadProjectVbaConfig(): Promise<void> {
  const zip = new JSZip();
  zip.file('PublicarEapNoFirebase.txt', PROJECT_VBA_SCRIPT);
  zip.file('TUTORIAL-PublicarEapNoFirebase.txt', PROJECT_VBA_TUTORIAL);
  const blob = await zip.generateAsync({ type: 'blob' });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'configuracao-project-firebase.zip';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
