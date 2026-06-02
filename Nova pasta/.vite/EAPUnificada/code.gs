// --- CONFIGURAÇÕES DO FIREBASE E OTIMIZAÇÃO ---
var FIREBASE_DB_URL = "https://dash-lideres-quanta-default-rtdb.firebaseio.com";

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🔄 QUANTA Sync')
      .addItem('Subir Curva S Oficial', 'pushToFirebase')
      .addToUi();
}

function updateVersion_() {
  var timestamp = new Date().getTime().toString();
  PropertiesService.getScriptProperties().setProperty('appVersion', timestamp);
  CacheService.getScriptCache().remove('appData');
  return timestamp;
}

function getAppVersion_() {
  var version = PropertiesService.getScriptProperties().getProperty('appVersion');
  if (!version) version = updateVersion_();
  return version;
}

// Quando alguém edita algo na planilha, atualizamos a versão e forçamos os dados pro Firebase.
function onEdit(e) {
  updateVersion_();
  
  // Como onEdit roda pra qualquer célula, é recomendado não bombardear o Firebase.
  // Vou usar o CacheService para garantir que ele só faça o upload a cada 30 segundos se houverem várias edições.
  var cache = CacheService.getScriptCache();
  if (!cache.get("isUploadingFirebase")) {
    cache.put("isUploadingFirebase", "true", 30);
    ScriptApp.newTrigger("pushToFirebase")
      .timeBased()
      .after(30 * 1000)
      .create();
  }
}

function pushToFirebase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = getCompressedData_(ss);
  
  var url = FIREBASE_DB_URL + "/s_curve_data.json";
  var options = {
    method: "put",
    contentType: "application/json",
    payload: JSON.stringify(data)
  };
  
  try {
    UrlFetchApp.fetch(url, options);
  } catch (err) {
    Logger.log("Erro ao enviar para Firebase: " + String(err));
  }
}

// --- ROTINA SEMANAL: CRIAR ABA 'GABRIEL' ---
// O Líder/Admin deve configurar um Acionador de Tempo (Time-driven trigger) para rodar esta função toda Sexta-feira.
function prepareWeeklyGabrielTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gabrielSheet = ss.getSheetByName('Gabriel');
  
  // Transformar a aba antiga "Gabriel" na data de hoje
  if (gabrielSheet) {
    var today = new Date();
    var dateStr = Utilities.formatDate(today, Session.getScriptTimeZone(), "dd/MM/yyyy");
    
    // Se por acaso já existir uma aba com essa data hoje, coloca um sufixo
    var finalName = dateStr;
    var counter = 1;
    while(ss.getSheetByName(finalName)) {
      finalName = dateStr + "-" + counter;
      counter++;
    }
    gabrielSheet.setName(finalName);
  }
  
  // Criar uma nova aba vazia chamada "Gabriel" na primeira posição à esquerda
  ss.insertSheet('Gabriel', 0);
  
  // Após a criação, forçar atualização pro Firebase
  pushToFirebase();
}


// --- ROTAS PRINCIPAIS ---
function doGet(e) {
  try {
    var clientVersion = String(e.parameter.lastVersion || '');
    var currentVersion = getAppVersion_();

    if (clientVersion === currentVersion) {
      return json_({ success: true, unchanged: true, version: currentVersion });
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
      cache.put("appData", JSON.stringify(responseObj), 21600); // 6h de cache
    } catch(err) {}

    return json_(responseObj);

  } catch (err) {
    return json_({ success: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var payload = JSON.parse(e.postData.contents);

    // ======= AUTH ACTIONS =======

    if (payload.action === 'authUser') {
      return json_(authUser_(ss, payload.email, payload.password));
    }

    if (payload.action === 'registerUser') {
      return json_(registerUser_(ss, payload.name, payload.email, payload.password));
    }

    if (payload.action === 'forgotPassword') {
      return json_(forgotPassword_(ss, payload.email));
    }

    if (payload.action === 'resetPassword') {
      return json_(resetPassword_(ss, payload.email, payload.code, payload.newPassword));
    }

    if (payload.action === 'saveUserAccess') {
      return json_(saveUserAccess_(ss, payload));
    }

    if (payload.action === 'heartbeat') {
      return json_(heartbeat_(ss, payload.email));
    }

    // ======= DADOS =======

    if (payload.action === 'salvarReajuste') {
      var sheet = ss.getSheetByName('Reajustado');
      if (!sheet) sheet = ss.insertSheet('Reajustado');
      
      sheet.clear();
      var dados = payload.dados;
      if (dados && dados.length > 0) {
        sheet.getRange(1, 1, dados.length, dados[0].length).setValues(dados);
      }
      
      var newVersion = updateVersion_();
      pushToFirebase();
      return json_({ success: true, message: 'Reajuste salvo com sucesso e enviado ao Firebase!', newVersion: newVersion });
    }

    return json_({ success: false, error: 'Ação POST desconhecida.' });
  } catch (err) {
    return json_({ success: false, error: String(err) });
  }
}

// ============================================================
// HELPERS DE AUTH
// ============================================================

function hashPassword_(password) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  return bytes.map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function getUsersSheet_(ss) {
  var sh = ss.getSheetByName('Usuarios');
  if (!sh) {
    sh = ss.insertSheet('Usuarios');
    sh.appendRow(['nome','email','senha_hash','role','disciplina','status','abas','isAdmin','cargo','allowedTabs','resetCode','resetExpiry','online','lastSeen']);
  }
  return sh;
}

function findUserRow_(sh, email) {
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var emailCol = headers.indexOf('email');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][emailCol]).toLowerCase().trim() === String(email).toLowerCase().trim()) {
      var obj = {};
      headers.forEach(function(h, idx) { obj[h] = data[i][idx]; });
      obj._row = i + 1;
      return obj;
    }
  }
  return null;
}

function rowToUser_(u) {
  var abas = String(u.abas || u.allowedTabs || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  return {
    nome: u.nome || '',
    email: u.email || '',
    role: u.role || u.cargo || '',
    disciplina: u.disciplina || '',
    status: u.status || 'pending',
    abas: abas,
    isAdmin: String(u.isAdmin) === 'true' || u.isAdmin === true || u.isAdmin === 1,
    online: true
  };
}

function authUser_(ss, email, password) {
  if (!email || !password) return { success: false, error: 'E-mail e senha são obrigatórios.' };
  var sh = getUsersSheet_(ss);
  var u = findUserRow_(sh, email);
  if (!u) return { success: false, error: 'Usuário não encontrado.' };
  if (u.status === 'blocked') return { success: false, error: 'Conta bloqueada. Contate o administrador.' };
  if (u.status === 'pending') return { success: false, error: 'Cadastro aguardando aprovação do administrador.' };
  var hash = hashPassword_(password);
  if (u.senha_hash !== hash) return { success: false, error: 'Senha incorreta.' };
  return { success: true, user: rowToUser_(u) };
}

function registerUser_(ss, name, email, password) {
  if (!name || !email || !password) return { success: false, error: 'Todos os campos são obrigatórios.' };
  var sh = getUsersSheet_(ss);
  if (findUserRow_(sh, email)) return { success: false, error: 'E-mail já cadastrado.' };
  var isCorporate = String(email).toLowerCase().trim().indexOf('@quantaconsultoria.com') !== -1;
  sh.appendRow([name, email, hashPassword_(password), '', '', isCorporate ? 'active' : 'pending', '', false, '', '', '', '', false, new Date()]);
  return { success: true, message: isCorporate ? 'Acesso liberado! Entre com suas credenciais.' : 'Cadastro enviado. Aguarde aprovação do administrador.' };
}

function forgotPassword_(ss, email) {
  if (!email) return { success: false, error: 'E-mail obrigatório.' };
  var sh = getUsersSheet_(ss);
  var u = findUserRow_(sh, email);
  if (!u) return { success: true }; // Não revela se o e-mail existe
  var code = String(Math.floor(100000 + Math.random() * 900000));
  var expiry = new Date(Date.now() + 30 * 60 * 1000); // 30 min
  var headers = sh.getDataRange().getValues()[0];
  sh.getRange(u._row, headers.indexOf('resetCode') + 1).setValue(code);
  sh.getRange(u._row, headers.indexOf('resetExpiry') + 1).setValue(expiry.toISOString());
  // Envia e-mail com o código
  try {
    MailApp.sendEmail(email, 'EcoQuanta - Código de recuperação', 'Seu código de recuperação: ' + code + '\n\nVálido por 30 minutos.');
  } catch(mailErr) { Logger.log('Erro ao enviar e-mail: ' + mailErr); }
  return { success: true };
}

function resetPassword_(ss, email, code, newPassword) {
  if (!email || !code || !newPassword) return { success: false, error: 'Todos os campos são obrigatórios.' };
  var sh = getUsersSheet_(ss);
  var u = findUserRow_(sh, email);
  if (!u) return { success: false, error: 'Usuário não encontrado.' };
  if (u.resetCode !== code) return { success: false, error: 'Código inválido.' };
  if (u.resetExpiry && new Date(u.resetExpiry) < new Date()) return { success: false, error: 'Código expirado. Solicite um novo.' };
  var headers = sh.getDataRange().getValues()[0];
  sh.getRange(u._row, headers.indexOf('senha_hash') + 1).setValue(hashPassword_(newPassword));
  sh.getRange(u._row, headers.indexOf('resetCode') + 1).setValue('');
  sh.getRange(u._row, headers.indexOf('resetExpiry') + 1).setValue('');
  return { success: true, message: 'Senha redefinida com sucesso.' };
}

function saveUserAccess_(ss, payload) {
  var sh = getUsersSheet_(ss);
  var u = findUserRow_(sh, payload.email);
  var headers = sh.getDataRange().getValues()[0];
  var tabs = Array.isArray(payload.allowedTabs) ? payload.allowedTabs.join(',') : (payload.allowedTabs || '');
  if (u) {
    if (payload.name) sh.getRange(u._row, headers.indexOf('nome') + 1).setValue(payload.name);
    if (payload.role) sh.getRange(u._row, headers.indexOf('role') + 1).setValue(payload.role);
    if (payload.discipline) sh.getRange(u._row, headers.indexOf('disciplina') + 1).setValue(payload.discipline);
    if (payload.status) sh.getRange(u._row, headers.indexOf('status') + 1).setValue(payload.status);
    if (tabs !== undefined) sh.getRange(u._row, headers.indexOf('abas') + 1).setValue(tabs);
    sh.getRange(u._row, headers.indexOf('isAdmin') + 1).setValue(Boolean(payload.isAdmin));
    if (payload.cargo) sh.getRange(u._row, headers.indexOf('cargo') + 1).setValue(payload.cargo);
  }
  return { success: true };
}

function heartbeat_(ss, email) {
  if (!email) return { success: false };
  var sh = getUsersSheet_(ss);
  var u = findUserRow_(sh, email);
  if (u) {
    var headers = sh.getDataRange().getValues()[0];
    sh.getRange(u._row, headers.indexOf('online') + 1).setValue(true);
    sh.getRange(u._row, headers.indexOf('lastSeen') + 1).setValue(new Date());
  }
  return { success: true };
}

function doOptions() {
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

// --- FUNÇÃO DE COMPRESSÃO EXTREMA (Matriz + RLE) ---
function getCompressedData_(ss) {
  var sheets = ss.getSheets();
  var out = { atual: [], dates: [], timeline: {}, reajustado: [] };
  var snapshotSheets = [];

  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var name = String(sh.getName() || '').trim();
    
    if (name === 'Reajustado') {
      out.reajustado = sh.getDataRange().getValues();
    } 
    else if (name === 'Atual') {
      var values = sh.getDataRange().getValues();
      for (var r = 1; r < values.length; r++) {
        var code = String(values[r][3] || '').trim();
        if (!code) continue;
        // Array compacto: [code, name, progress, duration, pStart, pEnd, idealProg, lDate, mDate]
        out.atual.push([
          code, 
          String(values[r][4] || '').trim(), 
          values[r][2], 
          values[r][5], 
          formatIfDate_(values[r][6]), 
          formatIfDate_(values[r][7]), 
          values[r][9], 
          formatIfDate_(values[r][11]), 
          formatIfDate_(values[r][12])
        ]);
      }
    } 
    else if (/^\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}$/.test(name) || /^\d{4}-\d{2}-\d{2}$/.test(name)) {
      snapshotSheets.push({ name: name, sheet: sh });
    }
  }

  // Ordena as abas de data da mais antiga para a mais nova
  snapshotSheets.sort(function(a, b) {
    return parseSimpleDate_(a.name) - parseSimpleDate_(b.name);
  });

  var dates = [];
  var tempMap = {}; // { "OS-01": [ {r: 10, i: 20}, {r: 10, i: 20} ] }

  // Extrai as colunas de Real e Ideal de todas as abas
  for (var s = 0; s < snapshotSheets.length; s++) {
    dates.push(snapshotSheets[s].name);
    var sValues = snapshotSheets[s].sheet.getDataRange().getValues();
    for (var rs = 1; rs < sValues.length; rs++) {
      var osCode = String(sValues[rs][3] || '').trim();
      if (!osCode) continue;
      if (!tempMap[osCode]) tempMap[osCode] = [];
      tempMap[osCode][s] = { r: sValues[rs][2], i: sValues[rs][9] };
    }
  }
  
  // Traz a aba 'Gabriel' também como a data mais atual, se existir, para complementar 
  // caso o usuário preencha dados recentes ali
  var shGabriel = ss.getSheetByName('Gabriel');
  if (shGabriel) {
    var gabrielDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
    dates.push(gabrielDate);
    var gValues = shGabriel.getDataRange().getValues();
    for (var rg = 1; rg < gValues.length; rg++) {
      var osCodeG = String(gValues[rg][3] || '').trim();
      if(!osCodeG) continue;
      if(!tempMap[osCodeG]) tempMap[osCodeG] = [];
      tempMap[osCodeG][dates.length - 1] = { r: gValues[rg][2], i: gValues[rg][9] };
    }
  }

  out.dates = dates;

  // Lógica da IA (RLE): Agrupa os meses repetidos
  for (var c in tempMap) {
    var runs = [];
    var currentRun = null;
    
    for (var d = 0; d < dates.length; d++) {
      var pt = tempMap[c][d];
      if (!pt) continue; // Pula se a OS não existia nessa data
      
      if (!currentRun) {
        // [IndexInício, IndexFim, Real, Ideal]
        currentRun = [d, d, pt.r, pt.i];
      } else {
        // Se for igualzinho ao mês passado, só estica a data final
        if (currentRun[2] === pt.r && currentRun[3] === pt.i && currentRun[1] === d - 1) {
          currentRun[1] = d;
        } else {
          // Mudou! Salva o bloco e começa um novo
          runs.push(currentRun);
          currentRun = [d, d, pt.r, pt.i];
        }
      }
    }
    if (currentRun) runs.push(currentRun);
    if (runs.length > 0) out.timeline[c] = runs;
  }

  return out;
}

function formatIfDate_(val) {
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
    return val.getTime(); // Envia o Timestamp (Número), economiza letras
  }
  return val; 
}

function parseSimpleDate_(name) {
  var str = String(name).trim();
  var ptMatch = str.match(/^(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/);
  if (ptMatch) return new Date(Number(ptMatch[3]), Number(ptMatch[2]) - 1, Number(ptMatch[1])).getTime();
  var isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])).getTime();
  return 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}