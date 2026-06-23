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
var EAP_PUBLIC_JSON_FILE = "";
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
  firestoreCleanupAppData_("menu", buildEapMenuData_(data, publishedAt));
  firestoreCleanupAppData_("eap", data);
  firestoreSetAppData_("menu", buildEapMenuData_(data, publishedAt));
  firestoreSetAppData_("eap", data);
  return "EAP publicada no Firebase. Versao: " + version;
}

function buildLoginFirebaseData_(ss) {
  var sheet = getOrCreateLoginSheet_(ss);
  var header = getHeaderMapSafe_(sheet);
  var values = sheet.getDataRange().getValues();
  var users = [];
  var usersByEmail = {};

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var user = normalizeUserResponse_(row, header);
    var email = normalizeEmail_(user.email);
    if (!email) continue;

    var passwordHash = String(row[header.passwordhash] || '').trim();
    var resetCode = String(row[header.resetcode] || '').trim();
    var resetExpires = Number(row[header.resetexpires] || 0);
    var lastSeen = Number(row[header.lastseen] || 0);

    var authUser = {
      id: email,
      nome: user.nome,
      email: user.email,
      cargo: user.cargo,
      role: user.role,
      disciplina: user.disciplina,
      disciplinas: user.disciplinas,
      contrato: user.contrato,
      contract: user.contract,
      status: user.status,
      alocacao: user.alocacao,
      allowedTabs: user.allowedTabs,
      abas: user.abas,
      isAdmin: user.isAdmin,
      online: user.online,
      sessionVersion: user.sessionVersion,
      passwordHash: passwordHash,
      resetCode: resetCode,
      resetExpires: resetExpires,
      lastSeen: lastSeen,
      onlyThirdParty: user.onlyThirdParty,
      showInCharts: user.showInCharts
    };

    users.push(authUser);
    usersByEmail[email] = authUser;
  }

  return {
    source: "EAPunificada",
    publishedAt: new Date().toISOString(),
    users: users,
    usersByEmail: usersByEmail
  };
}

function publishLoginDataToFirebaseNow() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  firestoreSetAppData_("auth", buildLoginFirebaseData_(ss));
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
  return "Registrodeatividades desativado.";
}

function requestRegistroImmediateSync_() {
  return "Registrodeatividades desativado.";
}

function forwardAdminSnapshotToRegistro_(snapshot) {
  return false;
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

    firestoreSetAppData_("menu", buildEapMenuData_(data, publishedAt));
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
    var action = String(payload.action || '').trim();

    if (isFirebaseAuthAction_(action)) {
      return handleFirebaseAuthAction_(payload);
    }

    if (action === 'heartbeat') {
      var hbEmail = normalizeEmail_(payload.email);
      if (!hbEmail) {
        return json_({
          success: false,
          error: 'E-mail invalido.'
        });
      }

      var hbSheet = getOrCreateLoginSheet_(ss);
      var hbHeader = getHeaderMapSafe_(hbSheet);
      var hbValues = hbSheet.getDataRange().getValues();
      var hbIndex = findUserRowByEmail_(hbValues, hbHeader, hbEmail);

      if (hbIndex >= 0) {
        setLoginRowPatch_(hbSheet, hbIndex + 1, hbHeader, {
          lastseen: Date.now()
        });
        publishLoginDataToFirebaseNow();
      }

      return json_({
        success: true,
        sessionVersion: hbIndex >= 0 ? String(hbValues[hbIndex][hbHeader.sessionversion] || '') : ''
      });
    }

    if (action === 'registerUser') {
      var regName = String(payload.name || '').trim();
      var regEmail = normalizeEmail_(payload.email);
      var regPassword = String(payload.password || '');
      var regSheet = getOrCreateLoginSheet_(ss);
      var regHeader = getHeaderMapSafe_(regSheet);
      var regValues = regSheet.getDataRange().getValues();

      if (!regName) {
        return json_({ success: false, error: 'Informe o nome.' });
      }

      if (!regEmail) {
        return json_({ success: false, error: 'E-mail invalido.' });
      }

      if (regPassword.length < 6) {
        return json_({ success: false, error: 'Senha muito curta (min. 6).' });
      }

      if (findUserRowByEmail_(regValues, regHeader, regEmail) >= 0) {
        return json_({ success: false, error: 'Este e-mail ja esta cadastrado.' });
      }

      var regRow = newEmptyLoginRow_(regHeader);
      var regPreReg = findPreRegistration_(ss, regEmail);
      var regApproved = isCorporateEmail_(regEmail) || !!regPreReg;

      regRow[regHeader.data] = new Date().toLocaleString('pt-BR');
      regRow[regHeader.nome] = regName;
      regRow[regHeader.email] = regEmail;
      regRow[regHeader.role] = regPreReg ? regPreReg.cargo : '';
      regRow[regHeader.disciplina] = regPreReg ? regPreReg.disciplina : '';
      regRow[regHeader.status] = regApproved ? 'approved' : 'pending';
      regRow[regHeader.alocacao] = regPreReg ? regPreReg.alocacao : '';
      regRow[regHeader.contrato] = regPreReg ? regPreReg.contrato : '';
      regRow[regHeader.abas] = regPreReg ? normalizeAllowedTabs_(regPreReg.allowedTabs || []) : '';
      regRow[regHeader.passwordhash] = makePasswordHash_(regPassword);
      regRow[regHeader.resetcode] = '';
      regRow[regHeader.resetexpires] = '';
      regRow[regHeader.isadmin] = 'false';
      regRow[regHeader.lastseen] = '';
      regRow[regHeader.sessionversion] = newSessionVersion_();

      regSheet.appendRow(regRow);
      publishLoginDataToFirebaseNow();
      logAuth_(ss, 'INFO', 'registerUser ok', regEmail + (regPreReg ? ' (pre-cadastro)' : ''));
      return json_({
        success: true,
        message: regApproved
          ? 'Acesso liberado! Entre com suas credenciais.'
          : 'Cadastro realizado com sucesso. Aguarde aprovacao.'
      });
    }

    if (action === 'authUser') {
      var authEmail = normalizeEmail_(payload.email);
      var authPassword = String(payload.password || '');
      var authSheet = getOrCreateLoginSheet_(ss);
      var authHeader = getHeaderMapSafe_(authSheet);
      var authValues = authSheet.getDataRange().getValues();

      if (!authEmail || !authPassword) {
        return json_({ success: false, error: 'Informe e-mail e senha.' });
      }

      var authIndex = findUserRowByEmail_(authValues, authHeader, authEmail);
      if (authIndex < 0) {
        logAuth_(ss, 'WARN', 'authUser email nao encontrado', authEmail);
        return json_({ success: false, error: 'E-mail ou senha invalidos.' });
      }

      var authRow = authValues[authIndex];
      var storedHash = String(authRow[authHeader.passwordhash] || '').trim();
      var authStatus = String(authRow[authHeader.status] || '').trim().toLowerCase();

      if (!storedHash) {
        logAuth_(ss, 'ERROR', 'authUser sem PasswordHash', authEmail);
        return json_({ success: false, error: 'Conta invalida (senha nao cadastrada).' });
      }

      if (!verifyPassword_(authPassword, storedHash)) {
        logAuth_(ss, 'WARN', 'authUser senha invalida', authEmail);
        return json_({ success: false, error: 'E-mail ou senha invalidos.' });
      }

      if (authStatus === 'pending') {
        return json_({ success: false, error: 'Seu cadastro ainda esta aguardando aprovacao do administrador.' });
      }

      if (authStatus === 'blocked') {
        return json_({ success: false, error: 'Seu acesso esta bloqueado. Procure um administrador.' });
      }

      var authSessionVersion = String(authRow[authHeader.sessionversion] || '').trim();
      if (!authSessionVersion) {
        authSessionVersion = newSessionVersion_();
        setLoginRowPatch_(authSheet, authIndex + 1, authHeader, {
          sessionversion: authSessionVersion
        });
        authRow[authHeader.sessionversion] = authSessionVersion;
      }

      setLoginRowPatch_(authSheet, authIndex + 1, authHeader, {
        lastseen: Date.now()
      });
      publishLoginDataToFirebaseNow();

      var user = normalizeUserResponse_(authRow, authHeader);
      logAuth_(ss, 'INFO', 'authUser ok', authEmail);
      return json_({
        success: true,
        user: user
      });
    }

    if (action === 'forgotPassword') {
      var forgotEmail = normalizeEmail_(payload.email);
      if (!forgotEmail) {
        return json_({ success: false, error: 'E-mail invalido.' });
      }

      var forgotSheet = getOrCreateLoginSheet_(ss);
      var forgotHeader = getHeaderMapSafe_(forgotSheet);
      var forgotValues = forgotSheet.getDataRange().getValues();
      var forgotIndex = findUserRowByEmail_(forgotValues, forgotHeader, forgotEmail);

      if (forgotIndex < 0) {
        return json_({ success: true });
      }

      var resetCode = randomCode_(6);
      var resetExpires = Date.now() + 15 * 60 * 1000;
      setLoginRowPatch_(forgotSheet, forgotIndex + 1, forgotHeader, {
        resetcode: resetCode,
        resetexpires: resetExpires
      });
      publishLoginDataToFirebaseNow();

      try {
        sendResetCodeEmail_(forgotEmail, resetCode, 15);
      } catch (mailErr) {
        logAuth_(ss, 'ERROR', 'forgotPassword falha MailApp', String(mailErr));
        return json_({
          success: false,
          error: 'Falha ao enviar e-mail. Verifique as permissoes do Apps Script.'
        });
      }

      logAuth_(ss, 'INFO', 'forgotPassword code enviado', forgotEmail);
      return json_({ success: true });
    }

    if (action === 'resetPassword') {
      var resetEmail = normalizeEmail_(payload.email);
      var resetCodeIn = String(payload.code || '').trim();
      var resetNewPassword = String(payload.newPassword || '');
      var resetSheet = getOrCreateLoginSheet_(ss);
      var resetHeader = getHeaderMapSafe_(resetSheet);
      var resetValues = resetSheet.getDataRange().getValues();
      var resetIndex = findUserRowByEmail_(resetValues, resetHeader, resetEmail);

      if (!resetEmail) {
        return json_({ success: false, error: 'E-mail invalido.' });
      }

      if (!resetCodeIn) {
        return json_({ success: false, error: 'Informe o codigo.' });
      }

      if (resetNewPassword.length < 6) {
        return json_({ success: false, error: 'Senha muito curta (min. 6).' });
      }

      if (resetIndex < 0) {
        return json_({ success: false, error: 'Codigo invalido.' });
      }

      var resetRow = resetValues[resetIndex];
      var codeStored = String(resetRow[resetHeader.resetcode] || '').trim();
      var expiresStored = Number(resetRow[resetHeader.resetexpires] || 0);

      if (!codeStored || codeStored !== resetCodeIn) {
        return json_({ success: false, error: 'Codigo invalido.' });
      }

      if (!expiresStored || Date.now() > expiresStored) {
        return json_({ success: false, error: 'Codigo expirado.' });
      }

      setLoginRowPatch_(resetSheet, resetIndex + 1, resetHeader, {
        passwordhash: makePasswordHash_(resetNewPassword),
        resetcode: '',
        resetexpires: '',
        lastseen: '',
        sessionversion: newSessionVersion_()
      });
      publishLoginDataToFirebaseNow();

      logAuth_(ss, 'INFO', 'resetPassword ok', resetEmail);
      return json_({ success: true, message: 'Senha redefinida com sucesso.' });
    }

    if (action === 'approveUser') {
      var approveEmail = normalizeEmail_(payload.email);
      var approveSheet = getOrCreateLoginSheet_(ss);
      var approveHeader = getHeaderMapSafe_(approveSheet);
      var approveValues = approveSheet.getDataRange().getValues();
      var approveIndex = findUserRowByEmail_(approveValues, approveHeader, approveEmail);

      if (!approveEmail) {
        return json_({ success: false, error: 'E-mail invalido.' });
      }

      if (approveIndex < 0) {
        return json_({ success: false, error: 'Usuario nao encontrado.' });
      }

      var approvePatch = {
        status: 'approved',
        lastseen: '',
        sessionversion: newSessionVersion_()
      };

      if (payload.name !== undefined) approvePatch.nome = String(payload.name || '');
      if (payload.role !== undefined) approvePatch.role = String(payload.role || '');
      if (payload.discipline !== undefined) approvePatch.disciplina = normalizeUserDisciplines_(payload.discipline).join(' | ');
      if (payload.allowedTabs !== undefined) approvePatch.abas = normalizeAllowedTabs_(payload.allowedTabs);
      if (payload.allocation !== undefined) approvePatch.alocacao = String(payload.allocation || '');
      if (payload.contract !== undefined) approvePatch.contrato = String(payload.contract || '');
      if (payload.isAdmin !== undefined) approvePatch.isadmin = boolToSheet_(payload.isAdmin);

      setLoginRowPatch_(approveSheet, approveIndex + 1, approveHeader, approvePatch);
      publishLoginDataToFirebaseNow();
      logAuth_(ss, 'INFO', 'approveUser ok', approveEmail);
      return json_({ success: true });
    }

    if (action === 'blockUser') {
      var blockEmail = normalizeEmail_(payload.email);
      var blockSheet = getOrCreateLoginSheet_(ss);
      var blockHeader = getHeaderMapSafe_(blockSheet);
      var blockValues = blockSheet.getDataRange().getValues();
      var blockIndex = findUserRowByEmail_(blockValues, blockHeader, blockEmail);

      if (!blockEmail) {
        return json_({ success: false, error: 'E-mail invalido.' });
      }

      if (blockIndex < 0) {
        return json_({ success: false, error: 'Usuario nao encontrado.' });
      }

      setLoginRowPatch_(blockSheet, blockIndex + 1, blockHeader, {
        status: 'blocked',
        lastseen: '',
        sessionversion: newSessionVersion_()
      });

      publishLoginDataToFirebaseNow();
      logAuth_(ss, 'INFO', 'blockUser ok', blockEmail);
      return json_({ success: true });
    }

    if (action === 'saveUserAccess') {
      var saveEmail = normalizeEmail_(payload.email);
      var saveSheet = getOrCreateLoginSheet_(ss);
      var saveHeader = getHeaderMapSafe_(saveSheet);
      var saveValues = saveSheet.getDataRange().getValues();
      var saveIndex = findUserRowByEmail_(saveValues, saveHeader, saveEmail);

      if (!saveEmail) {
        return json_({ success: false, error: 'E-mail invalido.' });
      }

      if (saveIndex < 0) {
        return json_({ success: false, error: 'Usuario nao encontrado.' });
      }

      var savePatch = {
        lastseen: '',
        sessionversion: newSessionVersion_()
      };

      if (payload.name !== undefined) savePatch.nome = String(payload.name || '');
      if (payload.role !== undefined) savePatch.role = String(payload.role || '');
      if (payload.discipline !== undefined) savePatch.disciplina = normalizeUserDisciplines_(payload.discipline).join(' | ');
      if (payload.allowedTabs !== undefined) savePatch.abas = normalizeAllowedTabs_(payload.allowedTabs);
      if (payload.allocation !== undefined) savePatch.alocacao = String(payload.allocation || '');
      if (payload.contract !== undefined) savePatch.contrato = String(payload.contract || '');
      if (payload.isAdmin !== undefined) savePatch.isadmin = boolToSheet_(payload.isAdmin);
      if (payload.onlyThirdParty !== undefined) savePatch.onlythirdparty = boolToSheet_(payload.onlyThirdParty);
      if (payload.showInCharts !== undefined) savePatch.showincharts = boolToSheet_(payload.showInCharts !== false);
      if (payload.status !== undefined) savePatch.status = String(payload.status || 'pending');

      setLoginRowPatch_(saveSheet, saveIndex + 1, saveHeader, savePatch);
      publishLoginDataToFirebaseNow();
      logAuth_(ss, 'INFO', 'saveUserAccess ok', saveEmail);
      return json_({ success: true });
    }

    if (action === 'syncAdminSnapshot') {
      var adminSnapshot = payload.snapshot || {};
      var adminUsersSnapshot = adminSnapshot.users || adminSnapshot.usuarios || [];
      if ((!Array.isArray(adminUsersSnapshot) || adminUsersSnapshot.length === 0) && adminSnapshot.usersByEmail && typeof adminSnapshot.usersByEmail === 'object') {
        adminUsersSnapshot = Object.keys(adminSnapshot.usersByEmail).map(function(key) {
          return adminSnapshot.usersByEmail[key];
        });
      }
      syncUsersSnapshotToLoginSheet_(ss, adminUsersSnapshot);
      if (Array.isArray(adminSnapshot.preRegistrations)) {
        savePreRegistrationsToSheet_(ss, adminSnapshot.preRegistrations);
      }
      publishLoginDataToFirebaseNow();
      var forwarded = forwardAdminSnapshotToRegistro_(adminSnapshot);
      logAuth_(ss, 'INFO', 'syncAdminSnapshot ok', safeJson_({
        users: Array.isArray(adminSnapshot.users) ? adminSnapshot.users.length : 0,
        preRegistrations: Array.isArray(adminSnapshot.preRegistrations) ? adminSnapshot.preRegistrations.length : 0,
        forwardedToRegistro: forwarded
      }));
      return json_({ success: true });
    }

    if (action === 'adminResetPassword') {
      var adminResetEmail = normalizeEmail_(payload.email);
      var adminResetSheet = getOrCreateLoginSheet_(ss);
      var adminResetHeader = getHeaderMapSafe_(adminResetSheet);
      var adminResetValues = adminResetSheet.getDataRange().getValues();
      var adminResetIndex = findUserRowByEmail_(adminResetValues, adminResetHeader, adminResetEmail);

      if (!adminResetEmail) {
        return json_({ success: false, error: 'E-mail invalido.' });
      }

      if (adminResetIndex < 0) {
        return json_({ success: false, error: 'Usuario nao encontrado.' });
      }

      var tempPassword = randomTemporaryPassword_();
      setLoginRowPatch_(adminResetSheet, adminResetIndex + 1, adminResetHeader, {
        passwordhash: makePasswordHash_(tempPassword),
        resetcode: '',
        resetexpires: '',
        lastseen: '',
        sessionversion: newSessionVersion_()
      });

      try {
        sendAdminTemporaryPasswordEmail_(adminResetEmail, tempPassword);
      } catch (mailErr2) {
        logAuth_(ss, 'ERROR', 'adminResetPassword falha MailApp', String(mailErr2));
        return json_({
          success: false,
          error: 'Falha ao enviar senha temporaria por e-mail.'
        });
      }

      publishLoginDataToFirebaseNow();
      logAuth_(ss, 'INFO', 'adminResetPassword ok', adminResetEmail);
      return json_({
        success: true,
        message: 'Senha temporaria enviada por e-mail.'
      });
    }

    if (action === 'scheduleCompressedDataPublicJson') {
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

    if (payload.action === 'savePlannerApprovals') {
      var approvals = Array.isArray(payload.approvals) ? payload.approvals : [];
      var plannerSaveResult = savePlannerApprovals_(ss, approvals, payload.userEmail, payload.userName);
      return json_({
        success: true,
        message: plannerSaveResult.message,
        updated: plannerSaveResult.updated,
        published: plannerSaveResult.published,
        newVersion: plannerSaveResult.newVersion
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
    timelineCompression: {
      mode: 'rle-ranges',
      repeatedMonths: 'stored_as_single_range_and_expanded_by_site'
    },
    curvaS: {
      atual: [],
      dates: [],
      timeline: {}
    },
    reajustado: [],
    latestEapSheet: '',
    latestEapDate: '',
    latestEapPublishedAt: '',
    registro: {
      contracts: [],
      osOptions: [],
      itemOptions: [],
      lodOptions: [],
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
      var itemDiscipline = String(displayValues[r][14] || values[r][14] || '').trim(); // Coluna O
      var itemPlannedStart = normalizeSheetDate_(values[r][11]); // Coluna L - Inicio
      var itemPlannedEnd = normalizeSheetDate_(values[r][12]); // Coluna M - Término
      if (isLodItemName_(itemName) && !hasExplicitDiscipline_(splitDisciplines_(itemDiscipline))) {
        itemDiscipline = 'Ignorado';
      }

      if (itemCode && isOsItemName_(itemName)) {
        out.curvaS.atual.push([
          itemCode,
          itemName,
          values[r][2],
          values[r][5],
          formatIfDate_(values[r][6]),
          formatIfDate_(values[r][7]),
          values[r][9],
          formatIfDate_(values[r][11]),
          formatIfDate_(values[r][12])
        ]);
      }

      if (!itemCode || !isLodItemName_(itemName) || !hasExplicitDiscipline_(splitDisciplines_(itemDiscipline)) || !itemPlannedStart || !itemPlannedEnd || itemPlannedStart > itemPlannedEnd) {
        continue;
      }

        // Estrutura compacta mantida para o app:
        // [code, name, progress, duration, start, end, idealProg, discipline]
        out.atual.push([
          itemCode,
          itemName,
          values[r][2],                 // Coluna C - Real / Progresso atual
          values[r][5],                 // Coluna F - Duracao
          itemPlannedStart,             // Coluna L - Inicio
          itemPlannedEnd,               // Coluna M - Término
          values[r][13],                // Coluna N - Porcentagem ideal
          itemDiscipline // Coluna O - Disciplina
        ]);
      }
    }

    else if (isDateSheetName_(name)) {
      snapshotSheets.push({
        name: name,
        date: normalizeSheetNameDate_(name),
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
  if (out.curvaS.atual.length === 0 && snapshotSheets.length > 0) {
    var latestCurvaValues = snapshotSheets[snapshotSheets.length - 1].sheet.getDataRange().getValues();
    var latestCurvaDisplayValues = snapshotSheets[snapshotSheets.length - 1].sheet.getDataRange().getDisplayValues();

    for (var cr = 1; cr < latestCurvaValues.length; cr++) {
      var latestOsCode = String(latestCurvaDisplayValues[cr][3] || latestCurvaValues[cr][3] || '').trim();
      var latestOsName = String(latestCurvaDisplayValues[cr][4] || latestCurvaValues[cr][4] || '').trim();

      if (!latestOsCode || !isOsItemName_(latestOsName)) {
        continue;
      }

      out.curvaS.atual.push([
        latestOsCode,
        latestOsName,
        latestCurvaValues[cr][2],
        latestCurvaValues[cr][5],
        formatIfDate_(latestCurvaValues[cr][6]),
        formatIfDate_(latestCurvaValues[cr][7]),
        latestCurvaValues[cr][9],
        formatIfDate_(latestCurvaValues[cr][11]),
        formatIfDate_(latestCurvaValues[cr][12])
      ]);
    }
  }

  if (out.atual.length === 0 && snapshotSheets.length > 0) {
    var latestValues = snapshotSheets[snapshotSheets.length - 1].sheet.getDataRange().getValues();
    var latestDisplayValues = snapshotSheets[snapshotSheets.length - 1].sheet.getDataRange().getDisplayValues();

    for (var ar = 1; ar < latestValues.length; ar++) {
      var latestItemCode = String(latestDisplayValues[ar][3] || latestValues[ar][3] || '').trim(); // Coluna D
      var latestItemName = String(latestDisplayValues[ar][4] || latestValues[ar][4] || '').trim(); // Coluna E
      var latestItemDiscipline = String(latestDisplayValues[ar][14] || latestValues[ar][14] || '').trim(); // Coluna O
      var latestItemPlannedStart = normalizeSheetDate_(latestValues[ar][11]); // Coluna L - Inicio
      var latestItemPlannedEnd = normalizeSheetDate_(latestValues[ar][12]); // Coluna M - Término
      if (isLodItemName_(latestItemName) && !hasExplicitDiscipline_(splitDisciplines_(latestItemDiscipline))) {
        latestItemDiscipline = 'Ignorado';
      }

      if (!latestItemCode || !isLodItemName_(latestItemName) || !hasExplicitDiscipline_(splitDisciplines_(latestItemDiscipline)) || !latestItemPlannedStart || !latestItemPlannedEnd || latestItemPlannedStart > latestItemPlannedEnd) {
        continue;
      }

      out.atual.push([
        latestItemCode,
        latestItemName,
        latestValues[ar][2],                 // Coluna C - Real / Progresso atual
        latestValues[ar][5],                 // Coluna F - Duracao
        latestItemPlannedStart,              // Coluna L - Inicio
        latestItemPlannedEnd,                // Coluna M - Término
        latestValues[ar][13],                // Coluna N - Porcentagem ideal
        latestItemDiscipline // Coluna O - Disciplina
      ]);
    }
  }

  var dates = [];
  var tempMap = {};
  var curvaSTempMap = {};

  // Cada aba com nome de data representa um snapshot da Curva S.
  for (var s = 0; s < snapshotSheets.length; s++) {
    dates.push(snapshotSheets[s].date);

    var sValues = snapshotSheets[s].sheet.getDataRange().getValues();
    var sDisplayValues = snapshotSheets[s].sheet.getDataRange().getDisplayValues();

    for (var rs = 1; rs < sValues.length; rs++) {
      var osCode = String(sDisplayValues[rs][3] || sValues[rs][3] || '').trim(); // Coluna D
      var osName = String(sDisplayValues[rs][4] || sValues[rs][4] || '').trim(); // Coluna E

      if (osCode && isOsItemName_(osName)) {
        if (!curvaSTempMap[osCode]) {
          curvaSTempMap[osCode] = [];
        }

        curvaSTempMap[osCode][s] = {
          r: sValues[rs][2],
          i: sValues[rs][9]
        };
      }

      if (!osCode || !isLodItemName_(osName)) {
        continue;
      }

      if (!tempMap[osCode]) {
        tempMap[osCode] = [];
      }

      tempMap[osCode][s] = {
        r: sValues[rs][2], // Coluna C - Real
        i: sValues[rs][13]  // Coluna N - Ideal
      };
    }
  }

  out.dates = dates;
  out.curvaS.dates = dates;

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

  out.curvaS.timeline = buildSnapshotTimelineMap_(curvaSTempMap, dates);

  return out;
}

// A Curva S precisa manter uma fotografia explicita por aba datada.
// Nao compactamos pontos iguais: o nome de cada aba representa a data-base.
function buildSnapshotTimelineMap_(tempMap, dates) {
  var timeline = {};

  for (var code in tempMap) {
    var runs = [];

    for (var d = 0; d < dates.length; d++) {
      var pt = tempMap[code][d];
      if (!pt) continue;
      runs.push([d, d, pt.r, pt.i]);
    }

    if (runs.length > 0) {
      timeline[code] = runs;
    }
  }

  return timeline;
}

function buildEapMenuData_(data, publishedAt) {
  data = data || {};
  var registro = data.registro || {};

  return {
    source: "EAPunificada",
    updatedAt: publishedAt || new Date().toISOString(),
    eapResumo: {
      latestEapSheet: data.latestEapSheet || '',
      latestEapDate: data.latestEapDate || '',
      latestEapPublishedAt: data.latestEapPublishedAt || publishedAt || '',
      dates: Array.isArray(data.dates) ? data.dates : []
    },
    registro: {
      contracts: Array.isArray(registro.contracts) ? registro.contracts : [],
      osOptions: Array.isArray(registro.osOptions) ? registro.osOptions : [],
      itemOptions: Array.isArray(registro.itemOptions) ? registro.itemOptions : [],
      lodOptions: Array.isArray(registro.lodOptions) ? registro.lodOptions : [],
      hierarchyNodes: Array.isArray(registro.hierarchyNodes) ? registro.hierarchyNodes : [],
      childrenByParent: registro.childrenByParent || {},
      rootCodes: Array.isArray(registro.rootCodes) ? registro.rootCodes : []
    }
  };
}

function getLatestEapSheet_(ss, snapshotSheets) {
  var sheets = snapshotSheets || [];
  if (sheets.length === 0) return null;

  var latestSheet = null;
  var latestDate = -1;

  for (var i = 0; i < sheets.length; i++) {
    var sheetDate = parseSimpleDate_(sheets[i].name);
    if (sheetDate >= latestDate) {
      latestDate = sheetDate;
      latestSheet = sheets[i].sheet;
    }
  }

  return latestSheet;
}

function getLatestPublishedEapSheet_(ss) {
  var sheets = ss.getSheets();
  var snapshotSheets = [];

  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var name = String(sh.getName() || '').trim();
    if (isDateSheetName_(name)) {
      snapshotSheets.push({
        name: name,
        sheet: sh
      });
    }
  }

  snapshotSheets.sort(function(a, b) {
    return parseSimpleDate_(a.name) - parseSimpleDate_(b.name);
  });

  return snapshotSheets.length > 0 ? snapshotSheets[snapshotSheets.length - 1].sheet : null;
}

function buildEapRowMap_(sheet) {
  var values = sheet.getDataRange().getValues();
  var displayValues = sheet.getDataRange().getDisplayValues();
  var map = {};

  for (var i = 1; i < values.length; i++) {
    var codigo = String(displayValues[i][3] || values[i][3] || '').trim();
    if (!codigo) continue;
    map[codigo] = i + 1;
  }

  return map;
}

function applyPlannerApprovalsToSheet_(sheet, approvals) {
  if (!sheet || !approvals.length) return 0;

  var rowMap = buildEapRowMap_(sheet);
  var updated = 0;

  for (var i = 0; i < approvals.length; i++) {
    var item = approvals[i] || {};
    var code = String(item.itemCodigo || item.code || '').trim();
    var approved = Boolean(item.approved);
    var progress = Number(item.progress || 0);
    if (!code || !approved || progress <= 0) continue;

    var rowIndex = rowMap[code];
    if (!rowIndex) continue;

    sheet.getRange(rowIndex, 3).setValue(Math.max(0, Math.min(100, progress)) / 100);
    updated++;
  }

  return updated;
}

function savePlannerApprovals_(ss, approvals, userEmail, userName) {
  var validApprovals = [];
  for (var i = 0; i < approvals.length; i++) {
    var item = approvals[i] || {};
    var code = String(item.itemCodigo || item.code || '').trim();
    var progress = Number(item.progress || 0);
    if (!code || progress <= 0) continue;
    validApprovals.push({
      itemCodigo: code,
      itemNome: String(item.itemNome || '').trim(),
      progress: Math.max(0, Math.min(100, progress)),
      approved: Boolean(item.approved),
      updatedBy: String(userName || userEmail || '').trim(),
      updatedAt: new Date().toISOString()
    });
  }

  if (!validApprovals.length) {
    return {
      updated: 0,
      published: false,
      newVersion: '',
      message: 'Nenhuma aprovacao valida foi enviada.'
    };
  }

  var updated = 0;
  var latestSheet = getLatestPublishedEapSheet_(ss);
  if (latestSheet) {
    updated += applyPlannerApprovalsToSheet_(latestSheet, validApprovals);
  }

  var atualSheet = ss.getSheetByName('Atual');
  if (atualSheet) {
    updated += applyPlannerApprovalsToSheet_(atualSheet, validApprovals);
  }

  var publishedMessage = publishCompressedDataToFirebaseNow();

  return {
    updated: updated,
    published: true,
    newVersion: String(publishedMessage || ''),
    message: 'Aprovacoes do planejamento salvas. ' + updated + ' linha(s) atualizada(s) na EAP e Firebase republicado.'
  };
}

function getRawEapRows_(sheet) {
  var values = sheet.getDataRange().getValues();
  var displayValues = sheet.getDataRange().getDisplayValues();
  var rows = [];

  for (var i = 1; i < values.length; i++) {
    var codigo = String(displayValues[i][3] || values[i][3] || '').trim();
    var nome = String(displayValues[i][4] || values[i][4] || '').trim();
    if (!codigo || !nome) continue;
    var disciplinas = splitDisciplines_(displayValues[i][14] || values[i][14] || '');
    var isLod = isLodItemName_(nome);
    var isGeneralLod = isLod && !hasExplicitDiscipline_(disciplinas);
    var plannedStart = normalizeSheetDate_(values[i][11]);
    var plannedEnd = normalizeSheetDate_(values[i][12]);
    if (!plannedStart || !plannedEnd || plannedStart > plannedEnd) continue;
    if (isGeneralLod) continue;

    rows.push({
      progress: toNumberSafe_(values[i][2]),
      code: codigo,
      name: nome,
      duration: toNumberSafe_(values[i][5]),
      plannedStart: plannedStart,
      plannedEnd: plannedEnd,
      predecessor: String(displayValues[i][8] || values[i][8] || '').trim(),
      idealProgress: toNumberSafe_(values[i][13]),
      realStart: plannedStart,
      realEnd: plannedEnd,
      baselineIdealProgress: toNumberSafe_(values[i][13]),
      disciplina: disciplinas.join(' | '),
      disciplinas: disciplinas,
      isLod: isLod,
      isGeneralLod: isGeneralLod
    });
  }

  return rows;
}

function hasExplicitDiscipline_(disciplinas) {
  if (!Array.isArray(disciplinas) || disciplinas.length === 0) return false;

  for (var i = 0; i < disciplinas.length; i++) {
    var item = String(disciplinas[i] || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
    if (!item) continue;

    var normalized = item.normalize
      ? item.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      : item.toLowerCase();

    if (!normalized || normalized === 'sem disciplina' || normalized === 'ignorado') continue;
    if (/^\d+([.,]\d+)?$/.test(normalized)) continue;
    if (/^\d{11,13}$/.test(normalized)) continue;
    if (!/[a-z]/i.test(normalized)) continue;
    return true;
  }

  return false;
}

function isLodItemName_(value) {
  var text = String(value || '').trim();
  if (!text) return false;
  return Boolean(getLodNumberFromName_(text));
}

function getLodNumberFromName_(value) {
  var text = String(value || '').trim();
  if (!text) return null;

  var match = text.match(/\bLOD\b[^0-9]*([0-9]{2,3})/i);
  if (!match) return null;

  var lod = parseInt(match[1], 10);
  if ([100, 200, 300, 350, 400].indexOf(lod) === -1) return null;

  return lod;
}

function splitDisciplines_(value) {
  var raw = Array.isArray(value) ? value.join(' | ') : String(value || '').trim();
  if (!raw) return [];

  return raw
    .split(/[\n,;|/]+/)
    .map(function(item) { return String(item || '').trim(); })
    .filter(Boolean);
}

function getEapStructuredDataFromRows_(rows) {
  var hierarchy = buildEapHierarchyPayloadFromRows_(rows);
  var contracts = [];
  var osOptions = [];
  var itemOptions = [];
  var lodOptions = [];

  for (var i = 0; i < hierarchy.nodes.length; i++) {
    var node = hierarchy.nodes[i];
    if (node.tipo === 'contrato') {
      contracts.push({ codigo: node.codigo, nome: node.nome });
    }
  }

  for (var os = 0; os < hierarchy.nodes.length; os++) {
    var osNode = hierarchy.nodes[os];
    if (osNode.tipo === 'os' && osNode.contratoCodigo && osNode.filterable !== false) {
      osOptions.push({ codigo: osNode.codigo, nome: osNode.nome, contratoCodigo: osNode.contratoCodigo });
    }
  }

  for (var j = 0; j < hierarchy.nodes.length; j++) {
    var itemNode = hierarchy.nodes[j];
    if (itemNode.tipo === 'item' && itemNode.osCodigo && itemNode.filterable !== false) {
      var matchedRow = rows.find(function(row) { return String(row.code || '').trim() === String(itemNode.codigo || '').trim(); }) || {};
      itemOptions.push({
        codigo: itemNode.codigo,
        nome: itemNode.nome,
        osCodigo: itemNode.osCodigo,
        disciplina: String(matchedRow.disciplina || '').trim(),
        disciplinas: Array.isArray(matchedRow.disciplinas) ? matchedRow.disciplinas : [],
        isLod: Boolean(itemNode.isLod)
      });

      if (itemNode.isLod) {
        lodOptions.push({
          codigo: itemNode.codigo,
          nome: itemNode.nome,
          osCodigo: itemNode.osCodigo,
          disciplina: String(matchedRow.disciplina || '').trim(),
          disciplinas: Array.isArray(matchedRow.disciplinas) ? matchedRow.disciplinas : []
        });
      }
    }
  }

  return {
    contracts: contracts,
    osOptions: osOptions,
    itemOptions: itemOptions,
    lodOptions: lodOptions,
    hierarchyNodes: hierarchy.nodes,
    childrenByParent: hierarchy.childrenByParent,
    rootCodes: hierarchy.rootCodes
  };
}

function buildEapHierarchyPayloadFromRows_(rows) {
  var rawNodes = [];

  for (var i = 0; i < rows.length; i++) {
    var item = rows[i] || {};
    var codigo = String(item.code || '').trim();
    var nome = String(item.name || '').trim();
    if (!codigo || !nome) continue;

    rawNodes.push({
      codigo: codigo,
      nome: nome,
      dotCount: (codigo.match(/\./g) || []).length,
      disciplina: String(item.disciplina || '').trim(),
      disciplinas: Array.isArray(item.disciplinas) ? item.disciplinas : [],
      isLod: Boolean(item.isLod || isLodItemName_(nome)),
      filterable: !Boolean(item.isGeneralLod)
    });
  }

  rawNodes.sort(function(a, b) {
    if (a.dotCount !== b.dotCount) return a.dotCount - b.dotCount;
    return a.codigo < b.codigo ? -1 : (a.codigo > b.codigo ? 1 : 0);
  });

  var nodes = [];
  var rootCodes = [];

  for (var j = 0; j < rawNodes.length; j++) {
    var raw = rawNodes[j];
    var parts = String(raw.codigo || '').trim().split('.');
    var level = parts.length - 1;
    var parentCodigo = level > 0 ? parts.slice(0, parts.length - 1).join('.') : '';
    var contratoCodigo = '';
    var osCodigo = '';
    var tipo = 'item';

    if (level === 0) {
      tipo = 'contrato';
      contratoCodigo = raw.codigo;
      rootCodes.push(raw.codigo);
    } else if (level === 1) {
      tipo = 'os';
      contratoCodigo = parts[0] || '';
      osCodigo = raw.codigo;
    } else {
      tipo = 'item';
      contratoCodigo = parts[0] || '';
      osCodigo = parentCodigo;
    }

    nodes.push({
      codigo: raw.codigo,
      nome: raw.nome,
      tipo: tipo,
      nivel: raw.dotCount,
      parentCodigo: parentCodigo,
      contratoCodigo: contratoCodigo,
      osCodigo: osCodigo,
      disciplina: raw.disciplina,
      disciplinas: raw.disciplinas,
      isLod: raw.isLod,
      filterable: raw.filterable
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
  return Boolean(normalizeSheetNameDate_(name));
}

function formatIfDate_(val) {
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
    return formatDateYmdSafe_(val);
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

  var ptMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (ptMatch) {
    var ptDate = buildValidDateSafe_(Number(ptMatch[3]), Number(ptMatch[2]), Number(ptMatch[1]));
    return ptDate ? formatDateYmdSafe_(ptDate) : '';
  }

  var isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    var isoDate = buildValidDateSafe_(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    return isoDate ? formatDateYmdSafe_(isoDate) : '';
  }

  return '';
}

function buildValidDateSafe_(year, month, day) {
  if (!year || !month || !day) return null;
  var date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseSimpleDate_(name) {
  var normalized = normalizeSheetNameDate_(name);
  if (!normalized) return 0;
  var parsed = parseYmdDateSafe_(normalized);
  return parsed ? parsed.getTime() : 0;
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
  PropertiesService.getScriptProperties().setProperty("appData_chunk_count_" + name, String(chunks.length));
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

function firestoreCleanupAppData_(name, data) {
  var props = PropertiesService.getScriptProperties();
  var previousChunkCount = Number(props.getProperty("appData_chunk_count_" + name) || 0);
  if (!previousChunkCount) return;

  var jsonText = JSON.stringify(data || {});
  var nextChunkCount = splitStringIntoChunks_(jsonText, FIREBASE_APPDATA_CHUNK_SIZE).length;
  if (nextChunkCount >= previousChunkCount) return;

  var projectId = firestoreGetProjectId_();
  var baseName = "projects/" + projectId + "/databases/(default)/documents/appData/" + encodeURIComponent(name) + "/chunks/";
  for (var i = nextChunkCount; i < previousChunkCount; i++) {
    var docId = ("00000" + i).slice(-5);
    try {
      firestoreDeleteDocument_(baseName + docId);
    } catch (err) {
      // Se o chunk nao existir mais, seguimos a publicacao.
    }
  }
}

function firestoreDeleteDocument_(documentName) {
  if (!documentName) return;
  var url = "https://firestore.googleapis.com/v1/" + documentName;
  var response = UrlFetchApp.fetch(url, {
    method: "delete",
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + firestoreGetIdToken_() }
  });
  var status = response.getResponseCode();
  if (status === 404) return;
  if (status < 200 || status >= 300) {
    throw new Error("Falha ao apagar documento Firestore " + documentName + " (" + status + "): " + response.getContentText().slice(0, 500));
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

function firestoreValueToJs_(value) {
  if (!value) return undefined;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return Number(value.doubleValue);
  if (value.booleanValue !== undefined) return Boolean(value.booleanValue);
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.nullValue !== undefined) return null;
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values || []).map(function(item) {
      return firestoreValueToJs_(item);
    });
  }
  if (value.mapValue !== undefined) {
    return firestoreFieldsToObject_(value.mapValue.fields || {});
  }
  return undefined;
}

function firestoreFieldsToObject_(fields) {
  var out = {};
  fields = fields || {};
  for (var key in fields) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      out[key] = firestoreValueToJs_(fields[key]);
    }
  }
  return out;
}

function firestoreGetDocument_(documentPath) {
  var url = firestoreGetBaseUrl_() + "/" + String(documentPath || '').replace(/^\/+/, '');
  var response = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + firestoreGetIdToken_() }
  });
  var status = response.getResponseCode();
  if (status === 404) return null;
  if (status < 200 || status >= 300) {
    throw new Error("Firestore GET " + documentPath + " falhou (" + status + "): " + response.getContentText().slice(0, 500));
  }
  return JSON.parse(response.getContentText() || "{}");
}

function firestoreGetAppData_(name) {
  var doc = firestoreGetDocument_("appData/" + encodeURIComponent(name));
  if (!doc || !doc.fields) return null;
  if (doc.fields.data) return firestoreValueToJs_(doc.fields.data);
  if (doc.fields.chunked && Number(firestoreValueToJs_(doc.fields.chunkCount) || 0) > 0) {
    var chunkText = firestoreGetAppDataChunkText_(name);
    return chunkText ? JSON.parse(chunkText) : null;
  }
  if (doc.fields.dataJson) {
    return JSON.parse(String(firestoreValueToJs_(doc.fields.dataJson) || '{}'));
  }
  return firestoreFieldsToObject_(doc.fields);
}

function firestoreGetAppDataChunkText_(name) {
  var url = firestoreGetBaseUrl_() + "/appData/" + encodeURIComponent(name) + "/chunks";
  var response = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + firestoreGetIdToken_() }
  });
  var status = response.getResponseCode();
  if (status === 404) return "";
  if (status < 200 || status >= 300) {
    throw new Error("Firestore chunks appData/" + name + " falhou (" + status + "): " + response.getContentText().slice(0, 500));
  }
  var body = JSON.parse(response.getContentText() || "{}");
  return (body.documents || [])
    .sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); })
    .map(function(doc) { return String(firestoreValueToJs_(doc.fields && doc.fields.value) || ''); })
    .join('');
}

function firestoreSetAppDataDirect_(name, data) {
  var url = firestoreGetBaseUrl_() + "/appData/" + encodeURIComponent(name);
  var response = UrlFetchApp.fetch(url, {
    method: "patch",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + firestoreGetIdToken_() },
    payload: JSON.stringify({
      fields: firestoreObjectToFields_({
        data: data || {},
        updatedAt: new Date()
      })
    })
  });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error("Firestore appData/" + name + " falhou (" + status + "): " + response.getContentText().slice(0, 500));
  }
}

function isFirebaseAuthAction_(action) {
  return [
    'heartbeat',
    'registerUser',
    'authUser',
    'forgotPassword',
    'resetPassword',
    'approveUser',
    'blockUser',
    'saveUserAccess',
    'syncAdminSnapshot',
    'adminResetPassword'
  ].indexOf(String(action || '').trim()) !== -1;
}

function handleFirebaseAuthAction_(payload) {
  var action = String(payload.action || '').trim();
  try {
    if (action === 'heartbeat') return firebaseHeartbeat_(payload);
    if (action === 'registerUser') return firebaseRegisterUser_(payload);
    if (action === 'authUser') return firebaseAuthUser_(payload);
    if (action === 'forgotPassword') return firebaseForgotPassword_(payload);
    if (action === 'resetPassword') return firebaseResetPassword_(payload);
    if (action === 'adminResetPassword') return firebaseAdminResetPassword_(payload);
    if (action === 'approveUser') return firebaseApproveUser_(payload);
    if (action === 'blockUser') return firebaseBlockUser_(payload);
    if (action === 'saveUserAccess') return firebaseSaveUserAccess_(payload);
    if (action === 'syncAdminSnapshot') return firebaseSyncAdminSnapshot_(payload);
  } catch (err) {
    logAuth_(null, 'ERROR', action + ' firebase', String(err));
    return json_({ success: false, error: String(err && err.message ? err.message : err) });
  }
  return json_({ success: false, error: 'Acao invalida.' });
}

function firebaseGetAuthUsers_(authData) {
  if (Array.isArray(authData && authData.users)) return authData.users;
  if (authData && authData.usersByEmail && typeof authData.usersByEmail === 'object') {
    return Object.keys(authData.usersByEmail).map(function(key) {
      return authData.usersByEmail[key];
    });
  }
  return [];
}

function firebaseGetSnapshotUsers_(snapshot) {
  if (Array.isArray(snapshot && snapshot.users)) return snapshot.users;
  if (Array.isArray(snapshot && snapshot.usuarios)) return snapshot.usuarios;
  if (snapshot && snapshot.usersByEmail && typeof snapshot.usersByEmail === 'object') {
    return Object.keys(snapshot.usersByEmail).map(function(key) {
      return snapshot.usersByEmail[key];
    });
  }
  return [];
}

function firebaseFindUserIndex_(users, email) {
  var normalized = normalizeEmail_(email);
  for (var i = 0; i < users.length; i++) {
    if (normalizeEmail_(users[i] && (users[i].email || users[i].id)) === normalized) return i;
  }
  return -1;
}

function firebaseBool_(value) {
  if (typeof value === 'boolean') return value;
  return parseBool_(value);
}

function firebaseNormalizeUser_(raw) {
  raw = raw || {};
  var email = normalizeEmail_(raw.email || raw.id);
  var disciplines = normalizeUserDisciplines_(raw.disciplinas || raw.disciplina || raw.discipline || '');
  var tabs = normalizeAllowedTabs_(raw.allowedTabs || raw.abas || []);
  var resetExpires = raw.resetExpires !== undefined ? raw.resetExpires : raw.resetexpires;
  var lastSeen = raw.lastSeen !== undefined ? raw.lastSeen : raw.lastseen;
  var passwordHash = String(raw.passwordHash || raw.passwordhash || '');
  var resetCode = String(raw.resetCode || raw.resetcode || '');
  var sessionVersion = String(raw.sessionVersion || raw.sessionversion || '');

  return {
    id: email,
    data: raw.data || '',
    nome: String(raw.nome || raw.name || ''),
    email: email,
    cargo: String(raw.cargo || raw.role || ''),
    role: String(raw.role || raw.cargo || ''),
    disciplina: disciplines.length > 0 ? disciplines[0] : String(raw.disciplina || raw.discipline || ''),
    disciplinas: disciplines,
    contrato: String(raw.contrato || raw.contract || ''),
    contract: String(raw.contract || raw.contrato || ''),
    status: String(raw.status || 'pending'),
    alocacao: String(raw.alocacao || raw.allocation || ''),
    allowedTabs: tabs,
    abas: tabs,
    isAdmin: firebaseBool_(raw.isAdmin),
    online: firebaseBool_(raw.online),
    sessionVersion: sessionVersion,
    passwordHash: passwordHash,
    resetCode: resetCode,
    resetExpires: resetExpires || '',
    lastSeen: lastSeen || '',
    onlyThirdParty: firebaseBool_(raw.onlyThirdParty || raw.onlyThirdPartyUsers || raw.somenteTerceirizados),
    showInCharts: raw.showInCharts === undefined ? true : raw.showInCharts !== false
  };
}

function firebaseBuildAuthData_(authData, users) {
  var normalizedUsers = (Array.isArray(users) ? users : []).map(firebaseNormalizeUser_).filter(function(user) {
    return Boolean(user.email);
  });
  var usersByEmail = {};
  normalizedUsers.forEach(function(user) {
    usersByEmail[String(user.email).replace(/[.#$\[\]]/g, '_')] = user;
  });
  return {
    source: 'EAPunificada-Firebase',
    publishedAt: new Date().toISOString(),
    users: normalizedUsers,
    usersByEmail: usersByEmail
  };
}

function firebaseWriteAuthUsers_(authData, users) {
  firestoreSetAppDataDirect_('auth', firebaseBuildAuthData_(authData, users));
}

function firebaseReadAuth_() {
  var authData = firestoreGetAppData_('auth') || {};
  var users = firebaseGetAuthUsers_(authData).map(firebaseNormalizeUser_);
  return { authData: authData, users: users };
}

function firebaseAuthResponseUser_(user) {
  var normalized = firebaseNormalizeUser_(user);
  return {
    id: normalized.id,
    data: normalized.data,
    nome: normalized.nome,
    email: normalized.email,
    cargo: normalized.cargo,
    role: normalized.role,
    disciplina: normalized.disciplina,
    disciplinas: normalized.disciplinas,
    contrato: normalized.contrato,
    contract: normalized.contract,
    status: normalized.status,
    alocacao: normalized.alocacao,
    allowedTabs: normalized.allowedTabs,
    abas: normalized.abas,
    isAdmin: normalized.isAdmin,
    online: normalized.online,
    sessionVersion: normalized.sessionVersion,
    onlyThirdParty: normalized.onlyThirdParty,
    showInCharts: normalized.showInCharts
  };
}

function firebaseFindPreRegistration_(email) {
  var adminData = firestoreGetAppData_('admin') || {};
  var records = Array.isArray(adminData.preRegistrations) ? adminData.preRegistrations : [];
  var normalized = normalizeEmail_(email);
  for (var i = 0; i < records.length; i++) {
    if (normalizeEmail_(records[i] && records[i].email) === normalized) {
      return {
        email: normalized,
        cargo: String(records[i].cargo || ''),
        disciplina: String(records[i].disciplina || ''),
        alocacao: String(records[i].alocacao || ''),
        contrato: String(records[i].contrato || ''),
        allowedTabs: normalizeAllowedTabs_(records[i].allowedTabs || [])
      };
    }
  }
  return null;
}

function firebaseRegisterUser_(payload) {
  var name = String(payload.name || '').trim();
  var email = normalizeEmail_(payload.email);
  var password = String(payload.password || '');
  if (!name) return json_({ success: false, error: 'Informe o nome.' });
  if (!email) return json_({ success: false, error: 'E-mail invalido.' });
  if (password.length < 6) return json_({ success: false, error: 'Senha muito curta (min. 6).' });

  var state = firebaseReadAuth_();
  if (firebaseFindUserIndex_(state.users, email) >= 0) {
    return json_({ success: false, error: 'Este e-mail ja esta cadastrado.' });
  }

  var preReg = firebaseFindPreRegistration_(email);
  var approved = isCorporateEmail_(email) || !!preReg;
  var tabs = preReg ? normalizeAllowedTabs_(preReg.allowedTabs || []) : [];
  var disciplines = preReg ? normalizeUserDisciplines_(preReg.disciplina || '') : [];
  var user = firebaseNormalizeUser_({
    id: email,
    data: new Date().toISOString(),
    nome: name,
    email: email,
    cargo: preReg ? preReg.cargo : '',
    role: preReg ? preReg.cargo : '',
    disciplina: preReg ? preReg.disciplina : '',
    disciplinas: disciplines,
    alocacao: preReg ? preReg.alocacao : '',
    contrato: preReg ? preReg.contrato : '',
    contract: preReg ? preReg.contrato : '',
    status: approved ? 'approved' : 'pending',
    allowedTabs: tabs,
    abas: tabs,
    passwordHash: makePasswordHash_(password),
    resetCode: '',
    resetExpires: '',
    isAdmin: false,
    online: false,
    lastSeen: '',
    sessionVersion: newSessionVersion_(),
    onlyThirdParty: false,
    showInCharts: true
  });

  state.users.push(user);
  firebaseWriteAuthUsers_(state.authData, state.users);
  logAuth_(null, 'INFO', 'registerUser firebase ok', email + (preReg ? ' (pre-cadastro)' : ''));
  return json_({
    success: true,
    message: approved
      ? 'Acesso liberado! Entre com suas credenciais.'
      : 'Cadastro realizado com sucesso. Aguarde aprovacao.'
  });
}

function firebaseAuthUser_(payload) {
  var email = normalizeEmail_(payload.email);
  var password = String(payload.password || '');
  if (!email || !password) return json_({ success: false, error: 'Informe e-mail e senha.' });

  var state = firebaseReadAuth_();
  var index = firebaseFindUserIndex_(state.users, email);
  if (index < 0) {
    logAuth_(null, 'WARN', 'authUser firebase email nao encontrado', email);
    return json_({ success: false, error: 'E-mail ou senha invalidos.' });
  }

  var user = firebaseNormalizeUser_(state.users[index]);
  if (!user.passwordHash) {
    logAuth_(null, 'ERROR', 'authUser firebase sem PasswordHash', email);
    return json_({ success: false, error: 'Conta invalida (senha nao cadastrada).' });
  }
  if (!verifyPassword_(password, user.passwordHash)) {
    logAuth_(null, 'WARN', 'authUser firebase senha invalida', email);
    return json_({ success: false, error: 'E-mail ou senha invalidos.' });
  }
  if (normalizeEmail_(user.status) === 'pending') {
    return json_({ success: false, error: 'Seu cadastro ainda esta aguardando aprovacao do administrador.' });
  }
  if (normalizeEmail_(user.status) === 'blocked') {
    return json_({ success: false, error: 'Seu acesso esta bloqueado. Procure um administrador.' });
  }

  if (!user.sessionVersion) user.sessionVersion = newSessionVersion_();
  user.lastSeen = Date.now();
  user.online = true;
  state.users[index] = user;
  firebaseWriteAuthUsers_(state.authData, state.users);
  logAuth_(null, 'INFO', 'authUser firebase ok', email);
  return json_({ success: true, user: firebaseAuthResponseUser_(user) });
}

function firebaseHeartbeat_(payload) {
  var email = normalizeEmail_(payload.email);
  if (!email) return json_({ success: false, error: 'E-mail invalido.' });
  var state = firebaseReadAuth_();
  var index = firebaseFindUserIndex_(state.users, email);
  if (index < 0) return json_({ success: true, sessionVersion: '' });

  var user = firebaseNormalizeUser_(state.users[index]);
  var requestedVersion = String(payload.sessionVersion || '').trim();
  if (requestedVersion && user.sessionVersion && requestedVersion !== user.sessionVersion) {
    return json_({ success: false, error: 'Sessao expirada.', sessionVersion: user.sessionVersion });
  }
  user.lastSeen = Date.now();
  user.online = true;
  state.users[index] = user;
  firebaseWriteAuthUsers_(state.authData, state.users);
  return json_({ success: true, sessionVersion: user.sessionVersion || '' });
}

function firebaseForgotPassword_(payload) {
  var email = normalizeEmail_(payload.email);
  if (!email) return json_({ success: false, error: 'E-mail invalido.' });
  var state = firebaseReadAuth_();
  var index = firebaseFindUserIndex_(state.users, email);
  if (index < 0) {
    // Resposta neutra (anti-enumeracao), mas registra para diagnostico: se o reset
    // "nao chega", quase sempre e porque o e-mail nao existe no appData/auth.
    logAuth_(null, 'WARN', 'forgotPassword email nao encontrado no auth', email + ' (total=' + state.users.length + ')');
    return json_({ success: true, message: 'Se o e-mail estiver cadastrado, o codigo foi enviado.' });
  }

  var user = firebaseNormalizeUser_(state.users[index]);
  var resetCode = randomCode_(6);

  try {
    sendResetCodeEmail_(email, resetCode, 15);
  } catch (mailErr) {
    logAuth_(null, 'ERROR', 'forgotPassword firebase falha MailApp', String(mailErr));
    return json_({ success: false, error: recoveryEmailErrorMessage_(mailErr) });
  }

  // So invalida o codigo anterior depois que o provedor aceitou o novo e-mail.
  user.resetCode = resetCode;
  user.resetExpires = Date.now() + 15 * 60 * 1000;
  state.users[index] = user;
  firebaseWriteAuthUsers_(state.authData, state.users);

  logAuth_(null, 'INFO', 'forgotPassword firebase code enviado', email);
  return json_({ success: true, message: 'Codigo enviado. Confira a caixa de entrada e o spam.' });
}

function firebaseResetPassword_(payload) {
  var email = normalizeEmail_(payload.email);
  var code = String(payload.code || '').trim();
  var newPassword = String(payload.newPassword || '');
  if (!email) return json_({ success: false, error: 'E-mail invalido.' });
  if (!code) return json_({ success: false, error: 'Informe o codigo.' });
  if (newPassword.length < 6) return json_({ success: false, error: 'Senha muito curta (min. 6).' });

  var state = firebaseReadAuth_();
  var index = firebaseFindUserIndex_(state.users, email);
  if (index < 0) return json_({ success: false, error: 'Codigo invalido.' });

  var user = firebaseNormalizeUser_(state.users[index]);
  if (!user.resetCode || user.resetCode !== code) return json_({ success: false, error: 'Codigo invalido.' });
  if (!Number(user.resetExpires || 0) || Date.now() > Number(user.resetExpires || 0)) {
    return json_({ success: false, error: 'Codigo expirado.' });
  }

  user.passwordHash = makePasswordHash_(newPassword);
  user.resetCode = '';
  user.resetExpires = '';
  user.lastSeen = '';
  user.online = false;
  user.sessionVersion = newSessionVersion_();
  state.users[index] = user;
  firebaseWriteAuthUsers_(state.authData, state.users);
  logAuth_(null, 'INFO', 'resetPassword firebase ok', email);
  return json_({ success: true, message: 'Senha redefinida com sucesso.' });
}

function firebaseAdminResetPassword_(payload) {
  var email = normalizeEmail_(payload.email);
  if (!email) return json_({ success: false, error: 'E-mail invalido.' });
  var state = firebaseReadAuth_();
  var index = firebaseFindUserIndex_(state.users, email);
  if (index < 0) return json_({ success: false, error: 'Usuario nao encontrado.' });

  var tempPassword = randomTemporaryPassword_();
  var user = firebaseNormalizeUser_(state.users[index]);
  user.passwordHash = makePasswordHash_(tempPassword);
  user.resetCode = '';
  user.resetExpires = '';
  user.lastSeen = '';
  user.online = false;
  user.sessionVersion = newSessionVersion_();
  state.users[index] = user;
  firebaseWriteAuthUsers_(state.authData, state.users);

  try {
    sendAdminTemporaryPasswordEmail_(email, tempPassword);
  } catch (mailErr) {
    logAuth_(null, 'ERROR', 'adminResetPassword firebase falha MailApp', String(mailErr));
    return json_({ success: false, error: 'Falha ao enviar senha temporaria por e-mail.' });
  }

  logAuth_(null, 'INFO', 'adminResetPassword firebase ok', email);
  return json_({ success: true, message: 'Senha temporaria enviada por e-mail.' });
}

function firebasePatchUser_(email, patch) {
  var state = firebaseReadAuth_();
  var index = firebaseFindUserIndex_(state.users, email);
  if (index < 0) return null;
  var user = firebaseNormalizeUser_(state.users[index]);
  for (var key in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) user[key] = patch[key];
  }
  user.lastSeen = '';
  user.online = false;
  user.sessionVersion = newSessionVersion_();
  state.users[index] = user;
  firebaseWriteAuthUsers_(state.authData, state.users);
  return user;
}

function firebaseApproveUser_(payload) {
  var email = normalizeEmail_(payload.email);
  if (!email) return json_({ success: false, error: 'E-mail invalido.' });
  var patch = { status: 'approved' };
  if (payload.name !== undefined) patch.nome = String(payload.name || '');
  if (payload.role !== undefined) { patch.cargo = String(payload.role || ''); patch.role = String(payload.role || ''); }
  if (payload.discipline !== undefined) {
    patch.disciplinas = normalizeUserDisciplines_(payload.discipline);
    patch.disciplina = patch.disciplinas.length > 0 ? patch.disciplinas[0] : '';
  }
  if (payload.allowedTabs !== undefined) { patch.allowedTabs = normalizeAllowedTabs_(payload.allowedTabs); patch.abas = patch.allowedTabs; }
  if (payload.allocation !== undefined) patch.alocacao = String(payload.allocation || '');
  if (payload.contract !== undefined) { patch.contrato = String(payload.contract || ''); patch.contract = String(payload.contract || ''); }
  if (payload.isAdmin !== undefined) patch.isAdmin = firebaseBool_(payload.isAdmin);
  var user = firebasePatchUser_(email, patch);
  if (!user) return json_({ success: false, error: 'Usuario nao encontrado.' });
  logAuth_(null, 'INFO', 'approveUser firebase ok', email);
  return json_({ success: true });
}

function firebaseBlockUser_(payload) {
  var email = normalizeEmail_(payload.email);
  if (!email) return json_({ success: false, error: 'E-mail invalido.' });
  var user = firebasePatchUser_(email, { status: 'blocked' });
  if (!user) return json_({ success: false, error: 'Usuario nao encontrado.' });
  logAuth_(null, 'INFO', 'blockUser firebase ok', email);
  return json_({ success: true });
}

function firebaseSaveUserAccess_(payload) {
  var email = normalizeEmail_(payload.email);
  if (!email) return json_({ success: false, error: 'E-mail invalido.' });
  var patch = {};
  if (payload.name !== undefined) patch.nome = String(payload.name || '');
  if (payload.role !== undefined) { patch.cargo = String(payload.role || ''); patch.role = String(payload.role || ''); }
  if (payload.discipline !== undefined) {
    patch.disciplinas = normalizeUserDisciplines_(payload.discipline);
    patch.disciplina = patch.disciplinas.length > 0 ? patch.disciplinas[0] : '';
  }
  if (payload.allowedTabs !== undefined) { patch.allowedTabs = normalizeAllowedTabs_(payload.allowedTabs); patch.abas = patch.allowedTabs; }
  if (payload.allocation !== undefined) patch.alocacao = String(payload.allocation || '');
  if (payload.contract !== undefined) { patch.contrato = String(payload.contract || ''); patch.contract = String(payload.contract || ''); }
  if (payload.isAdmin !== undefined) patch.isAdmin = firebaseBool_(payload.isAdmin);
  if (payload.onlyThirdParty !== undefined) patch.onlyThirdParty = firebaseBool_(payload.onlyThirdParty);
  if (payload.showInCharts !== undefined) patch.showInCharts = payload.showInCharts !== false;
  if (payload.status !== undefined) patch.status = String(payload.status || 'pending');
  var user = firebasePatchUser_(email, patch);
  if (!user) return json_({ success: false, error: 'Usuario nao encontrado.' });
  logAuth_(null, 'INFO', 'saveUserAccess firebase ok', email);
  return json_({ success: true });
}

function firebaseSyncAdminSnapshot_(payload) {
  var snapshot = payload.snapshot || {};
  var snapshotUsers = firebaseGetSnapshotUsers_(snapshot);
  var state = firebaseReadAuth_();
  if (snapshotUsers.length === 0 && state.users.length > 0) {
    throw new Error('Protecao de dados: syncAdminSnapshot recebeu zero usuarios e nao vai publicar lista vazia.');
  }

  var existingByEmail = {};
  state.users.forEach(function(user) {
    existingByEmail[normalizeEmail_(user.email || user.id)] = user;
  });

  var nextUsers = [];
  var seen = {};
  snapshotUsers.forEach(function(raw) {
    var email = normalizeEmail_(raw && (raw.email || raw.id));
    if (!email) return;
    var existing = existingByEmail[email] || {};
    var merged = firebaseNormalizeUser_(raw);
    merged.passwordHash = String(existing.passwordHash || existing.passwordhash || merged.passwordHash || '');
    merged.resetCode = String(existing.resetCode || existing.resetcode || merged.resetCode || '');
    merged.resetExpires = existing.resetExpires || existing.resetexpires || merged.resetExpires || '';
    merged.lastSeen = existing.lastSeen || existing.lastseen || merged.lastSeen || '';
    merged.sessionVersion = String(merged.sessionVersion || existing.sessionVersion || existing.sessionversion || '');
    nextUsers.push(merged);
    seen[email] = true;
  });

  state.users.forEach(function(existing) {
    var email = normalizeEmail_(existing.email || existing.id);
    if (email && !seen[email]) nextUsers.push(firebaseNormalizeUser_(existing));
  });

  firestoreSetAppDataDirect_('admin', snapshot);
  firebaseWriteAuthUsers_(state.authData, nextUsers);
  logAuth_(null, 'INFO', 'syncAdminSnapshot firebase ok', 'users=' + nextUsers.length);
  return json_({ success: true });
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

function getOrCreateLoginSheet_(ss) {
  var sh = ss.getSheetByName('login');
  if (!sh) {
    sh = ss.insertSheet('login');
  }

  if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.clear();
    sh.getRange(1, 1, 1, 17).setValues([[
      'Data', 'Nome', 'Email', 'Role', 'Disciplina', 'Status', 'Abas',
      'PasswordHash', 'ResetCode', 'ResetExpires', 'IsAdmin', 'LastSeen',
      'Alocacao', 'Contrato', 'SessionVersion', 'OnlyThirdParty', 'ShowInCharts'
    ]]);
  }

  return sh;
}

function getOrCreatePreRegistrationsSheet_(ss) {
  var sh = ss.getSheetByName('pre_cadastros');
  if (!sh) {
    sh = ss.insertSheet('pre_cadastros');
  }

  if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.clear();
    sh.getRange(1, 1, 1, 6).setValues([['Email', 'Cargo', 'Disciplina', 'Alocacao', 'Contrato', 'AllowedTabs']]);
  }

  return sh;
}

function savePreRegistrationsToSheet_(ss, records) {
  var sh = getOrCreatePreRegistrationsSheet_(ss);
  sh.clearContents();
  sh.getRange(1, 1, 1, 6).setValues([['Email', 'Cargo', 'Disciplina', 'Alocacao', 'Contrato', 'AllowedTabs']]);

  if (!Array.isArray(records) || records.length === 0) return;

  var rows = records.map(function(r) {
    return [
      String(r.email || '').trim().toLowerCase(),
      String(r.cargo || ''),
      String(r.disciplina || ''),
      String(r.alocacao || ''),
      String(r.contrato || ''),
      normalizeAllowedTabs_(r.allowedTabs || []),
    ];
  }).filter(function(row) { return row[0]; });

  if (rows.length > 0) {
    sh.getRange(2, 1, rows.length, 6).setValues(rows);
  }
}

function findPreRegistration_(ss, email) {
  var sh = getOrCreatePreRegistrationsSheet_(ss);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  var numCols = Math.max(6, sh.getLastColumn());
  var data = sh.getRange(2, 1, lastRow - 1, numCols).getValues();
  var normalizedEmail = String(email || '').trim().toLowerCase();

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim().toLowerCase() === normalizedEmail) {
      return {
        email: normalizedEmail,
        cargo: String(data[i][1] || ''),
        disciplina: String(data[i][2] || ''),
        alocacao: String(data[i][3] || ''),
        contrato: String(data[i][4] || ''),
        allowedTabs: parseAllowedTabs_(data[i][5] || ''),
      };
    }
  }

  return null;
}

function getHeaderMapSafe_(sheet) {
  var lastColumn = Math.max(17, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) {
    return String(value || '').trim().toLowerCase();
  });

  function ensure(name) {
    var key = String(name).toLowerCase();
    var index = headers.indexOf(key);
    if (index !== -1) {
      return index;
    }

    sheet.getRange(1, headers.length + 1).setValue(name);
    headers.push(key);
    return headers.length - 1;
  }

  return {
    data: ensure('Data'),
    nome: ensure('Nome'),
    email: ensure('Email'),
    role: ensure('Role'),
    disciplina: ensure('Disciplina'),
    status: ensure('Status'),
    abas: ensure('Abas'),
    passwordhash: ensure('PasswordHash'),
    resetcode: ensure('ResetCode'),
    resetexpires: ensure('ResetExpires'),
    isadmin: ensure('IsAdmin'),
    lastseen: ensure('LastSeen'),
    alocacao: ensure('Alocacao'),
    contrato: ensure('Contrato'),
    sessionversion: ensure('SessionVersion'),
    onlythirdparty: ensure('OnlyThirdParty'),
    showincharts: ensure('ShowInCharts')
  };
}

function getHeaderWidth_(header) {
  var max = 0;
  for (var key in header) {
    if (Object.prototype.hasOwnProperty.call(header, key)) {
      max = Math.max(max, header[key]);
    }
  }
  return max + 1;
}

function newEmptyLoginRow_(header) {
  var row = [];
  var width = getHeaderWidth_(header);
  for (var i = 0; i < width; i++) {
    row.push('');
  }
  return row;
}

function syncUsersSnapshotToLoginSheet_(ss, items) {
  var loginSheet = getOrCreateLoginSheet_(ss);
  var header = getHeaderMapSafe_(loginSheet);
  var width = getHeaderWidth_(header);
  var existingValues = loginSheet.getDataRange().getValues();
  var existingByEmail = {};

  for (var i = 1; i < existingValues.length; i++) {
    var existingEmail = normalizeEmail_(existingValues[i][header.email]);
    if (!existingEmail) continue;
    existingByEmail[existingEmail] = existingValues[i];
  }

  var rows = [];
  var users = Array.isArray(items) ? items : [];
  for (var u = 0; u < users.length; u++) {
    var item = users[u] || {};
    var email = normalizeEmail_(item.email);
    if (!email) continue;
    var existing = existingByEmail[email] || newEmptyLoginRow_(header);
    var row = existing.slice(0, width);
    while (row.length < width) row.push('');
    var disciplinas = normalizeUserDisciplines_(item.disciplinas || item.disciplina || '');

    row[header.data] = row[header.data] || new Date().toLocaleString('pt-BR');
    row[header.nome] = String(item.nome || '');
    row[header.email] = email;
    row[header.role] = String(item.cargo || item.role || '');
    row[header.disciplina] = disciplinas.join(' | ');
    row[header.status] = String(item.status || 'pending');
    row[header.abas] = normalizeAllowedTabs_(item.allowedTabs || item.abas || []);
    row[header.isadmin] = boolToSheet_(item.isAdmin);
    row[header.alocacao] = String(item.alocacao || '');
    row[header.contrato] = String(item.contrato || item.contract || '');
    row[header.onlythirdparty] = boolToSheet_(item.onlyThirdParty || item.onlyThirdPartyUsers || item.somenteTerceirizados);
    row[header.showincharts] = boolToSheet_(item.showInCharts !== false);
    rows.push(row);
  }

  if (rows.length === 0 && existingValues.length > 1) {
    throw new Error('Protecao de dados: syncAdminSnapshot recebeu zero usuarios e nao vai limpar a aba login.');
  }

  loginSheet.clearContents();
  var headerRow = [];
  for (var key in header) {
    if (!Object.prototype.hasOwnProperty.call(header, key)) continue;
    headerRow[header[key]] = key;
  }
  var titleRow = headerRow.map(function(name) {
    if (name === 'isadmin') return 'IsAdmin';
    if (name === 'lastseen') return 'LastSeen';
    if (name === 'passwordhash') return 'PasswordHash';
    if (name === 'resetcode') return 'ResetCode';
    if (name === 'resetexpires') return 'ResetExpires';
    if (name === 'sessionversion') return 'SessionVersion';
    if (name === 'onlythirdparty') return 'OnlyThirdParty';
    if (name === 'showincharts') return 'ShowInCharts';
    return name.charAt(0).toUpperCase() + name.slice(1);
  });
  loginSheet.getRange(1, 1, 1, titleRow.length).setValues([titleRow]);
  if (rows.length > 0) {
    loginSheet.getRange(2, 1, rows.length, titleRow.length).setValues(rows);
  }
}

function setLoginRowPatch_(sheet, rowNumber, header, patch) {
  var width = getHeaderWidth_(header);
  var range = sheet.getRange(rowNumber, 1, 1, width);
  var row = range.getValues()[0];

  for (var key in patch) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) {
      continue;
    }
    if (header[key] === undefined) {
      continue;
    }
    row[header[key]] = patch[key];
  }

  range.setValues([row]);
}

function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function isCorporateEmail_(email) {
  return normalizeEmail_(email).indexOf('@quantaconsultoria.com') !== -1;
}

function findUserRowByEmail_(values, header, email) {
  var normalized = normalizeEmail_(email);
  for (var i = 1; i < values.length; i++) {
    if (normalizeEmail_(values[i][header.email]) === normalized) {
      return i;
    }
  }
  return -1;
}

function parseDelimitedList_(value) {
  if (Array.isArray(value)) {
    return value.map(function(item) {
      return String(item || '').trim();
    }).filter(Boolean);
  }

  return String(value || '')
    .split(/[\n,;|]+/)
    .map(function(item) {
      return String(item || '').trim();
    })
    .filter(Boolean);
}

function normalizeUserDisciplines_(value) {
  return parseDelimitedList_(value);
}

function normalizeAllowedTabs_(value) {
  return parseDelimitedList_(value).map(function(item) {
    return String(item || '').trim().toLowerCase();
  }).filter(Boolean);
}

function parseBool_(value) {
  var text = String(value || '').trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes' || text === 'sim';
}

function boolToSheet_(value) {
  return parseBool_(value) ? 'true' : 'false';
}

function parseBoolWithDefault_(value, defaultValue) {
  if (value === '' || value === null || value === undefined) return defaultValue;
  return parseBool_(value);
}

function normalizeUserResponse_(row, header) {
  var lastSeen = Number(row[header.lastseen] || 0);
  var online = lastSeen > 0 && (Date.now() - lastSeen <= 2 * 60 * 1000);
  var disciplines = normalizeUserDisciplines_(row[header.disciplina] || '');
  var tabs = normalizeAllowedTabs_(row[header.abas] || '');

  return {
    id: String(row[header.email] || ''),
    data: row[header.data],
    nome: String(row[header.nome] || ''),
    email: String(row[header.email] || ''),
    cargo: String(row[header.role] || ''),
    role: String(row[header.role] || ''),
    disciplina: disciplines.length > 0 ? disciplines[0] : String(row[header.disciplina] || ''),
    disciplinas: disciplines,
    contrato: String(row[header.contrato] || ''),
    contract: String(row[header.contrato] || ''),
    status: String(row[header.status] || 'pending'),
    alocacao: String(row[header.alocacao] || ''),
    allowedTabs: tabs,
    abas: tabs,
    isAdmin: parseBool_(row[header.isadmin]),
    online: online,
    sessionVersion: String(row[header.sessionversion] || ''),
    onlyThirdParty: parseBool_(row[header.onlythirdparty]),
    showInCharts: header.showincharts === undefined ? true : parseBoolWithDefault_(row[header.showincharts], true)
  };
}

function newSessionVersion_() {
  return String(Date.now()) + '-' + Utilities.getUuid().slice(0, 8);
}

function makePasswordHash_(password) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(password || ''),
    Utilities.Charset.UTF_8
  );

  return 'sha256:' + digest.map(function(b) {
    return ('0' + (b & 255).toString(16)).slice(-2);
  }).join('');
}

function verifyPassword_(password, stored) {
  var hash = String(stored || '').trim();
  if (!hash) return false;
  if (hash.indexOf('sha256:') === 0) {
    return makePasswordHash_(password) === hash;
  }
  // Formato legado: "<saltHex>:<sha256Hex>" com hash = SHA-256(salt + '|' + senha).
  var parts = hash.split(':');
  if (parts.length === 2 && /^[0-9a-fA-F]+$/.test(parts[0]) && /^[0-9a-fA-F]{64}$/.test(parts[1])) {
    var raw = parts[0] + '|' + String(password || '');
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
    var hex = bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
    return hex.toLowerCase() === parts[1].toLowerCase();
  }
  return String(password || '') === hash;
}

function randomCode_(length) {
  var digits = '';
  var size = Math.max(4, Number(length || 6));
  for (var i = 0; i < size; i++) {
    digits += String(Math.floor(Math.random() * 10));
  }
  return digits;
}

function randomTemporaryPassword_() {
  return 'Q' + randomCode_(5) + randomCode_(3);
}

function ensureAuthLogSheet_(ss) {
  var sh = ss.getSheetByName('logs_auth');
  if (!sh) {
    sh = ss.insertSheet('logs_auth');
    sh.appendRow(['Data', 'Level', 'Evento', 'Detalhe']);
  } else if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.clear();
    sh.appendRow(['Data', 'Level', 'Evento', 'Detalhe']);
  }
  return sh;
}

function logAuth_(ss, level, eventName, detail) {
  try {
    if (!ss) {
      Logger.log('[AUTH][' + String(level || 'INFO') + '] ' + String(eventName || '') + ' ' + String(detail || ''));
      return;
    }
    ensureAuthLogSheet_(ss).appendRow([
      new Date().toISOString(),
      String(level || 'INFO'),
      String(eventName || ''),
      String(detail || '')
    ]);
  } catch (err) {
    Logger.log('[AUTH][' + String(level || 'INFO') + '] ' + String(eventName || '') + ' ' + String(detail || ''));
  }
}

function sendResetCodeEmail_(to, code, minutesValid) {
  var quota = MailApp.getRemainingDailyQuota();
  if (Number(quota || 0) < 1) {
    throw new Error('EMAIL_QUOTA_EXHAUSTED');
  }
  MailApp.sendEmail({
    to: String(to || ''),
    subject: 'EcoQuanta - Codigo de recuperacao',
    name: 'EcoQuanta',
    body: 'Recebemos uma solicitacao para redefinir sua senha no EcoQuanta.\n\nCodigo: ' + String(code || '') + '\nValidade: ' + String(minutesValid || 15) + ' minutos.\n\nSe nao foi voce, ignore este e-mail.',
    htmlBody: '<div style="font-family:Arial,sans-serif;color:#2d2d2d;line-height:1.5"><h2 style="color:#f05d28">EcoQuanta</h2><p>Recebemos uma solicitacao para redefinir sua senha.</p><p>Seu codigo e:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">' + String(code || '') + '</p><p>Validade: ' + String(minutesValid || 15) + ' minutos.</p><p style="color:#757575">Se nao foi voce, ignore este e-mail.</p></div>'
  });
}

function recoveryEmailErrorMessage_(error) {
  var detail = String(error && error.message ? error.message : error || '');
  if (detail.indexOf('EMAIL_QUOTA_EXHAUSTED') !== -1 || /quota|limit|too many/i.test(detail)) {
    return 'O limite diario de e-mails de recuperacao foi atingido. Tente novamente apos a renovacao da cota ou solicite uma redefinicao ao administrador.';
  }
  if (/authorization|permission|scope|access denied|not authorized/i.test(detail)) {
    return 'O envio de recuperacao precisa ser reautorizado pelo administrador do Apps Script.';
  }
  return 'Nao foi possivel enviar o e-mail de recuperacao agora. Tente novamente em alguns minutos.';
}

function sendAdminTemporaryPasswordEmail_(to, tempPassword) {
  MailApp.sendEmail({
    to: String(to || ''),
    subject: 'EcoQuanta - Senha temporaria',
    body: 'Sua senha temporaria e: ' + String(tempPassword || '') + '\n\nApos entrar, altere a senha imediatamente.'
  });
}

// JSON publico desativado: a EAP agora permanece somente no Firebase.
function publishLoginDataToFirebaseNow() { return "Login via planilha desativado. Use appData/auth no Firebase."; }
function scheduleCompressedDataPublicJson() { return "Publicacao JSON desativada."; }
function scheduleCompressedDataPublicJson_() { return "Publicacao JSON desativada."; }
function scheduleFullPublicJsonRefresh() { return "Publicacao JSON desativada."; }
function publishCompressedDataToPublicJsonByTrigger() { return "Publicacao JSON desativada."; }
function publishCompressedDataToPublicJsonNow() { return "Publicacao JSON desativada."; }
function syncAllPublicJsonNow() { return "Publicacao JSON desativada."; }
function requestRegistroImmediateSync_() { return "Publicacao JSON desativada."; }
function publishCompressedDataToPublicJson() { return publishCompressedDataToFirebaseNow(); }
