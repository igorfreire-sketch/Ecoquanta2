// --- CONFIGURACOES DE PUBLICACAO JSON ---
var PUBLIC_JSON_FOLDER = "Publica";
var EAP_PUBLIC_JSON_FILE = "eap-unificada.json";

function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu('QUANTA Sync')
    .addItem('Publicar Curva S em JSON', 'publishCompressedDataToPublicJson')
    .addItem('Configurar Triggers', 'setupProjectTriggers')
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

  var cache = CacheService.getScriptCache();

  // Evita varias publicacoes em sequencia quando houver muitas edicoes.
  if (!cache.get("isPublishingPublicJson")) {
    cache.put("isPublishingPublicJson", "true", 30);

    ScriptApp.newTrigger("publishCompressedDataToPublicJsonByTrigger")
      .timeBased()
      .after(30 * 1000)
      .create();
  }
}

function publishCompressedDataToPublicJsonByTrigger() {
  try {
    return publishCompressedDataToPublicJson();
  } finally {
    cleanupCompressedDataPublishTriggers_();
  }
}

function setupProjectTriggers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  deleteAllProjectTriggers_();

  // Trigger instalavel: publica quando a planilha for editada.
  ScriptApp.newTrigger("handleSpreadsheetEdit")
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  // Trigger automatico: republica a cada 30 minutos.
  ScriptApp.newTrigger("publishCompressedDataToPublicJson")
    .timeBased()
    .everyMinutes(30)
    .create();

  return "Triggers configurados com sucesso.";
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

    publishEncryptedJsonToGithub_(
      EAP_PUBLIC_JSON_FILE,
      {
        source: "EAPunificada",
        version: version,
        publishedAt: new Date().toISOString(),
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
    registro: {
      contracts: [],
      osOptions: [],
      itemOptions: []
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

  return ss.getSheetByName('Atual') || ss.getSheetByName('EAP') || null;
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
  var contracts = [];
  var osOptions = [];
  var itemOptions = [];

  for (var i = 0; i < rows.length; i++) {
    var item = rows[i];
    var codigo = String(item.code || '').trim();
    var nome = String(item.name || '').trim();
    var dotCount = (codigo.match(/\./g) || []).length;

    if (!codigo || !nome) continue;

    if (dotCount === 0) {
      contracts.push({ codigo: codigo, nome: nome });
    }
  }

  for (var os = 0; os < rows.length; os++) {
    var osRow = rows[os];
    var osCodigo = String(osRow.code || '').trim();
    var osNome = String(osRow.name || '').trim();
    var contratoParent = findContractParentCode_(osCodigo, contracts);

    if (contratoParent && isOsItemName_(osNome)) {
      osOptions.push({ codigo: osCodigo, nome: osNome, contratoCodigo: contratoParent });
    }
  }

  for (var j = 0; j < rows.length; j++) {
    var itemRow = rows[j];
    var itemCodigo = String(itemRow.code || '').trim();
    var itemNome = String(itemRow.name || '').trim();
    if (!itemCodigo || !itemNome) continue;

    var osParent = findOsParentCode_(itemCodigo, osOptions);
    if (osParent && itemCodigo !== osParent) {
      itemOptions.push({ codigo: itemCodigo, nome: itemNome, osCodigo: osParent });
    }
  }

  return { contracts: contracts, osOptions: osOptions, itemOptions: itemOptions };
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

function publishEncryptedJsonToGithub_(fileName, payloadObj) {
  var cfg = getGithubPublisherConfig_();

  var envelope = encryptPayloadEnvelope_(payloadObj, cfg.cryptoKey);
  var body = JSON.stringify(envelope, null, 2);

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

function getGithubPublisherConfig_() {
  var props = PropertiesService.getScriptProperties();

  var githubApi = String(props.getProperty("github_api") || "").trim();
  var githubToken = String(props.getProperty("github_token") || "").trim();
  var cryptoKey = String(
    props.getProperty("json_crypto_key") ||
    props.getProperty("crypto_key") ||
    ""
  ).trim();

  var githubBranch = String(props.getProperty("github_branch") || "main").trim();

  if (!githubApi) {
    throw new Error('Propriedade "github_api" nao configurada.');
  }

  if (!githubToken) {
    throw new Error('Propriedade "github_token" nao configurada.');
  }

  if (!cryptoKey) {
    throw new Error('Propriedade "json_crypto_key" nao configurada.');
  }

  return {
    githubApi: githubApi,
    githubToken: githubToken,
    cryptoKey: cryptoKey,
    githubBranch: githubBranch
  };
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
