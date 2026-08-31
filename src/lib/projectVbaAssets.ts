// Macro distribuída ao usuário: exporta TSV para a tela existente, sem acessar Firebase.
export const PROJECT_EAP_EXPORT_VBA = String.raw`Attribute VB_Name = "ExportarEapEcoquanta"
Option Explicit

Sub ExportarEapEcoquanta()
    Dim linhas As String, tarefa As Task, destino As String
    linhas = "Alerta" & vbTab & "Status" & vbTab & "% Concluída" & vbTab & "N° item" & vbTab & "Nome da Tarefa" & vbTab & "Duração" & vbTab & "Início do Plano Base" & vbTab & "Conclusão do Plano Base" & vbTab & "Predecessoras" & vbTab & "%ideal REPROG" & vbTab & "Nome do Recurso" & vbTab & "Início Real" & vbTab & "Conclusão Reprogramada" & vbTab & "%ideal Plano Base" & vbTab & "Área Técnica" & vbTab & "Área Técnica (dup)" & vbTab & "EDIFICAÇÃO" & vbTab & "Prioridade" & vbTab & "Respons. Subcontratado" & vbCrLf

    For Each tarefa In ActiveProject.Tasks
        If Not tarefa Is Nothing Then
            If Len(Trim$(tarefa.Name)) > 0 Then
                linhas = linhas & Celula("") & vbTab & Celula(CStr(tarefa.Status)) & vbTab & Celula(CStr(tarefa.PercentComplete)) & vbTab & Celula(tarefa.WBS) & vbTab & Celula(tarefa.Name) & vbTab & Celula(Format$(tarefa.Duration / 480, "0.00")) & vbTab & Celula(DataTexto(tarefa.BaselineStart)) & vbTab & Celula(DataTexto(tarefa.BaselineFinish)) & vbTab & Celula(tarefa.Predecessors) & vbTab & Celula("") & vbTab & Celula(tarefa.ResourceNames) & vbTab & Celula(DataTexto(tarefa.ActualStart)) & vbTab & Celula(DataTexto(tarefa.Finish)) & vbTab & Celula("") & vbTab & Celula(tarefa.Text1) & vbTab & Celula(tarefa.Text1) & vbTab & Celula(tarefa.Text2) & vbTab & Celula(tarefa.Text3) & vbTab & Celula(tarefa.Text4) & vbCrLf
            End If
        End If
    Next tarefa

    destino = Environ$("USERPROFILE") & "\Downloads\Ecoquanta-EAP-" & Format$(Now, "yyyymmdd-hhnnss") & ".tsv"
    SalvarUtf8 destino, linhas
    MsgBox "Arquivo gerado para importar na tela Planejamento: " & destino, vbInformation
End Sub

Private Function Celula(ByVal valor As Variant) As String
    Dim texto As String
    texto = Replace(Replace(Replace(CStr(valor), """", """"""), vbCr, " "), vbLf, " ")
    Celula = """" & texto & """"
End Function

Private Function DataTexto(ByVal valor As Variant) As String
    If IsDate(valor) Then DataTexto = Format$(CDate(valor), "dd/mm/yyyy") Else DataTexto = ""
End Function

Private Sub SalvarUtf8(ByVal caminho As String, ByVal conteudo As String)
    Dim stream As Object
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 2
    stream.Charset = "utf-8"
    stream.Open
    stream.WriteText conteudo
    stream.SaveToFile caminho, 2
    stream.Close
End Sub
`;

export function downloadProjectVbaConfig(): void {
  const blob = new Blob([PROJECT_EAP_EXPORT_VBA], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ExportarEapEcoquanta.bas';
  link.click();
  URL.revokeObjectURL(url);
}
