// --- CONFIGURACOES DE PUBLICACAO JSON ---
//
// POLITICA DE PERFORMANCE:
// - Toda interacao do site deve priorizar resposta rapida ao usuario.
// - Escreva na planilha e no JSON com o menor numero possivel de chamadas.
// - Publique JSON compacto para reduzir trafego e tempo da API do GitHub.
// - Use gatilhos curtos para trabalho pesado em segundo plano.
// - Quando json_crypto_key/crypto_key existir, publique envelope criptografado;
//   velocidade nao deve abrir janela publica para dados sensiveis.
var PUBLIC_JSON_FOLDER = "Publica";
var EAP_PUBLIC_JSON_FILE = "eap-unificada.json";
var DEFAULT_REGISTRO_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyl1TyOHEuhWV-twFybZ3wQ1k7IOb4Ob-lvjNtODiK9rxgZB4TA4iVtFbRjXorhaK5G/exec";
var PUBLIC_JSON_FAST_DELAY_MS = 1000;
var DEFAULT_FIREBASE_PROJECT_ID = "ecoquanta-c2720";
var DEFAULT_FIREBASE_API_KEY = "AIzaSyCGJ4UHPGyaf1GqayvTXUhvn3eLdu9ZW9g";
var FIREBASE_AUTH_CACHE_KEY = "firebase_anonymous_id_token";
var FIREBASE_APPDATA_CHUNK_SIZE = 750000;
var FIREBASE_SYNC_DELAY_MS = 5000;

function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu('QUANTA Sync')
    .addItem('Sincronizar Firebase', 'syncFirebaseNow')
    .addToUi();
}

// --- VERSIONAMENTO E CACHE ---

function updateVersion_() {
  var timestamp = new Date().getTime().toString();

  PropertiesService.getScriptProperties().setProperty('appVersion', timestamp);
  CacheService.getScriptCache().remove('appData');

  return timestamp;
}

function getAppVersion_() {
  var version = PropertiesService.getScriptProperties().getProperty('appVersion');

  if (!version) {
    version = updateVersion_();
  }

  return version;
}

// --- TRIGGERS ---

function handleSpreadsheetEdit(e) {
  updateVersion_();
  scheduleFirebaseSync_(FIREBASE_SYNC_DELAY_MS);
}

function handleSpreadsheetChange(e) {
  updateVersion_();
  scheduleFirebaseSync_(FIREBASE_SYNC_DELAY_MS);
}

function syncFirebaseNow() {
  ensureProjectTriggers_();
  cleanupFirebaseSyncTriggers_();
  PropertiesService.getScriptProperties().deleteProperty('pending_firebase_sync_at');
  return publishCompressedDataToFirebaseNow();
}

function scheduleFirebaseSync_(delayMs, force) {
  var waitMs = Math.max(1000, Number(delayMs || FIREBASE_SYNC_DELAY_MS));
  var now = Date.now();
  var targetAt = now + waitMs;
  var props = PropertiesService.getScriptProperties();
  var pendingAt = Number(props.getProperty('pending_firebase_sync_at') || 0);

  if (!force && pendingAt && pendingAt > now && pendingAt <= targetAt) {
    return;
  }

  props.setProperty('pending_firebase_sync_at', String(targetAt));
  cleanupFirebaseSyncTriggers_();
  ScriptApp.newTrigger("syncFirebaseByTrigger")
    .timeBased()
    .after(waitMs)
    .create();
}

function syncFirebaseByTrigger() {
  var props = PropertiesService.getScriptProperties();
  var dueAt = Number(props.getProperty('pending_firebase_sync_at') || 0);
  var remainingMs = dueAt - Date.now();

  if (remainingMs > 5000) {
    cleanupFirebaseSyncTriggers_();
    ScriptApp.newTrigger("syncFirebaseByTrigger")
      .timeBased()
      .after(remainingMs)
      .create();
    return "Sincronizacao Firebase reagendada.";
  }

  props.deleteProperty('pending_firebase_sync_at');
  try {
    return publishCompressedDataToFirebaseNow();
  } finally {
    cleanupFirebaseSyncTriggers_();
  }
}

function scheduleCompressedDataPublicJson() {
  scheduleCompressedDataPublicJson_(PUBLIC_JSON_FAST_DELAY_MS);
  return "Publicacao da EAP agendada.";
}

function scheduleCompressedDataPublicJson_(delayMs, force) {
  var waitMs = Math.max(1000, Number(delayMs || PUBLIC_JSON_FAST_DELAY_MS));
  var now = Date.now();
  var targetAt = now + waitMs;
  var props = PropertiesService.getScriptProperties();
  var pendingAt = Number(props.getProperty('pending_eap_publish_at') || 0);

  if (!force && pendingAt && pendingAt > now && pendingAt <= targetAt) {
    return;
  }

  props.setProperty('pending_eap_publish_at', String(targetAt));
  cleanupCompressedDataPublishTriggers_();

  ScriptApp.newTrigger("publishCompressedDataToPublicJsonByTrigger")
    .timeBased()
    .after(waitMs)
    .create();
}

function scheduleFullPublicJsonRefresh() {
  var cache = CacheService.getScriptCache();
  if (!cache.get("isFullPublicJsonRefreshQueued")) {
    cache.put("isFullPublicJsonRefreshQueued", "true", 120);
    cleanupFullPublicJsonRefreshTriggers_();
    ScriptApp.newTrigger("runFullPublicJsonRefreshByTrigger")
      .timeBased()
      .after(1000)
      .create();
  }

  return "Atualizacao completa agendada. A EAP sera publicada primeiro; em seguida o Registro sera agendado.";
}

function runFullPublicJsonRefreshByTrigger() {
  try {
    cleanupCompressedDataPublishTriggers_();
    var version = publishCompressedDataToPublicJson();
    var registroResult = scheduleRegistroPublicJsonPublish_();
    return "EAP publicada (" + version + "). " + registroResult;
  } finally {
    cleanupFullPublicJsonRefreshTriggers_();
  }
}

function publishCompressedDataToPublicJsonByTrigger() {
  var props = PropertiesService.getScriptProperties();
  var dueAt = Number(props.getProperty('pending_eap_publish_at') || 0);
  var remainingMs = dueAt - Date.now();

  if (remainingMs > 5000) {
    cleanupCompressedDataPublishTriggers_();
    ScriptApp.newTrigger("publishCompressedDataToPublicJsonByTrigger")
      .timeBased()
      .after(remainingMs)
      .create();
    return "Publicacao da EAP reagendada.";
  }

  props.deleteProperty('pending_eap_publish_at');
  try {
    return publishCompressedDataToPublicJson();
  } finally {
    cleanupCompressedDataPublishTriggers_();
  }
}

function publishCompressedDataToPublicJsonNow() {
  cleanupCompressedDataPublishTriggers_();
  PropertiesService.getScriptProperties().deleteProperty('pending_eap_publish_at');
  var version = publishCompressedDataToPublicJson();
  return "EAP publicada agora. Versao: " + version;
}

function publishCompressedDataToFirebaseNow() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = getCompressedData_(ss);
  var version = updateVersion_();
  var publishedAt = new Date().toISOString();
  data.latestEapPublishedAt = publishedAt;
  firestoreSetAppData_("eap", data);
  return "EAP publicada no Firebase. Versao: " + version;
}

function syncAllPublicJsonNow() {
  ensureProjectTriggers_();
  cleanupCompressedDataPublishTriggers_();
  cleanupFullPublicJsonRefreshTriggers_();
  PropertiesService.getScriptProperties().deleteProperty('pending_eap_publish_at');

  var version = publishCompressedDataToPublicJson();
  var registroResult = requestRegistroImmediateSync_();
  return "EAP publicada agora (" + version + "). " + registroResult;
}

function setupProjectTriggers() {
  ensureProjectTriggers_();
  return "Triggers configurados com sucesso.";
}

function ensureProjectTriggers_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var triggers = ScriptApp.getProjectTriggers();
  var hasEdit = false;
  var hasChange = false;
  var hasPeriodic = false;

  for (var i = 0; i < triggers.length; i++) {
    var trigger = triggers[i];
    var handler = trigger.getHandlerFunction();
    if (handler === "handleSpreadsheetEdit") hasEdit = true;
    if (handler === "handleSpreadsheetChange") hasChange = true;
    if (handler === "publishCompressedDataToFirebaseNow") hasPeriodic = true;
    if (handler === "publishCompressedDataToPublicJson") ScriptApp.deleteTrigger(trigger);
  }

  if (!hasEdit) {
    ScriptApp.newTrigger("handleSpreadsheetEdit")
      .forSpreadsheet(ss)
      .onEdit()
      .create();
  }

  if (!hasChange) {
    ScriptApp.newTrigger("handleSpreadsheetChange")
      .forSpreadsheet(ss)
      .onChange()
      .create();
  }

  if (!hasPeriodic) {
    ScriptApp.newTrigger("publishCompressedDataToFirebaseNow")
      .timeBased()
      .everyMinutes(5)
      .create();
  }
}

function deleteAllProjectTriggers() {
  deleteAllProjectTriggers_();
  return "Todos os gatilhos deste projeto foram removidos.";
}

function deleteAllProjectTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
}

function cleanupCompressedDataPublishTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "publishCompressedDataToPublicJsonByTrigger") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function cleanupFullPublicJsonRefreshTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "runFullPublicJsonRefreshByTrigger") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function scheduleRegistroPublicJsonPublish_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var url = String(props.getProperty("registro_apps_script_url") || DEFAULT_REGISTRO_APPS_SCRIPT_URL || "").trim();

    if (!url) {
      return "Registro nao agendado: URL do Apps Script nao configurada.";
    }

    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({ action: "schedulePublicJsonPublish" })
    });

    var status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      return "Registro nao agendado (" + status + "): " + response.getContentText().slice(0, 200);
    }

    return "Publicacao do Registro agendada.";
  } catch (err) {
    return "Registro nao agendado: " + String(err);
  }
}

function requestRegistroImmediateSync_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var url = String(props.getProperty("registro_apps_script_url") || DEFAULT_REGISTRO_APPS_SCRIPT_URL || "").trim();

    if (!url) {
      return "Registro nao sincronizado: URL do Apps Script nao configurada.";
    }

    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({ action: "publishFullDatabaseToPublicJsonNow" })
    });

    var status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      return "Registro nao sincronizado (" + status + "): " + response.getContentText().slice(0, 200);
    }

    return "Registro sincronizado agora.";
  } catch (err) {
    return "Registro nao sincronizado: " + String(err);
  }
}

// --- PUBLICACAO ---

function publishCompressedDataToPublicJson() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log("Publicacao EAP ignorada: outra publicacao ja esta em andamento.");
    return getAppVersion_();
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = getCompressedData_(ss);
    var version = updateVersion_();
    var publishedAt = new Date().toISOString();
    data.latestEapPublishedAt = publishedAt;

    firestoreSetAppData_("eap", data);

    publishEncryptedJsonToGithub_(
      EAP_PUBLIC_JSON_FILE,
      {
        source: "EAPunificada",
        version: version,
        publishedAt: publishedAt,
        data: data
      }
    );

    return version;

  } catch (err) {
    Logger.log("Erro ao publicar JSON da curva S: " + String(err));
    throw err;
  } finally {
    lock.releaseLock();
  }
}

// --- ROTAS PRINCIPAIS DA APLICACAO WEB ---

function doGet(e) {
  try {
    var clientVersion = String((e && e.parameter && e.parameter.lastVersion) || '');
    var currentVersion = getAppVersion_();

    if (clientVersion === currentVersion) {
      return json_({
        success: true,
        unchanged: true,
        version: currentVersion
      });
    }

    var cache = CacheService.getScriptCache();
    var cachedData = cache.get("appData");

    if (cachedData != null) {
      var parsedCache = JSON.parse(cachedData);
      parsedCache.version = currentVersion;
      return json_(parsedCache);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = getCompressedData_(ss);

    var responseObj = {
      success: true,
      unchanged: false,
      version: currentVersion,
      data: data
    };

    try {
      cache.put("appData", JSON.stringify(responseObj), 21600);
    } catch (err) {}

    return json_(responseObj);

  } catch (err2) {
    return json_({
      success: false,
      error: String(err2)
    });
  }
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var payload = JSON.parse(e.postData.contents);

    if (payload.action === 'scheduleCompressedDataPublicJson') {
      scheduleCompressedDataPublicJson();
      return json_({
        success: true,
        message: 'Publicacao da EAP agendada.'
      });
    }

    if (payload.action === 'publishCompressedDataToPublicJsonNow') {
      var publishedNowVersion = publishCompressedDataToPublicJson();
      return json_({
        success: true,
        message: 'Publicacao imediata da EAP concluida.',
        newVersion: publishedNowVersion
      });
    }

    if (payload.action === 'syncAllPublicJsonNow') {
      var syncNowMessage = syncAllPublicJsonNow();
      return json_({
        success: true,
        message: syncNowMessage
      });
    }

    if (payload.action === 'salvarReajuste') {
      var sheet = ss.getSheetByName('Reajustado');

      if (!sheet) {
        sheet = ss.insertSheet('Reajustado');
      }

      sheet.clear();

      var dados = payload.dados;

      if (dados && dados.length > 0) {
        sheet.getRange(1, 1, dados.length, dados[0].length).setValues(dados);
      }

      // Publica e retorna exatamente a versao publicada.
      var publishedVersion = publishCompressedDataToPublicJson();

      return json_({
        success: true,
        message: 'Reajuste salvo com sucesso e publicado no JSON criptografado.',
        newVersion: publishedVersion
      });
    }

    return json_({
      success: false,
      error: 'Acao POST desconhecida.'
    });

  } catch (err) {
    return json_({
      success: false,
      error: String(err)
    });
  }
}

function doOptions() {
  return ContentService
    .createTextOutput('OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

// --- COMPRESSAO DOS DADOS DA CURVA S ---

function getCompressedData_(ss) {
  var sheets = ss.getSheets();

  var out = {
    atual: [],
    dates: [],
    timeline: {},
    reajustado: [],
    latestEapSheet: '',
    latestEapDate: '',
    latestEapPublishedAt: '',
    registro: {
      contracts: [],
      osOptions: [],
      itemOptions: [],
      hierarchyNodes: [],
      childrenByParent: {},
      rootCodes: []
    },
    cronograma: []
  };

  var snapshotSheets = [];

  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var name = String(sh.getName() || '').trim();

    if (name === 'Reajustado') {
      out.reajustado = sh.getDataRange().getValues();
    }

    else if (name === 'Atual') {
      var values = sh.getDataRange().getValues();
      var displayValues = sh.getDataRange().getDisplayValues();

      for (var r = 1; r < values.length; r++) {
        var itemCode = String(displayValues[r][3] || values[r][3] || '').trim(); // Coluna D
        var itemName = String(displayValues[r][4] || values[r][4] || '').trim(); // Coluna E

        if (!itemCode || !isOsItemName_(itemName)) {
          continue;
        }

        // Estrutura compacta mantida para o app:
        // [code, name, progress, duration, pStart, pEnd, idealProg, lDate, mDate]
        out.atual.push([
          itemCode,
          itemName,
          values[r][2],                 // Coluna C - Real / Progresso atual
          values[r][5],                 // Coluna F - Duracao
          formatIfDate_(values[r][6]),  // Coluna G - Inicio planejado
          formatIfDate_(values[r][7]),  // Coluna H - Fim planejado
          values[r][9],                 // Coluna J - Ideal
          formatIfDate_(values[r][11]), // Coluna L
          formatIfDate_(values[r][12])  // Coluna M
        ]);
      }
    }

    else if (isDateSheetName_(name)) {
      snapshotSheets.push({
        name: name,
        sheet: sh
      });
    }
  }

  // Ordena as abas de data da mais antiga para a mais nova.
  snapshotSheets.sort(function(a, b) {
    return parseSimpleDate_(a.name) - parseSimpleDate_(b.name);
  });

  var latestEapSheet = getLatestEapSheet_(ss, snapshotSheets);
  if (latestEapSheet) {
    var latestEapRows = getRawEapRows_(latestEapSheet);
    out.latestEapSheet = latestEapSheet.getName();
    out.latestEapDate = normalizeSheetNameDate_(latestEapSheet.getName());
    out.registro = getEapStructuredDataFromRows_(latestEapRows);
    out.cronograma = latestEapRows;
  }

  // Se a aba "Atual" nao existir ou nao tiver OS validas, usa o snapshot mais recente
  // como base para montar a lista principal da Curva S.
  if (out.atual.length === 0 && snapshotSheets.length > 0) {
    var latestValues = snapshotSheets[snapshotSheets.length - 1].sheet.getDataRange().getValues();
    var latestDisplayValues = snapshotSheets[snapshotSheets.length - 1].sheet.getDataRange().getDisplayValues();

    for (var ar = 1; ar < latestValues.length; ar++) {
      var latestItemCode = String(latestDisplayValues[ar][3] || latestValues[ar][3] || '').trim(); // Coluna D
      var latestItemName = String(latestDisplayValues[ar][4] || latestValues[ar][4] || '').trim(); // Coluna E

      if (!latestItemCode || !isOsItemName_(latestItemName)) {
        continue;
      }

      out.atual.push([
        latestItemCode,
        latestItemName,
        latestValues[ar][2],                 // Coluna C - Real / Progresso atual
        latestValues[ar][5],                 // Coluna F - Duracao
        formatIfDate_(latestValues[ar][6]),  // Coluna G - Inicio planejado
        formatIfDate_(latestValues[ar][7]),  // Coluna H - Fim planejado
        latestValues[ar][9],                 // Coluna J - Ideal
        formatIfDate_(latestValues[ar][11]), // Coluna L
        formatIfDate_(latestValues[ar][12])  // Coluna M
      ]);
    }
  }

  var dates = [];
  var tempMap = {};

  // Cada aba com nome de data representa um snapshot da Curva S.
  for (var s = 0; s < snapshotSheets.length; s++) {
    dates.push(snapshotSheets[s].name);

    var sValues = snapshotSheets[s].sheet.getDataRange().getValues();
    var sDisplayValues = snapshotSheets[s].sheet.getDataRange().getDisplayValues();

    for (var rs = 1; rs < sValues.length; rs++) {
      var osCode = String(sDisplayValues[rs][3] || sValues[rs][3] || '').trim(); // Coluna D
      var osName = String(sDisplayValues[rs][4] || sValues[rs][4] || '').trim(); // Coluna E

      if (!osCode || !isOsItemName_(osName)) {
        continue;
      }

      if (!tempMap[osCode]) {
        tempMap[osCode] = [];
      }

      tempMap[osCode][s] = {
        r: sValues[rs][2], // Coluna C - Real
        i: sValues[rs][9]  // Coluna J - Ideal
      };
    }
  }

  out.dates = dates;

  // Compactacao RLE:
  // Se Real e Ideal forem iguais em datas consecutivas,
  // salva apenas um intervalo [inicio, fim, real, ideal].
  for (var c in tempMap) {
    var runs = [];
    var currentRun = null;

    for (var d = 0; d < dates.length; d++) {
      var pt = tempMap[c][d];

      if (!pt) {
        continue;
      }

      if (!currentRun) {
        currentRun = [d, d, pt.r, pt.i];
      } else {
        if (
          currentRun[2] === pt.r &&
          currentRun[3] === pt.i &&
          currentRun[1] === d - 1
        ) {
          currentRun[1] = d;
        } else {
          runs.push(currentRun);
          currentRun = [d, d, pt.r, pt.i];
        }
      }
    }

    if (currentRun) {
      runs.push(currentRun);
    }

    if (runs.length > 0) {
      out.timeline[c] = runs;
    }
  }

  return out;
}

function getLatestEapSheet_(ss, snapshotSheets) {
  if (snapshotSheets.length > 0) {
    return snapshotSheets[snapshotSheets.length - 1].sheet;
  }

  return null;
}

function getRawEapRows_(sheet) {
  var values = sheet.getDataRange().getValues();
  var displayValues = sheet.getDataRange().getDisplayValues();
  var rows = [];

  for (var i = 1; i < values.length; i++) {
    var codigo = String(displayValues[i][3] || values[i][3] || '').trim();
    var nome = String(displayValues[i][4] || values[i][4] || '').trim();
    if (!codigo || !nome) continue;

    rows.push({
      progress: toNumberSafe_(values[i][2]),
      code: codigo,
      name: nome,
      duration: toNumberSafe_(values[i][5]),
      plannedStart: normalizeSheetDate_(values[i][6]),
      plannedEnd: normalizeSheetDate_(values[i][7]),
      predecessor: String(displayValues[i][8] || values[i][8] || '').trim(),
      idealProgress: toNumberSafe_(values[i][9]),
      realStart: normalizeSheetDate_(values[i][11]),
      realEnd: normalizeSheetDate_(values[i][12]),
      baselineIdealProgress: toNumberSafe_(values[i][13])
    });
  }

  return rows;
}

function getEapStructuredDataFromRows_(rows) {
  var hierarchy = buildEapHierarchyPayloadFromRows_(rows);
  var contracts = [];
  var osOptions = [];
  var itemOptions = [];

  for (var i = 0; i < hierarchy.nodes.length; i++) {
    var node = hierarchy.nodes[i];
    if (node.tipo === 'contrato') {
      contracts.push({ codigo: node.codigo, nome: node.nome });
    }
  }

  for (var os = 0; os < hierarchy.nodes.length; os++) {
    var osNode = hierarchy.nodes[os];
    if (osNode.tipo === 'os' && osNode.contratoCodigo) {
      osOptions.push({ codigo: osNode.codigo, nome: osNode.nome, contratoCodigo: osNode.contratoCodigo });
    }
  }

  for (var j = 0; j < hierarchy.nodes.length; j++) {
    var itemNode = hierarchy.nodes[j];
    if (itemNode.tipo === 'item' && itemNode.osCodigo) {
      itemOptions.push({ codigo: itemNode.codigo, nome: itemNode.nome, osCodigo: itemNode.osCodigo });
    }
  }

  return {
    contracts: contracts,
    osOptions: osOptions,
    itemOptions: itemOptions,
    hierarchyNodes: hierarchy.nodes,
    childrenByParent: hierarchy.childrenByParent,
    rootCodes: hierarchy.rootCodes
  };
}

function buildEapHierarchyPayloadFromRows_(rows) {
  var rawNodes = [];
  var nodeMap = {};

  for (var i = 0; i < rows.length; i++) {
    var item = rows[i] || {};
    var codigo = String(item.code || '').trim();
    var nome = String(item.name || '').trim();
    if (!codigo || !nome) continue;

    rawNodes.push({
      codigo: codigo,
      nome: nome,
      dotCount: (codigo.match(/\./g) || []).length,
      isOs: isOsItemName_(nome)
    });
    nodeMap[codigo] = true;
  }

  rawNodes.sort(function(a, b) {
    if (a.dotCount !== b.dotCount) return a.dotCount - b.dotCount;
    return a.codigo < b.codigo ? -1 : (a.codigo > b.codigo ? 1 : 0);
  });

  var nodes = [];
  var rootCodes = [];
  var contractCodeByNode = {};
  var nearestOsByNode = {};

  for (var j = 0; j < rawNodes.length; j++) {
    var raw = rawNodes[j];
    var parentCodigo = inferDirectParentCode_(raw.codigo, nodeMap);
    var contratoCodigo = '';
    var osCodigo = '';
    var tipo = 'item';

    if (!parentCodigo) {
      tipo = 'contrato';
      contratoCodigo = raw.codigo;
      rootCodes.push(raw.codigo);
    } else {
      contratoCodigo = contractCodeByNode[parentCodigo] || getContractRootFromCode_(raw.codigo);
      if (raw.isOs) {
        tipo = 'os';
        osCodigo = raw.codigo;
      } else {
        tipo = 'item';
        osCodigo = nearestOsByNode[parentCodigo] || '';
      }
    }

    if (tipo === 'os' && !osCodigo) osCodigo = raw.codigo;

    contractCodeByNode[raw.codigo] = contratoCodigo;
    nearestOsByNode[raw.codigo] = tipo === 'os' ? raw.codigo : osCodigo;

    nodes.push({
      codigo: raw.codigo,
      nome: raw.nome,
      tipo: tipo,
      nivel: raw.dotCount,
      parentCodigo: parentCodigo,
      contratoCodigo: contratoCodigo,
      osCodigo: osCodigo
    });
  }

  return {
    nodes: nodes,
    childrenByParent: buildChildrenByParentMap_(nodes),
    rootCodes: rootCodes
  };
}

function inferDirectParentCode_(codigo, nodeMap) {
  var parts = String(codigo || '').trim().split('.');
  if (parts.length <= 1) return '';

  for (var i = parts.length - 1; i > 0; i--) {
    var candidate = parts.slice(0, i).join('.');
    if (nodeMap[candidate]) return candidate;
  }

  return '';
}

function getContractRootFromCode_(codigo) {
  var parts = String(codigo || '').trim().split('.');
  return parts.length ? parts[0] : '';
}

function buildChildrenByParentMap_(nodes) {
  var out = {};
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var key = node.parentCodigo || 'ROOT';
    if (!out[key]) out[key] = [];
    out[key].push({
      codigo: node.codigo,
      nome: node.nome,
      tipo: node.tipo,
      nivel: node.nivel,
      parentCodigo: node.parentCodigo,
      contratoCodigo: node.contratoCodigo,
      osCodigo: node.osCodigo
    });
  }
  return out;
}

function findContractParentCode_(codigo, contracts) {
  var best = '';
  for (var i = 0; i < contracts.length; i++) {
    var contractCode = String(contracts[i].codigo || '');
    if (codigo.indexOf(contractCode + '.') === 0 || codigo === contractCode) {
      if (contractCode.length > best.length) best = contractCode;
    }
  }
  return best;
}

function findOsParentCode_(codigo, osOptions) {
  var best = '';
  for (var i = 0; i < osOptions.length; i++) {
    var osCode = String(osOptions[i].codigo || '');
    if (codigo.indexOf(osCode + '.') === 0 || codigo === osCode) {
      if (osCode.length > best.length) best = osCode;
    }
  }
  return best;
}

// --- FILTROS E FORMATADORES ---

function isOsItemName_(value) {
  var text = String(value || '').trim();

  if (!text) {
    return false;
  }

  // Aceita exemplos:
  // OS
  // OS 031
  // OS031
  // OS_031
  // OS-031
  // OS.A
  // _OS
  // _OS 031
  // PROJETO _OS
  // OSletra
  // OSnumero
  //
  // Evita pegar palavras onde "os" aparece no meio, como:
  // custos, básicos, projetos, postos, etc.
  return /(^|[^A-Za-z0-9À-ÿ])_?OS(?=[A-Za-z0-9À-ÿ_\-\.\s]|$)/i.test(text);
}

function isDateSheetName_(name) {
  var str = String(name || '').trim();

  return (
    /^\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}$/.test(str) ||
    /^\d{4}-\d{2}-\d{2}$/.test(str)
  );
}

function formatIfDate_(val) {
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
    return val.getTime();
  }

  return val;
}

function toNumberSafe_(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  var str = String(value).trim().replace(/\./g, '').replace(',', '.');
  var num = Number(str);
  return isNaN(num) ? 0 : num;
}

function normalizeSheetDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return formatDateYmdSafe_(value);
  }

  var str = String(value).trim();
  if (!str) return '';

  if (str.indexOf('/') !== -1) {
    var parsedBr = parsePtBrDateOnlySafe_(str);
    if (parsedBr) return formatDateYmdSafe_(parsedBr);
  }

  if (str.indexOf('-') !== -1) {
    var parsedYmd = parseYmdDateSafe_(str);
    if (parsedYmd) return formatDateYmdSafe_(parsedYmd);
  }

  return '';
}

function parsePtBrDateOnlySafe_(text) {
  var str = String(text || '').trim();
  if (!str) return null;
  var parts = str.split('/');
  if (parts.length !== 3) return null;
  var day = Number(parts[0]);
  var month = Number(parts[1]) - 1;
  var year = Number(parts[2]);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  var date = new Date(year, month, day);
  date.setHours(0, 0, 0, 0);
  return isNaN(date.getTime()) ? null : date;
}

function parseYmdDateSafe_(text) {
  var str = String(text || '').trim();
  if (!str) return null;
  var parts = str.split('-');
  if (parts.length !== 3) return null;
  var year = Number(parts[0]);
  var month = Number(parts[1]) - 1;
  var day = Number(parts[2]);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  var date = new Date(year, month, day);
  date.setHours(0, 0, 0, 0);
  return isNaN(date.getTime()) ? null : date;
}

function formatDateYmdSafe_(date) {
  var y = date.getFullYear();
  var m = ('0' + (date.getMonth() + 1)).slice(-2);
  var d = ('0' + date.getDate()).slice(-2);
  return y + '-' + m + '-' + d;
}

function normalizeSheetNameDate_(name) {
  var str = String(name || '').trim();

  var ptMatch = str.match(/^(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})$/);
  if (ptMatch) {
    return ptMatch[3] + '-' + ptMatch[2] + '-' + ptMatch[1];
  }

  var isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3];
  }

  return '';
}

function parseSimpleDate_(name) {
  var str = String(name || '').trim();

  var ptMatch = str.match(/^(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/);

  if (ptMatch) {
    return new Date(
      Number(ptMatch[3]),
      Number(ptMatch[2]) - 1,
      Number(ptMatch[1])
    ).getTime();
  }

  var isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    return new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3])
    ).getTime();
  }

  return 0;
}

// --- PUBLICACAO CRIPTOGRAFADA NO GITHUB ---

function firestoreGetProjectId_() {
  return String(PropertiesService.getScriptProperties().getProperty("firebase_project_id") || DEFAULT_FIREBASE_PROJECT_ID || "").trim();
}

function cleanupFirebaseSyncTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "syncFirebaseByTrigger") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function firestoreGetApiKey_() {
  return String(PropertiesService.getScriptProperties().getProperty("firebase_api_key") || DEFAULT_FIREBASE_API_KEY || "").trim();
}

function firestoreGetBaseUrl_() {
  var projectId = firestoreGetProjectId_();
  if (!projectId) throw new Error("firebase_project_id nao configurado.");
  return "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(projectId) + "/databases/(default)/documents";
}

function firestoreGetIdToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(FIREBASE_AUTH_CACHE_KEY);
  if (cached) return cached;

  var apiKey = firestoreGetApiKey_();
  if (!apiKey) throw new Error("firebase_api_key nao configurada.");
  var response = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + encodeURIComponent(apiKey), {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({ returnSecureToken: true })
  });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error("Falha ao autenticar no Firebase (" + status + "): " + response.getContentText().slice(0, 300));
  }

  var body = JSON.parse(response.getContentText() || "{}");
  if (!body.idToken) throw new Error("Firebase nao retornou idToken.");
  cache.put(FIREBASE_AUTH_CACHE_KEY, body.idToken, 3300);
  return body.idToken;
}

function firestoreSetAppData_(name, data) {
  var jsonText = JSON.stringify(data || {});
  var chunks = splitStringIntoChunks_(jsonText, FIREBASE_APPDATA_CHUNK_SIZE);
  var url = firestoreGetBaseUrl_() + "/appData/" + encodeURIComponent(name);
  var response = UrlFetchApp.fetch(url, {
    method: "patch",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + firestoreGetIdToken_() },
    payload: JSON.stringify({
      fields: firestoreObjectToFields_({
        chunked: true,
        chunkCount: chunks.length,
        byteLength: jsonText.length,
        source: "EAPunificada",
        updatedAt: new Date().toISOString()
      })
    })
  });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error("Firestore appData/" + name + " falhou (" + status + "): " + response.getContentText().slice(0, 500));
  }
  firestoreSetAppDataChunks_(name, chunks);
}

function splitStringIntoChunks_(text, chunkSize) {
  var chunks = [];
  for (var i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks.length ? chunks : [""];
}

function firestoreSetAppDataChunks_(name, chunks) {
  var projectId = firestoreGetProjectId_();
  var baseName = "projects/" + projectId + "/databases/(default)/documents/appData/" + name + "/chunks/";
  for (var i = 0; i < chunks.length; i++) {
    var docId = ("00000" + i).slice(-5);
    var url = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(projectId) + "/databases/(default)/documents:commit";
    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      headers: { Authorization: "Bearer " + firestoreGetIdToken_() },
      payload: JSON.stringify({
        writes: [{
          update: {
            name: baseName + docId,
            fields: firestoreObjectToFields_({
              index: i,
              value: chunks[i],
              updatedAt: new Date().toISOString()
            })
          }
        }]
      })
    });
    var status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      throw new Error("Firestore chunk appData/" + name + "/" + docId + " falhou (" + status + "): " + response.getContentText().slice(0, 500));
    }
  }
}

function firestoreObjectToFields_(obj) {
  var fields = {};
  obj = obj || {};
  for (var key in obj) {
    if (obj.hasOwnProperty(key) && obj[key] !== undefined) fields[key] = firestoreToValue_(obj[key]);
  }
  return fields;
}

function firestoreToValue_(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(function(item) { return firestoreToValue_(item); }) } };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: firestoreObjectToFields_(value) } };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (Math.floor(value) === value) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  return { stringValue: String(value) };
}

function publishEncryptedJsonToGithub_(fileName, payloadObj) {
  var cfg = getGithubPublisherConfig_();
  var body = buildFastPublicJsonBody_(payloadObj);

  var url = buildGithubContentsUrl_(
    cfg.githubApi,
    PUBLIC_JSON_FOLDER,
    fileName
  );

  writeGithubFile_(
    url,
    body,
    cfg.githubToken,
    cfg.githubBranch,
    "Atualiza " + PUBLIC_JSON_FOLDER + "/" + fileName
  );
}

function buildFastPublicJsonBody_(payloadObj) {
  var cryptoKey = getOptionalJsonCryptoKey_();
  var out = cryptoKey
    ? encryptPayloadEnvelope_(payloadObj, cryptoKey)
    : payloadObj;

  return JSON.stringify(out);
}

function getGithubPublisherConfig_() {
  var props = PropertiesService.getScriptProperties();

  var githubApi = String(props.getProperty("github_api") || "").trim();
  var githubToken = String(props.getProperty("github_token") || "").trim();
  var githubBranch = String(props.getProperty("github_branch") || "main").trim();

  if (!githubApi) {
    throw new Error('Propriedade "github_api" nao configurada.');
  }

  if (!githubToken) {
    throw new Error('Propriedade "github_token" nao configurada.');
  }

  return {
    githubApi: githubApi,
    githubToken: githubToken,
    githubBranch: githubBranch
  };
}

function getOptionalJsonCryptoKey_() {
  var props = PropertiesService.getScriptProperties();
  return String(props.getProperty("json_crypto_key") || props.getProperty("crypto_key") || "").trim();
}

function buildGithubContentsUrl_(baseApi, folderName, fileName) {
  var cleanBase = String(baseApi || "").replace(/\/+$/, "");
  var folder = encodeURIComponent(String(folderName || "").replace(/^\/+|\/+$/g, ""));
  var file = encodeURIComponent(String(fileName || "").replace(/^\/+/, ""));

  if (/\/contents$/i.test(cleanBase)) {
    return cleanBase + "/" + folder + "/" + file;
  }

  if (/\/contents\/[^\/]+$/i.test(cleanBase)) {
    return cleanBase + "/" + file;
  }

  return cleanBase + "/" + folder + "/" + file;
}

function writeGithubFile_(url, plainTextContent, token, branch, commitMessage) {
  var sha = fetchGithubFileSha_(url, token, branch);

  var requestBody = {
    message: commitMessage,
    content: Utilities.base64Encode(plainTextContent, Utilities.Charset.UTF_8),
    branch: branch
  };

  if (sha) {
    requestBody.sha = sha;
  }

  var response = UrlFetchApp.fetch(url, {
    method: "put",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json"
    },
    payload: JSON.stringify(requestBody)
  });

  var status = response.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error(
      "GitHub API PUT falhou (" +
      status +
      "): " +
      response.getContentText()
    );
  }
}

function fetchGithubFileSha_(url, token, branch) {
  var response = UrlFetchApp.fetch(url + "?ref=" + encodeURIComponent(branch), {
    method: "get",
    muteHttpExceptions: true,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json"
    }
  });

  var status = response.getResponseCode();

  if (status === 404) {
    return "";
  }

  if (status < 200 || status >= 300) {
    throw new Error(
      "GitHub API GET falhou (" +
      status +
      "): " +
      response.getContentText()
    );
  }

  var parsed = JSON.parse(response.getContentText() || "{}");

  return String(parsed.sha || "");
}

// --- CRIPTOGRAFIA DO PAYLOAD ---

function encryptPayloadEnvelope_(payloadObj, cryptoKey) {
  var plainText = JSON.stringify(payloadObj);
  var nonce = Utilities.getUuid().replace(/-/g, "");
  var plainBytes = Utilities.newBlob(plainText, "application/json").getBytes();
  var encryptedBytes = xorEncryptBytes_(plainBytes, cryptoKey, nonce);

  return {
    version: 1,
    algorithm: "xor-sha256-stream",
    nonce: nonce,
    checksum: computeSha256Hex_(plainText),
    publishedAt: new Date().toISOString(),
    payload: Utilities.base64EncodeWebSafe(encryptedBytes)
  };
}

function xorEncryptBytes_(plainBytes, cryptoKey, nonce) {
  var out = [];
  var counter = 0;
  var offset = 0;
  var block = [];

  for (var i = 0; i < plainBytes.length; i++) {
    if (offset >= block.length) {
      block = buildKeyStreamBlock_(cryptoKey, nonce, counter++);
      offset = 0;
    }

    out.push((plainBytes[i] & 255) ^ (block[offset++] & 255));
  }

  return out;
}

function buildKeyStreamBlock_(cryptoKey, nonce, counter) {
  var seed = String(cryptoKey) + "|" + String(nonce) + "|" + String(counter);

  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    seed,
    Utilities.Charset.UTF_8
  );
}

function computeSha256Hex_(text) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    text,
    Utilities.Charset.UTF_8
  );

  return bytes.map(function(b) {
    return ("0" + (b & 255).toString(16)).slice(-2);
  }).join("");
}

// --- RESPOSTA JSON ---

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
