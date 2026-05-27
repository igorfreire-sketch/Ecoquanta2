/**
 * ============================================================================
 * BACK-END DE ACESSO / ADMINISTRAÇÃO / REGISTRO DE ATIVIDADES / CRONOGRAMA
 * ============================================================================
 *
 * POLITICA DE PERFORMANCE:
 * - Toda interacao do site deve priorizar resposta rapida ao usuario.
 * - Escreva na planilha em lote sempre que possivel; evite setValue repetido.
 * - Nao bloqueie o salvamento esperando publicacao pesada no GitHub.
 * - Publique JSON em segundo plano por gatilho curto, reaproveitando publicacoes
 *   pendentes em vez de recriar trabalho.
 * - JSON publico deve ser compacto para trafegar rapido.
 * - Dados administrativos/usuarios nao devem ser publicados sem criptografia
 *   quando json_crypto_key/crypto_key estiver configurada; velocidade nao deve
 *   criar janela publica de dados sensiveis.
 */

var DEFAULT_EAP_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx4hAEe5i_ulWGSl9qfiokoCGzMza3QzUDIlM4cuZV_8eRw-Ml3XltdAbD0K0EFWm9x4Q/exec";
var DEFAULT_EAP_PUBLIC_JSON_URL = "";
var DEFAULT_FIREBASE_PROJECT_ID = "ecoquanta-c2720";
var DEFAULT_FIREBASE_API_KEY = "AIzaSyCGJ4UHPGyaf1GqayvTXUhvn3eLdu9ZW9g";
var FIREBASE_AUTH_CACHE_KEY = "firebase_anonymous_id_token";
var FIREBASE_COMMIT_BATCH_SIZE = 400;
var FIREBASE_APPDATA_CHUNK_SIZE = 750000;
var FIREBASE_SYNC_DELAY_MS = 5000;
var DEFAULT_ALOCACAO_SOURCE = [
  'Rio de Janeiro',
  'Maca\u00e9',
  'Maric\u00e1',
  'Quanta',
  'S\u00e3o Paulo',
  'Fortaleza',
  'Belo Horizonte',
  'Bahia',
  'Jo\u00e3o Pessoa',
  'Natal',
  'Oiticica'
];
var DEFAULT_DISCIPLINE_SOURCE = [
  ['ARQ', 'Arquitetura'],
  ['URB', 'Urbanismo'],
  ['LAY', 'Layout'],
  ['LUM', 'Luminot\u00e9cnica'],
  ['ACES', 'Acessibilidade'],
  ['APS', 'Paisagismo'],
  ['TSD', 'Sondagem'],
  ['EST', 'Estrutura Mista'],
  ['SCO', 'Estrutura de Concreto'],
  ['CONT', 'Conten\u00e7\u00e3o'],
  ['SMT', 'Estrutura Met\u00e1lica'],
  ['FUND', 'Funda\u00e7\u00f5es'],
  ['HIDS', 'Hidrossanit\u00e1rio'],
  ['HIDA', 'Hidr\u00e1ulica'],
  ['ESG', 'Esgoto'],
  ['DREN', 'Drenagem'],
  ['GAS', 'G\u00e1s'],
  ['REUS', 'Reuso'],
  ['SUB', 'Subesta\u00e7\u00e3o'],
  ['ELET', 'El\u00e9trica'],
  ['SPDA', 'SPDA'],
  ['EREN', 'Energia Renov\u00e1vel'],
  ['CFTV', 'CFTV'],
  ['SOM', 'Sonoriza\u00e7\u00e3o'],
  ['AUVI', '\u00c1udio e V\u00eddeo'],
  ['ACUS', 'Ac\u00fastica'],
  ['CENO', 'Cenot\u00e9cnica'],
  ['DADO', 'Dados'],
  ['AUTO', 'Automa\u00e7\u00e3o'],
  ['TELE', 'Telecom'],
  ['AVAC', 'AVAC'],
  ['ARCO', 'Ar Comprimido'],
  ['IMPE', 'Impermeabiliza\u00e7\u00e3o'],
  ['ALA', 'Alarme'],
  ['PCI', 'PCI'],
  ['TERR', 'Terraplanagem'],
  ['TOPO', 'Topografia'],
  ['VPAV', 'Vias e Pavimenta\u00e7\u00e3o'],
  ['SINS', 'Sinaliza\u00e7\u00e3o Vi\u00e1ria'],
  ['MEC', 'Mec\u00e2nica / Caldeiraria'],
  ['AMB', 'Ambiental'],
  ['COMP', 'Compatibiliza\u00e7\u00e3o'],
  ['ORC', 'Or\u00e7amento'],
  ['ENG', 'Engenharia'],
  ['JUR', 'Jur\u00eddico'],
  ['MULT', 'Multidisciplinar'],
  ['ECON', 'Econ\u00f4mico-Financeiro'],
  ['GEO', 'Geof\u00edsica'],
  ['VIAR', 'Vi\u00e1rio'],
  ['DES', 'Desapropria\u00e7\u00e3o'],
  ['CLSH', 'Clash'],
  ['SUP', 'Supervis\u00e3o'],
  ['GER', 'Gerenciamento'],
  ['GECO', 'Gest\u00e3o do Contrato'],
  ['CONF', 'Conformidade']
];

function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu('QUANTA Sync')
    .addItem('Sincronizar Firebase', 'syncFirebaseNow')
    .addToUi();
}

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = String(data.action || '').trim();

    if (action === 'schedulePublicJsonPublish') {
      schedulePublicJsonPublish_();
      return json_({ success: true, message: 'Publicacao do Registro agendada.' });
    }

    if (action === 'publishFullDatabaseToPublicJsonNow') {
      var publishNowMessage = publishFullDatabaseToPublicJsonNow();
      return json_({ success: true, message: publishNowMessage });
    }

    if (action === 'syncAllPublicJsonNow') {
      var syncNowMessage = syncAllPublicJsonNow();
      return json_({ success: true, message: syncNowMessage });
    }

    if (action === 'syncRegistroAtividadesFirebaseNow') {
      var firebaseSyncMessage = syncRegistroAtividadesFirebaseNow();
      return json_({ success: true, message: firebaseSyncMessage });
    }

    if (action === 'publishFullDatabaseToFirebaseNow') {
      var firebasePublishMessage = publishFullDatabaseToFirebaseNow();
      return json_({ success: true, message: firebasePublishMessage });
    }

    if (action === 'syncFirebaseNow') {
      var unifiedFirebaseSyncMessage = syncFirebaseNow();
      return json_({ success: true, message: unifiedFirebaseSyncMessage });
    }

    if (action === 'scheduleFirebaseSync') {
      scheduleFirebaseSync_();
      return json_({ success: true, message: 'Sincronizacao Firebase agendada.' });
    }

    if (action === 'scheduleFullPublicJsonRefresh') {
      var fullRefreshMessage = scheduleFullPublicJsonRefresh();
      return json_({ success: true, message: fullRefreshMessage });
    }

    if (action === 'saveConfigOptions') {
      var cargosFast = arrayFromAny_(data.cargos);
      var disciplinasFast = arrayFromAny_(data.disciplinas);
      var alocacoesFast = arrayFromAny_(data.alocacoes);

      saveConfigSheet_(ss, cargosFast, disciplinasFast, alocacoesFast);
      logAuth_(ss, 'INFO', 'saveConfigOptions ok', safeJson_({ cargos: cargosFast.length, disciplinas: disciplinasFast.length, alocacoes: alocacoesFast.length }));
      flushAndSchedulePublicJsonPublish_();
      return json_({ success: true });
    }

    if (action === 'saveRoleTabPermissions') {
      var roleTabPermissionsFast = data.roleTabPermissions || {};

      saveRoleTabPermissions_(ss, roleTabPermissionsFast);
      logAuth_(ss, 'INFO', 'saveRoleTabPermissions ok', safeJson_(roleTabPermissionsFast));
      flushAndSchedulePublicJsonPublish_();
      return json_({ success: true });
    }

    if (action === 'saveDatabaseLink') {
      var idDbFast = String(data.id || '').trim();
      var nomeDbFast = String(data.nome || '').trim();
      var linkDbFast = String(data.link || '').trim();
      var descricaoDbFast = String(data.descricao || '').trim();

      if (!nomeDbFast) return json_({ success: false, error: 'Informe o nome da planilha.' });
      if (!linkDbFast) return json_({ success: false, error: 'Informe o link da planilha.' });
      if (descricaoDbFast.length > 100) descricaoDbFast = descricaoDbFast.slice(0, 100);

      var shDbFast = getOrCreateDatabaseLinksSheet_(ss);
      var rowsDbFast = shDbFast.getDataRange().getValues();
      var nowDbFast = new Date().toLocaleString('pt-BR');

      if (!idDbFast) {
        idDbFast = Utilities.getUuid();
        shDbFast.appendRow([idDbFast, nomeDbFast, linkDbFast, descricaoDbFast, nowDbFast]);
      } else {
        var foundDbFast = false;
        for (var iDbFast = 1; iDbFast < rowsDbFast.length; iDbFast++) {
          if (String(rowsDbFast[iDbFast][0]) === idDbFast) {
            shDbFast.getRange(iDbFast + 1, 2, 1, 4).setValues([[nomeDbFast, linkDbFast, descricaoDbFast, nowDbFast]]);
            foundDbFast = true;
            break;
          }
        }
        if (!foundDbFast) {
          shDbFast.appendRow([idDbFast, nomeDbFast, linkDbFast, descricaoDbFast, nowDbFast]);
        }
      }

      flushAndSchedulePublicJsonPublish_();
      return json_({ success: true, id: idDbFast });
    }

    if (action === 'deleteDatabaseLink') {
      var idDelFast = String(data.id || '').trim();
      if (!idDelFast) return json_({ success: false, error: 'ID inválido.' });

      var shDelFast = getOrCreateDatabaseLinksSheet_(ss);
      var rowsDelFast = shDelFast.getDataRange().getValues();

      for (var iDelFast = rowsDelFast.length - 1; iDelFast >= 1; iDelFast--) {
        if (String(rowsDelFast[iDelFast][0]) === idDelFast) {
          shDelFast.deleteRow(iDelFast + 1);
          flushAndSchedulePublicJsonPublish_();
          return json_({ success: true });
        }
      }

      return json_({ success: false, error: 'Banco de dados não encontrado.' });
    }

    if (action === 'saveTerceirizada') {
      var idTerFast = String(data.id || '').trim();
      var nomeTerFast = String(data.nome || data.name || '').trim();
      var disciplinaTerFast = String(data.disciplina || data.discipline || '').trim();

      if (!nomeTerFast) return json_({ success: false, error: 'Informe o nome da terceirizada.' });
      if (!disciplinaTerFast) return json_({ success: false, error: 'Informe a disciplina da terceirizada.' });

      var shTerFast = getOrCreateTerceirizadasSheet_(ss);
      var rowsTerFast = shTerFast.getDataRange().getValues();
      var nowTerFast = new Date().toLocaleString('pt-BR');

      if (!idTerFast) {
        idTerFast = Utilities.getUuid();
        shTerFast.appendRow([idTerFast, nomeTerFast, disciplinaTerFast, nowTerFast]);
      } else {
        var foundTerFast = false;
        for (var iTerFast = 1; iTerFast < rowsTerFast.length; iTerFast++) {
          if (String(rowsTerFast[iTerFast][0]) === idTerFast) {
            shTerFast.getRange(iTerFast + 1, 2, 1, 3).setValues([[nomeTerFast, disciplinaTerFast, nowTerFast]]);
            foundTerFast = true;
            break;
          }
        }
        if (!foundTerFast) shTerFast.appendRow([idTerFast, nomeTerFast, disciplinaTerFast, nowTerFast]);
      }

      flushAndSchedulePublicJsonPublish_();
      return json_({ success: true, id: idTerFast });
    }

    if (action === 'deleteTerceirizada') {
      var idTerDelFast = String(data.id || '').trim();
      if (!idTerDelFast) return json_({ success: false, error: 'ID invalido.' });

      var shTerDelFast = getOrCreateTerceirizadasSheet_(ss);
      var rowsTerDelFast = shTerDelFast.getDataRange().getValues();

      for (var iTerDelFast = rowsTerDelFast.length - 1; iTerDelFast >= 1; iTerDelFast--) {
        if (String(rowsTerDelFast[iTerDelFast][0]) === idTerDelFast) {
          shTerDelFast.deleteRow(iTerDelFast + 1);
          flushAndSchedulePublicJsonPublish_();
          return json_({ success: true });
        }
      }

      return json_({ success: false, error: 'Terceirizada nao encontrada.' });
    }

    if (action === 'registerActivitiesBatch') {
      return registerActivitiesBatch_(ss, data);
    }

    if (action === 'updateActivitiesBatch') {
      return updateActivitiesBatch_(ss, data);
    }

    if (action === 'saveNc2RecordsBatch') {
      return saveNc2RecordsBatch_(ss, data);
    }

    if (action === 'updateNc2Record') {
      return updateNc2Record_(ss, data);
    }

    var loginSheet = getOrCreateLoginSheet_(ss);
    var header = getHeaderMapSafe_(loginSheet);
    var values = loginSheet.getDataRange().getValues();

    logAuth_(ss, 'INFO', 'doPost recebido', safeJson_(data));

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
      row[header.alocacao] = '';
      row[header.contrato] = '';
      row[header.abas] = '';
      row[header.passwordhash] = hash;
      row[header.resetcode] = '';
      row[header.resetexpires] = '';
      row[header.isadmin] = 'false';
      row[header.lastseen] = '';
      row[header.sessionversion] = newSessionVersion_();

      loginSheet.appendRow(row);
      logAuth_(ss, 'INFO', 'registerUser ok', email);
      flushAndSchedulePublicJsonPublish_(); return json_({ success: true, message: 'Cadastro realizado com sucesso. Aguarde aprovação.' });
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

      var authSessionVersion = String(row2[header.sessionversion] || '').trim();
      if (!authSessionVersion) {
        authSessionVersion = newSessionVersion_();
        setLoginRowPatch_(loginSheet, idx + 1, header, { sessionversion: authSessionVersion });
        row2[header.sessionversion] = authSessionVersion;
      }

      loginSheet.getRange(idx + 1, header.lastseen + 1).setValue(Date.now());
      var user = normalizeUserResponse_(row2, header);

      logAuth_(ss, 'INFO', 'authUser ok', email2);
      return json_({ success: true, user: user });
    }

    if (action === 'heartbeat') {
      var emailHb = normalizeEmail_(data.email);
      if (!emailHb) return json_({ success: false, error: 'E-mail inválido.' });

      var idxHb = findUserRowByEmail_(values, header, emailHb);
      if (idxHb < 0) return json_({ success: false, error: 'Usuário não encontrado.' });

      var heartbeatVersion = String(data.sessionVersion || '').trim();
      var currentVersion = String(values[idxHb][header.sessionversion] || '').trim();
      if (currentVersion && heartbeatVersion !== currentVersion) {
        return json_({ success: false, forceLogout: true, error: 'Sessao invalidada.' });
      }

      loginSheet.getRange(idxHb + 1, header.lastseen + 1).setValue(Date.now());
      return json_({ success: true, sessionVersion: currentVersion });
    }

    if (action === 'forgotPassword') {
      var email3 = normalizeEmail_(data.email);
      if (!email3) return json_({ success: false, error: 'E-mail inválido.' });

      logRecovery_(ss, email3, 'solicitado', '');
      var idx2 = findUserRowByEmail_(values, header, email3);

      if (idx2 < 0) {
        logRecovery_(ss, email3, 'ignorado', 'email não encontrado');
        return json_({ success: true });
      }

      var code = randomCode_(6);
      var expires = Date.now() + 15 * 60 * 1000;

      setLoginRowPatch_(loginSheet, idx2 + 1, header, {
        resetcode: code,
        resetexpires: expires
      });

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

      return json_({ success: true });
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

      setLoginRowPatch_(loginSheet, idx3 + 1, header, {
        passwordhash: newHash,
        resetcode: '',
        resetexpires: '',
        lastseen: '',
        sessionversion: newSessionVersion_()
      });

      logRecovery_(ss, email4, 'concluido', 'senha redefinida');
      logAuth_(ss, 'INFO', 'resetPassword ok', email4);

      return json_({ success: true });
    }

    if (action === 'approveUser') {
      var emailA = normalizeEmail_(data.email);
      if (!emailA) return json_({ success: false, error: 'E-mail inválido.' });

      var idxA = findUserRowByEmail_(values, header, emailA);
      if (idxA < 0) return json_({ success: false, error: 'Usuário não encontrado.' });

      var approvePatch = { status: 'approved' };
      if (data.name !== undefined) approvePatch.nome = data.name || '';
      if (data.role !== undefined) approvePatch.role = data.role || '';
      if (data.discipline !== undefined) approvePatch.disciplina = normalizeUserDisciplines_(data.discipline).join(' | ');
      if (data.allowedTabs !== undefined) approvePatch.abas = normalizeAllowedTabs_(data.allowedTabs);
      if (data.allocation !== undefined) approvePatch.alocacao = String(data.allocation || '');
      if (data.contract !== undefined) approvePatch.contrato = String(data.contract || '');
      if (data.isAdmin !== undefined) approvePatch.isadmin = boolToSheet_(data.isAdmin);
      approvePatch.lastseen = '';
      approvePatch.sessionversion = newSessionVersion_();
      setLoginRowPatch_(loginSheet, idxA + 1, header, approvePatch);
      logAuth_(ss, 'INFO', 'approveUser ok', emailA);
      flushAndSchedulePublicJsonPublish_(); return json_({ success: true });
    }

    if (action === 'blockUser') {
      var emailB = normalizeEmail_(data.email);
      if (!emailB) return json_({ success: false, error: 'E-mail inválido.' });

      var idxB = findUserRowByEmail_(values, header, emailB);
      if (idxB < 0) return json_({ success: false, error: 'Usuário não encontrado.' });

      setLoginRowPatch_(loginSheet, idxB + 1, header, {
        status: 'blocked',
        lastseen: '',
        sessionversion: newSessionVersion_()
      });
      logAuth_(ss, 'INFO', 'blockUser ok', emailB);
      flushAndSchedulePublicJsonPublish_(); return json_({ success: true });
    }

    if (action === 'saveUserAccess') {
      var emailS = normalizeEmail_(data.email);
      if (!emailS) return json_({ success: false, error: 'E-mail inválido.' });

      var idxS = findUserRowByEmail_(values, header, emailS);
      if (idxS < 0) return json_({ success: false, error: 'Usuário não encontrado.' });

      var saveUserPatch = {};
      if (data.name !== undefined) saveUserPatch.nome = String(data.name || '');
      if (data.role !== undefined) saveUserPatch.role = String(data.role || '');
      if (data.discipline !== undefined) saveUserPatch.disciplina = normalizeUserDisciplines_(data.discipline).join(' | ');
      if (data.allowedTabs !== undefined) saveUserPatch.abas = normalizeAllowedTabs_(data.allowedTabs);
      if (data.allocation !== undefined) saveUserPatch.alocacao = String(data.allocation || '');
      if (data.contract !== undefined) saveUserPatch.contrato = String(data.contract || '');
      if (data.isAdmin !== undefined) saveUserPatch.isadmin = boolToSheet_(data.isAdmin);
      if (data.status !== undefined) saveUserPatch.status = String(data.status || 'pending');
      saveUserPatch.lastseen = '';
      saveUserPatch.sessionversion = newSessionVersion_();
      setLoginRowPatch_(loginSheet, idxS + 1, header, saveUserPatch);

      logAuth_(ss, 'INFO', 'saveUserAccess ok', emailS);
      flushAndSchedulePublicJsonPublish_(); return json_({ success: true });
    }

    if (action === 'adminResetPassword') {
      var emailR = normalizeEmail_(data.email);
      if (!emailR) return json_({ success: false, error: 'E-mail inválido.' });

      var idxR = findUserRowByEmail_(values, header, emailR);
      if (idxR < 0) return json_({ success: false, error: 'Usuário não encontrado.' });

      var tempPassword = randomTemporaryPassword_();
      var hashTemp = makePasswordHash_(tempPassword);

      setLoginRowPatch_(loginSheet, idxR + 1, header, {
        passwordhash: hashTemp,
        resetcode: '',
        resetexpires: '',
        lastseen: '',
        sessionversion: newSessionVersion_()
      });

      try {
        sendAdminTemporaryPasswordEmail_(emailR, tempPassword);
      } catch (mailErr2) {
        var detail2 = (mailErr2 && mailErr2.stack) ? mailErr2.stack : String(mailErr2);
        logAuth_(ss, 'ERROR', 'adminResetPassword falha MailApp', detail2);
        return json_({ success: false, error: 'Falha ao enviar senha temporária por e-mail.' });
      }

      logAuth_(ss, 'INFO', 'adminResetPassword ok', emailR);
      return json_({ success: true, message: 'Senha temporária enviada por e-mail.' });
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
    var userDisciplinaR = normalizeUserDisciplines_(e.parameter.disciplinas || e.parameter.disciplina).join(' | ');
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
        hierarchyNodes: eapData.hierarchyNodes,
        childrenByParent: eapData.childrenByParent,
        rootCodes: eapData.rootCodes,
        professionals: professionalsData,
        activeActivities: activitiesData.activeActivities,
        completedActivities: activitiesData.completedActivities
      };
    }

    if (tabs.indexOf('cronograma') !== -1) {
      responseData.cronograma = getRawCronogramaData_(ss).rawRows;
    }

    if (isAdmin) {
      var loginSheet = getOrCreateLoginSheet_(ss);
      var header = getHeaderMapSafe_(loginSheet);
      var values = loginSheet.getDataRange().getValues();
      var config = getConfigOptions_(ss);
      var databaseLinks = getDatabaseLinks_(ss);
      var terceirizadas = getTerceirizadas_(ss);
      var roleTabPermissions = getRoleTabPermissions_(ss);

      var users = [];
      for (var i = 1; i < values.length; i++) {
        if (!normalizeEmail_(values[i][header.email])) continue;
        users.push(normalizeUserResponse_(values[i], header));
      }

      responseData.admin = {
        users: users,
        cargos: config.cargos,
        disciplinas: config.disciplinas,
        alocacoes: config.alocacoes,
        terceirizadas: terceirizadas,
        databaseLinks: databaseLinks,
        roleTabPermissions: roleTabPermissions
      };
    }

    return json_({ success: true, data: responseData });
  }

  if (action === 'getAdminData') {
    var loginSheet = getOrCreateLoginSheet_(ss);
    var header = getHeaderMapSafe_(loginSheet);
    var values = loginSheet.getDataRange().getValues();
    var config = getConfigOptions_(ss);
    var databaseLinks = getDatabaseLinks_(ss);
    var terceirizadasAdmin = getTerceirizadas_(ss);
    var roleTabPermissionsAdmin = getRoleTabPermissions_(ss);

    var responseDataAdmin = {
      users: [], cargos: config.cargos, disciplinas: config.disciplinas, alocacoes: config.alocacoes, terceirizadas: terceirizadasAdmin, databaseLinks: databaseLinks, roleTabPermissions: roleTabPermissionsAdmin
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
    var uDisciplina = primaryDiscipline_(e.parameter.userDisciplina || '');
    return json_(Object.assign({ success: true }, buildRegistroAtividadesResponseData_(ss, uEmail, uRole, uDisciplina)));
  }

  if (action === 'getCronogramaData') {
    return json_(getRawCronogramaData_(ss));
  }

  if (action === 'getNc2Records') {
    return json_({ success: true, records: getNc2Records_(ss) });
  }

  return json_({ error: 'Acao invalida' });
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
  var userDisciplinaA = primaryDiscipline_(data.userDisciplina || '');
  var activities = Array.isArray(data.activities) ? data.activities : [];

  if (!userEmailA) return json_({ success: false, error: 'Usuário inválido.' });
  if (!activities.length) return json_({ success: false, error: 'Nenhuma atividade para registrar.' });

  var shAct = getOrCreateActivitiesSheet_(ss);

  // VELOCIDADE: para validar duplicidade lemos somente ItemCodigo (K) e Status (U).
  // Evite getDataRange() aqui; em planilhas grandes ele aumenta o tempo de input do usuario.
  var lastActRow = shAct.getLastRow();
  var existingOpenItems = {};
  if (lastActRow > 1) {
    var itemCodigoValues = shAct.getRange(2, 11, lastActRow - 1, 1).getValues();
    var statusValues = shAct.getRange(2, 21, lastActRow - 1, 1).getValues();
    for (var iAct = 0; iAct < itemCodigoValues.length; iAct++) {
      var existingItemCodigo = String(itemCodigoValues[iAct][0] || '').trim();
      var existingStatus = String(statusValues[iAct][0] || '').trim().toLowerCase();
      if (existingItemCodigo && existingStatus !== 'concluida') {
        existingOpenItems[existingItemCodigo] = true;
      }
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
    var avancoInicial = Math.max(0, Math.min(100, Number(item.avancoInicial || 0)));
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
    var statusInicial = avancoInicial === 100 ? 'aguardando_conclusao' : 'em_andamento';
    var data100Inicial = avancoInicial === 100 ? nowStr : '';

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
      avancoInicial,
      '',
      '',
      statusInicial,
      data100Inicial,
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
        avancoInicial: avancoInicial,
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
  try {
    var firebaseDocsToCreate = rowsToAppend.map(function(row) {
      var activity = activityRowToFirebaseObject_(row);
      return { id: activity.activityId, data: activity };
    });
    firestoreCommitDocuments_("registroAtividades", firebaseDocsToCreate);
  } catch (firebaseErr) {
    Logger.log("Falha ao duplicar registro no Firebase: " + String(firebaseErr));
  }

  var shHistory = getOrCreateActivitiesHistorySheet_(ss);
  shHistory.getRange(shHistory.getLastRow() + 1, 1, historyRows.length, 8).setValues(historyRows);
  SpreadsheetApp.flush();

  schedulePublicJsonPublish_();
  return json_({
    success: true,
    message: rowsToAppend.length + ' atividade(s) registrada(s) com sucesso.',
    duplicateItems: duplicateItems,
    publicJsonUpdated: false,
    publicJsonError: '',
    registroSnapshot: buildRegistroActivitiesOnlyResponseData_(ss, userEmailA, userRoleA)
  });
}

function updateActivitiesBatch_(ss, data) {
  var userEmailU = normalizeEmail_(data.userEmail);
  var userNameU = String(data.userName || '').trim();
  var userRoleU = String(data.userRole || '').trim();
  var userDisciplinaU = primaryDiscipline_(data.userDisciplina || '');
  var updates = Array.isArray(data.updates) ? data.updates : [];

  if (!updates.length) {
    return json_({ success: false, error: 'Nenhuma alteração para salvar.' });
  }

  var shUpd = getOrCreateActivitiesSheet_(ss);
  var activityRowMap = {};

  // VELOCIDADE: mapeie atividades pela coluna A, sem carregar as 25 colunas da planilha inteira.
  var lastUpdRow = shUpd.getLastRow();
  if (lastUpdRow > 1) {
    var activityIdValues = shUpd.getRange(2, 1, lastUpdRow - 1, 1).getValues();
    for (var i = 0; i < activityIdValues.length; i++) {
      var activityId = String(activityIdValues[i][0] || '').trim();
      if (activityId) {
        activityRowMap[activityId] = i + 2;
      }
    }
  }

  // === Mapeamento da aba EAP para salver % ===
  var shEap = ss.getSheetByName('EAP');
  var eapRowMap = {};
  if (shEap) {
    // VELOCIDADE: limita a busca da EAP ate a coluna D, sem carregar a planilha inteira.
    var lastEapRow = shEap.getLastRow();
    var eapValues = lastEapRow > 1 ? shEap.getRange(2, 1, lastEapRow - 1, 4).getValues() : [];
    var eapDisplayValues = lastEapRow > 1 ? shEap.getRange(2, 1, lastEapRow - 1, 4).getDisplayValues() : [];
    for (var e = 0; e < eapValues.length; e++) {
      var codEap = String(eapDisplayValues[e][3] || eapValues[e][3] || '').trim(); // Coluna D (índice 3) é o código
      if (codEap) {
        eapRowMap[codEap] = e + 2;
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
    var updatedRow = currentRow.slice();
    var rowChanged = false;

    var profissionaisEmailsU = Array.isArray(upd.profissionaisEmails) ? upd.profissionaisEmails : null;
    var profissionaisNomesU = Array.isArray(upd.profissionaisNomes) ? upd.profissionaisNomes : null;
    var avancoAtualU = upd.avancoAtual !== undefined ? Number(upd.avancoAtual || 0) : null;
    var avaliacaoAtualU = upd.avaliacaoAtual !== undefined ? String(upd.avaliacaoAtual || '') : null;
    var observacaoAtualU = upd.observacaoAtual !== undefined ? String(upd.observacaoAtual || '') : null;

    if (profissionaisEmailsU !== null && profissionaisNomesU !== null) {
      updatedRow[13] = profissionaisNomesU.join(' | ');
      updatedRow[14] = profissionaisEmailsU.join(' | ');

      historyRows.push([
        Utilities.getUuid(), activityIdU, new Date().toLocaleString('pt-BR'), userEmailU, userNameU, 'profissionais', oldEmails, profissionaisEmailsU.join(' | ')
      ]);
      rowChanged = true;
      anyUpdated = true;
    }

    if (avancoAtualU !== null) {
      var avancoNormalizado = Math.max(0, Math.min(100, avancoAtualU));
      updatedRow[17] = avancoNormalizado;

      // === Salvar % na coluna C da EAP (% Atual) ===
      if (shEap && eapRowMap[itemCodigoU]) {
        shEap.getRange(eapRowMap[itemCodigoU], 3).setValue(avancoNormalizado / 100);
      }
      // ===================================

      historyRows.push([
        Utilities.getUuid(), activityIdU, new Date().toLocaleString('pt-BR'), userEmailU, userNameU, 'avanco', String(oldAvanco), String(avancoNormalizado)
      ]);

      if (avancoNormalizado === 100 && currentStatus !== 'aguardando_conclusao') {
        var now100 = new Date();
        updatedRow[20] = 'aguardando_conclusao';
        updatedRow[21] = now100.toLocaleString('pt-BR');
      } else if (avancoNormalizado < 100 && currentStatus === 'aguardando_conclusao') {
        updatedRow[20] = 'em_andamento';
        updatedRow[21] = '';
      }

      rowChanged = true;
      anyUpdated = true;
    }

    if (avaliacaoAtualU !== null) {
      updatedRow[18] = avaliacaoAtualU;
      historyRows.push([Utilities.getUuid(), activityIdU, new Date().toLocaleString('pt-BR'), userEmailU, userNameU, 'avaliacao', oldAvaliacao, avaliacaoAtualU]);
      rowChanged = true;
      anyUpdated = true;
    }

    if (observacaoAtualU !== null) {
      updatedRow[19] = observacaoAtualU;
      historyRows.push([Utilities.getUuid(), activityIdU, new Date().toLocaleString('pt-BR'), userEmailU, userNameU, 'observacao', oldObservacao, observacaoAtualU]);
      rowChanged = true;
      anyUpdated = true;
    }

    if (rowChanged) {
      updatedRow[24] = new Date().toLocaleString('pt-BR');
      shUpd.getRange(rowFound, 1, 1, 25).setValues([updatedRow]);
      try {
        var activityForFirebase = activityRowToFirebaseObject_(updatedRow);
        firestoreSetDocument_("registroAtividades", activityForFirebase.activityId, activityForFirebase);
      } catch (firebaseErr) {
        Logger.log("Falha ao atualizar atividade no Firebase: " + String(firebaseErr));
      }
    }
  }

  if (historyRows.length) {
    var shHistory = getOrCreateActivitiesHistorySheet_(ss);
    shHistory.getRange(shHistory.getLastRow() + 1, 1, historyRows.length, 8).setValues(historyRows);
  }

  if (!anyUpdated) {
    return json_({ success: false, error: 'Nenhuma alteração válida foi encontrada.' });
  }

  flushAndSchedulePublicJsonPublish_(); return json_({ success: true, message: 'Alterações salvas com sucesso.' });
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

function getDefaultDisciplineLabels_() {
  return DEFAULT_DISCIPLINE_SOURCE.map(function (item) {
    return String(item[0] || '').trim() + ' - ' + String(item[1] || '').trim();
  }).filter(Boolean);
}

function getDefaultAlocacaoLabels_() {
  return DEFAULT_ALOCACAO_SOURCE.map(function (item) {
    return String(item || '').trim();
  }).filter(Boolean);
}

function seedDefaultDisciplineConfigIfMissing_(ss) {
  var sh = getOrCreateConfigSheet_(ss);
  var values = sh.getDataRange().getValues();
  var hasDisciplineRows = false;
  var hasAlocacaoRows = false;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][1] || '').trim()) {
      hasDisciplineRows = true;
    }
    if (String(values[i][2] || '').trim()) {
      hasAlocacaoRows = true;
    }
  }

  if (hasDisciplineRows && hasAlocacaoRows) return false;

  var defaults = getDefaultDisciplineLabels_();
  var alocacoes = getDefaultAlocacaoLabels_();
  var rowCount = Math.max(values.length - 1, defaults.length, alocacoes.length);
  var rows = [['Cargo', 'Disciplina', 'Alocacao']];

  for (var j = 0; j < rowCount; j++) {
    var current = values[j + 1] || [];
    rows.push([
      String(current[0] || ''),
      String(defaults[j] || current[1] || ''),
      String(alocacoes[j] || current[2] || '')
    ]);
  }

  sh.clearContents();
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  return true;
}

function getOrCreateRoleTabPermissionsSheet_(ss) {
  var sh = ss.getSheetByName('permissoes_cargos');
  if (!sh) {
    sh = ss.insertSheet('permissoes_cargos');
    sh.getRange(1, 1, 1, 2).setValues([['Cargo', 'Abas']]);
  } else if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.clear();
    sh.getRange(1, 1, 1, 2).setValues([['Cargo', 'Abas']]);
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

function getOrCreateTerceirizadasSheet_(ss) {
  var sh = ss.getSheetByName('terceirizadas');
  if (!sh) {
    sh = ss.insertSheet('terceirizadas');
    sh.getRange(1, 1, 1, 4).setValues([['ID', 'Nome', 'Disciplina', 'AtualizadoEm']]);
  } else if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
    sh.clear();
    sh.getRange(1, 1, 1, 4).setValues([['ID', 'Nome', 'Disciplina', 'AtualizadoEm']]);
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

// ============================================================================
// HELPERS
// ============================================================================

function saveConfigSheet_(ss, cargos, disciplinas, alocacoes) {
  var sh = getOrCreateConfigSheet_(ss);
  sh.clearContents();

  disciplinas = Array.isArray(disciplinas) ? disciplinas : [];
  if (disciplinas.length === 0) {
    disciplinas = getDefaultDisciplineLabels_();
  }
  alocacoes = Array.isArray(alocacoes) ? alocacoes : [];
  if (alocacoes.length === 0) {
    alocacoes = getDefaultAlocacaoLabels_();
  }
  var maxLen = Math.max(cargos.length, disciplinas.length, alocacoes.length, 1);
  var rows = [['Cargo', 'Disciplina', 'Alocacao']];
  for (var i = 0; i < maxLen; i++) {
    rows.push([cargos[i] || '', disciplinas[i] || '', alocacoes[i] || '']);
  }

  sh.getRange(1, 1, rows.length, 3).setValues(rows);
}

function getConfigOptions_(ss) {
  seedDefaultDisciplineConfigIfMissing_(ss);
  var sh = getOrCreateConfigSheet_(ss);
  var values = sh.getDataRange().getValues();
  var cargos = [];
  var disciplinas = [];
  var alocacoes = [];

  for (var i = 1; i < values.length; i++) {
    if (values[i][0]) cargos.push(String(values[i][0]));
    if (values[i][1]) disciplinas.push(String(values[i][1]));
    if (values[i][2]) alocacoes.push(String(values[i][2]));
  }

  return {
    cargos: uniqueSorted_(cargos),
    disciplinas: uniqueSorted_(disciplinas),
    alocacoes: uniqueSorted_(alocacoes.length ? alocacoes : getDefaultAlocacaoLabels_())
  };
}

function saveRoleTabPermissions_(ss, permissions) {
  var sh = getOrCreateRoleTabPermissionsSheet_(ss);
  sh.clearContents();

  var rows = [];
  var map = permissions && typeof permissions === 'object' ? permissions : {};
  for (var cargo in map) {
    if (!Object.prototype.hasOwnProperty.call(map, cargo)) continue;
    var cargoName = String(cargo || '').trim();
    if (!cargoName) continue;
    rows.push([cargoName, normalizeAllowedTabs_(map[cargo])]);
  }

  rows.sort(function (a, b) { return String(a[0]).localeCompare(String(b[0]), 'pt-BR'); });
  rows.unshift(['Cargo', 'Abas']);
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
}

function getRoleTabPermissions_(ss) {
  var sh = getOrCreateRoleTabPermissionsSheet_(ss);
  var values = sh.getDataRange().getValues();
  var out = {};

  for (var i = 1; i < values.length; i++) {
    var cargo = String(values[i][0] || '').trim();
    if (!cargo) continue;
    out[cargo] = parseAllowedTabs_(values[i][1]);
  }

  return out;
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

function getTerceirizadas_(ss) {
  var sh = getOrCreateTerceirizadasSheet_(ss);
  var values = sh.getDataRange().getValues();
  var out = [];

  for (var i = 1; i < values.length; i++) {
    var id = String(values[i][0] || '').trim();
    var nome = String(values[i][1] || '').trim();
    var disciplina = String(values[i][2] || '').trim();
    if (!id || !nome || !disciplina) continue;

    out.push({
      id: id,
      nome: nome,
      disciplina: disciplina
    });
  }

  out.sort(function(a, b) {
    var da = String(a.disciplina || '').localeCompare(String(b.disciplina || ''), 'pt-BR');
    if (da !== 0) return da;
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  });

  return out;
}

function buildTerceirizadaProfessionalId_(id) {
  return 'terceirizada:' + String(id || '').trim();
}

function getUnifiedEapPublicDataSafe_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var url = String(
      props.getProperty("git_eap_unificada") ||
      props.getProperty("git_eap") ||
      props.getProperty("git_eap_public") ||
      DEFAULT_EAP_PUBLIC_JSON_URL ||
      ""
    ).trim();

    if (!url) return null;

    var response = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true,
      headers: { Accept: "application/json" }
    });

    var status = response.getResponseCode();
    if (status < 200 || status >= 300) return null;

    var envelope = JSON.parse(response.getContentText() || "{}");
    var payload = decryptPayloadEnvelope_(
      envelope,
      envelope && envelope.algorithm === "xor-sha256-stream" ? getJsonCryptoKey_() : ""
    );

    return payload && payload.data ? payload.data : null;
  } catch (e) {
    return null;
  }
}

function getEapStructuredData_(ss) {
  var unifiedEap = getUnifiedEapPublicDataSafe_();
  if (unifiedEap && unifiedEap.registro) {
    return {
      contracts: Array.isArray(unifiedEap.registro.contracts) ? unifiedEap.registro.contracts : [],
      osOptions: Array.isArray(unifiedEap.registro.osOptions) ? unifiedEap.registro.osOptions : [],
      itemOptions: Array.isArray(unifiedEap.registro.itemOptions) ? unifiedEap.registro.itemOptions : [],
      hierarchyNodes: Array.isArray(unifiedEap.registro.hierarchyNodes) ? unifiedEap.registro.hierarchyNodes : [],
      childrenByParent: unifiedEap.registro.childrenByParent && typeof unifiedEap.registro.childrenByParent === 'object' ? unifiedEap.registro.childrenByParent : {},
      rootCodes: Array.isArray(unifiedEap.registro.rootCodes) ? unifiedEap.registro.rootCodes : []
    };
  }

  if (unifiedEap && Array.isArray(unifiedEap.atual) && unifiedEap.atual.length > 0) {
    var rawRows = [];
    for (var u = 0; u < unifiedEap.atual.length; u++) {
      var raw = unifiedEap.atual[u] || [];
      var code = String(raw[0] || '').trim();
      var name = String(raw[1] || '').trim();
      if (!code || !name) continue;
      rawRows.push({ code: code, name: name });
    }

    if (rawRows.length > 0) {
      return getEapStructuredDataFromRows_(rawRows);
    }
  }

  var sh = ss.getSheetByName('EAP');
  if (!sh) return { contracts: [], osOptions: [], itemOptions: [], hierarchyNodes: [], childrenByParent: {}, rootCodes: [] };

  var values = sh.getDataRange().getValues();
  var displayValues = sh.getDataRange().getDisplayValues();
  var rows = [];

  for (var i = 1; i < values.length; i++) {
    var codigo = String(displayValues[i][3] || values[i][3] || '').trim();
    var nome = String(displayValues[i][4] || values[i][4] || '').trim();
    if (!codigo || !nome) continue;
    rows.push({ codigo: codigo, nome: nome });
  }

  return buildEapStructuredDataFromSimpleRows_(rows);
}

function buildEapStructuredDataFromSimpleRows_(rows) {
  var hierarchy = buildEapHierarchyPayloadFromRows_(rows);
  var contracts = [];
  var osOptions = [];
  var itemOptions = [];

  for (var i = 0; i < hierarchy.nodes.length; i++) {
    var node = hierarchy.nodes[i];
    if (node.tipo === 'contrato') {
      contracts.push({ codigo: node.codigo, nome: node.nome });
    }
    if (node.tipo === 'os' && node.contratoCodigo) {
      osOptions.push({ codigo: node.codigo, nome: node.nome, contratoCodigo: node.contratoCodigo });
    }
    if (node.tipo === 'item' && node.osCodigo) {
      itemOptions.push({ codigo: node.codigo, nome: node.nome, osCodigo: node.osCodigo });
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
    var codigo = String(item.codigo || item.code || '').trim();
    var nome = String(item.nome || item.name || '').trim();
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

function isOsItemName_(value) {
  var text = String(value || '').trim();
  if (!text) return false;
  return /(^|[^A-Za-z0-9À-ÿ])_?OS(?=[A-Za-z0-9À-ÿ_\-\.\s]|$)/i.test(text);
}

function getProfessionalsByDisciplina_(ss, disciplina) {
  var loginSheet = getOrCreateLoginSheet_(ss);
  var header = getHeaderMapSafe_(loginSheet);
  var values = loginSheet.getDataRange().getValues();

  var out = [];
  var disciplinaNorms = normalizeUserDisciplines_(disciplina).map(function (item) { return normalizeText_(item); });
  if (!disciplinaNorms.length) return out;

  for (var i = 1; i < values.length; i++) {
    var email = String(values[i][header.email] || '').trim();
    var nome = String(values[i][header.nome] || '').trim();
    var cargo = String(values[i][header.role] || '').trim();
    var userDisciplinaList = normalizeUserDisciplines_(values[i][header.disciplina] || '');
    var status = String(values[i][header.status] || '').trim().toLowerCase();

    if (!email || status !== 'approved') continue;
    if (!userDisciplinaList.length) continue;

    var matchesUser = false;
    for (var d = 0; d < userDisciplinaList.length; d++) {
      if (disciplinaNorms.indexOf(normalizeText_(userDisciplinaList[d])) !== -1) {
        matchesUser = true;
        break;
      }
    }
    if (!matchesUser) continue;

    out.push({ nome: nome, email: email, cargo: cargo, disciplina: userDisciplinaList.join(' | ') });
  }

  var terceirizadas = getTerceirizadas_(ss);
  for (var t = 0; t < terceirizadas.length; t++) {
    var terceirizada = terceirizadas[t] || {};
    var terceirizadaDisciplinaList = normalizeUserDisciplines_(terceirizada.disciplina || '');
    var matchesTerceirizada = false;
    for (var td = 0; td < terceirizadaDisciplinaList.length; td++) {
      if (disciplinaNorms.indexOf(normalizeText_(terceirizadaDisciplinaList[td])) !== -1) {
        matchesTerceirizada = true;
        break;
      }
    }
    if (!matchesTerceirizada) continue;

    out.push({
      nome: String(terceirizada.nome || '').trim(),
      email: buildTerceirizadaProfessionalId_(terceirizada.id),
      cargo: 'Terceirizada',
      disciplina: terceirizadaDisciplinaList.join(' | ')
    });
  }

  return out;
}

function getActivitiesForUser_(ss, userEmail, userRole) {
  var sh = getOrCreateActivitiesSheet_(ss);
  var values = sh.getDataRange().getValues();
  var displayValues = sh.getDataRange().getDisplayValues();

  var activeActivities = [];
  var completedActivities = [];

  updateDelayedCompletedActivities_(ss);
  values = sh.getDataRange().getValues();
  displayValues = sh.getDataRange().getDisplayValues();

  for (var i = 1; i < values.length; i++) {
    var createdByEmail = String(values[i][3] || '').trim().toLowerCase();
    var roleLower = String(userRole || '').trim().toLowerCase();

    if (roleLower === 'lider' && createdByEmail !== String(userEmail || '').trim().toLowerCase()) {
      continue;
    }

    var rowObj = {
      id: String(displayValues[i][0] || values[i][0] || ''),
      dataRegistro: String(displayValues[i][1] || values[i][1] || ''),
      createdByEmail: String(displayValues[i][3] || values[i][3] || ''),
      contratoCodigo: String(displayValues[i][6] || values[i][6] || ''),
      contratoNome: String(displayValues[i][7] || values[i][7] || ''),
      osCodigo: String(displayValues[i][8] || values[i][8] || ''),
      osNome: String(displayValues[i][9] || values[i][9] || ''),
      itemCodigo: String(displayValues[i][10] || values[i][10] || ''),
      itemNome: String(displayValues[i][11] || values[i][11] || ''),
      setor: String(displayValues[i][12] || values[i][12] || ''),
      profissionais: String(displayValues[i][13] || values[i][13] || '').split(' | ').filter(Boolean),
      profissionaisEmails: String(displayValues[i][14] || values[i][14] || '').split(' | ').filter(Boolean),
      dificuldade: String(displayValues[i][15] || values[i][15] || ''),
      descricao: String(displayValues[i][16] || values[i][16] || ''),
      avancoAtual: Number(values[i][17] || 0),
      avaliacaoAtual: String(displayValues[i][18] || values[i][18] || ''),
      observacaoAtual: String(displayValues[i][19] || values[i][19] || ''),
      status: String(displayValues[i][20] || values[i][20] || 'em_andamento'),
      data100: String(displayValues[i][21] || values[i][21] || ''),
      dataConclusaoEfetiva: String(displayValues[i][22] || values[i][22] || ''),
      ultimaAtualizacao: String(displayValues[i][24] || values[i][24] || '')
    };

    if (rowObj.status === 'concluida') {
      completedActivities.push(rowObj);
    } else {
      activeActivities.push(rowObj);
    }
  }

  return { activeActivities: activeActivities, completedActivities: completedActivities };
}

function buildRegistroAtividadesResponseData_(ss, userEmail, userRole, userDisciplina) {
  var eapData = getEapStructuredData_(ss);
  var professionalsData = getProfessionalsByDisciplina_(ss, userDisciplina);
  var activitiesData = getActivitiesForUser_(ss, userEmail, userRole);

  return {
    contracts: eapData.contracts,
    osOptions: eapData.osOptions,
    itemOptions: eapData.itemOptions,
    hierarchyNodes: eapData.hierarchyNodes,
    childrenByParent: eapData.childrenByParent,
    rootCodes: eapData.rootCodes,
    professionals: professionalsData,
    activeActivities: activitiesData.activeActivities,
    completedActivities: activitiesData.completedActivities
  };
}

function buildRegistroActivitiesOnlyResponseData_(ss, userEmail, userRole) {
  var activitiesData = getActivitiesForUser_(ss, userEmail, userRole);
  return {
    activeActivities: activitiesData.activeActivities,
    completedActivities: activitiesData.completedActivities
  };
}

function updateDelayedCompletedActivities_(ss) {
  var sh = getOrCreateActivitiesSheet_(ss);
  var values = sh.getDataRange().getValues();
  var now = new Date();
  var changed = false;

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
      values[i][20] = 'concluida';
      values[i][22] = now.toLocaleString('pt-BR');
      values[i][23] = 'false';
      values[i][24] = now.toLocaleString('pt-BR');
      sh.getRange(i + 1, 1, 1, 25).setValues([values[i].slice(0, 25)]);
      changed = true;
    }
  }

  if (changed) flushAndSchedulePublicJsonPublish_();
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
  var normalizedLevel = String(level || '').trim().toUpperCase();
  var verboseInfoLogs = String(PropertiesService.getScriptProperties().getProperty('auth_verbose_logs') || '').trim().toLowerCase() === 'true';
  if (normalizedLevel === 'INFO' && !verboseInfoLogs) return;

  var sh = getOrCreateAuthLogSheet_(ss);
  sh.appendRow([new Date().toLocaleString('pt-BR'), normalizedLevel || level, eventName, String(detail || '')]);
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
    resetexpires: ensure('ResetExpires'), isadmin: ensure('IsAdmin'), lastseen: ensure('LastSeen'),
    alocacao: ensure('Alocacao'), contrato: ensure('Contrato'), sessionversion: ensure('SessionVersion')
  };
}

function newEmptyLoginRow_(header) {
  var max = 0;
  for (var k in header) max = Math.max(max, header[k]);
  var row = [];
  for (var i = 0; i <= max; i++) row.push('');
  return row;
}

function getHeaderWidth_(header) {
  var max = 0;
  for (var k in header) {
    if (Object.prototype.hasOwnProperty.call(header, k)) max = Math.max(max, header[k]);
  }
  return max + 1;
}

function setLoginRowPatch_(sheet, rowNumber, header, patch) {
  var width = getHeaderWidth_(header);
  var range = sheet.getRange(rowNumber, 1, 1, width);
  var row = range.getValues()[0];

  for (var key in patch) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    if (header[key] === undefined) continue;
    row[header[key]] = patch[key];
  }

  range.setValues([row]);
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
  var disciplinas = normalizeUserDisciplines_(row[header.disciplina] || '');
  return {
    id: String(row[header.email] || ''), data: row[header.data], nome: String(row[header.nome] || ''),
    email: String(row[header.email] || ''), cargo: String(row[header.role] || ''), role: String(row[header.role] || ''),
    disciplina: disciplinas.length > 0 ? disciplinas[0] : String(row[header.disciplina] || ''),
    disciplinas: disciplinas,
    status: String(row[header.status] || 'pending'),
    alocacao: String(row[header.alocacao] || ''),
    contrato: String(row[header.contrato] || ''),
    allowedTabs: parseAllowedTabs_(row[header.abas]), abas: parseAllowedTabs_(row[header.abas]),
    isAdmin: parseBool_(row[header.isadmin]), online: online,
    sessionVersion: String(row[header.sessionversion] || '')
  };
}

function newSessionVersion_() {
  return String(Date.now()) + '-' + Utilities.getUuid().slice(0, 8);
}

function normalizeText_(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function buildDisciplineLookup_() {
  var map = {};
  for (var i = 0; i < DEFAULT_DISCIPLINE_SOURCE.length; i++) {
    var code = String(DEFAULT_DISCIPLINE_SOURCE[i][0] || '').trim();
    var name = String(DEFAULT_DISCIPLINE_SOURCE[i][1] || '').trim();
    var label = code + ' - ' + name;
    var aliases = [code, name, label, code + ' ' + name, name + ' - ' + code];
    for (var j = 0; j < aliases.length; j++) {
      var key = normalizeText_(aliases[j]);
      if (key) map[key] = label;
    }
  }
  return map;
}

var DISCIPLINE_LOOKUP_ = buildDisciplineLookup_();

function resolveDisciplineEntry_(value) {
  var clean = String(value || '').trim();
  if (!clean) return '';
  return DISCIPLINE_LOOKUP_[normalizeText_(clean)] || clean;
}

function splitDisciplineValues_(value) {
  if (Array.isArray(value)) {
    return value.map(function (item) { return resolveDisciplineEntry_(item); }).filter(Boolean);
  }
  return String(value || '')
    .split(/[\n,;|]+/)
    .map(function (item) { return resolveDisciplineEntry_(item); })
    .filter(Boolean);
}

function normalizeUserDisciplines_(value) {
  var list = splitDisciplineValues_(value);
  var seen = {};
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var item = String(list[i] || '').trim();
    var key = normalizeText_(item);
    if (!item || seen[key]) continue;
    seen[key] = true;
    out.push(item);
  }
  return out;
}

function primaryDiscipline_(value) {
  var list = normalizeUserDisciplines_(value);
  return list.length > 0 ? list[0] : '';
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

function getOrCreateNc2Sheet_(ss) {
  var sh = ss.getSheetByName('NC2_Revisoes');
  if (!sh) sh = ss.insertSheet('NC2_Revisoes');

  var header = [
    'Id', 'ContratoCodigo', 'ContratoNome', 'OS', 'OSCodigo', 'ObjetoOs',
    'ObjetoOsCodigo', 'Disciplina', 'Avaliador', 'AvaliadorEmail', 'Observacoes',
    'DataHora', 'ItensJson', 'Concluido', 'CreatedAt', 'UpdatedAt',
    'UpdatedByNome', 'UpdatedByEmail'
  ];

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.setFrozenRows(1);
  }

  return sh;
}

function normalizeNc2RecordForStore_(record, userName, userEmail) {
  var normalized = record || {};
  var itens = Array.isArray(normalized.itens) ? normalized.itens : [];
  var itensT = itens.filter(function (item) { return Number(item && item.quantidadeT || 0) > 0; });
  var concluido = Boolean(normalized.concluido);
  if (itensT.length > 0) concluido = itensT.every(function (item) { return Boolean(item.revisado); });

  return {
    id: String(normalized.id || Utilities.getUuid()).trim(),
    contratoCodigo: String(normalized.contratoCodigo || '').trim(),
    contratoNome: String(normalized.contratoNome || '').trim(),
    os: String(normalized.os || '').trim(),
    osCodigo: String(normalized.osCodigo || '').trim(),
    objetoOs: String(normalized.objetoOs || '').trim(),
    objetoOsCodigo: String(normalized.objetoOsCodigo || '').trim(),
    disciplina: String(normalized.disciplina || '').trim(),
    avaliador: String(normalized.avaliador || '').trim(),
    avaliadorEmail: normalizeEmail_(normalized.avaliadorEmail || ''),
    observacoes: String(normalized.observacoes || '').trim(),
    dataHora: String(normalized.dataHora || '').trim(),
    itens: itens,
    itensT: itensT,
    concluido: concluido,
    createdAt: String(normalized.createdAt || new Date().toISOString()).trim(),
    updatedAt: new Date().toISOString(),
    updatedByNome: String(userName || normalized.updatedByNome || '').trim(),
    updatedByEmail: normalizeEmail_(userEmail || normalized.updatedByEmail || '')
  };
}

function mapNc2RecordToRow_(record) {
  return [
    record.id || '', record.contratoCodigo || '', record.contratoNome || '', record.os || '',
    record.osCodigo || '', record.objetoOs || '', record.objetoOsCodigo || '',
    record.disciplina || '', record.avaliador || '', record.avaliadorEmail || '',
    record.observacoes || '', record.dataHora || '', JSON.stringify(record.itens || []),
    record.concluido ? 'true' : 'false', record.createdAt || '', record.updatedAt || '',
    record.updatedByNome || '', record.updatedByEmail || ''
  ];
}

function readNc2RecordsFromSheet_(ss) {
  var sh = getOrCreateNc2Sheet_(ss);
  var lastRow = sh.getLastRow();
  if (lastRow <= 1) return [];

  var rows = sh.getRange(2, 1, lastRow - 1, 18).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var itens = [];
    try { itens = JSON.parse(String(row[12] || '[]')); } catch (err) { itens = []; }
    var itensT = itens.filter(function (item) { return Number(item && item.quantidadeT || 0) > 0; });
    out.push({
      id: String(row[0] || '').trim(),
      contratoCodigo: String(row[1] || '').trim(),
      contratoNome: String(row[2] || '').trim(),
      os: String(row[3] || '').trim(),
      osCodigo: String(row[4] || '').trim(),
      objetoOs: String(row[5] || '').trim(),
      objetoOsCodigo: String(row[6] || '').trim(),
      disciplina: String(row[7] || '').trim(),
      avaliador: String(row[8] || '').trim(),
      avaliadorEmail: String(row[9] || '').trim(),
      observacoes: String(row[10] || '').trim(),
      dataHora: String(row[11] || '').trim(),
      itens: itens,
      itensT: itensT,
      concluido: String(row[13] || '').toLowerCase() === 'true',
      createdAt: String(row[14] || '').trim(),
      updatedAt: String(row[15] || '').trim(),
      updatedByNome: String(row[16] || '').trim(),
      updatedByEmail: String(row[17] || '').trim()
    });
  }

  out.sort(function (a, b) {
    return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
  });
  return out;
}

function getNc2Records_(ss) {
  return readNc2RecordsFromSheet_(ss);
}

function saveNc2RecordsBatch_(ss, data) {
  var records = Array.isArray(data.records) ? data.records : [];
  var userName = String(data.userName || '').trim();
  var userEmail = normalizeEmail_(data.userEmail || '');
  if (!records.length) return json_({ success: false, error: 'Nenhum registro de conformidade para salvar.' });

  var sh = getOrCreateNc2Sheet_(ss);
  var rows = [];
  for (var i = 0; i < records.length; i++) {
    rows.push(mapNc2RecordToRow_(normalizeNc2RecordForStore_(records[i], userName, userEmail)));
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 18).setValues(rows);
  return json_({ success: true, records: readNc2RecordsFromSheet_(ss) });
}

function updateNc2Record_(ss, data) {
  var record = data.record || null;
  var userName = String(data.userName || '').trim();
  var userEmail = normalizeEmail_(data.userEmail || '');
  if (!record || !record.id) return json_({ success: false, error: 'Registro de conformidade invalido.' });

  var sh = getOrCreateNc2Sheet_(ss);
  var lastRow = sh.getLastRow();
  if (lastRow <= 1) return json_({ success: false, error: 'Nenhum registro encontrado para atualizar.' });

  var ids = sh.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  var rowIndex = -1;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() === String(record.id || '').trim()) {
      rowIndex = i + 2;
      break;
    }
  }
  if (rowIndex < 0) return json_({ success: false, error: 'Registro de conformidade nao encontrado.' });

  var normalized = normalizeNc2RecordForStore_(record, userName, userEmail);
  sh.getRange(rowIndex, 1, 1, 18).setValues([mapNc2RecordToRow_(normalized)]);
  return json_({ success: true, records: [normalized] });
}

function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function safeJson_(x) { try { return JSON.stringify(x); } catch (e) { return String(x); } }

// ============================================================================
// CRONOGRAMA / GANTT - MAGRO (Apenas leitura bruta e rápida da planilha)
// ============================================================================

function getRawCronogramaData_(ss) {
  var unifiedEap = getUnifiedEapPublicDataSafe_();
  var sheetRows = getEapCronogramaSheetRows_(ss);

  if (unifiedEap && Array.isArray(unifiedEap.cronograma)) {
    return { success: true, rawRows: mergeCronogramaRowsWithSheet_(unifiedEap.cronograma, sheetRows) };
  }

  return { success: true, rawRows: sheetRows };
}

function getEapCronogramaSheetRows_(ss) {
  var sh = ss.getSheetByName('EAP');
  if (!sh) return [];

  var values = sh.getDataRange().getValues();
  var displayValues = sh.getDataRange().getDisplayValues();
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

function mergeCronogramaRowsWithSheet_(sourceRows, sheetRows) {
  var sheetByCode = {};
  for (var i = 0; i < sheetRows.length; i++) {
    var sheetRow = sheetRows[i] || {};
    var sheetCode = String(sheetRow.code || '').trim();
    if (!sheetCode) continue;
    sheetByCode[sheetCode] = sheetRow;
  }

  var source = Array.isArray(sourceRows) ? sourceRows : [];
  if (source.length === 0) return sheetRows;

  return source.map(function (row) {
    var code = String(row && (row.code || row.codigo || row.id) || '').trim();
    var sheetRow = code ? sheetByCode[code] : null;
    var predecessor = row && (row.predecessor || row.predecessoras || row.predecessora || row.predecessorCode || row.predecessors);
    if (Array.isArray(predecessor)) predecessor = predecessor.join(' | ');

    return {
      progress: toNumberSafe_(row && (row.progress || row.avancoAtual || row.percentage)),
      code: code,
      name: String(row && (row.name || row.nome || row.title) || '').trim() || String(sheetRow && sheetRow.name || '').trim(),
      duration: toNumberSafe_(row && (row.duration || row.duracao) || (sheetRow && sheetRow.duration)),
      plannedStart: normalizeSheetDate_(row && (row.plannedStart || row.inicioPlanejado || row.dataInicio) || (sheetRow && sheetRow.plannedStart)),
      plannedEnd: normalizeSheetDate_(row && (row.plannedEnd || row.terminoPlanejado || row.dataFim) || (sheetRow && sheetRow.plannedEnd)),
      predecessor: String(predecessor || (sheetRow && sheetRow.predecessor) || '').trim(),
      idealProgress: toNumberSafe_(row && (row.idealProgress || row.progressIdeal) || (sheetRow && sheetRow.idealProgress)),
      realStart: normalizeSheetDate_(row && (row.realStart || row.dataInicioReal) || (sheetRow && sheetRow.realStart)),
      realEnd: normalizeSheetDate_(row && (row.realEnd || row.dataFimReal) || (sheetRow && sheetRow.realEnd)),
      baselineIdealProgress: toNumberSafe_(row && (row.baselineIdealProgress || row.idealProgressBase) || (sheetRow && sheetRow.baselineIdealProgress))
    };
  }).filter(function (row) { return Boolean(row.code); });
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
// --- PUBLICACAO DE JSON CRIPTOGRAFADO ---
var PUBLIC_JSON_FOLDER = "Publica";
var REGISTRO_PUBLIC_JSON_FILE = "";
var REGISTRO_ATIVIDADES_JSON_FILE = "";
var APP_REGISTRO_JSON_FILE = "";
var APP_ADMIN_JSON_FILE = "";
var APP_CRONOGRAMA_JSON_FILE = "";
var APP_CONTROLE_JSON_FILE = "";
var APP_CONTRATO_JSON_FILE = "";
var APP_NC_JSON_FILE = "";
var REGISTRO_ATIVIDADES_IMPORT_SHEET = "registrodeatividades_limpo";
var PUBLIC_JSON_FAST_DELAY_MS = 1000;
var PUBLIC_JSON_FULL_REFRESH_DELAY_MS = 90 * 1000;

function schedulePublicJsonPublish() {
  schedulePublicJsonPublish_(PUBLIC_JSON_FAST_DELAY_MS);
  return "Publicacao do Registro agendada.";
}

function schedulePublicJsonPublish_(delayMs, force) {
  var waitMs = Math.max(1000, Number(delayMs || PUBLIC_JSON_FAST_DELAY_MS));
  var now = Date.now();
  var targetAt = now + waitMs;
  var props = PropertiesService.getScriptProperties();
  var pendingAt = Number(props.getProperty('pending_registro_publish_at') || 0);

  if (!force && pendingAt && pendingAt > now && pendingAt <= targetAt) {
    return;
  }

  props.setProperty('pending_registro_publish_at', String(targetAt));
  cleanupPublicJsonPublishTriggers_();
  ScriptApp.newTrigger("publishFullDatabaseToPublicJsonByTrigger")
    .timeBased()
    .after(waitMs)
    .create();
}

function flushAndSchedulePublicJsonPublish_(delayMs) {
  SpreadsheetApp.flush();
  schedulePublicJsonPublish_(delayMs || PUBLIC_JSON_FAST_DELAY_MS);
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

  return "Atualizacao completa agendada. A EAP sera agendada primeiro; o Registro sera publicado depois.";
}

function runFullPublicJsonRefreshByTrigger() {
  try {
    var eapResult = scheduleEapPublicJsonPublish_();
    schedulePublicJsonPublish_(PUBLIC_JSON_FULL_REFRESH_DELAY_MS, true);
    return eapResult + " Publicacao do Registro agendada para depois da EAP.";
  } finally {
    cleanupFullPublicJsonRefreshTriggers_();
  }
}

function scheduleEapPublicJsonPublish_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var url = String(props.getProperty("eap_apps_script_url") || DEFAULT_EAP_APPS_SCRIPT_URL || "").trim();

    if (!url) {
      return "EAP nao agendada: URL do Apps Script nao configurada.";
    }

    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({ action: "scheduleCompressedDataPublicJson" })
    });

    var status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      return "EAP nao agendada (" + status + "): " + response.getContentText().slice(0, 200);
    }

    return "Publicacao da EAP agendada.";
  } catch (err) {
    return "EAP nao agendada: " + String(err);
  }
}

function handlePublicJsonSpreadsheetEdit(e) {
  scheduleFirebaseSync_(FIREBASE_SYNC_DELAY_MS);
}

function handlePublicJsonSpreadsheetChange(e) {
  scheduleFirebaseSync_(FIREBASE_SYNC_DELAY_MS);
}

function syncFirebaseNow() {
  ensurePublicJsonAutoPublishTriggers_();
  cleanupFirebaseSyncTriggers_();
  PropertiesService.getScriptProperties().deleteProperty('pending_firebase_sync_at');
  var activitiesResult = syncRegistroAtividadesFirebaseNow();
  var publishResult = publishFullDatabaseToFirebaseNow();
  return activitiesResult + " " + publishResult;
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
    return syncFirebaseNow();
  } finally {
    cleanupFirebaseSyncTriggers_();
  }
}

function publishFullDatabaseToPublicJsonNow() {
  cleanupPublicJsonPublishTriggers_();
  PropertiesService.getScriptProperties().deleteProperty('pending_registro_publish_at');
  publishFullDatabaseToPublicJson();
  return "Registro publicado agora.";
}

function syncAllPublicJsonNow() {
  ensurePublicJsonAutoPublishTriggers_();
  cleanupPublicJsonPublishTriggers_();
  cleanupFullPublicJsonRefreshTriggers_();
  PropertiesService.getScriptProperties().deleteProperty('pending_registro_publish_at');

  var eapResult = requestEapImmediateSync_();
  publishFullDatabaseToPublicJson();
  return eapResult + " Registro publicado agora.";
}

function setupPublicJsonAutoPublishTriggers() {
  ensurePublicJsonAutoPublishTriggers_();
  return "Publicacao automatica configurada.";
}

function ensurePublicJsonAutoPublishTriggers_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var triggers = ScriptApp.getProjectTriggers();
  var hasEdit = false;
  var hasChange = false;
  var hasPeriodic = false;

  for (var i = 0; i < triggers.length; i++) {
    var trigger = triggers[i];
    var handler = trigger.getHandlerFunction();
    if (handler === "handlePublicJsonSpreadsheetEdit") hasEdit = true;
    if (handler === "handlePublicJsonSpreadsheetChange") hasChange = true;
    if (handler === "syncFirebaseNow") hasPeriodic = true;
    if (handler === "publishFullDatabaseToPublicJson") ScriptApp.deleteTrigger(trigger);
  }

  if (!hasEdit) {
    ScriptApp.newTrigger("handlePublicJsonSpreadsheetEdit")
      .forSpreadsheet(ss)
      .onEdit()
      .create();
  }

  if (!hasChange) {
    ScriptApp.newTrigger("handlePublicJsonSpreadsheetChange")
      .forSpreadsheet(ss)
      .onChange()
      .create();
  }

  if (!hasPeriodic) {
    ScriptApp.newTrigger("syncFirebaseNow")
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

function cleanupPublicJsonPublishTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "publishFullDatabaseToPublicJsonByTrigger") {
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

function publishFullDatabaseToPublicJsonByTrigger() {
  var props = PropertiesService.getScriptProperties();
  var dueAt = Number(props.getProperty('pending_registro_publish_at') || 0);
  var remainingMs = dueAt - Date.now();

  if (remainingMs > 5000) {
    cleanupPublicJsonPublishTriggers_();
    ScriptApp.newTrigger("publishFullDatabaseToPublicJsonByTrigger")
      .timeBased()
      .after(remainingMs)
      .create();
    return "Publicacao do Registro reagendada.";
  }

  props.deleteProperty('pending_registro_publish_at');
  try {
    return publishFullDatabaseToPublicJson();
  } finally {
    cleanupPublicJsonPublishTriggers_();
  }
}

function requestEapImmediateSync_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var url = String(props.getProperty("eap_apps_script_url") || DEFAULT_EAP_APPS_SCRIPT_URL || "").trim();

    if (!url) {
      return "EAP nao sincronizada: URL do Apps Script nao configurada.";
    }

    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({ action: "publishCompressedDataToPublicJsonNow" })
    });

    var status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      return "EAP nao sincronizada (" + status + "): " + response.getContentText().slice(0, 200);
    }

    return "EAP sincronizada agora.";
  } catch (err) {
    return "EAP nao sincronizada: " + String(err);
  }
}

function pushFullDatabaseToFirebase() {
  return publishFullDatabaseToFirebaseNow();
}

function cleanupFirebaseSyncTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "syncFirebaseByTrigger") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function publishFullDatabaseToFirebaseNow() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.flush();
  var payloadData = buildFullDatabasePayloadData_(ss);
  publishPayloadDataToFirebase_(payloadData);
  return "Base completa publicada no Firebase.";
}

function publishFullDatabaseToPublicJson() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log("Public JSON push skipped: another publication is already running.");
    return "Publicacao ignorada: outra publicacao ja esta em andamento.";
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    SpreadsheetApp.flush();
    var payloadData = buildFullDatabasePayloadData_(ss);
    var activities = payloadData.registro.activitiesList || [];

    publishPayloadDataToFirebase_(payloadData);
    
    publishEncryptedJsonToGithub_(
      REGISTRO_PUBLIC_JSON_FILE,
      {
        source: "Registrodeatividades",
        publishedAt: new Date().toISOString(),
        data: payloadData
      }
    );

    publishAppModuleJsons_(payloadData);

    publishRegistroAtividadesJson_(activities);
  } catch(err) {
    Logger.log("Public JSON push failed: " + err);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function publishAppModuleJsons_(payloadData) {
  var publishedAt = new Date().toISOString();
  publishEncryptedJsonToGithub_(
    APP_REGISTRO_JSON_FILE,
    {
      source: "Registrodeatividades",
      module: "registro",
      publishedAt: publishedAt,
      data: {
        registro: payloadData.registro
      }
    }
  );

  publishEncryptedJsonToGithub_(
    APP_ADMIN_JSON_FILE,
    {
      source: "Registrodeatividades",
      module: "administracao",
      publishedAt: publishedAt,
      data: {
        admin: payloadData.admin
      }
    }
  );

  publishEncryptedJsonToGithub_(
    APP_CRONOGRAMA_JSON_FILE,
    {
      source: "Registrodeatividades",
      module: "cronograma",
      publishedAt: publishedAt,
      data: {
        registro: payloadData.registro,
        cronograma: payloadData.cronograma
      }
    }
  );

  publishEncryptedJsonToGithub_(
    APP_CONTROLE_JSON_FILE,
    {
      source: "Registrodeatividades",
      module: "controle",
      publishedAt: publishedAt,
      data: {
        registro: payloadData.registro,
        admin: payloadData.admin,
        cronograma: payloadData.cronograma
      }
    }
  );

  publishEncryptedJsonToGithub_(
    APP_CONTRATO_JSON_FILE,
    {
      source: "Registrodeatividades",
      module: "contrato",
      publishedAt: publishedAt,
      data: {
        registro: payloadData.registro,
        cronograma: payloadData.cronograma
      }
    }
  );

  publishEncryptedJsonToGithub_(
    APP_NC_JSON_FILE,
    {
      source: "Registrodeatividades",
      module: "nao-conformidades",
      publishedAt: publishedAt,
      data: {
        registro: payloadData.registro,
        admin: payloadData.admin
      }
    }
  );
}

function buildFullDatabasePayloadData_(ss) {
  var loginSheet = getOrCreateLoginSheet_(ss);
  var header = getHeaderMapSafe_(loginSheet);
  var values = loginSheet.getDataRange().getValues();
  var config = getConfigOptions_(ss);
  var databaseLinks = getDatabaseLinks_(ss);
  var terceirizadasPublic = getTerceirizadas_(ss);
  var roleTabPermissions = getRoleTabPermissions_(ss);

  var users = {};
  for (var i = 1; i < values.length; i++) {
    if (!normalizeEmail_(values[i][header.email])) continue;
    var u = normalizeUserResponse_(values[i], header);
    var safeEmail = String(u.email).replace(/[.#$\[\]]/g, '_');
    users[safeEmail] = u;
  }

  var eapDataR = getEapStructuredData_(ss);
  var cronograma = getRawCronogramaData_(ss).rawRows;
  var activities = getAllActivitiesForPublicJson_(ss);

  return {
    admin: {
      usersByEmail: users,
      cargos: config.cargos,
      disciplinas: config.disciplinas,
      alocacoes: config.alocacoes,
      terceirizadas: terceirizadasPublic,
      databaseLinks: databaseLinks,
      roleTabPermissions: roleTabPermissions
    },
    registro: {
      contracts: eapDataR.contracts,
      osOptions: eapDataR.osOptions,
      itemOptions: eapDataR.itemOptions,
      hierarchyNodes: eapDataR.hierarchyNodes,
      childrenByParent: eapDataR.childrenByParent,
      rootCodes: eapDataR.rootCodes,
      activitiesList: activities,
      professionalsByDisciplina: getProfessionalsIndexForJson_(ss, values, header),
      usersSummary: getUsersSummaryForJson_(values, header)
    },
    cronograma: cronograma
  };
}

function publishPayloadDataToFirebase_(payloadData) {
  payloadData = payloadData || {};
  firestoreSetAppData_("admin", payloadData.admin || {});
  firestoreSetAppData_("registro", payloadData.registro || {});
  firestoreSetAppData_("cronograma", payloadData.cronograma || []);

  var activities = payloadData.registro && Array.isArray(payloadData.registro.activitiesList)
    ? payloadData.registro.activitiesList
    : [];
  var docs = activities.map(function(activity) {
    var normalized = normalizeFirebaseActivity_(activity);
    return { id: normalized.activityId, data: normalized };
  }).filter(function(item) {
    return Boolean(item.id);
  });
  if (docs.length) firestoreCommitDocuments_("registroAtividades", docs);
}

function publishRegistroAtividadesJson_(activities) {
  publishEncryptedJsonToGithub_(
    REGISTRO_ATIVIDADES_JSON_FILE,
    {
      source: "Registrodeatividades",
      publishedAt: new Date().toISOString(),
      data: {
        activities: activities || []
      }
    }
  );
}

function importRegistroAtividadesFromGitJson() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var payload = fetchRegistroAtividadesPayloadFromGit_();
  var activities = payload && payload.data && Array.isArray(payload.data.activities)
    ? payload.data.activities
    : [];

  var sh = ss.getSheetByName(REGISTRO_ATIVIDADES_IMPORT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(REGISTRO_ATIVIDADES_IMPORT_SHEET);
  }

  var header = [
    "ActivityID", "DataRegistro", "CriadoPorNome", "CriadoPorEmail",
    "CriadoPorRole", "CriadoPorDisciplina", "ContratoCodigo", "ContratoNome",
    "OSCodigo", "OSNome", "ItemCodigo", "ItemNome", "Setor", "Profissionais",
    "ProfissionaisEmails", "Dificuldade", "Descricao", "AvancoAtual",
    "AvaliacaoAtual", "ObservacaoAtual", "Status", "Data100",
    "DataConclusaoEfetiva", "UltimaAtualizacao"
  ];

  var rows = [header];
  for (var i = 0; i < activities.length; i++) {
    var a = activities[i] || {};
    rows.push([
      a.activityId || "", a.dataRegistro || "", a.criadoPorNome || "", a.criadoPorEmail || "",
      a.criadoPorRole || "", a.criadoPorDisciplina || "", a.contratoCodigo || "", a.contratoNome || "",
      a.osCodigo || "", a.osNome || "", a.itemCodigo || "", a.itemNome || "", a.setor || "",
      a.profissionais || "", a.profissionaisEmails || "", a.dificuldade || "", a.descricao || "",
      a.avancoAtual || 0, a.avaliacaoAtual || "", a.observacaoAtual || "", a.status || "",
      a.data100 || "", a.dataConclusaoEfetiva || "", a.ultimaAtualizacao || ""
    ]);
  }

  sh.clearContents();
  sh.getRange(1, 1, rows.length, header.length).setValues(rows);
  sh.setFrozenRows(1);

  return "Importadas " + activities.length + " atividade(s) para " + REGISTRO_ATIVIDADES_IMPORT_SHEET + ".";
}

function fetchRegistroAtividadesPayloadFromGit_() {
  var props = PropertiesService.getScriptProperties();
  var url = String(props.getProperty("git_registro") || "").trim();
  if (!url) throw new Error('Propriedade "git_registro" nao configurada.');

  var response = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: { Accept: "application/json" }
  });

  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error("Falha ao ler git_registro (" + status + "): " + response.getContentText());
  }

  var envelope = JSON.parse(response.getContentText() || "{}");
  return decryptPayloadEnvelope_(
    envelope,
    envelope && envelope.algorithm === "xor-sha256-stream" ? getJsonCryptoKey_() : ""
  );
}

function getAllActivitiesForPublicJson_(ss) {
  var shAct = getOrCreateActivitiesSheet_(ss);
  var values = shAct.getDataRange().getValues();
  var displayValues = shAct.getDataRange().getDisplayValues();
  var acts = [];
  for(var i=1; i<values.length; i++){
    var r = values[i];
    var d = displayValues[i] || [];
    if (!String(r[0] || '').trim()) continue;
    acts.push({
      activityId: String(d[0] || r[0] || ''),
      dataRegistro: String(d[1] || r[1] || ''),
      criadoPorNome: String(d[2] || r[2] || ''),
      criadoPorEmail: String(d[3] || r[3] || ''),
      criadoPorRole: String(d[4] || r[4] || ''),
      criadoPorDisciplina: String(d[5] || r[5] || ''),
      contratoCodigo: String(d[6] || r[6] || ''),
      contratoNome: String(d[7] || r[7] || ''),
      osCodigo: String(d[8] || r[8] || ''),
      osNome: String(d[9] || r[9] || ''),
      itemCodigo: String(d[10] || r[10] || ''),
      itemNome: String(d[11] || r[11] || ''),
      setor: String(d[12] || r[12] || ''),
      profissionais: String(d[13] || r[13] || ''),
      profissionaisEmails: String(d[14] || r[14] || ''),
      dificuldade: String(d[15] || r[15] || ''),
      descricao: String(d[16] || r[16] || ''),
      avancoAtual: r[17], avaliacaoAtual: r[18], observacaoAtual: r[19],
      status: String(d[20] || r[20] || ''),
      data100: String(d[21] || r[21] || ''),
      dataConclusaoEfetiva: String(d[22] || r[22] || ''),
      ultimaAtualizacao: String(d[24] || r[24] || '')
    });
  }
  return acts;
}

function syncRegistroAtividadesFirebaseNow() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return "Sincronizacao ignorada: outra sincronizacao ja esta em andamento.";
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    SpreadsheetApp.flush();

    var sh = getOrCreateActivitiesSheet_(ss);
    var sheetActivities = getAllActivitiesForPublicJson_(ss);
    var firebaseActivities = firestoreListCollection_("registroAtividades");
    var firebaseById = {};
    var sheetById = {};
    var sheetRowById = {};

    for (var f = 0; f < firebaseActivities.length; f++) {
      var firebaseActivity = normalizeFirebaseActivity_(firebaseActivities[f]);
      if (firebaseActivity.activityId) {
        firebaseById[firebaseActivity.activityId] = firebaseActivity;
      }
    }

    var values = sh.getDataRange().getValues();
    for (var s = 0; s < sheetActivities.length; s++) {
      var sheetActivity = normalizeFirebaseActivity_(sheetActivities[s]);
      if (sheetActivity.activityId) {
        sheetById[sheetActivity.activityId] = sheetActivity;
      }
    }
    for (var r = 1; r < values.length; r++) {
      var rowId = String(values[r][0] || '').trim();
      if (rowId) sheetRowById[rowId] = r + 1;
    }

    var rowsToAppend = [];
    var rowsToUpdate = [];
    var docsToUpsert = [];
    var importedFromFirebase = 0;
    var updatedSheetFromFirebase = 0;
    var exportedToFirebase = 0;
    var updatedFirebaseFromSheet = 0;

    for (var idF in firebaseById) {
      if (!firebaseById.hasOwnProperty(idF)) continue;
      var fromFirebase = firebaseById[idF];
      var inSheet = sheetById[idF];

      if (!inSheet) {
        rowsToAppend.push(activityToSheetRow_(fromFirebase));
        importedFromFirebase++;
        continue;
      }

      if (getActivityUpdatedMs_(fromFirebase) > getActivityUpdatedMs_(inSheet)) {
        rowsToUpdate.push({ row: sheetRowById[idF], values: activityToSheetRow_(fromFirebase) });
        updatedSheetFromFirebase++;
      }
    }

    for (var idS in sheetById) {
      if (!sheetById.hasOwnProperty(idS)) continue;
      var fromSheet = sheetById[idS];
      var inFirebase = firebaseById[idS];

      if (!inFirebase) {
        docsToUpsert.push({ id: idS, data: fromSheet });
        exportedToFirebase++;
        continue;
      }

      if (getActivityUpdatedMs_(fromSheet) > getActivityUpdatedMs_(inFirebase)) {
        docsToUpsert.push({ id: idS, data: fromSheet });
        updatedFirebaseFromSheet++;
      }
    }

    if (rowsToAppend.length) {
      sh.getRange(sh.getLastRow() + 1, 1, rowsToAppend.length, 25).setValues(rowsToAppend);
    }
    for (var u = 0; u < rowsToUpdate.length; u++) {
      if (rowsToUpdate[u].row) {
        sh.getRange(rowsToUpdate[u].row, 1, 1, 25).setValues([rowsToUpdate[u].values]);
      }
    }
    if (docsToUpsert.length) {
      firestoreCommitDocuments_("registroAtividades", docsToUpsert);
    }

    logFirebaseSync_(ss, {
      importedFromFirebase: importedFromFirebase,
      updatedSheetFromFirebase: updatedSheetFromFirebase,
      exportedToFirebase: exportedToFirebase,
      updatedFirebaseFromSheet: updatedFirebaseFromSheet
    });

    SpreadsheetApp.flush();
    return "Firebase sincronizado. Importadas: " + importedFromFirebase +
      ", planilha atualizada: " + updatedSheetFromFirebase +
      ", exportadas: " + exportedToFirebase +
      ", Firebase atualizado: " + updatedFirebaseFromSheet + ".";
  } finally {
    lock.releaseLock();
  }
}

function normalizeFirebaseActivity_(a) {
  a = a || {};
  var activityId = String(a.activityId || a.id || "").trim();
  return {
    activityId: activityId,
    id: activityId,
    dataRegistro: String(a.dataRegistro || ""),
    criadoPorNome: String(a.criadoPorNome || a.criadoPor || ""),
    criadoPorEmail: String(a.criadoPorEmail || ""),
    criadoPorRole: String(a.criadoPorRole || ""),
    criadoPorDisciplina: String(a.criadoPorDisciplina || a.disciplina || ""),
    contratoCodigo: String(a.contratoCodigo || ""),
    contratoNome: String(a.contratoNome || ""),
    osCodigo: String(a.osCodigo || ""),
    osNome: String(a.osNome || ""),
    itemCodigo: String(a.itemCodigo || ""),
    itemNome: String(a.itemNome || ""),
    setor: String(a.setor || "Engenharia"),
    profissionais: Array.isArray(a.profissionais) ? a.profissionais.join(" | ") : String(a.profissionais || ""),
    profissionaisEmails: Array.isArray(a.profissionaisEmails) ? a.profissionaisEmails.join(" | ") : String(a.profissionaisEmails || ""),
    dificuldade: String(a.dificuldade || ""),
    descricao: String(a.descricao || ""),
    avancoAtual: Number(a.avancoAtual || 0),
    avaliacaoAtual: String(a.avaliacaoAtual || ""),
    observacaoAtual: String(a.observacaoAtual || ""),
    status: String(a.status || "em_andamento"),
    data100: String(a.data100 || ""),
    dataConclusaoEfetiva: String(a.dataConclusaoEfetiva || ""),
    ativo: a.ativo === false ? false : String(a.status || "").toLowerCase() !== "concluida",
    ultimaAtualizacao: String(a.ultimaAtualizacao || a.updatedAt || a.dataRegistro || "")
  };
}

function activityToSheetRow_(a) {
  a = normalizeFirebaseActivity_(a);
  return [
    a.activityId,
    a.dataRegistro,
    a.criadoPorNome,
    a.criadoPorEmail,
    a.criadoPorRole,
    a.criadoPorDisciplina,
    a.contratoCodigo,
    a.contratoNome,
    a.osCodigo,
    a.osNome,
    a.itemCodigo,
    a.itemNome,
    a.setor,
    a.profissionais,
    a.profissionaisEmails,
    a.dificuldade,
    a.descricao,
    a.avancoAtual,
    a.avaliacaoAtual,
    a.observacaoAtual,
    a.status,
    a.data100,
    a.dataConclusaoEfetiva,
    a.ativo ? "true" : "false",
    a.ultimaAtualizacao
  ];
}

function activityRowToFirebaseObject_(row) {
  row = row || [];
  return normalizeFirebaseActivity_({
    activityId: row[0],
    dataRegistro: row[1],
    criadoPorNome: row[2],
    criadoPorEmail: row[3],
    criadoPorRole: row[4],
    criadoPorDisciplina: row[5],
    contratoCodigo: row[6],
    contratoNome: row[7],
    osCodigo: row[8],
    osNome: row[9],
    itemCodigo: row[10],
    itemNome: row[11],
    setor: row[12],
    profissionais: row[13],
    profissionaisEmails: row[14],
    dificuldade: row[15],
    descricao: row[16],
    avancoAtual: row[17],
    avaliacaoAtual: row[18],
    observacaoAtual: row[19],
    status: row[20],
    data100: row[21],
    dataConclusaoEfetiva: row[22],
    ativo: String(row[23]).toLowerCase() !== "false",
    ultimaAtualizacao: row[24]
  });
}

function getActivityUpdatedMs_(a) {
  var candidates = [
    a && a.ultimaAtualizacao,
    a && a.updatedAt,
    a && a.dataRegistro
  ];
  for (var i = 0; i < candidates.length; i++) {
    var raw = String(candidates[i] || "").trim();
    if (!raw) continue;
    var parsedPt = parsePtBrDateTime_(raw);
    if (parsedPt) return parsedPt.getTime();
    var parsedIso = new Date(raw);
    if (!isNaN(parsedIso.getTime())) return parsedIso.getTime();
  }
  return 0;
}

function logFirebaseSync_(ss, summary) {
  var sh = ss.getSheetByName("firebase_sync_log");
  if (!sh) {
    sh = ss.insertSheet("firebase_sync_log");
    sh.getRange(1, 1, 1, 6).setValues([[
      "DataHora", "ImportadasFirebase", "AtualizadasNaPlanilha", "ExportadasFirebase", "AtualizadasNoFirebase", "Resumo"
    ]]);
  }
  sh.getRange(sh.getLastRow() + 1, 1, 1, 6).setValues([[
    new Date().toLocaleString("pt-BR"),
    summary.importedFromFirebase || 0,
    summary.updatedSheetFromFirebase || 0,
    summary.exportedToFirebase || 0,
    summary.updatedFirebaseFromSheet || 0,
    JSON.stringify(summary || {})
  ]]);
}

function firestoreGetProjectId_() {
  return String(PropertiesService.getScriptProperties().getProperty("firebase_project_id") || DEFAULT_FIREBASE_PROJECT_ID || "").trim();
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

function firestoreRequest_(method, path, payload) {
  var url = firestoreGetBaseUrl_() + "/" + path.replace(/^\/+/, "");
  var options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization: "Bearer " + firestoreGetIdToken_()
    }
  };
  if (payload !== undefined) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(payload);
  }

  var response = UrlFetchApp.fetch(url, options);
  var status = response.getResponseCode();
  var text = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error("Firestore " + method + " " + path + " falhou (" + status + "): " + text.slice(0, 500));
  }
  return text ? JSON.parse(text) : {};
}

function firestoreListCollection_(collectionName) {
  var pageToken = "";
  var out = [];
  do {
    var path = encodeURIComponent(collectionName) + "?pageSize=300" + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    var payload = firestoreRequest_("get", path);
    var docs = payload.documents || [];
    for (var i = 0; i < docs.length; i++) {
      var doc = firestoreDocumentToObject_(docs[i]);
      var nameParts = String(docs[i].name || "").split("/");
      doc.id = doc.id || nameParts[nameParts.length - 1] || "";
      if (!doc.activityId && collectionName === "registroAtividades") doc.activityId = doc.id;
      out.push(doc);
    }
    pageToken = payload.nextPageToken || "";
  } while (pageToken);
  return out;
}

function firestoreSetDocument_(collectionName, docId, data) {
  firestoreCommitDocuments_(collectionName, [{ id: docId, data: data }]);
}

function firestoreCommitDocuments_(collectionName, docs) {
  if (!docs || !docs.length) return;
  var projectId = firestoreGetProjectId_();
  var baseName = "projects/" + projectId + "/databases/(default)/documents/" + collectionName + "/";

  for (var start = 0; start < docs.length; start += FIREBASE_COMMIT_BATCH_SIZE) {
    var chunk = docs.slice(start, start + FIREBASE_COMMIT_BATCH_SIZE);
    var writes = [];
    for (var i = 0; i < chunk.length; i++) {
      var docId = firestoreSafeDocId_(chunk[i].id);
      var data = chunk[i].data || {};
      writes.push({
        update: {
          name: baseName + docId,
          fields: firestoreObjectToFields_(data)
        }
      });
    }

    var url = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(projectId) + "/databases/(default)/documents:commit";
    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      headers: { Authorization: "Bearer " + firestoreGetIdToken_() },
      payload: JSON.stringify({ writes: writes })
    });
    var status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      throw new Error("Firestore commit falhou (" + status + "): " + response.getContentText().slice(0, 500));
    }
  }
}

function firestoreSetAppData_(name, data) {
  var jsonText = JSON.stringify(data || {});
  var chunks = splitStringIntoChunks_(jsonText, FIREBASE_APPDATA_CHUNK_SIZE);
  firestoreSetDocument_("appData", name, {
    chunked: true,
    chunkCount: chunks.length,
    byteLength: jsonText.length,
    source: "AppsScript",
    updatedAt: new Date().toISOString()
  });
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
  var docs = [];
  for (var i = 0; i < chunks.length; i++) {
    docs.push({
      id: ("00000" + i).slice(-5),
      data: {
        index: i,
        value: chunks[i],
        updatedAt: new Date().toISOString()
      }
    });
  }
  firestoreCommitDocuments_("appData/" + name + "/chunks", docs);
}

function firestoreSafeDocId_(value) {
  var out = String(value || "").trim();
  if (!out) out = Utilities.getUuid();
  return out.replace(/\//g, "_");
}

function firestoreObjectToFields_(obj) {
  var fields = {};
  obj = obj || {};
  for (var key in obj) {
    if (obj.hasOwnProperty(key) && obj[key] !== undefined) {
      fields[key] = firestoreToValue_(obj[key]);
    }
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

function firestoreDocumentToObject_(doc) {
  return firestoreFieldsToObject_((doc && doc.fields) || {});
}

function firestoreFieldsToObject_(fields) {
  var out = {};
  for (var key in fields) {
    if (fields.hasOwnProperty(key)) out[key] = firestoreFromValue_(fields[key]);
  }
  return out;
}

function firestoreFromValue_(field) {
  if (!field || typeof field !== "object") return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.doubleValue !== undefined) return Number(field.doubleValue);
  if (field.booleanValue !== undefined) return Boolean(field.booleanValue);
  if (field.timestampValue !== undefined) return field.timestampValue;
  if (field.nullValue !== undefined) return null;
  if (field.arrayValue !== undefined) {
    var values = (field.arrayValue && field.arrayValue.values) || [];
    return values.map(function(item) { return firestoreFromValue_(item); });
  }
  if (field.mapValue !== undefined) {
    return firestoreFieldsToObject_((field.mapValue && field.mapValue.fields) || {});
  }
  return null;
}

function getProfessionalsIndexForJson_(ss, values, header) {
  if (!values || !header) {
    var loginSheet = getOrCreateLoginSheet_(ss);
    header = getHeaderMapSafe_(loginSheet);
    values = loginSheet.getDataRange().getValues();
  }
  var out = {};

  for (var i = 1; i < values.length; i++) {
    var email = normalizeEmail_(values[i][header.email]);
    var nome = String(values[i][header.nome] || '').trim();
    var cargo = String(values[i][header.role] || '').trim();
    var disciplina = String(values[i][header.disciplina] || '').trim();
    var status = String(values[i][header.status] || '').trim().toLowerCase();

    if (!email || !nome || status !== 'approved') continue;

    var key = disciplina || 'Sem disciplina';
    if (!out[key]) out[key] = [];
    out[key].push({
      nome: nome,
      email: email,
      cargo: cargo,
      disciplina: disciplina,
      alocacao: String(values[i][header.alocacao] || '').trim()
    });
  }

  var terceirizadas = getTerceirizadas_(ss);
  for (var t = 0; t < terceirizadas.length; t++) {
    var terceirizada = terceirizadas[t] || {};
    var nomeTer = String(terceirizada.nome || '').trim();
    var disciplinaTer = String(terceirizada.disciplina || '').trim();
    if (!nomeTer || !disciplinaTer) continue;

    var keyTer = disciplinaTer || 'Sem disciplina';
    if (!out[keyTer]) out[keyTer] = [];
    out[keyTer].push({
      nome: nomeTer,
      email: buildTerceirizadaProfessionalId_(terceirizada.id),
      cargo: 'Terceirizada',
      disciplina: disciplinaTer,
      alocacao: 'Terceirizada'
    });
  }

  return out;
}

function getUsersSummaryForJson_(values, header) {
  var out = [];

  for (var i = 1; i < values.length; i++) {
    var email = normalizeEmail_(values[i][header.email]);
    if (!email) continue;

    out.push({
      nome: String(values[i][header.nome] || '').trim(),
      email: email,
      role: String(values[i][header.role] || '').trim(),
      disciplina: String(values[i][header.disciplina] || '').trim(),
      alocacao: String(values[i][header.alocacao] || '').trim(),
      contrato: String(values[i][header.contrato] || '').trim(),
      status: String(values[i][header.status] || '').trim(),
      isAdmin: parseBool_(values[i][header.isadmin])
    });
  }

  return out;
}

function publishEncryptedJsonToGithub_(fileName, payloadObj) {
  var cfg = getGithubPublisherConfig_();
  var body = buildFastPublicJsonBody_(payloadObj);
  var url = buildGithubContentsUrl_(cfg.githubApi, PUBLIC_JSON_FOLDER, fileName);
  writeGithubFile_(url, body, cfg.githubToken, cfg.githubBranch, "Atualiza " + PUBLIC_JSON_FOLDER + "/" + fileName);
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

  if (!githubApi) throw new Error('Propriedade "github_api" nao configurada.');
  if (!githubToken) throw new Error('Propriedade "github_token" nao configurada.');

  return {
    githubApi: githubApi,
    githubToken: githubToken,
    githubBranch: githubBranch
  };
}

function getJsonCryptoKey_() {
  var props = PropertiesService.getScriptProperties();
  var cryptoKey = String(props.getProperty("json_crypto_key") || props.getProperty("crypto_key") || "").trim();
  if (!cryptoKey) throw new Error('Propriedade "json_crypto_key" nao configurada.');
  return cryptoKey;
}

function getOptionalJsonCryptoKey_() {
  var props = PropertiesService.getScriptProperties();
  return String(props.getProperty("json_crypto_key") || props.getProperty("crypto_key") || "").trim();
}

function buildGithubContentsUrl_(baseApi, folderName, fileName) {
  var cleanBase = String(baseApi || "").replace(/\/+$/, "");
  var folder = encodeURIComponent(String(folderName || "").replace(/^\/+|\/+$/g, ""));
  var file = encodeURIComponent(String(fileName || "").replace(/^\/+/, ""));

  if (/\/contents$/i.test(cleanBase)) return cleanBase + "/" + folder + "/" + file;
  if (/\/contents\/[^\/]+$/i.test(cleanBase)) return cleanBase + "/" + file;
  return cleanBase + "/" + folder + "/" + file;
}

function writeGithubFile_(url, plainTextContent, token, branch, commitMessage) {
  var sha = fetchGithubFileSha_(url, token, branch);
  var requestBody = {
    message: commitMessage,
    content: Utilities.base64Encode(plainTextContent, Utilities.Charset.UTF_8),
    branch: branch
  };

  if (sha) requestBody.sha = sha;

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
    throw new Error("GitHub API PUT falhou (" + status + "): " + response.getContentText());
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
  if (status === 404) return "";
  if (status < 200 || status >= 300) {
    throw new Error("GitHub API GET falhou (" + status + "): " + response.getContentText());
  }

  var parsed = JSON.parse(response.getContentText() || "{}");
  return String(parsed.sha || "");
}

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

function decryptPayloadEnvelope_(envelope, cryptoKey) {
  if (envelope && typeof envelope === "object" && !envelope.algorithm && envelope.data !== undefined) {
    return envelope;
  }

  if (!envelope || envelope.algorithm !== "xor-sha256-stream") {
    throw new Error("Formato de JSON criptografado nao suportado.");
  }

  var cipherBytes = Utilities.base64DecodeWebSafe(String(envelope.payload || ""));
  var plainBytes = xorEncryptBytes_(cipherBytes, cryptoKey, String(envelope.nonce || ""));
  var plainText = Utilities.newBlob(plainBytes).getDataAsString("UTF-8");

  if (envelope.checksum && computeSha256Hex_(plainText) !== String(envelope.checksum)) {
    throw new Error("Falha ao validar checksum do JSON registrodeatividades.");
  }

  return JSON.parse(plainText || "{}");
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
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed, Utilities.Charset.UTF_8);
}

function computeSha256Hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ("0" + (b & 255).toString(16)).slice(-2);
  }).join("");
}

// JSON publico desativado: o sistema agora usa somente Firebase.
function schedulePublicJsonPublish() { return "Publicacao JSON desativada."; }
function schedulePublicJsonPublish_() { return "Publicacao JSON desativada."; }
function flushAndSchedulePublicJsonPublish_() { return "Publicacao JSON desativada."; }
function scheduleFullPublicJsonRefresh() { return "Publicacao JSON desativada."; }
function publishFullDatabaseToPublicJsonNow() { return "Publicacao JSON desativada."; }
function syncAllPublicJsonNow() { return "Publicacao JSON desativada."; }
function publishFullDatabaseToPublicJsonByTrigger() { return "Publicacao JSON desativada."; }
function publishFullDatabaseToPublicJson() { return "Publicacao JSON desativada."; }
function publishAppModuleJsons_() { return "Publicacao JSON desativada."; }
function publishRegistroAtividadesJson_() { return "Publicacao JSON desativada."; }
function requestEapImmediateRefresh_() { return "Publicacao JSON desativada."; }


