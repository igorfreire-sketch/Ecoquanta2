/* Install alongside the unchanged AgrupadorMRK. No recipient or credential here.
 * Pure core ends at ACC SERVICES. All dates are emitted as UTC ISO strings.
 */
var ACC_HEADERS = {
  id: ['ID'], titulo: ['Titulo', 'Title'], status: ['Status'], categoria: ['Categoria', 'Category'],
  tipo: ['Tipo', 'Type'], descricao: ['Descricao', 'Description'], atribuido: ['Atribuido a', 'Assigned to'],
  empresa: ['Empresa', 'Company'], seguidores: ['Seguidores', 'Watchers'], criadoPor: ['Criado por', 'Created by'],
  criadoEm: ['Criado em', 'Created on'], vencimento: ['Data de vencimento', 'Due date'],
  posicionamento: ['Posicionamento', 'Placement'], atualizadoEm: ['Atualizado em', 'Updated on'],
  fechadoPor: ['Fechado por', 'Closed by'], fechadoEm: ['Fechado as', 'Closed at'], comentarios: ['Comentarios', 'Comments']
};
// Same vocabulary as src/lib/disciplineCatalog.ts; unknown codes stay raw.
var ACC_SETORES = { ARQ:'Arquitetura', URB:'Urbanismo', LAY:'Layout', LUM:'Luminotécnica', ACES:'Acessibilidade',
  APS:'Paisagismo', TSD:'Sondagem', EST:'Estrutura Mista', SCO:'Estrutura de Concreto', SMAD:'Estrutura de Madeira',
  CONT:'Contenção', SMT:'Estrutura Metálica', FUND:'Fundações', HIDS:'Hidrossanitário', HIDA:'Hidráulica', ESG:'Esgoto',
  DREN:'Drenagem', GAS:'Gás', REUS:'Reuso', SUB:'Subestação', ELET:'Elétrica', SPDA:'SPDA', EREN:'Energia Renovável',
  CFTV:'CFTV', SOM:'Sonorização', AUVI:'Áudio e Vídeo', ACUS:'Acústica', CENO:'Cenotécnica', DADO:'Dados', AUTO:'Automação',
  TELE:'Telecom', AVAC:'AVAC', ARCO:'Ar Comprimido', IMPE:'Impermeabilização', ALA:'Alarme', PCI:'PCI', HIDL:'Hidrológico',
  TERR:'Terraplanagem', TOPO:'Topografia', VPAV:'Vias e Pavimentação', SINS:'Sinalização Viária', MEC:'Mecânica / Caldeiraria',
  AMB:'Ambiental', COMP:'Compatibilização', ORC:'Orçamento', ENG:'Engenharia', JUR:'Jurídico', MULT:'Multidisciplinar',
  ECON:'Econômico-Financeiro', GEOM:'Geométrico', GEO:'Geofísica', HAB:'Habitação', VIAR:'Viário', MOBI:'Mobilidade',
  DES:'Desapropriação', CLSH:'Clash', SUP:'Supervisão', GER:'Gerenciamento', GECO:'Gestão do Contrato', CONF:'Conformidade',
  DEV:'Desenvolvimento', BISD:'BI e Soluções Digitais' };
var ACC_STATUS = [ ['Open','Aberto'], ['Pending','Pendente'], ['In progress','Em andamento'], ['In review','Em revisao'],
  ['In dispute','Em disputa'], ['Not approved','Nao aprovado'], ['Draft','Rascunho'], ['Completed','Concluido'], ['Closed','Fechado'] ];
function accNorm_(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
function accXml_(s) {
  return String(s || '').replace(/\r\n?/g,'\n').replace(/&#x([\da-f]+);/gi, function(_, n) { return String.fromCodePoint(parseInt(n,16)); })
    .replace(/&#(\d+);/g, function(_, n) { return String.fromCodePoint(+n); })
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')
    .replace(/_x([\da-f]{4})_/gi, function(_, n) { return String.fromCharCode(parseInt(n,16)); });
}
function accTexts_(xml) { return Array.from(xml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g), function(m) { return accXml_(m[1]); }).join(''); }
function accCells_(xml, shared) {
  var cells = {};
  Array.from(xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)).forEach(function(m) {
    var ref = /\br="([A-Z]+)\d+"/.exec(m[1]); if (!ref) return;
    var type = /\bt="([^"]+)"/.exec(m[1]), v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(m[2] || '');
    cells[ref[1]] = type && type[1] === 's' ? shared[+(v ? v[1] : -1)] || '' :
      type && type[1] === 'inlineStr' ? accTexts_(m[2]) : accXml_(v ? v[1] : '');
  }); return cells;
}
function accParse_(files) {
  var shared = Array.from((files['xl/sharedStrings.xml'] || '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g), function(m) { return accTexts_(m[1]); });
  var sheetName = Object.keys(files).filter(function(n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); }).sort()[0];
  if (!sheetName) throw new Error('XLSX sem planilha');
  var headers, mapping = {}, rows = [], total = 0;
  for (var match of files[sheetName].matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    var cells = accCells_(match[2], shared);
    if (!headers) {
      headers = cells;
      Object.keys(ACC_HEADERS).forEach(function(key) {
        mapping[key] = Object.keys(cells).find(function(col) { return ACC_HEADERS[key].some(function(h) { return accNorm_(h) === accNorm_(cells[col]); }); });
        if (!mapping[key]) throw new Error('Coluna ausente: ' + key);
      }); continue;
    }
    total++;
    if (accNorm_(cells[mapping.categoria]) !== 'quality') continue;
    var row = { linha: +(/\br="(\d+)"/.exec(match[1]) || [0,total+1])[1] };
    Object.keys(mapping).forEach(function(key) { row[key] = cells[mapping[key]] || ''; }); rows.push(row);
  }
  return { rows: rows, total: total, headers: headers };
}
function accSplit_(value,company) {
  var lines = String(value || '').split(/\r?\n/).map(function(s) { return s.trim(); }).filter(Boolean);
  if(lines.length===1 && (company && accNorm_(lines[0])===accNorm_(company) ||
    /^(architect|arquiteto|arquiteta|engineer|engenheiro|engenheira|coordinator|coordenador|coordenadora|manager|gerente|designer|projetista)$/i.test(lines[0]) ||
    /\b(ltda|engenharia|consultoria|engineering)\b/i.test(lines[0]))) return {pessoa:'',cargo:lines[0]};
  return { pessoa: lines[0] || '', cargo: lines.slice(1).join('\n') };
}
function accDate_(value, utc) {
  if (!value) return '';
  var text = String(value).trim(), d;
  if (/^\d+(\.\d+)?$/.test(text)) d = new Date(Math.round((+text - 25569) * 86400000) + (utc ? 0 : 10800000));
  else {
    var m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
    if (m) d = new Date(Date.UTC(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0), +(m[6]||0)) + (utc ? 0 : 10800000));
    else d = new Date(text + (/Z$|[+-]\d\d:\d\d$/.test(text) ? '' : utc ? 'Z' : '-03:00'));
  }
  if (isNaN(d.getTime())) throw new Error('Data invalida'); return d.toISOString();
}
function accNormalize_(parsed, fallback, cadastro) {
  var issues = [], errors = [], unknown = {}, seen = {};
  parsed.rows.forEach(function(r) {
    try {
      var match = /OS\s*(\d+)/i.exec(r.posicionamento) || /OS\s*(\d+)/i.exec(fallback) || /(?:^|\s-\s)(\d{3})(?:\s-\s|$)/.exec(fallback);
      if (!match) throw new Error('OS ausente');
      var os = match[1].padStart(3,'0'), status = ACC_STATUS.find(function(pair) { return pair.some(function(s) { return accNorm_(s) === accNorm_(r.status); }); });
      if (!status) throw new Error('Status desconhecido: ' + r.status);
      if (!r.id) throw new Error('ID ausente');
      var key = os + '-' + r.id; if (seen[key]) throw new Error('ID duplicado: ' + key); seen[key] = true;
      var sector = /OS\d+_P\d+_([A-Z0-9]+)/i.exec(r.posicionamento), code = sector ? sector[1].toUpperCase() : '';
      if (!ACC_SETORES[code]) unknown[code || '(ausente)'] = true;
      var company = r.empresa.trim(), assigned = accSplit_(r.atribuido,company);
      issues.push({ key: key, os: os, id: r.id, titulo: r.titulo, status: status[1], concluido: ['Concluido','Fechado'].indexOf(status[1]) >= 0,
        categoria: 'Quality', tipo: r.tipo, descricao: r.descricao, pessoa: assigned.pessoa, cargo: assigned.cargo,
        empresa: company, terceirizada: !!company && accNorm_(company) !== 'quanta consultoria' && !!cadastro[accNorm_(company)],
        seguidores: r.seguidores, criadoPor: accSplit_(r.criadoPor).pessoa, criadoEm: accDate_(r.criadoEm,false),
        vencimento: accDate_(r.vencimento,false), posicionamento: r.posicionamento, setor: code, setorNome: ACC_SETORES[code] || code,
        atualizadoEm: accDate_(r.atualizadoEm,false), fechadoPor: accSplit_(r.fechadoPor).pessoa, fechadoEm: accDate_(r.fechadoEm,true),
        comentarios: r.comentarios, origem: 'acc' });
    } catch (e) { errors.push({ linha: r.linha, erro: e.message }); }
  });
  issues.sort(function(a,b) { return a.key.localeCompare(b.key); });
  return { issues: issues, errors: errors, setoresDesconhecidos: Object.keys(unknown) };
}
function accBytes_(s) { return unescape(encodeURIComponent(s)).length; }
function accChunk_(text) {
  var chunks = [];
  for (var i=0; i<text.length;) { var end = Math.min(i+200000,text.length); if (end < text.length && /[\uD800-\uDBFF]/.test(text[end-1])) end--; chunks.push(text.slice(i,end)); i=end; }
  return chunks;
}
function accHash_(text, digest) { return digest(text); }
function accSummary_(issues) {
  var totals = {}, companies = {};
  issues.forEach(function(r) {
    if (r.empresa) companies[r.empresa] = true;
    var dims = [r.os,r.setor,r.tipo,r.empresa,r.status,r.criadoEm.slice(0,7)], key = JSON.stringify(dims);
    totals[key] = (totals[key] || 0) + 1;
  }); return { empresas: Object.keys(companies).sort(), totais: totals };
}
// ACC SERVICES: never evaluated by the pure Node checks.
function accTesteSimulacao() { return accRun_('daily',true); }
function accImportarDiario() { return accRun_('daily',false); }
function accCargaHistorica() { return accRun_('history',false); }
function accContinuar_() { return accRun_('continue',false); }
function accStatus() {
  var p = PropertiesService.getScriptProperties();
  var state = { dryRun: p.getProperty('DRY_RUN') !== 'false', queue: accQueueRead_(p).length,
    discovery: JSON.parse(p.getProperty('ACC_DISCOVERY') || 'null'),
    last: JSON.parse(p.getProperty('ACC_LAST') || 'null') }; console.log(JSON.stringify(state)); return state;
}
function accDigest_(text) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8).map(function(b) { return ('0'+(b&255).toString(16)).slice(-2); }).join(''); }
function accUnzip_(blob) { var files = {}; Utilities.unzip(blob).forEach(function(b) { if (/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(b.getName())) files[b.getName()] = b.getDataAsString('UTF-8'); }); return files; }
function accAuth_() {
  var sa = JSON.parse(PropertiesService.getScriptProperties().getProperty('ACC_FIREBASE_SA') || 'null');
  if (!sa || !sa.project_id || !sa.private_key || !sa.client_email) throw new Error('Configure ACC_FIREBASE_SA');
  var now = Math.floor(Date.now()/1000), enc = function(o) { return Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/,''); };
  var unsigned = enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:sa.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  var jwt = unsigned+'.'+Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(unsigned,sa.private_key)).replace(/=+$/,'');
  var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token',{method:'post',payload:{grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt},muteHttpExceptions:true});
  if (response.getResponseCode() !== 200) throw new Error('OAuth HTTP '+response.getResponseCode());
  return { token:JSON.parse(response.getContentText()).access_token, root:'https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(sa.project_id)+'/databases/(default)/documents' };
}
function accValue_(v) {
  if (v === null) return {nullValue:null}; if (typeof v === 'string') return {stringValue:v};
  if (typeof v === 'boolean') return {booleanValue:v}; if (typeof v === 'number') return Number.isInteger(v) ? {integerValue:String(v)} : {doubleValue:v};
  if (Array.isArray(v)) return {arrayValue:{values:v.map(accValue_)}};
  var fields = {}; Object.keys(v).forEach(function(k) { fields[k] = accValue_(v[k]); }); return {mapValue:{fields:fields}};
}
function accDecode_(v) {
  if ('stringValue' in v) return v.stringValue; if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return +v.integerValue; if ('doubleValue' in v) return v.doubleValue;
  if (v.arrayValue) return (v.arrayValue.values || []).map(accDecode_);
  if (v.mapValue) { var o={}; Object.keys(v.mapValue.fields || {}).forEach(function(k) { o[k]=accDecode_(v.mapValue.fields[k]); }); return o; } return null;
}
function accGet_(auth,path) {
  var res = UrlFetchApp.fetch(auth.root+'/'+path,{headers:{Authorization:'Bearer '+auth.token},muteHttpExceptions:true});
  if (res.getResponseCode() === 404) return null;
  if (res.getResponseCode() !== 200) throw new Error('Firestore read HTTP '+res.getResponseCode());
  var doc = JSON.parse(res.getContentText()); return accDecode_({mapValue:{fields:doc.fields}});
}
function accRead_(auth,path) {
  var doc = accGet_(auth,path); if (!doc || !doc.chunked) return doc;
  var text=''; for(var i=0;i<doc.chunkCount;i++) { var c=accGet_(auth,path+'/chunks/'+String(i).padStart(5,'0')); if (!c) throw new Error('Chunk ausente'); text+=c.value; }
  var data=JSON.parse(text); return Object.assign({},doc,data);
}
function accPlan_(path,data,old) {
  var serialized=JSON.stringify(data), writes=[], count=0;
  if(accBytes_(serialized)>900000) {
    var chunks=accChunk_(serialized); count=chunks.length;
    chunks.forEach(function(value,index) { writes.push({path:path+'/chunks/'+String(index).padStart(5,'0'),data:{index:index,value:value,updatedAt:data.updatedAt}}); });
    var pointer={chunked:true,chunkCount:count,byteLength:accBytes_(serialized),updatedAt:data.updatedAt};
    ['os','hash','sourceFile'].forEach(function(k) { if(data[k] !== undefined) pointer[k]=data[k]; }); writes.push({path:path,data:pointer});
  } else writes.push({path:path,data:data});
  for(var i=count;i<(old && old.chunkCount || 0);i++) writes.push({path:path+'/chunks/'+String(i).padStart(5,'0'),remove:true});
  return writes;
}
function accCommit_(auth,plans,budget) {
  if(plans.length > budget.remaining || plans.length > 500) throw new Error('Limite de escritas por execucao');
  var root=auth.root.replace('https://firestore.googleapis.com/v1/','');
  var writes=plans.map(function(p) { return p.remove ? {delete:root+'/'+p.path} : {update:{name:root+'/'+p.path,fields:accValue_(p.data).mapValue.fields}}; });
  var res=UrlFetchApp.fetch(auth.root+':commit',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+auth.token},payload:JSON.stringify({writes:writes}),muteHttpExceptions:true});
  if(res.getResponseCode() !== 200) throw new Error('Firestore commit HTTP '+res.getResponseCode()); budget.remaining-=plans.length;
}
function accQueueRead_(p) {
  var count=+(p.getProperty('ACC_QUEUE_PARTS') || 0), text='';
  for(var i=0;i<count;i++) text+=p.getProperty('ACC_QUEUE_'+i) || '';
  return JSON.parse(text || '[]');
}
function accQueueSave_(p,queue) {
  var text=JSON.stringify(queue), parts=[], at=0;
  // Script Properties has a 9 KB per-value and 500 KB total quota.
  while(at<text.length) { var end=Math.min(at+1800,text.length); if(/[\uD800-\uDBFF]/.test(text[end-1])) end--; parts.push(text.slice(at,end)); at=end; }
  if(accBytes_(text)>350000) throw new Error('Fila excede limite seguro de Script Properties');
  var old=+(p.getProperty('ACC_QUEUE_PARTS') || 0);
  parts.forEach(function(value,i) { p.setProperty('ACC_QUEUE_'+i,value); });
  p.setProperty('ACC_QUEUE_PARTS',String(parts.length));
  for(var i=parts.length;i<old;i++) p.deleteProperty('ACC_QUEUE_'+i);
}
function accDiscover_(mode,cursor,deadline) {
  var query = PropertiesService.getScriptProperties().getProperty('ACC_GMAIL_QUERY') || 'subject:("was shared with you")';
  if(mode==='daily') query+=' newer_than:2d';
  if(cursor && cursor.query) query=cursor.query;
  var queue=[], seen={}, offset=cursor ? cursor.offset : 0, threads;
  // Persist discovery cursor; do not exceed the execution deadline on large mailboxes.
  do {
    threads=GmailApp.search(query,offset,10);
    threads.forEach(function(t) { t.getMessages().forEach(function(m) {
      var subject=m.getSubject(), os=extrairOs_(subject) || '';
      var links=extrairLinksDownload_(m.getBody());
      links.forEach(function(link) { if(seen[link]) return; seen[link]=true; queue.push({id:m.getId(),link:link,os:os,subject:subject,date:m.getDate().toISOString(),attempts:0}); });
    }); }); offset+=threads.length;
  } while(threads.length===10 && queue.length<50 && Date.now()<deadline);
  return {items:queue.sort(function(a,b) { return b.date.localeCompare(a.date); }),next:threads.length===10?offset:0,query:query};
}
function accTrigger_() {
  ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction()==='accContinuar_'; }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('accContinuar_').timeBased().after(60000).create();
}
function accRun_(mode,forceDry) {
  var lock=LockService.getScriptLock(); if(!lock.tryLock(1000)) throw new Error('Importacao ACC em andamento');
  var started=Date.now(), p=PropertiesService.getScriptProperties(), dry=forceDry || p.getProperty('DRY_RUN')!=='false';
  var report={dryRun:dry,lidos:0,novos:0,alterados:0,erros:[],files:[]};
  try {
    if(!dry) ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction()==='accContinuar_'; }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
    var cursor=mode==='continue' ? JSON.parse(p.getProperty('ACC_DISCOVERY') || 'null') : null;
    var queue=mode==='continue' ? accQueueRead_(p) : [];
    if(!queue.length && (mode!=='continue' || cursor && cursor.offset)) {
      if(!dry && mode!=='continue' && (accQueueRead_(p).length || +(JSON.parse(p.getProperty('ACC_DISCOVERY') || '{}').offset || 0))) throw new Error('Fila pendente: execute accContinuar_');
      var discovered=accDiscover_(mode,cursor,started+60000); queue=discovered.items;
      if(forceDry && queue.length) { var batchId=queue[0].id; queue=queue.filter(function(i) { return i.id===batchId; }); }
      if(!dry) accQueueSave_(p,queue);
      if(!dry) p.setProperty('ACC_DISCOVERY',JSON.stringify({offset:discovered.next,query:discovered.query}));
    }
    var auth=dry?null:accAuth_(), summary=dry?{osVersions:{},empresas:[],totais:{}}:accRead_(auth,'accResumo/atual') || {osVersions:{},empresas:[],totais:{}}, cadastro={};
    var budget={remaining:Math.min(450,Math.max(1,+(p.getProperty('ACC_MAX_WRITES') || 100)))}, downloaded={}, latest={};
    if(!dry) {
      // REST pagination for the manual company registry.
      var page=''; do {
        var resp=UrlFetchApp.fetch(auth.root+'/accTerceirizadas?pageSize=300'+(page?'&pageToken='+encodeURIComponent(page):''),{headers:{Authorization:'Bearer '+auth.token},muteHttpExceptions:true});
        if(resp.getResponseCode()!==200) throw new Error('Cadastro HTTP '+resp.getResponseCode());
        var registry=JSON.parse(resp.getContentText()); (registry.documents || []).forEach(function(d) { var r=accDecode_({mapValue:{fields:d.fields}}); cadastro[accNorm_(r.nome)]=r.terceirizada===true; }); page=registry.nextPageToken || '';
      } while(page);
    }
    while(queue.length && Date.now()-started<240000 && budget.remaining>0) {
      var item=queue[0], at=Date.now();
      try {
        var cached=downloaded[item.link];
        if(!cached) {
          try { cached={response:buscarDownloadAutodesk_(item.link).resposta}; }
          catch(downloadError) { cached={error:downloadError}; }
          downloaded[item.link]=cached;
        }
        if(cached.error) throw cached.error;
        var response=cached.response;
        if(response.getResponseCode()!==200) throw new Error('Download HTTP '+response.getResponseCode());
        var headers=response.getHeaders(), disposition=String(headers['Content-Disposition'] || headers['content-disposition'] || '');
        var fileMatch=/filename\*=UTF-8''([^;]+)/i.exec(disposition), plainMatch=/filename="?([^";]+)/i.exec(disposition);
        var filename=fileMatch ? decodeURIComponent(fileMatch[1]) : plainMatch ? plainMatch[1] : (item.os || 'ACC')+'.xlsx';
        var parseStarted=Date.now();
        var parsed=accParse_(accUnzip_(response.getBlob())), normalized=accNormalize_(parsed,filename+' '+item.os+' '+(item.subject || ''),cadastro);
        var parseMs=Date.now()-parseStarted;
        report.lidos+=parsed.rows.length; report.erros=report.erros.concat(normalized.errors);
        if(normalized.errors.length) throw new Error('Arquivo invalido; OS preservada');
        var groups={}; normalized.issues.forEach(function(r) { (groups[r.os] || (groups[r.os]=[])).push(r); });
        Object.keys(groups).forEach(function(os) {
          if(latest[os] && latest[os]>=item.date) return;
          var previous=dry?null:accRead_(auth,'accOs/'+os);
          if(previous && previous.sourceFile && previous.sourceFile.date>item.date) return;
          latest[os]=item.date;
          var json=JSON.stringify(groups[os]), hash=accHash_(json,accDigest_), partial=accSummary_(groups[os]);
          report.files.push({os:os,quality:groups[os].length,jsonBytes:accBytes_(json),parseMs:parseMs,fileMs:Date.now()-at,setoresDesconhecidos:normalized.setoresDesconhecidos});
          if(previous && previous.hash===hash) return;
          var next=JSON.parse(JSON.stringify(summary)); delete next.chunked; delete next.chunkCount; delete next.byteLength;
          next.updatedAt=new Date().toISOString(); next.osVersions[os]=hash;
          Object.keys(next.totais).forEach(function(k) { if(JSON.parse(k)[0]===os) delete next.totais[k]; }); Object.assign(next.totais,partial.totais);
          var companies={}; Object.keys(next.totais).forEach(function(k) { var name=JSON.parse(k)[3]; if(name) companies[name]=true; }); next.empresas=Object.keys(companies).sort();
          if(previous) report.alterados++; else report.novos++;
          next.ultimaImportacao={lidos:report.lidos,novos:report.novos,alterados:report.alterados,erros:report.erros.slice(-100)};
          var data={os:os,hash:hash,updatedAt:next.updatedAt,sourceFile:{name:filename,messageId:item.id,date:item.date},json:json};
          var summaryPlan=accPlan_('accResumo/atual',next,summary);
          if(!dry) accCommit_(auth,accPlan_('accOs/'+os,data,previous).concat(summaryPlan),budget);
          summary=Object.assign({},next,summaryPlan.find(function(plan) { return plan.path==='accResumo/atual'; }).data);
        });
        queue.shift();
      } catch(e) {
        item.attempts++; report.erros.push({messageId:item.id,erro:e.message});
        if(item.attempts>=3) queue.shift(); else break;
      }
      if(!dry) accQueueSave_(p,queue);
    }
    report.resumoBytes=accBytes_(JSON.stringify(summary)); report.ms=Date.now()-started;
    if(!dry) {
      accQueueSave_(p,queue);
      // Bounded, valid JSON; the full report is in execution logs.
      p.setProperty('ACC_LAST',JSON.stringify({dryRun:false,lidos:report.lidos,novos:report.novos,alterados:report.alterados,erros:report.erros.slice(-5),ms:report.ms}));
      if(queue.length || +(JSON.parse(p.getProperty('ACC_DISCOVERY') || '{}').offset || 0)) accTrigger_();
    }
    console.log(JSON.stringify(report)); return report;
  } finally { lock.releaseLock(); }
}
