/**
 * ============================================================================
 * BACK-END DE ACESSO / ADMINISTRAÇÃO / REGISTRO DE ATIVIDADES / CRONOGRAMA
 * ============================================================================
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🔄 QUANTA Sync')
      .addItem('Subir Banco de Dados Oficial', 'pushFullDatabaseToFirebase')
      .addToUi();
}

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var loginSheet = getOrCreateLoginSheet_(ss);
    var header = getHeaderMapSafe_(loginSheet);
    var values = loginSheet.getDataRange().getValues();

    logAuth_(ss, 'INFO', 'doPost recebido', safeJson_(data));
    var action = String(data.action || '').trim();

    if (action === 'registerUser') {
      var email = normalizeEmail_(data.email);
      var password = String(data.password || '');
      var name = String(data.name || '').trim();

      if (!name) return json_({ success: false, error: 'Informe o nome.' });
      if (!email) return json_({ success: false, error: 'E-mail inválido.' });
      if (password.length < 6) return json_({ success: false, error: 'Senha muito curta (mín. 6).' });

      var rowIndex = findUserRowByEmail_(values, header, email);
      if (rowIndex >= 0) return json_({ success: false, error: 'Este e-mail já está cadastrado.' });

      var hash = makePasswordHash_(password);
      var row = newEmptyLoginRow_(header);

      row[header.data] = new Date().toLocaleString('pt-BR');
      row[header.nome] = name;
      row[header.email] = email;
      row[header.role] = '';
      row[header.disciplina] = '';
      row[header.status] = 'pending';
      row[header.abas] = '';
      row[header.passwordhash] = hash;
      row[header.resetcode] = '';
      row[header.resetexpires] = '';
      row[header.isadmin] = 'false';
      row[header.lastseen] = '';

      loginSheet.appendRow(row);
      logAuth_(ss, 'INFO', 'registerUser ok', email);
      scheduleFirebasePush_(); return json_({ success: true, message: 'Cadastro realizado com sucesso. Aguarde aprovação.' });
    }

    if (action === 'authUser') {
      var email2 = normalizeEmail_(data.email);
      var pass2 = String(data.password || '');

      if (!email2 || !pass2) return json_({ success: false, error: 'Informe e-mail e senha.' });

      var idx = findUserRowByEmail_(values, header, email2);
      if (idx < 0) {
        logAuth_(ss, 'WARN', 'authUser email não encontrado', email2);
        return json_({ success: false, error: 'E-mail ou senha inválidos.' });
      }

      var row2 = values[idx];
      var storedHash = String(row2[header.passwordhash] || '').trim();
      var status2 = String(row2[header.status] || '').trim().toLowerCase();

      if (!storedHash) {
        logAuth_(ss, 'ERROR', 'authUser sem PasswordHash', email2);
        return json_({ success: false, error: 'Conta inválida (senha não cadastrada).' });
      }

      if (!verifyPassword_(pass2, storedHash)) {
        logAuth_(ss, 'WARN', 'authUser senha inválida', email2);
        return json_({ success: false, error: 'E-mail ou senha inválidos.' });
      }

      if (status2 === 'pending') {
        return json_({ success: false, error: 'Seu cadastro ainda está aguardando aprovação do administrador.' });
      }

      if (status2 === 'blocked') {
        return json_({ success: false, error: 'Seu acesso está bloqueado. Procure um administrador.' });
      }

      loginSheet.getRange(idx + 1, header.lastseen + 1).setValue(Date.now());
      var user = normalizeUserResponse_(row2, header);

      logAuth_(ss, 'INFO', 'authUser ok', email2);
      scheduleFirebasePush_(); return json_({ success: true, user: user });
    }

    if (action === 'heartbeat') {
      var emailHb = normalizeEmail_(data.email);
      if (!emailHb) return json_({ success: false, error: 'E-mail inválido.' });

      var idxHb = findUserRowByEmail_(values, header, emailHb);
      if (idxHb < 0) return json_({ success: false, error: 'Usuário não encontrado.' });

      loginSheet.getRange(idxHb + 1, header.lastseen + 1).setValue(Date.now());
      scheduleFirebasePush_(); return json_({ success: true });
    }

    if (action === 'forgotPassword') {
      var email3 = normalizeEmail_(data.email);
      if (!email3) return json_({ success: false, error: 'E-mail inválido.' });

      logRecovery_(ss, email3, 'solicitado', '');
      var idx2 = findUserRowByEmail_(values, header, email3);

      if (idx2 < 0) {
        logRecovery_(ss, email3, 'ignorado', 'email não encontrado');
        scheduleFirebasePush_(); return json_({ success: true });
      }

      var code = randomCode_(6);
      var expires = Date.now() + 15 * 60 * 1000;

      loginSheet.getRange(idx2 + 1, header.resetcode + 1).setValue(code);
      loginSheet.getRange(idx2 + 1, header.resetexpires + 1).setValue(expires);

      try {
        sendResetCodeEmail_(email3, code, 15);
        logRecovery_(ss, email3, 'enviado', 'código enviado');
        logAuth_(ss, 'INFO', 'forgotPassword code enviado', email3);
      } catch (mailErr) {
        var detail = (mailErr && mailErr.stack) ? mailErr.stack : String(mailErr);
        logRecovery_(ss, email3, 'erro', detail);
        logAuth_(ss, 'ERROR', 'forgotPassword falha MailApp', detail);
        return json_({ success: false, error: 'Falha ao enviar e-mail. Verifique permissões do Apps Script.' });
      }

      scheduleFirebasePush_(); return json_({ success: true });
    }

    if (action === 'resetPassword' || action === 'resetSenha' || action === 'confirmReset') {
      var email4 = normalizeEmail_(data.email);
      var codeIn = String(data.code || '').trim();
      var newPass = String(data.newPassword || '');

      if (!email4) return json_({ success: false, error: 'E-mail inválido.' });
      if (!codeIn) return json_({ success: false, error: 'Informe o código.' });
      if (newPass.length < 6) return json_({ success: false, error: 'Senha muito curta (mín. 6).' });

      var idx3 = findUserRowByEmail_(values, header, email4);
      if (idx3 < 0) return json_({ success: false, error: 'Código inválido.' });

      var row3 = values[idx3];
      var codeStored = String(row3[header.resetcode] || '').trim();
      var expStored = Number(row3[header.resetexpires] || 0);

      if (!codeStored || codeStored !== codeIn) return json_({ success: false, error: 'Código inválido.' });
      if (!expStored || Date.now() > expStored) return json_({ success: false, error: 'Código expirado.' });

      var newHash = makePasswordHash_(newPass);

      loginSheet.getRange(idx3 + 1, header.passwordhash + 1).setValue(newHash);
      loginSheet.getRange(idx3 + 1, header.resetcode + 1).setValue('');
      loginSheet.getRange(idx3 + 1, header.resetexpires + 1).setValue('');
      loginSheet.getRange(idx3 + 1, header.lastseen + 1).setValue('');

      logRecovery_(ss, email4, 'concluido', 'senha redefinida');
      logAuth_(ss, 'INFO', 'resetPassword ok', email4);

      scheduleFirebasePush_(); return json_({ success: true });
    }

    if (action === 'approveUser') {
      var emailA = normalizeEmail_(data.email);
      if (!emailA) return json_({ success: false, error: 'E-mail inválido.' });

      var idxA = findUserRowByEmail_(values, header, emailA);
      if (idxA < 0) return json_({ success: false, error: 'Usuário não encontrado.' });

      if (data.name !== undefined) loginSheet.getRange(idxA + 1, header.nome + 1).setValue(data.name || '');
      if (data.role !== undefined) loginSheet.getRange(idxA + 1, header.role + 1).setValue(data.role || '');
      if (data.discipline !== undefined) loginSheet.getRange(idxA + 1, header.disciplina + 1).setValue(data.discipline || '');
      if (data.allowedTabs !== undefined) loginSheet.getRange(idxA + 1, header.abas + 1).setValue(normalizeAllowedTabs_(data.allowedTabs));
      if (data.isAdmin !== undefined) loginSheet.getRange(idxA + 1, header.isadmin + 1).setValue(boolToSheet_(data.isAdmin));

      loginSheet.getRange(idxA + 1, header.status + 1).setValue('approved');
      logAuth_(ss, 'INFO', 'approveUser ok', emailA);
      scheduleFirebasePush_(); return json_({ success: true });
    }

    if (action === 'blockUser') {
      var emailB = normalizeEmail_(data.email);
      if (!emailB) return json_({ success: false, error: 'E-mail inválido.' });

      var idxB = findUserRowByEmail_(values, header, emailB);
      if (idxB < 0) return json_({ success: false, error: 'Usuário não encontrado.' });

      loginSheet.getRange(idxB + 1, header.status + 1).setValue('blocked');
      loginSheet.getRange(idxB + 1, header.lastseen + 1).setValue('');
      logAuth_(ss, 'INFO', 'blockUser ok', emailB);
      scheduleFirebasePush_(); return json_({ success: true });
    }

    if (action === 'saveUserAccess') {
      var emailS = normalizeEmail_(data.email);
      if (!emailS) return json_({ success: false, error: 'E-mail inválido.' });

      var idxS = findUserRowByEmail_(values, header, emailS);
      if (idxS < 0) return json_({ success: false, error: 'Usuário não encontrado.' });

      if (data.name !== undefined) loginSheet.getRange(idxS + 1, header.nome + 1).setValue(String(data.name || ''));
      if (data.role !== undefined) loginSheet.getRange(idxS + 1, header.role + 1).setValue(String(data.role || ''));
      if (data.discipline !== undefined) loginSheet.getRange(idxS + 1, header.disciplina + 1).setValue(String(data.discipline || ''));
      if (data.allowedTabs !== undefined) loginSheet.getRange(idxS + 1, header.abas + 1).setValue(normalizeAllowedTabs_(data.allowedTabs));
      if (data.isAdmin !== undefined) loginSheet.getRange(idxS + 1, header.isadmin + 1).setValue(boolToSheet_(data.isAdmin));
      if (data.status !== undefined) loginSheet.getRange(idxS + 1, header.status + 1).setValue(String(data.status || 'pending'));

      logAuth_(ss, 'INFO', 'saveUserAccess ok', emailS);
      scheduleFirebasePush_(); return json_({ success: true });
    }

    if (action === 'adminResetPassword') {
      var emailR = normalizeEmail_(data.email);
      if (!emailR) return json_({ success: false, error: 'E-mail inválido.' });

      var idxR = findUserRowByEmail_(values, header, emailR);
      if (idxR < 0) return json_({ success: false, error: 'Usuário não encontrado.' });

      var tempPassword = randomTemporaryPassword_();
      var hashTemp = makePasswordHash_(tempPassword);

      loginSheet.getRange(idxR + 1, header.passwordhash + 1).setValue(hashTemp);
      loginSheet.getRange(idxR + 1, header.resetcode + 1).setValue('');
      loginSheet.getRange(idxR + 1, header.resetexpires + 1).setValue('');
      loginSheet.getRange(idxR + 1, header.lastseen + 1).setValue('');

      try {
        sendAdminTemporaryPasswordEmail_(emailR, tempPassword);
      } catch (mailErr2) {
        var detail2 = (mailErr2 && mailErr2.stack) ? mailErr2.stack : String(mailErr2);
        logAuth_(ss, 'ERROR', 'adminResetPassword falha MailApp', detail2);
        return json_({ success: false, error: 'Falha ao enviar senha temporária por e-mail.' });
      }

      logAuth_(ss, 'INFO', 'adminResetPassword ok', emailR);
      scheduleFirebasePush_(); return json_({ success: true, message: 'Senha temporária enviada por e-mail.' });
    }

    if (action === 'saveConfigOptions') {
      var cargos = arrayFromAny_(data.cargos);
      var disciplinas = arrayFromAny_(data.disciplinas);

      saveConfigSheet_(ss, cargos, disciplinas);
      logAuth_(ss, 'INFO', 'saveConfigOptions ok', safeJson_({ cargos: cargos.length, disciplinas: disciplinas.length }));
      scheduleFirebasePush_(); return json_({ success: true });
    }

    if (action === 'saveDatabaseLink') {
      var idDb = String(data.id || '').trim();
      var nomeDb = String(data.nome || '').trim();
      var linkDb = String(data.link || '').trim();
      var descricaoDb = String(data.descricao || '').trim();

      if (!nomeDb) return json_({ success: false, error: 'Informe o nome da planilha.' });
      if (!linkDb) return json_({ success: false, error: 'Informe o link da planilha.' });
      if (descricaoDb.length > 100) descricaoDb = descricaoDb.slice(0, 100);

      var shDb = getOrCreateDatabaseLinksSheet_(ss);
      var rowsDb = shDb.getDataRange().getValues();

      if (!idDb) {
        idDb = Utilities.getUuid();
        shDb.appendRow([idDb, nomeDb, linkDb, descricaoDb, new Date().toLocaleString('pt-BR')]);
      } else {
        var found = false;
        for (var iDb = 1; iDb < rowsDb.length; iDb++) {
          if (String(rowsDb[iDb][0]) === idDb) {
            shDb.getRange(iDb + 1, 2, 1, 4).setValues([[nomeDb, linkDb, descricaoDb, new Date().toLocaleString('pt-BR')]]);
            found = true;
            break;
          }
        }
        if (!found) {
          shDb.appendRow([idDb, nomeDb, linkDb, descricaoDb, new Date().toLocaleString('pt-BR')]);
        }
      }

      scheduleFirebasePush_(); return json_({ success: true, id: idDb });
    }

    if (action === 'deleteDatabaseLink') {
      var idDel = String(data.id || '').trim();
      if (!idDel) return json_({ success: false, error: 'ID inválido.' });

      var shDel = getOrCreateDatabaseLinksSheet_(ss);
      var rowsDel = shDel.getDataRange().getValues();

      for (var iDel = rowsDel.length - 1; iDel >= 1; iDel--) {
        if (String(rowsDel[iDel][0]) === idDel) {
          shDel.deleteRow(iDel + 1);
          scheduleFirebasePush_(); return json_({ success: true });
        }
      }

      return json_({ success: false, error: 'Banco de dados não encontrado.' });
    }

    if (action === 'registerActivitiesBatch') {
      return registerActivitiesBatch_(ss, data);
    }

    if (action === 'updateActivitiesBatch') {
      return updateActivitiesBatch_(ss, data);
    }

    if (action === 'createEmergencia') {
      return createEmergencia_(ss, data);
    }

    if (action === 'addEmergenciaMensagem') {
      return addEmergenciaMensagem_(ss, data);
    }

    if (action === 'markEmergenciaRead') {
      return markEmergenciaRead_(ss, data);
    }

    return json_({
      success: false,
      error: 'Ação inválida.',
      receivedAction: action,
    });

  } catch (err) {
    try {
      var ss2 = SpreadsheetApp.getActiveSpreadsheet();
      logAuth_(ss2, 'ERROR', 'doPost exception', String(err));
    } catch (ignored) {}
    return json_({ success: false, error: String(err) });
  }
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var action = String((e && e.parameter && e.parameter.action) || '').trim();

  // MEGA PACOTE: Envia todos os dados pré-carregados de uma vez
  if (action === 'getInitialData') {
    var userEmailR = normalizeEmail_(e.parameter.email);
    var userRoleR = String(e.parameter.role || '').trim().toLowerCase();
    var userDisciplinaR = String(e.parameter.disciplina || '').trim();
    var isAdmin = String(e.parameter.isAdmin || '') === 'true';
    
    // Tratamento rigoroso das abas para evitar que venham vazias
    var tabsArr = String(e.parameter.tabs || '').split(',');
    var tabs = [];
    for(var t = 0; t < tabsArr.length; t++) {
      if(tabsArr[t].trim()) tabs.push(tabsArr[t].trim().toLowerCase());
    }

    var responseData = {};

    if (tabs.indexOf('registro') !== -1) {
      var eapData = getEapStructuredData_(ss);
      var professionalsData = getProfessionalsByDisciplina_(ss, userDisciplinaR);
      var activitiesData = getActivitiesForUser_(ss, userEmailR, userRoleR);
      responseData.registro = {
        contracts: eapData.contracts,
        osOptions: eapData.osOptions,
        itemOptions: eapData.itemOptions,
        professionals: professionalsData,
        activeActivities: activitiesData.activeActivities,
        completedActivities: activitiesData.completedActivities
      };
    }

    if (tabs.indexOf('cronograma') !== -1) {
      responseData.cronograma = getRawCronogramaData_(ss).rawRows;
    }

    if (isAdmin || tabs.indexOf('administracao') !== -1) {
      var loginSheet = getOrCreateLoginSheet_(ss);
      var header = getHeaderMapSafe_(loginSheet);
      var values = loginSheet.getDataRange().getValues();
      var config = getConfigOptions_(ss);
      var databaseLinks = getDatabaseLinks_(ss);

      var users = [];
      for (var i = 1; i < values.length; i++) {
        if (!normalizeEmail_(values[i][header.email])) continue;
        users.push(normalizeUserResponse_(values[i], header));
      }

      responseData.admin = {
        users: users,
        cargos: config.cargos,
        disciplinas: config.disciplinas,
        databaseLinks: databaseLinks
      };
    }

    scheduleFirebasePush_(); return json_({ success: true, data: responseData });
  }

  if (action === 'getAdminData') {
    var loginSheet = getOrCreateLoginSheet_(ss);
    var header = getHeaderMapSafe_(loginSheet);
    var values = loginSheet.getDataRange().getValues();
    var config = getConfigOptions_(ss);
    var databaseLinks = getDatabaseLinks_(ss);

    var responseDataAdmin = {
      users: [], cargos: config.cargos, disciplinas: config.disciplinas, databaseLinks: databaseLinks
    };

    for (var iA = 1; iA < values.length; iA++) {
      var row = values[iA];
      if (!normalizeEmail_(row[header.email])) continue;
      responseDataAdmin.users.push(normalizeUserResponse_(row, header));
    }

    return json_(responseDataAdmin);
  }

  // Rota auxiliar caso seja chamado direto pelo botão de atualizar do React
  if (action === 'getRegistroAtividadesData') {
    var uEmail = normalizeEmail_(e.parameter.userEmail);
    var uRole = String(e.parameter.userRole || '').trim().toLowerCase();
    var uDisciplina = String(e.parameter.userDisciplina || '').trim();

    var eapDataR = getEapStructuredData_(ss);
    var profData = getProfessionalsByDisciplina_(ss, uDisciplina);
    var actData = getActivitiesForUser_(ss, uEmail, uRole);

    return json_({
      success: true,
      contracts: eapDataR.contracts,
      osOptions: eapDataR.osOptions,
      itemOptions: eapDataR.itemOptions,
      professionals: profData,
      activeActivities: actData.activeActivities,
      completedActivities: actData.completedActivities
    });
  }

  if (action === 'getCronogramaData') {
    return json_(getRawCronogramaData_(ss));
  }

  if (action === 'getEmergenciaData') {
    return json_(getEmergenciaData_(ss));
  }

  return json_({ error: 'Ação inválida' });
}

function doOptions() {
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

// ============================================================================
// BATCH REGISTRO DE ATIVIDADES
// ============================================================================

function registerActivitiesBatch_(ss, data) {
  var userEmailA = normalizeEmail_(data.userEmail);
  var userNameA = String(data.userName || '').trim();
  var userRoleA = String(data.userRole || '').trim();
  var userDisciplinaA = String(data.userDisciplina || '').trim();
  var activities = Array.isArray(data.activities) ? data.activities : [];

  if (!userEmailA) return json_({ success: false, error: 'Usuário inválido.' });
  if (!activities.length) return json_({ success: false, error: 'Nenhuma atividade para registrar.' });

  var shAct = getOrCreateActivitiesSheet_(ss);
  var actValues = shAct.getDataRange().getValues();

  var existingOpenItems = {};
  for (var iAct = 1; iAct < actValues.length; iAct++) {
    var existingItemCodigo = String(actValues[iAct][10] || '').trim();
    var existingStatus = String(actValues[iAct][20] || '').trim().toLowerCase();
    if (existingItemCodigo && existingStatus !== 'concluida') {
      existingOpenItems[existingItemCodigo] = true;
    }
  }

  var queuedItems = {};
  var rowsToAppend = [];
  var historyRows = [];
  var duplicateItems = [];

  for (var i = 0; i < activities.length; i++) {
    var item = activities[i];

    var contratoCodigo = String(item.contratoCodigo || '').trim();
    var contratoNome = String(item.contratoNome || '').trim();
    var osCodigo = String(item.osCodigo || '').trim();
    var osNome = String(item.osNome || '').trim();
    var setor = String(item.setor || 'Engenharia').trim();
    var itemCodigo = String(item.itemCodigo || '').trim();
    var itemNome = String(item.itemNome || '').trim();
    var dificuldade = String(item.dificuldade || '').trim();
    var descricao = String(item.descricao || '').trim();
    var profissionaisEmails = Array.isArray(item.profissionaisEmails) ? item.profissionaisEmails : [];
    var profissionaisNomes = Array.isArray(item.profissionaisNomes) ? item.profissionaisNomes : [];

    if (!contratoCodigo || !osCodigo || !itemCodigo) continue;
    if (!descricao || descricao.length < 50) continue;
    if (!profissionaisEmails.length) continue;

    if (existingOpenItems[itemCodigo] || queuedItems[itemCodigo]) {
      duplicateItems.push({ itemCodigo: itemCodigo, itemNome: itemNome });
      continue;
    }

    queuedItems[itemCodigo] = true;

    var activityId = Utilities.getUuid();
    var nowStr = new Date().toLocaleString('pt-BR');

    rowsToAppend.push([
      activityId,
      nowStr,
      userNameA,
      userEmailA,
      userRoleA,
      userDisciplinaA,
      contratoCodigo,
      contratoNome,
      osCodigo,
      osNome,
      itemCodigo,
      itemNome,
      setor,
      profissionaisNomes.join(' | '),
      profissionaisEmails.join(' | '),
      dificuldade,
      descricao,
      0,
      '',
      '',
      'em_andamento',
      '',
      '',
      'true',
      nowStr
    ]);

    historyRows.push([
      Utilities.getUuid(),
      activityId,
      nowStr,
      userEmailA,
      userNameA,
      'registro_inicial',
      '',
      JSON.stringify({
        contratoCodigo: contratoCodigo,
        osCodigo: osCodigo,
        itemCodigo: itemCodigo,
        profissionaisEmails: profissionaisEmails,
        dificuldade: dificuldade,
        descricao: descricao
      })
    ]);
  }

  if (!rowsToAppend.length) {
    return json_({
      success: false,
      error: duplicateItems.length
        ? 'Todas as atividades enviadas já estavam registradas.'
        : 'Nenhuma atividade válida para registrar.',
      duplicateItems: duplicateItems
    });
  }

  shAct.getRange(shAct.getLastRow() + 1, 1, rowsToAppend.length, 25).setValues(rowsToAppend);

  var shHistory = getOrCreateActivitiesHistorySheet_(ss);
  shHistory.getRange(shHistory.getLastRow() + 1, 1, historyRows.length, 8).setValues(historyRows);

  return json_({
    success: true,
    message: rowsToAppend.length + ' atividade(s) registrada(s) com sucesso.',
    duplicateItems: duplicateItems
  });
}

function updateActivitiesBatch_(ss, data) {
  var userEmailU = normalizeEmail_(data.userEmail);
  var userNameU = String(data.userName || '').trim();
  var updates = Array.isArray(data.updates) ? data.updates : [];

  if (!updates.length) {
    return json_({ success: false, error: 'Nenhuma alteração para salvar.' });
  }

  var shUpd = getOrCreateActivitiesSheet_(ss);
  var updValues = shUpd.getDataRange().getValues();
  var activityRowMap = {};

  for (var i = 1; i < updValues.length; i++) {
    var activityId = String(updValues[i][0] || '').trim();
    if (activityId) {
      activityRowMap[activityId] = i + 1;
    }
  }

  // === Mapeamento da aba EAP para salver % ===
  var shEap = ss.getSheetByName('EAP');
  var eapRowMap = {};
  if (shEap) {
    var eapValues = shEap.getDataRange().getValues();
    for (var e = 1; e < eapValues.length; e++) {
      var codEap = String(eapValues[e][3] || '').trim(); // Coluna D (índice 3) é o código
      if (codEap) {
        eapRowMap[codEap] = e + 1; 
      }
    }
  }
  // ===========================================

  var historyRows = [];
  var anyUpdated = false;

  for (var j = 0; j < updates.length; j++) {
    var upd = updates[j];
    var activityIdU = String(upd.activityId || '').trim();
    if (!activityIdU || !activityRowMap[activityIdU]) continue;

    var rowFound = activityRowMap[activityIdU];
    var currentRow = shUpd.getRange(rowFound, 1, 1, 25).getValues()[0];
    var currentStatus = String(currentRow[20] || '').trim().toLowerCase();
    
    // Pegar o ItemCodigo (Coluna K / índice 10) para achar na aba EAP
    var itemCodigoU = String(currentRow[10] || '').trim(); 

    if (currentStatus === 'concluida') continue;

    var oldEmails = String(currentRow[14] || '');
    var oldAvanco = Number(currentRow[17] || 0);
    var oldAvaliacao = String(currentRow[18] || '');
    var oldObservacao = String(currentRow[19] || '');

    var profissionaisEmailsU = Array.isArray(upd.profissionaisEmails) ? upd.profissionaisEmails : null;
    var profissionaisNomesU = Array.isArray(upd.profissionaisNomes) ? upd.profissionaisNomes : null;
    var avancoAtualU = upd.avancoAtual !== undefined ? Number(upd.avancoAtual || 0) : null;
    var avaliacaoAtualU = upd.avaliacaoAtual !== undefined ? String(upd.avaliacaoAtual || '') : null;
    var observacaoAtualU = upd.observacaoAtual !== undefined ? String(upd.observacaoAtual || '') : null;

    if (profissionaisEmailsU !== null && profissionaisNomesU !== null) {
      shUpd.getRange(rowFound, 14).setValue(profissionaisNomesU.join(' | '));
      shUpd.getRange(rowFound, 15).setValue(profissionaisEmailsU.join(' | '));

      historyRows.push([
        Utilities.getUuid(), activityIdU, new Date().toLocaleString('pt-BR'), userEmailU, userNameU, 'profissionais', oldEmails, profissionaisEmailsU.join(' | ')
      ]);
      anyUpdated = true;
    }

    if (avancoAtualU !== null) {
      var avancoNormalizado = Math.max(0, Math.min(100, avancoAtualU));
      shUpd.getRange(rowFound, 18).setValue(avancoNormalizado);

      // === Salvar % na coluna Z da EAP ===
      if (shEap && eapRowMap[itemCodigoU]) {
        shEap.getRange(eapRowMap[itemCodigoU], 26).setValue(avancoNormalizado / 100);
      }
      // ===================================

      historyRows.push([
        Utilities.getUuid(), activityIdU, new Date().toLocaleString('pt-BR'), userEmailU, userNameU, 'avanco', String(oldAvanco), String(avancoNormalizado)
      ]);

      if (avancoNormalizado === 100) {
        var now100 = new Date();
        shUpd.getRange(rowFound, 21).setValue('aguardando_conclusao');
        shUpd.getRange(rowFound, 22).setValue(now100.toLocaleString('pt-BR'));
      } else if (avancoNormalizado < 100 && currentStatus === 'aguardando_conclusao') {
        shUpd.getRange(rowFound, 21).setValue('em_andamento');
        shUpd.getRange(rowFound, 22).setValue('');
      }

      anyUpdated = true;
    }

    if (avaliacaoAtualU !== null) {
      shUpd.getRange(rowFound, 19).setValue(avaliacaoAtualU);
      historyRows.push([Utilities.getUuid(), activityIdU, new Date().toLocaleString('pt-BR'), userEmailU, userNameU, 'avaliacao', oldAvaliacao, avaliacaoAtualU]);
      anyUpdated = true;
    }

    if (observacaoAtualU !== null) {
      shUpd.getRange(rowFound, 20).setValue(observacaoAtualU);
      historyRows.push([Utilities.getUuid(), activityIdU, new Date().toLocaleString('pt-BR'), userEmailU, userNameU, 'observacao', oldObservacao, observacaoAtualU]);
      anyUpdated = true;
    }

    shUpd.getRange(rowFound, 25).setValue(new Date().toLocaleString('pt-BR'));
  }

  if (historyRows.length) {
    var shHistory = getOrCreateActivitiesHistorySheet_(ss);
    shHistory.getRange(shHistory.getLastRow() + 1, 1, historyRows.length, 8).setValues(historyRows);
  }

  if (!anyUpdated) {
    return json_({ success: false, error: 'Nenhuma alteração válida foi encontrada.' });
  }

  scheduleFirebasePush_(); return json_({ success: true, message: 'Alterações salvas com sucesso.' });
}

// ============================================================================
// EMERGENCIAS
// ============================================================================

function createEmergencia_(ss, data) {
  var userEmail = normalizeEmail_(data.userEmail);
  var userName = String(data.userName || '').trim();
  var userSector = String(data.userSector || '').trim();
  var activityId = String(data.activityId || '').trim();
  var itemCodigo = String(data.itemCodigo || '').trim();
  var observation = String(data.observation || '').trim();
  var notifiedSectors = Array.isArray(data.notifiedSectors) ? data.notifiedSectors.map(function(item) { return String(item || '').trim(); }).filter(Boolean) : [];

  if (!userEmail) return json_({ success: false, error: 'Usuário inválido.' });
  if (!activityId || !itemCodigo) return json_({ success: false, error: 'Atividade inválida.' });
  if (observation.length < 10) return json_({ success: false, error: 'Descreva melhor a emergência.' });
  if (!notifiedSectors.length) return json_({ success: false, error: 'Selecione ao menos um setor para notificar.' });

  var sh = getOrCreateEmergenciasSheet_(ss);
  var emergencyId = Utilities.getUuid();
  var nowIso = new Date().toISOString();

  sh.appendRow([
    emergencyId,
    activityId,
    String(data.contratoCodigo || '').trim(),
    String(data.contratoNome || '').trim(),
    String(data.osCodigo || '').trim(),
    String(data.osNome || '').trim(),
    itemCodigo,
    String(data.itemNome || '').trim(),
    'aberta',
    nowIso,
    userEmail,
    userName,
    userSector,
    observation,
    notifiedSectors.join(' | '),
    nowIso
  ]);

  var shMessages = getOrCreateEmergenciaMessagesSheet_(ss);
  shMessages.appendRow([
    Utilities.getUuid(),
    emergencyId,
    nowIso,
    userEmail,
    userName,
    userSector,
    observation,
    'abertura'
  ]);

  scheduleFirebasePush_();
  return json_({ success: true, emergencyId: emergencyId });
}

function addEmergenciaMensagem_(ss, data) {
  var emergencyId = String(data.emergencyId || '').trim();
  var userEmail = normalizeEmail_(data.userEmail);
  var userName = String(data.userName || '').trim();
  var userSector = String(data.userSector || '').trim();
  var message = String(data.message || '').trim();

  if (!emergencyId) return json_({ success: false, error: 'Emergência inválida.' });
  if (!userEmail) return json_({ success: false, error: 'Usuário inválido.' });
  if (message.length < 3) return json_({ success: false, error: 'Mensagem muito curta.' });

  var shMessages = getOrCreateEmergenciaMessagesSheet_(ss);
  var nowIso = new Date().toISOString();
  shMessages.appendRow([
    Utilities.getUuid(),
    emergencyId,
    nowIso,
    userEmail,
    userName,
    userSector,
    message,
    'mensagem'
  ]);

  var sh = getOrCreateEmergenciasSheet_(ss);
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === emergencyId) {
      sh.getRange(i + 1, 16).setValue(nowIso);
      break;
    }
  }

  scheduleFirebasePush_();
  return json_({ success: true });
}

function markEmergenciaRead_(ss, data) {
  var emergencyId = String(data.emergencyId || '').trim();
  var sector = String(data.sector || '').trim();
  var userEmail = normalizeEmail_(data.userEmail);

  if (!emergencyId || !sector) return json_({ success: false, error: 'Leitura inválida.' });

  var sh = getOrCreateEmergenciaReadsSheet_(ss);
  var values = sh.getDataRange().getValues();
  var nowIso = new Date().toISOString();

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][1] || '').trim() === emergencyId && String(values[i][2] || '').trim() === sector) {
      sh.getRange(i + 1, 4).setValue(nowIso);
      sh.getRange(i + 1, 5).setValue(userEmail);
      return json_({ success: true });
    }
  }

  sh.appendRow([Utilities.getUuid(), emergencyId, sector, nowIso, userEmail]);
  return json_({ success: true });
}

function getEmergenciaData_(ss) {
  var sh = getOrCreateEmergenciasSheet_(ss);
  var values = sh.getDataRange().getValues();
  var emergencies = [];

  for (var i = 1; i < values.length; i++) {
    var id = String(values[i][0] || '').trim();
    if (!id) continue;
    emergencies.push({
      id: id,
      activityId: String(values[i][1] || '').trim(),
      contratoCodigo: String(values[i][2] || '').trim(),
      contratoNome: String(values[i][3] || '').trim(),
      osCodigo: String(values[i][4] || '').trim(),
      osNome: String(values[i][5] || '').trim(),
      itemCodigo: String(values[i][6] || '').trim(),
      itemNome: String(values[i][7] || '').trim(),
      status: String(values[i][8] || 'aberta').trim(),
      createdAt: String(values[i][9] || '').trim(),
      createdByEmail: String(values[i][10] || '').trim(),
      createdByName: String(values[i][11] || '').trim(),
      createdBySector: String(values[i][12] || '').trim(),
      initialObservation: String(values[i][13] || '').trim(),
      notifiedSectors: String(values[i][14] || '').split('|').map(function(item) { return String(item || '').trim(); }).filter(Boolean),
      lastUpdatedAt: String(values[i][15] || values[i][9] || '').trim()
    });
  }

  var shMessages = getOrCreateEmergenciaMessagesSheet_(ss);
  var messageValues = shMessages.getDataRange().getValues();
  var messagesByEmergency = {};
  for (var m = 1; m < messageValues.length; m++) {
    var emergencyId = String(messageValues[m][1] || '').trim();
    if (!emergencyId) continue;
    if (!messagesByEmergency[emergencyId]) messagesByEmergency[emergencyId] = [];
    messagesByEmergency[emergencyId].push({
      id: String(messageValues[m][0] || '').trim(),
      emergencyId: emergencyId,
      createdAt: String(messageValues[m][2] || '').trim(),
      authorEmail: String(messageValues[m][3] || '').trim(),
      authorName: String(messageValues[m][4] || '').trim(),
      authorSector: String(messageValues[m][5] || '').trim(),
      message: String(messageValues[m][6] || '').trim(),
      type: String(messageValues[m][7] || 'mensagem').trim()
    });
  }

  var shReads = getOrCreateEmergenciaReadsSheet_(ss);
  var readValues = shReads.getDataRange().getValues();
  var readMarkers = {};
  for (var r = 1; r < readValues.length; r++) {
    var readEmergencyId = String(readValues[r][1] || '').trim();
    var sector = String(readValues[r][2] || '').trim();
    if (!readEmergencyId || !sector) continue;
    if (!readMarkers[readEmergencyId]) readMarkers[readEmergencyId] = {};
    readMarkers[readEmergencyId][sector] = String(readValues[r][3] || '').trim();
  }

  return {
    success: true,
    emergencies: emergencies,
    messagesByEmergency: messagesByEmergency,
    readMarkers: readMarkers
  };
}

// ============================================================================
// SHEETS
// ============================================================================

function getOrCreateLoginSheet_(ss) {
  var sh = ss.getSheetByName('login');
  if (!sh) sh = ss.insertSheet('login');
  if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.clear();
    sh.getRange(1, 1, 1, 12).setValues([[
      'Data', 'Nome', 'Email', 'Role', 'Disciplina', 'Status', 'Abas',
      'PasswordHash', 'ResetCode', 'ResetExpires', 'IsAdmin', 'LastSeen'
    ]]);
  }
  return sh;
}

function getOrCreateRecoverySheet_(ss) {
  var sh = ss.getSheetByName('recuperacao');
  if (!sh) {
    sh = ss.insertSheet('recuperacao');
    sh.appendRow(['Data', 'Email', 'Status', 'Observacao']);
  } else if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.clear();
    sh.appendRow(['Data', 'Email', 'Status', 'Observacao']);
  }
  return sh;
}

function getOrCreateAuthLogSheet_(ss) {
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

function getOrCreateConfigSheet_(ss) {
  var sh = ss.getSheetByName('Configuracoes');
  if (!sh) {
    sh = ss.insertSheet('Configuracoes');
    sh.getRange(1, 1, 1, 2).setValues([['Cargo', 'Disciplina']]);
  } else if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.clear();
    sh.getRange(1, 1, 1, 2).setValues([['Cargo', 'Disciplina']]);
  }
  return sh;
}

function getOrCreateDatabaseLinksSheet_(ss) {
  var sh = ss.getSheetByName('bancos_dados');
  if (!sh) {
    sh = ss.insertSheet('bancos_dados');
    sh.getRange(1, 1, 1, 5).setValues([['ID', 'Nome', 'Link', 'Descricao', 'AtualizadoEm']]);
  } else if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.clear();
    sh.getRange(1, 1, 1, 5).setValues([['ID', 'Nome', 'Link', 'Descricao', 'AtualizadoEm']]);
  }
  return sh;
}

function getOrCreateActivitiesSheet_(ss) {
  var sh = ss.getSheetByName('atividades_registro');
  if (!sh) {
    sh = ss.insertSheet('atividades_registro');
    sh.getRange(1, 1, 1, 25).setValues([[
      'ID', 'DataRegistro', 'CriadoPorNome', 'CriadoPorEmail', 'CriadoPorCargo',
      'CriadoPorDisciplina', 'ContratoCodigo', 'ContratoNome', 'OSCodigo', 'OSNome',
      'ItemCodigo', 'ItemNome', 'Setor', 'Profissionais', 'ProfissionaisEmails',
      'Dificuldade', 'Descricao', 'AvancoAtual', 'AvaliacaoAtual', 'ObservacaoAtual',
      'Status', 'Data100', 'DataConclusaoEfetiva', 'Editavel', 'UltimaAtualizacao'
    ]]);
  } else if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.clear();
    sh.getRange(1, 1, 1, 25).setValues([[
      'ID', 'DataRegistro', 'CriadoPorNome', 'CriadoPorEmail', 'CriadoPorCargo',
      'CriadoPorDisciplina', 'ContratoCodigo', 'ContratoNome', 'OSCodigo', 'OSNome',
      'ItemCodigo', 'ItemNome', 'Setor', 'Profissionais', 'ProfissionaisEmails',
      'Dificuldade', 'Descricao', 'AvancoAtual', 'AvaliacaoAtual', 'ObservacaoAtual',
      'Status', 'Data100', 'DataConclusaoEfetiva', 'Editavel', 'UltimaAtualizacao'
    ]]);
  }
  return sh;
}

function getOrCreateActivitiesHistorySheet_(ss) {
  var sh = ss.getSheetByName('atividades_historico');
  if (!sh) {
    sh = ss.insertSheet('atividades_historico');
    sh.getRange(1, 1, 1, 8).setValues([[
      'HistoricoID', 'AtividadeID', 'DataHora', 'UsuarioEmail', 'UsuarioNome',
      'CampoAlterado', 'ValorAnterior', 'ValorNovo'
    ]]);
  } else if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.clear();
    sh.getRange(1, 1, 1, 8).setValues([[
      'HistoricoID', 'AtividadeID', 'DataHora', 'UsuarioEmail', 'UsuarioNome',
      'CampoAlterado', 'ValorAnterior', 'ValorNovo'
    ]]);
  }
  return sh;
}

function getOrCreateEmergenciasSheet_(ss) {
  var sh = ss.getSheetByName('emergencias');
  if (!sh) {
    sh = ss.insertSheet('emergencias');
    sh.getRange(1, 1, 1, 16).setValues([[
      'ID', 'ActivityID', 'ContratoCodigo', 'ContratoNome', 'OSCodigo', 'OSNome',
      'ItemCodigo', 'ItemNome', 'Status', 'CreatedAt', 'CreatedByEmail', 'CreatedByName',
      'CreatedBySector', 'InitialObservation', 'NotifiedSectors', 'LastUpdatedAt'
    ]]);
  } else if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.clear();
    sh.getRange(1, 1, 1, 16).setValues([[
      'ID', 'ActivityID', 'ContratoCodigo', 'ContratoNome', 'OSCodigo', 'OSNome',
      'ItemCodigo', 'ItemNome', 'Status', 'CreatedAt', 'CreatedByEmail', 'CreatedByName',
      'CreatedBySector', 'InitialObservation', 'NotifiedSectors', 'LastUpdatedAt'
    ]]);
  }
  return sh;
}

function getOrCreateEmergenciaMessagesSheet_(ss) {
  var sh = ss.getSheetByName('emergencias_mensagens');
  if (!sh) {
    sh = ss.insertSheet('emergencias_mensagens');
    sh.getRange(1, 1, 1, 8).setValues([[
      'ID', 'EmergencyID', 'CreatedAt', 'AuthorEmail', 'AuthorName', 'AuthorSector',
      'Message', 'Type'
    ]]);
  } else if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.clear();
    sh.getRange(1, 1, 1, 8).setValues([[
      'ID', 'EmergencyID', 'CreatedAt', 'AuthorEmail', 'AuthorName', 'AuthorSector',
      'Message', 'Type'
    ]]);
  }
  return sh;
}

function getOrCreateEmergenciaReadsSheet_(ss) {
  var sh = ss.getSheetByName('emergencias_leituras');
  if (!sh) {
    sh = ss.insertSheet('emergencias_leituras');
    sh.getRange(1, 1, 1, 5).setValues([[
      'ID', 'EmergencyID', 'Sector', 'LastReadAt', 'UpdatedByEmail'
    ]]);
  } else if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.clear();
    sh.getRange(1, 1, 1, 5).setValues([[
      'ID', 'EmergencyID', 'Sector', 'LastReadAt', 'UpdatedByEmail'
    ]]);
  }
  return sh;
}

// ============================================================================
// HELPERS
// ============================================================================

function saveConfigSheet_(ss, cargos, disciplinas) {
  var sh = getOrCreateConfigSheet_(ss);
  sh.clear();
  sh.getRange(1, 1, 1, 2).setValues([['Cargo', 'Disciplina']]);

  var maxLen = Math.max(cargos.length, disciplinas.length, 1);
  var rows = [];
  for (var i = 0; i < maxLen; i++) {
    rows.push([cargos[i] || '', disciplinas[i] || '']);
  }

  sh.getRange(2, 1, rows.length, 2).setValues(rows);
}

function getConfigOptions_(ss) {
  var sh = getOrCreateConfigSheet_(ss);
  var values = sh.getDataRange().getValues();
  var cargos = [];
  var disciplinas = [];

  for (var i = 1; i < values.length; i++) {
    if (values[i][0]) cargos.push(String(values[i][0]));
    if (values[i][1]) disciplinas.push(String(values[i][1]));
  }

  return {
    cargos: uniqueSorted_(cargos),
    disciplinas: uniqueSorted_(disciplinas)
  };
}

function getDatabaseLinks_(ss) {
  var sh = getOrCreateDatabaseLinksSheet_(ss);
  var values = sh.getDataRange().getValues();
  var out = [];

  for (var i = 1; i < values.length; i++) {
    if (!String(values[i][0] || '').trim()) continue;
    out.push({
      id: String(values[i][0] || ''),
      nome: String(values[i][1] || ''),
      link: String(values[i][2] || ''),
      descricao: String(values[i][3] || ''),
      atualizadoEm: String(values[i][4] || '')
    });
  }

  return out;
}

function getEapStructuredData_(ss) {
  var sh = ss.getSheetByName('EAP');
  if (!sh) return { contracts: [], osOptions: [], itemOptions: [] };

  var values = sh.getDataRange().getValues();
  var rows = [];

  for (var i = 1; i < values.length; i++) {
    var codigo = String(values[i][3] || '').trim();
    var nome = String(values[i][4] || '').trim();
    if (!codigo || !nome) continue;
    rows.push({ codigo: codigo, nome: nome });
  }

  var contracts = [];
  var osOptions = [];
  var itemOptions = [];

  for (var j = 0; j < rows.length; j++) {
    var item = rows[j];
    var dotCount = (item.codigo.match(/\./g) || []).length;

    if (dotCount === 0) {
      contracts.push({ codigo: item.codigo, nome: item.nome });
    }

    if (dotCount === 1) {
      osOptions.push({ codigo: item.codigo, nome: item.nome, contratoCodigo: item.codigo.split('.')[0] });
    }
  }

  for (var k = 0; k < rows.length; k++) {
    var itemK = rows[k];
    var itemLower = itemK.nome.toLowerCase();

    if (
      itemLower.indexOf('projeto') !== -1 ||
      itemLower.indexOf('memorial') !== -1 ||
      itemLower.indexOf('orçamento') !== -1 ||
      itemLower.indexOf('orcamento') !== -1
    ) {
      var osParent = findOsParentCode_(itemK.codigo, osOptions);
      if (osParent) {
        itemOptions.push({ codigo: itemK.codigo, nome: itemK.nome, osCodigo: osParent });
      }
    }
  }

  return { contracts: contracts, osOptions: osOptions, itemOptions: itemOptions };
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

function getProfessionalsByDisciplina_(ss, disciplina) {
  var loginSheet = getOrCreateLoginSheet_(ss);
  var header = getHeaderMapSafe_(loginSheet);
  var values = loginSheet.getDataRange().getValues();

  var out = [];
  var disciplinaNorm = String(disciplina || '').trim().toLowerCase();

  for (var i = 1; i < values.length; i++) {
    var email = String(values[i][header.email] || '').trim();
    var nome = String(values[i][header.nome] || '').trim();
    var cargo = String(values[i][header.role] || '').trim();
    var userDisciplina = String(values[i][header.disciplina] || '').trim();
    var status = String(values[i][header.status] || '').trim().toLowerCase();

    if (!email || status !== 'approved') continue;
    if (String(userDisciplina || '').trim().toLowerCase() !== disciplinaNorm) continue;

    out.push({ nome: nome, email: email, cargo: cargo, disciplina: userDisciplina });
  }

  return out;
}

function getActivitiesForUser_(ss, userEmail, userRole) {
  var sh = getOrCreateActivitiesSheet_(ss);
  var values = sh.getDataRange().getValues();

  var activeActivities = [];
  var completedActivities = [];

  updateDelayedCompletedActivities_(ss);
  values = sh.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    var createdByEmail = String(values[i][3] || '').trim().toLowerCase();
    var roleLower = String(userRole || '').trim().toLowerCase();

    if (roleLower === 'lider' && createdByEmail !== String(userEmail || '').trim().toLowerCase()) {
      continue;
    }

    var rowObj = {
      id: String(values[i][0] || ''),
      dataRegistro: String(values[i][1] || ''),
      createdByEmail: String(values[i][3] || ''),
      contratoCodigo: String(values[i][6] || ''),
      contratoNome: String(values[i][7] || ''),
      osCodigo: String(values[i][8] || ''),
      osNome: String(values[i][9] || ''),
      itemCodigo: String(values[i][10] || ''),
      itemNome: String(values[i][11] || ''),
      setor: String(values[i][12] || ''),
      profissionais: String(values[i][13] || '').split(' | ').filter(Boolean),
      profissionaisEmails: String(values[i][14] || '').split(' | ').filter(Boolean),
      dificuldade: String(values[i][15] || ''),
      descricao: String(values[i][16] || ''),
      avancoAtual: Number(values[i][17] || 0),
      avaliacaoAtual: String(values[i][18] || ''),
      observacaoAtual: String(values[i][19] || ''),
      status: String(values[i][20] || 'em_andamento'),
      data100: String(values[i][21] || ''),
      dataConclusaoEfetiva: String(values[i][22] || ''),
      ultimaAtualizacao: String(values[i][24] || '')
    };

    if (rowObj.status === 'concluida') {
      completedActivities.push(rowObj);
    } else {
      activeActivities.push(rowObj);
    }
  }

  return { activeActivities: activeActivities, completedActivities: completedActivities };
}

function updateDelayedCompletedActivities_(ss) {
  var sh = getOrCreateActivitiesSheet_(ss);
  var values = sh.getDataRange().getValues();
  var now = new Date();

  for (var i = 1; i < values.length; i++) {
    var status = String(values[i][20] || '').trim().toLowerCase();
    var data100Str = String(values[i][21] || '').trim();
    var avanco = Number(values[i][17] || 0);

    if (status !== 'aguardando_conclusao') continue;
    if (avanco !== 100) continue;
    if (!data100Str) continue;

    var parsed = parsePtBrDateTime_(data100Str);
    if (!parsed) continue;

    var diffMs = now.getTime() - parsed.getTime();
    var diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays >= 3) {
      sh.getRange(i + 1, 21).setValue('concluida');
      sh.getRange(i + 1, 23).setValue(now.toLocaleString('pt-BR'));
      sh.getRange(i + 1, 24).setValue('false');
      sh.getRange(i + 1, 25).setValue(now.toLocaleString('pt-BR'));
    }
  }
}

function parsePtBrDateTime_(text) {
  var str = String(text || '').trim();
  if (!str) return null;
  var parts = str.split(' ');
  if (parts.length < 2) return null;
  var datePart = parts[0].split('/');
  var timePart = parts[1].split(':');
  if (datePart.length !== 3 || timePart.length < 2) return null;

  return new Date(Number(datePart[2]), Number(datePart[1]) - 1, Number(datePart[0]), Number(timePart[0]), Number(timePart[1]), timePart.length > 2 ? Number(timePart[2]) : 0);
}

function logRecovery_(ss, email, status, obs) {
  var sh = getOrCreateRecoverySheet_(ss);
  sh.appendRow([new Date().toLocaleString('pt-BR'), email, status, obs || '']);
}

function logAuth_(ss, level, eventName, detail) {
  var sh = getOrCreateAuthLogSheet_(ss);
  sh.appendRow([new Date().toLocaleString('pt-BR'), level, eventName, String(detail || '')]);
}

function getHeaderMapSafe_(sheet) {
  var lastCol = Math.max(1, sheet.getLastColumn());
  var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var headers = headerRow.map(function (h) { return String(h || '').trim().toLowerCase(); });

  function ensure(name) {
    var n = String(name).toLowerCase();
    var i = headers.indexOf(n);
    if (i !== -1) return i;
    var newCol = headers.length + 1;
    sheet.getRange(1, newCol).setValue(name);
    headers.push(n);
    return headers.length - 1;
  }

  return {
    data: ensure('Data'), nome: ensure('Nome'), email: ensure('Email'),
    role: ensure('Role'), disciplina: ensure('Disciplina'), status: ensure('Status'),
    abas: ensure('Abas'), passwordhash: ensure('PasswordHash'), resetcode: ensure('ResetCode'),
    resetexpires: ensure('ResetExpires'), isadmin: ensure('IsAdmin'), lastseen: ensure('LastSeen')
  };
}

function newEmptyLoginRow_(header) {
  var max = 0;
  for (var k in header) max = Math.max(max, header[k]);
  var row = [];
  for (var i = 0; i <= max; i++) row.push('');
  return row;
}

function normalizeEmail_(email) { return String(email || '').trim().toLowerCase(); }

function findUserRowByEmail_(values, header, email) {
  var e = normalizeEmail_(email);
  for (var i = 1; i < values.length; i++) {
    if (normalizeEmail_(values[i][header.email]) === e) return i;
  }
  return -1;
}

function normalizeUserResponse_(row, header) {
  var lastSeen = Number(row[header.lastseen] || 0);
  var online = lastSeen > 0 && (Date.now() - lastSeen <= 2 * 60 * 1000);
  return {
    id: String(row[header.email] || ''), data: row[header.data], nome: String(row[header.nome] || ''),
    email: String(row[header.email] || ''), cargo: String(row[header.role] || ''), role: String(row[header.role] || ''),
    disciplina: String(row[header.disciplina] || ''), status: String(row[header.status] || 'pending'),
    allowedTabs: parseAllowedTabs_(row[header.abas]), abas: parseAllowedTabs_(row[header.abas]),
    isAdmin: parseBool_(row[header.isadmin]), online: online
  };
}

function normalizeAllowedTabs_(value) {
  if (Array.isArray(value)) return value.map(function (x) { return String(x || '').trim(); }).filter(Boolean).join(',');
  return String(value || '').trim();
}

function parseAllowedTabs_(value) {
  return String(value || '').split(',').map(function (x) { return String(x || '').trim(); }).filter(Boolean);
}

function parseBool_(value) {
  var v = String(value || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'sim';
}

function boolToSheet_(value) { return value ? 'true' : 'false'; }

function arrayFromAny_(value) {
  if (!value) return [];
  if (Array.isArray(value)) return uniqueSorted_(value.map(String).map(trim_).filter(Boolean));
  return uniqueSorted_(String(value).split(',').map(trim_).filter(Boolean));
}

function uniqueSorted_(arr) {
  var map = {}; var out = [];
  for (var i = 0; i < arr.length; i++) {
    var item = String(arr[i] || '').trim(); var key = item.toLowerCase();
    if (!item || map[key]) continue;
    map[key] = true; out.push(item);
  }
  return out.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
}

function trim_(x) { return String(x || '').trim(); }

function makePasswordHash_(password) {
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  var raw = salt + '|' + String(password);
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  var hex = bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  return salt + ':' + hex;
}

function verifyPassword_(password, stored) {
  if (!stored) return false;
  var parts = String(stored).split(':');
  if (parts.length !== 2) return false;
  var salt = parts[0]; var expected = parts[1];
  var raw = salt + '|' + String(password);
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  var hex = bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  return hex === expected;
}

function randomCode_(digits) {
  var d = digits || 6;
  var min = Math.pow(10, d - 1); var max = Math.pow(10, d) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

function randomTemporaryPassword_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#';
  var out = '';
  for (var i = 0; i < 10; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function sendResetCodeEmail_(to, code, minutesValid) {
  var subject = 'Recuperação de senha - Projetos Maricá';
  var body = 'Você solicitou recuperação de senha.\n\nCódigo: ' + code + '\nValidade: ' + String(minutesValid || 15) + ' minutos.\n\nSe você não solicitou, ignore este e-mail.\n';
  MailApp.sendEmail(to, subject, body);
}

function sendAdminTemporaryPasswordEmail_(to, tempPassword) {
  var subject = 'Senha temporária - Projetos Maricá';
  var body = 'Um administrador redefiniu seu acesso.\n\nSua senha temporária é: ' + tempPassword + '\n\nEntre no sistema e altere sua senha quando desejar.\n';
  MailApp.sendEmail(to, subject, body);
}

function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function safeJson_(x) { try { return JSON.stringify(x); } catch (e) { return String(x); } }

// ============================================================================
// CRONOGRAMA / GANTT - MAGRO (Apenas leitura bruta e rápida da planilha)
// ============================================================================

function getRawCronogramaData_(ss) {
  var sh = ss.getSheetByName('EAP');
  if (!sh) return { success: true, rawRows: [] };

  var values = sh.getDataRange().getValues();
  var rows = [];

  for (var i = 1; i < values.length; i++) {
    var codigo = String(values[i][3] || '').trim();
    var nome = String(values[i][4] || '').trim();
    if (!codigo || !nome) continue;

    rows.push({
      progress: toNumberSafe_(values[i][2]),
      code: codigo,
      name: nome,
      duration: toNumberSafe_(values[i][5]),
      plannedStart: normalizeSheetDate_(values[i][6]),
      plannedEnd: normalizeSheetDate_(values[i][7]),
      predecessor: String(values[i][8] || '').trim(),
      idealProgress: toNumberSafe_(values[i][9]),
      realStart: normalizeSheetDate_(values[i][11]),
      realEnd: normalizeSheetDate_(values[i][12])
    });
  }

  return { success: true, rawRows: rows };
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
// --- LOGICA HIBRIDA FIREBASE ---
var FIREBASE_DB_URL = "https://dash-lideres-quanta-default-rtdb.firebaseio.com";

function scheduleFirebasePush_() {
  try {
    var cache = CacheService.getScriptCache();
    if (!cache.get("isUploadingFirebaseBD")) {
      cache.put("isUploadingFirebaseBD", "true", 30);
      ScriptApp.newTrigger("pushFullDatabaseToFirebase")
        .timeBased()
        .after(10 * 1000)
        .create();
    }
  } catch (e) {}
}

function onEdit(e) {
  scheduleFirebasePush_();
}

function pushFullDatabaseToFirebase() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var loginSheet = getOrCreateLoginSheet_(ss);
    var header = getHeaderMapSafe_(loginSheet);
    var values = loginSheet.getDataRange().getValues();
    var config = getConfigOptions_(ss);
    var databaseLinks = getDatabaseLinks_(ss);

    var users = {};
    for (var i = 1; i < values.length; i++) {
        if (!normalizeEmail_(values[i][header.email])) continue;
        var u = normalizeUserResponse_(values[i], header);
        var safeEmail = String(u.email).replace(/[.#$\[\]]/g, '_');
        users[safeEmail] = u;
    }

    var eapDataR = getEapStructuredData_(ss);
    var cronograma = getRawCronogramaData_(ss).rawRows;
    var activities = getAllActivitiesForFirebase_(ss);

    var payloadData = {
        admin: {
            usersByEmail: users,
            cargos: config.cargos,
            disciplinas: config.disciplinas,
            databaseLinks: databaseLinks
        },
        registro: {
            contracts: eapDataR.contracts,
            osOptions: eapDataR.osOptions,
            itemOptions: eapDataR.itemOptions,
            activitiesList: activities
        },
        cronograma: cronograma
    };
    
    UrlFetchApp.fetch(FIREBASE_DB_URL + "/global_data.json", {
        method: "put",
        contentType: "application/json",
        payload: JSON.stringify(payloadData)
    });
  } catch(err) {
    Logger.log("Firebase push failed: " + err);
  }
}

function getAllActivitiesForFirebase_(ss) {
  var shAct = getOrCreateActivitiesSheet_(ss);
  var values = shAct.getDataRange().getValues();
  var acts = [];
  for(var i=1; i<values.length; i++){
    var r = values[i];
    acts.push({
      activityId: r[0], dataRegistro: r[1], criadoPorNome: r[2], criadoPorEmail: r[3],
      contratoCodigo: r[6], osCodigo: r[8], itemCodigo: r[10], itemNome: r[11],
      profissionais: r[13], profissionaisEmails: r[14], avancoAtual: r[17], avaliacaoAtual: r[18], observacaoAtual: r[19],
      status: r[20]
    });
  }
  return acts;
}
