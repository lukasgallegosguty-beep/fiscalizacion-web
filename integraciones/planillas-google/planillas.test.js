'use strict';
// Tests de la publicación de planillas y de su copia a revision/ (planillas.gs),
// con GitHub, Google Drive, Sheets y Gmail simulados. La recepción por correo
// está en correo.test.js.
//
// Las planillas simuladas guardan sus hojas como JSON: el «Excel» que la rutina
// deja en resultados/ es ese JSON, Drive lo «convierte» leyéndolo y lo
// «exporta» escribiéndolo. Así se sigue el contenido de punta a punta.
//
// Correr desde la raíz del repositorio:
//     node --test integraciones/planillas-google/*.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const CODIGO = fs.readFileSync(path.join(__dirname, 'planillas.gs'), 'utf8');
const YO = 'qf.lukasgallegos@gmail.com';
const REPO = 'lukasgallegosguty-beep/fiscalizacion-web';
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TIPO_PLANILLA = 'application/vnd.google-apps.spreadsheet';
const TIPO_CARPETA = 'application/vnd.google-apps.folder';
const AHORA = Date.parse('2026-11-09T15:00:00Z');
const MINUTO = 60e3;

const firmados = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));  // como getBytes() de Apps Script
const sinSigno = bytes => Buffer.from(bytes.map(b => (b + 256) % 256));
const shaGit = buf => crypto.createHash('sha1')
  .update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');
const plano = o => JSON.parse(JSON.stringify(o));  // objetos del contexto vm -> de este contexto
const iso = ms => new Date(ms).toISOString();


// ─── Lo simulado ────────────────────────────────────────────────────────────

function entorno({ github = {}, props = {}, drive = [], sinServicioDrive = false, sinCuentaGoogle = [] } = {}) {
  const estado = {
    ahora: AHORA,
    correos: [], puts: [], deletes: [], anomalias: [], activadores: [], busquedasGmail: 0,
    permisosCreados: 0, fallaDrive: null,
    props: Object.assign({ GITHUB_TOKEN: 'github_pat_prueba' }, props),
    repo: new Map(Object.entries(github).map(([k, v]) => [k, Buffer.isBuffer(v) ? v : Buffer.from(v)])),
    drive: new Map(),
    siguiente: 1,
    etiquetas: new Set(),
  };
  for (const a of drive) {
    estado.drive.set(a.id, Object.assign({ trashed: false, permisos: [], modifiedTime: iso(AHORA - 864e5) }, a));
  }
  const respuesta = (codigo, cuerpo, bytes) => ({
    getResponseCode: () => codigo,
    getContentText: () => (cuerpo === undefined ? '' : JSON.stringify(cuerpo)),
    getContent: () => firmados(bytes || Buffer.alloc(0)),
  });

  function githubApi(url, op) {
    const m = url.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/(.*)$/);
    if (!m || m[1] !== REPO) { estado.anomalias.push('URL inesperada: ' + url); return respuesta(400, {}); }
    if (op.headers.Authorization !== 'Bearer ' + estado.props.GITHUB_TOKEN) estado.anomalias.push('sin token de GitHub');
    const resto = m[2];
    const metodo = op.method || 'get';
    if (resto === 'git/trees/main?recursive=1') {
      const arbol = [{ path: 'resultados', type: 'tree', sha: 'x' }];
      for (const [ruta, buf] of estado.repo) arbol.push({ path: ruta, type: 'blob', sha: shaGit(buf) });
      return respuesta(200, { tree: arbol, truncated: false });
    }
    const blob = resto.match(/^git\/blobs\/([0-9a-f]+)$/);
    if (blob) {
      for (const buf of estado.repo.values()) {
        if (shaGit(buf) === blob[1]) {
          // GitHub corta el base64 en líneas.
          return respuesta(200, { content: buf.toString('base64').replace(/(.{60})/g, '$1\n'), encoding: 'base64' });
        }
      }
      return respuesta(404, { message: 'Not Found' });
    }
    const c = resto.match(/^contents\/([^?]+)(?:\?ref=(.*))?$/);
    if (!c) { estado.anomalias.push('URL de GitHub inesperada: ' + url); return respuesta(400, {}); }
    const ruta = decodeURIComponent(c[1]);
    if (metodo === 'get') {
      if (c[2] !== 'main') estado.anomalias.push('GET sin ref=main');
      return estado.repo.has(ruta) ? respuesta(200, { sha: shaGit(estado.repo.get(ruta)) }) : respuesta(404, { message: 'Not Found' });
    }
    const cuerpo = JSON.parse(op.payload);
    if (metodo === 'delete') {
      if (!estado.repo.has(ruta) || cuerpo.sha !== shaGit(estado.repo.get(ruta))) return respuesta(409, { message: 'sha distinto' });
      estado.repo.delete(ruta);
      estado.deletes.push({ ruta, cuerpo });
      return respuesta(200, { commit: {} });
    }
    estado.puts.push({ ruta, cuerpo });
    if (!cuerpo.content) return respuesta(422, { message: 'Invalid request. "content" wasn\'t supplied.' });
    const existe = estado.repo.has(ruta);
    if (existe && cuerpo.sha !== shaGit(estado.repo.get(ruta))) return respuesta(409, { message: 'sha distinto' });
    if (!existe && cuerpo.sha) return respuesta(422, { message: 'sha de un archivo que no existe' });
    estado.repo.set(ruta, Buffer.from(cuerpo.content, 'base64'));
    return respuesta(existe ? 200 : 201, { content: { path: ruta } });
  }

  function cumple(f, consulta) {
    let ok = true;
    const re = /(name|mimeType|modifiedTime)\s*(=|>)\s*'((?:\\'|[^'])*)'|'([^']+)' in parents|trashed\s*=\s*(true|false)/g;
    let n = 0;
    for (const x of consulta.matchAll(re)) {
      n++;
      if (x[4]) ok = ok && f.parents && f.parents.indexOf(x[4]) !== -1;
      else if (x[5]) ok = ok && f.trashed === (x[5] === 'true');
      else {
        const valor = x[3].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        if (x[1] === 'modifiedTime') ok = ok && Date.parse(f.modifiedTime) > Date.parse(valor);
        else ok = ok && f[x[1]] === valor;
      }
    }
    if (n !== consulta.split(' and ').length) estado.anomalias.push('consulta que la simulación no entiende: ' + consulta);
    return ok;
  }

  function nuevo(datos) {
    const id = 'id' + (estado.siguiente++);
    const f = Object.assign({ id, trashed: false, permisos: [], modifiedTime: iso(estado.ahora),
      webViewLink: datos.mimeType === TIPO_PLANILLA ? `https://docs.google.com/spreadsheets/d/${id}/edit`
        : `https://drive.google.com/drive/folders/${id}` }, datos);
    estado.drive.set(id, f);
    return f;
  }

  function driveApi(url, op) {
    if (op.headers.Authorization !== 'Bearer token-google') estado.anomalias.push('sin token de Google: ' + url);
    if (estado.fallaDrive) return respuesta(estado.fallaDrive, { error: { message: 'falla simulada' } });
    if (estado.apiApagada) {
      return respuesta(403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Google Drive API has not been ' +
        'used in project 123 before or it is disabled.', errors: [{ reason: 'accessNotConfigured' }] } });
    }
    const metodo = op.method || 'get';
    const u = new URL(url);
    if (u.pathname === '/drive/v3/about') return respuesta(200, { user: { emailAddress: YO } });
    if (u.pathname === '/upload/drive/v3/files' && metodo === 'post') {
      const limite = op.contentType.match(/boundary=(.+)$/)[1];
      const buf = sinSigno(op.payload);
      const sep = Buffer.from('--' + limite);
      const partes = [];
      for (let i = buf.indexOf(sep); i !== -1;) {
        const j = buf.indexOf(sep, i + sep.length);
        if (j === -1) break;
        partes.push(buf.slice(i + sep.length, j));
        i = j;
      }
      const cuerpo = p => p.slice(p.indexOf('\r\n\r\n') + 4, p.length - 2);
      if (partes.length !== 2 || partes[1].indexOf(TIPO_XLSX) === -1) estado.anomalias.push('subida mal armada');
      const meta = JSON.parse(cuerpo(partes[0]).toString('utf8'));
      const f = nuevo(Object.assign({}, meta, { hojas: JSON.parse(cuerpo(partes[1]).toString('utf8')) }));
      return respuesta(200, { id: f.id, webViewLink: f.webViewLink, modifiedTime: f.modifiedTime });
    }
    if (u.pathname === '/drive/v3/files' && metodo === 'get') {
      const consulta = u.searchParams.get('q');
      const todos = [...estado.drive.values()].filter(f => cumple(f, consulta));
      const desde = Number(u.searchParams.get('pageToken') || 0);
      const pagina = todos.slice(desde, desde + 3);  // páginas chicas, para recorrerlas
      return respuesta(200, Object.assign({ files: pagina.map(plano) },
        desde + 3 < todos.length ? { nextPageToken: String(desde + 3) } : {}));
    }
    if (u.pathname === '/drive/v3/files' && metodo === 'post') {
      const f = nuevo(JSON.parse(op.payload));
      return respuesta(200, { id: f.id });
    }
    const m = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)(\/permissions|\/export)?$/);
    const f = m && estado.drive.get(decodeURIComponent(m[1]));
    if (!f) return respuesta(404, { error: { message: 'File not found' } });
    if (m[2] === '/export') {
      if (u.searchParams.get('mimeType') !== TIPO_XLSX) estado.anomalias.push('exportación sin xlsx');
      return respuesta(200, undefined, Buffer.from(JSON.stringify(f.hojas)));
    }
    if (m[2] === '/permissions') {
      if (metodo === 'get') return respuesta(200, { permissions: f.permisos });
      const p = JSON.parse(op.payload);
      if (u.searchParams.get('sendNotificationEmail') !== 'true') estado.anomalias.push('compartir sin invitación');
      if (sinCuentaGoogle.indexOf(p.emailAddress) !== -1) {
        return respuesta(400, { error: { message: 'There is no Google account associated with ' + p.emailAddress } });
      }
      estado.permisosCreados++;
      f.permisos.push({ emailAddress: p.emailAddress, role: p.role });
      return respuesta(200, { id: 'perm' + estado.permisosCreados });
    }
    if (metodo === 'patch') {
      Object.assign(f, JSON.parse(op.payload));
      return respuesta(200, { id: f.id });
    }
    return respuesta(200, { id: f.id, trashed: f.trashed });
  }

  const ctx = {
    console: { log() {} },
    URL,
    Session: { getEffectiveUser: () => ({ getEmail: () => YO }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (Object.prototype.hasOwnProperty.call(estado.props, k) ? estado.props[k] : null),
      setProperty(k, v) { estado.props[k] = String(v); },
      deleteProperty(k) { delete estado.props[k]; },
      getProperties: () => Object.assign({}, estado.props),
    }) },
    Utilities: {
      base64Encode: bytes => sinSigno(bytes).toString('base64'),
      base64Decode: texto => firmados(Buffer.from(texto, 'base64')),
      DigestAlgorithm: { SHA_1: 'sha1' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, v) => firmados(crypto.createHash(alg)
        .update(typeof v === 'string' ? Buffer.from(v, 'utf8') : sinSigno(v)).digest()),
      formatDate: d => d.toISOString(),
      getUuid: () => '1234-5678',
      newBlob: datos => ({
        getBytes: () => firmados(typeof datos === 'string' ? Buffer.from(datos, 'utf8') : sinSigno(datos)),
        getDataAsString: () => (typeof datos === 'string' ? datos : sinSigno(datos).toString('utf8')),
      }),
    },
    GmailApp: {
      search() { estado.busquedasGmail++; return []; },
      sendEmail(para, asunto, cuerpo, opciones = {}) {
        estado.correos.push({ para, asunto, cuerpo, html: opciones.htmlBody, nombre: opciones.name });
      },
      getUserLabelByName: n => (estado.etiquetas.has(n) ? { n } : null),
      createLabel(n) { estado.etiquetas.add(n); return { n }; },
    },
    UrlFetchApp: { fetch(url, op = {}) {
      if (url.startsWith('https://api.github.com/')) return githubApi(url, op);
      if (url.startsWith('https://www.googleapis.com/')) return driveApi(url, op);
      estado.anomalias.push('URL inesperada: ' + url);
      return respuesta(400, {});
    } },
    SpreadsheetApp: { openById(id) {
      const f = estado.drive.get(id);
      if (!f || f.mimeType !== TIPO_PLANILLA) throw new Error('No se encontró la planilla ' + id);
      return { getSheets: () => Object.keys(f.hojas).map(n => ({
        getName: () => n,
        getDataRange: () => ({ getValues: () => JSON.parse(JSON.stringify(f.hojas[n])) }),
      })) };
    } },
    DriveApp: { getRootFolder: () => ({ getId: () => 'root' }) },
    ScriptApp: {
      getOAuthToken: () => 'token-google',
      getProjectTriggers: () => estado.activadores.slice(),
      deleteTrigger(t) { estado.activadores = estado.activadores.filter(x => x !== t); },
      newTrigger(funcion) {
        const t = { getHandlerFunction: () => funcion };
        const cadena = {
          timeBased: () => cadena,
          everyMinutes(n) { t.minutos = n; return cadena; },
          create() { estado.activadores.push(t); return t; },
        };
        return cadena;
      },
    },
  };
  if (!sinServicioDrive) ctx.Drive = {};
  vm.createContext(ctx);
  vm.runInContext(CODIGO, ctx);
  // El reloj del script es el de la simulación.
  ctx.__ahora = () => estado.ahora;
  vm.runInContext('Date.now = () => __ahora();', ctx);
  return { ctx, estado };
}


// ─── Reportes de prueba ─────────────────────────────────────────────────────

const ENCABEZADO = ['Nombre de DM ofertado', 'URL', 'Título de la publicación', 'Oferente', 'Coincidencia',
  'Nombre del producto con el que coincide', 'Registro del producto con el que coincide', 'Clasificación',
  'Observaciones', 'Decisión final', 'Observaciones del inspector'];
const ENCABEZADO_MKT = ['Marketplace', 'URL de búsqueda', 'Palabras clave usadas', 'Marcas detectadas en filtros',
  'Cantidad aprox. de publicaciones', 'Observaciones para el fiscalizador', 'Observaciones del inspector'];
const COL_DECISION = 9;
const COL_OBS = 10;

const hallazgo = (nombre, url, oferente, clasificacion) =>
  [nombre, url, nombre, oferente, '', '', '', clasificacion, 'Observación de la rutina', '', ''];

function xlsx(hojas) {
  return Buffer.from(JSON.stringify(hojas));
}

function reporte({ filas, anexo = [] } = {}) {
  const hojas = {
    'Hallazgos': [ENCABEZADO].concat(filas || [
      hallazgo('Aguja 30G x 13mm', 'https://tienda-uno.cl/aguja-30g', 'Tienda Uno', 'NO REGISTRADO'),
      hallazgo('Aguja 27G Nipro', 'https://farmacia.cl/27g', 'Farmacia', 'REGISTRADO'),
      hallazgo('Aguja 25G sin marca', 'https://ml.cl/25g', 'Vendedor ML', 'NO REGISTRADO'),
    ]),
    'Búsquedas Marketplace': [ENCABEZADO_MKT, ['Mercado Libre', 'https://ml.cl/buscar', 'aguja', '', '~50', 'Revisar', '']],
  };
  if (anexo.length) {
    hojas['Anexo — sobre el tope'] = [['Nombre de DM ofertado', 'URL', 'Oferente', 'Clasificación', 'Observaciones']]
      .concat(anexo, [['Estas ofertas quedaron fuera del reporte por el tope.', '', '', '', '']]);
  }
  return xlsx(hojas);
}

const AGUJAS = 'Fiscalizacion_Web_DM_agujas-hipodermicas_09-11-2026.xlsx';
const AUTOTEST = 'Fiscalizacion_Web_DM_autotest-vih_09-11-2026.xlsx';
const CONSOLIDADO = 'Consolidado_Mensual_DM_11-2026.xlsx';

function historial(extra = {}) {
  return JSON.stringify(Object.assign({
    categoria: 'agujas-hipodermicas', nombre: 'Agujas hipodérmicas', fecha: '2026-11-09', dia: 'lunes',
    slot: 1, archivo: AGUJAS, inspector: 'lgallegos@ispch.cl', hallazgos: 3, detectados: 5,
  }, extra));
}

function repoConAgujas({ hist = {}, contenido } = {}) {
  return {
    'revision/README.md': '# revision',
    ['resultados/' + AGUJAS]: contenido || reporte({ anexo: [
      ['Aguja 23G', 'https://otra.cl/23g', 'Otra', 'REGISTRADO', ''],
      ['Aguja 21G', 'https://otra.cl/21g', 'Otra', 'REGISTRADO', ''],
    ] }),
    'historial/2026-11-09_slot1.json': historial(hist),
    'historial/2026-11-09_slot2.json': historial({ categoria: 'autotest-vih', slot: 2, archivo: AUTOTEST }),
  };
}

const planillas = estado => [...estado.drive.values()].filter(f => f.mimeType === TIPO_PLANILLA);
const carpeta = (estado, nombre) => [...estado.drive.values()].find(f => f.mimeType === TIPO_CARPETA && f.name === nombre);
const registro = (estado, nombre) => JSON.parse(estado.props['planilla:' + nombre]);
const alertas = estado => estado.correos.filter(c => c.asunto.startsWith('ALERTA'));
const avisos = estado => estado.correos.filter(c => !c.asunto.startsWith('ALERTA'));

/**
 * Una edición de la planilla hecha hace `minutos` minutos. El inspector edita
 * después de que la planilla existe: si hace falta, el reloj avanza.
 */
function tocar(estado, id, minutos) {
  const f = estado.drive.get(id);
  const antes = Date.parse(f.modifiedTime);
  if (estado.ahora - minutos * MINUTO <= antes) estado.ahora = antes + (minutos + 1) * MINUTO;
  f.modifiedTime = iso(estado.ahora - minutos * MINUTO);
  f.lastModifyingUser = { displayName: 'Lukas Gallegos', emailAddress: 'lgallegos@ispch.cl' };
}

/** Lo que haría el inspector en la planilla: escribir una celda, hace `minutos` minutos. */
function editar(estado, id, hoja, fila, columna, valor, minutos = 10) {
  estado.drive.get(id).hojas[hoja][fila][columna] = valor;
  tocar(estado, id, minutos);
}

function sinAnomalias(estado) {
  assert.deepEqual(estado.anomalias, []);
}


// ─── Publicar ───────────────────────────────────────────────────────────────

test('un reporte nuevo se convierte en planilla en la carpeta de su categoría y el inspector de turno recibe el enlace', () => {
  const { ctx, estado } = entorno({ github: repoConAgujas() });
  const r = plano(ctx.sincronizar());
  assert.equal(r.publicar.publicadas, 1);
  assert.equal(r.publicar.avisadas, 1);
  assert.deepEqual(r.guardar, { guardadas: 0, borradas: 0, sinCambios: 0, esperando: 0 },
    'la planilla recién creada no cuenta como editada');

  const raiz = carpeta(estado, 'Fiscalización web DM');
  assert.deepEqual(raiz.parents, ['root']);
  assert.equal(raiz.writersCanShare, false, 'los inspectores no pueden compartirla con otros');
  assert.deepEqual(raiz.permisos.map(p => [p.emailAddress, p.role]),
    [['emillan@ispch.cl', 'writer'], ['lgallegos@ispch.cl', 'writer'], ['mmedina@ispch.cl', 'writer']]);
  const sub = carpeta(estado, 'Agujas hipodérmicas');
  assert.deepEqual(sub.parents, [raiz.id]);

  const [p] = planillas(estado);
  assert.equal(p.name, 'Fiscalizacion_Web_DM_agujas-hipodermicas_09-11-2026');
  assert.deepEqual(p.parents, [sub.id]);
  assert.equal(p.writersCanShare, false);
  assert.deepEqual(p.hojas, JSON.parse(estado.repo.get('resultados/' + AGUJAS)), 'la planilla trae el reporte entero');

  const [c] = avisos(estado);
  assert.equal(c.para, 'lgallegos@ispch.cl');
  assert.equal(c.asunto, 'Fiscalización web DM — Agujas hipodérmicas — 09-11-2026');
  assert.equal(c.nombre, 'Fiscalización web DM');
  assert.ok(c.cuerpo.startsWith('Hola, Lukas Gallegos:'));
  assert.ok(c.cuerpo.includes(p.webViewLink));
  assert.ok(c.html.includes('href="' + p.webViewLink + '"'));
  assert.match(c.cuerpo, /Se revisaron 5 ofertas en total; la planilla trae las 3 más relevantes \(el tope es 10\)/);
  assert.match(c.cuerpo, /De esas 3: 2 NO REGISTRADO, 1 REGISTRADO\./);
  assert.match(c.cuerpo, /Las otras 2 están en la hoja «Anexo»: no requieren revisión esta semana/);
  assert.match(c.cuerpo, /1\. Aguja 30G x 13mm — Tienda Uno\n {2}2\. Aguja 25G sin marca — Vendedor ML/);
  assert.match(c.cuerpo, /no hay que descargar ni devolver nada/);
  assert.match(c.cuerpo, /Plazo: antes del lunes 16-11-2026/);
  assert.ok(c.cuerpo.includes('resultados/' + AGUJAS), 'trae el respaldo en el repositorio');
  assert.deepEqual(registro(estado, AGUJAS).id, p.id);

  ctx.sincronizar();
  assert.equal(planillas(estado).length, 1, 'no se publica dos veces');
  assert.equal(avisos(estado).length, 1, 'ni se avisa dos veces');
  assert.equal(estado.busquedasGmail, 2, 'el correo se revisa en cada corrida');
  sinAnomalias(estado);
});

test('no se publica lo anterior al cambio, ni lo que ya volvió revisado por correo', () => {
  const { ctx, estado } = entorno({ github: {
    'revision/README.md': '# revision',
    'resultados/Fiscalizacion_Web_DM_preservativos-femeninos_06-11-2026.xlsx': reporte(),
    'resultados/Consolidado_Mensual_DM_10-2026.xlsx': xlsx({ 'Casos del mes': [['URL']] }),
    ['resultados/' + AUTOTEST]: reporte(),
    'revision/Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx': 'revisado por correo',
    'resultados/Reunion_Mensual_DM_11-2026.ics': 'BEGIN:VCALENDAR',
  } });
  const r = plano(ctx.sincronizar());
  assert.equal(r.publicar.publicadas, 0);
  assert.equal(r.publicar.omitidas, 1);
  assert.equal(planillas(estado).length, 0);
  assert.equal(avisos(estado).length, 0);
  assert.equal(registro(estado, AUTOTEST).revisadoPorCorreo, true);
  ctx.sincronizar();
  assert.equal(planillas(estado).length, 0);
  sinAnomalias(estado);
});

test('sin registro en historial/: el enlace le llega al coordinador, que sabe a quién reenviarlo', () => {
  const repo = repoConAgujas();
  delete repo['historial/2026-11-09_slot1.json'];
  const { ctx, estado } = entorno({ github: repo });
  ctx.sincronizar();
  const [c] = avisos(estado);
  assert.equal(c.para, 'lgallegos@ispch.cl');
  assert.match(c.cuerpo, /^No encontré en historial\/ a qué inspector le toca este reporte/);
  assert.match(c.cuerpo, /Se revisaron 5 ofertas en total/, 'sin historial, cuenta lo de la planilla y el anexo');
});

test('si fue feriado, el correo lo dice y no pone plazo', () => {
  const { ctx, estado } = entorno({ github: repoConAgujas({ hist: {
    inspector: 'emillan@ispch.cl', feriado: 'Inmaculada Concepción', notas: 'Mercado Libre bloqueó el acceso.',
  } }) });
  ctx.sincronizar();
  const [c] = avisos(estado);
  assert.equal(c.para, 'emillan@ispch.cl');
  assert.match(c.cuerpo, /Hola, Emilio Millán:\n\nHoy es feriado \(Inmaculada Concepción\)/);
  assert.match(c.cuerpo, /no se te cuenta como pendiente/);
  assert.doesNotMatch(c.cuerpo, /Plazo:/);
  assert.match(c.cuerpo, /Notas de la búsqueda: Mercado Libre bloqueó el acceso\./);
});

test('un reporte sin hallazgos: el correo pide escribir «Sin hallazgos» en la fila', () => {
  const vacio = reporte({ filas: [['Sin hallazgos', '', '', '', '', '', '', 'SIN HALLAZGOS', 'Revisión sin hallazgos', '', '']] });
  const { ctx, estado } = entorno({ github: repoConAgujas({ contenido: vacio, hist: { hallazgos: 0, detectados: 0 } }) });
  ctx.sincronizar();
  const [c] = avisos(estado);
  assert.match(c.cuerpo, /la hoja «Hallazgos» trae una sola fila, «Sin hallazgos»/);
  assert.match(c.cuerpo, /escribe «Sin hallazgos» en su «Decisión final»/);
  assert.doesNotMatch(c.cuerpo, /Se revisaron/);
});

test('un reporte que se vuelve a generar: sin revisión se reemplaza; con revisión se conserva y se avisa una vez', () => {
  const { ctx, estado } = entorno({ github: repoConAgujas() });
  ctx.sincronizar();
  const primera = planillas(estado)[0];

  // 1. Nadie escribió todavía: la planilla nueva reemplaza a la anterior.
  estado.repo.set('resultados/' + AGUJAS, reporte({ filas: [hallazgo('Aguja nueva', 'https://n.cl/1', 'N', 'NO REGISTRADO')] }));
  let r = plano(ctx.sincronizar());
  assert.equal(r.publicar.reemplazadas, 1);
  assert.equal(estado.drive.get(primera.id).trashed, true, 'la anterior queda en la papelera');
  const segunda = planillas(estado).find(f => !f.trashed);
  assert.equal(segunda.hojas.Hallazgos[1][0], 'Aguja nueva');
  assert.equal(registro(estado, AGUJAS).id, segunda.id);
  assert.equal(avisos(estado).length, 2);
  assert.match(avisos(estado)[1].cuerpo, /esta planilla reemplaza a la del correo anterior/);

  // 2. El inspector ya escribió: se conserva lo suyo y se avisa una sola vez.
  editar(estado, segunda.id, 'Hallazgos', 1, COL_DECISION, 'Correcto');
  estado.repo.set('resultados/' + AGUJAS, reporte({ filas: [hallazgo('Otra más', 'https://n.cl/2', 'N', 'NO REGISTRADO')] }));
  r = plano(ctx.sincronizar());
  assert.equal(r.publicar.conservadas, 1);
  assert.equal(planillas(estado).filter(f => !f.trashed).length, 1);
  assert.equal(estado.drive.get(segunda.id).trashed, false);
  assert.equal(alertas(estado).length, 1);
  assert.match(alertas(estado)[0].asunto, /se volvió a generar y su planilla ya tenía revisión/);
  ctx.sincronizar();
  assert.equal(alertas(estado).length, 1, 'el aviso no se repite');
  assert.equal(avisos(estado).length, 2, 'al inspector no se le escribe de nuevo');
  assert.ok(estado.repo.has('revision/' + AGUJAS), 'lo que escribió sí quedó copiado');

  // 3. Si Lukas decide que vale el nuevo y manda la planilla a la papelera, se
  //    publica la nueva y se borra la copia de la anterior en revision/.
  estado.drive.get(segunda.id).trashed = true;
  r = plano(ctx.sincronizar());
  assert.equal(r.publicar.reemplazadas, 1);
  const tercera = planillas(estado).find(f => !f.trashed);
  assert.equal(tercera.hojas.Hallazgos[1][0], 'Otra más');
  assert.equal(estado.repo.has('revision/' + AGUJAS), false);
  assert.equal(avisos(estado).length, 3);
  sinAnomalias(estado);
});

test('el consolidado del mes va a «Consolidados mensuales» y les llega a los tres', () => {
  const casos = [['Categoría', 'Fecha de detección', 'Nombre de DM ofertado', 'URL', 'Origen del caso',
    'Decisión final', 'Justificación de la decisión'],
  ['Agujas hipodérmicas', '09-11-2026', 'Aguja 30G', 'https://t.cl/1', 'Rutina', '', ''],
  ['Autotest VIH', '10-11-2026', 'Autotest', 'https://v.cl/2', 'Detección manual', '', '']];
  const { ctx, estado } = entorno({ github: {
    'revision/README.md': '# revision',
    ['resultados/' + CONSOLIDADO]: xlsx({ 'Casos del mes': casos, 'Cobertura del mes': [['Fecha']], 'Listas': [['Se descarta']] }),
  } });
  ctx.sincronizar();
  const [p] = planillas(estado);
  assert.deepEqual(p.parents, [carpeta(estado, 'Consolidados mensuales').id]);
  const [c] = avisos(estado);
  assert.equal(c.para, 'emillan@ispch.cl,lgallegos@ispch.cl,mmedina@ispch.cl');
  assert.equal(c.asunto, 'Planilla en línea — Consolidado mensual fiscalización web DM — noviembre 2026');
  assert.match(c.cuerpo, /Trae 2 casos en «Casos del mes»/);
  assert.match(c.cuerpo, /queda como acta del mes/);

  // Lo que se decide en la reunión queda como acta en revision/.
  editar(estado, p.id, 'Casos del mes', 1, 5, 'Se genera nueva alerta');
  editar(estado, p.id, 'Casos del mes', 1, 6, 'Alerta N°101/26');
  ctx.sincronizar();
  const acta = JSON.parse(estado.repo.get('revision/' + CONSOLIDADO));
  assert.equal(acta['Casos del mes'][1][5], 'Se genera nueva alerta');
  sinAnomalias(estado);
});


// ─── Guardar ────────────────────────────────────────────────────────────────

test('lo que escribe el inspector se copia a revision/ cuando deja de editar, a su nombre y solo si cambió', () => {
  const { ctx, estado } = entorno({ github: repoConAgujas() });
  ctx.sincronizar();
  const p = planillas(estado)[0];
  const ruta = 'revision/' + AGUJAS;
  assert.equal(estado.repo.has(ruta), false, 'una planilla sin revisar no cuenta como revisada');

  // Está escribiendo: se espera.
  editar(estado, p.id, 'Hallazgos', 1, COL_DECISION, 'Correcto', 2);
  let r = plano(ctx.sincronizar());
  assert.equal(r.guardar.esperando, 1);
  assert.equal(estado.repo.has(ruta), false);

  // Dejó de editar hace más de cinco minutos: se copia.
  estado.ahora += 10 * MINUTO;
  r = plano(ctx.sincronizar());
  assert.equal(r.guardar.guardadas, 1);
  const copia = JSON.parse(estado.repo.get(ruta));
  assert.equal(copia.Hallazgos[1][COL_DECISION], 'Correcto');
  const put = estado.puts.filter(x => x.ruta === ruta).pop();
  assert.equal(put.cuerpo.message, 'planilla en línea: ' + AGUJAS + ' (editó Lukas Gallegos)');
  assert.deepEqual(put.cuerpo.author, { name: 'Lukas Gallegos', email: 'lgallegos@ispch.cl' });

  // Sin cambios nuevos: nada, y lo ya visto no se vuelve a leer.
  const commits = estado.puts.length;
  assert.equal(plano(ctx.sincronizar()).guardar.sinCambios, 0);
  assert.equal(estado.puts.length, commits);

  // Una edición que no cambia ningún valor (un formato, un ancho de columna): nada.
  tocar(estado, p.id, 6);
  r = plano(ctx.sincronizar());
  assert.equal(r.guardar.sinCambios, 1);
  assert.equal(estado.puts.length, commits);

  // Otra observación: se copia de nuevo, sobre la anterior.
  editar(estado, p.id, 'Hallazgos', 2, COL_OBS, 'Mirar también la tienda chica.', 6);
  ctx.sincronizar();
  assert.equal(JSON.parse(estado.repo.get(ruta)).Hallazgos[2][COL_OBS], 'Mirar también la tienda chica.');
  assert.ok(estado.puts.filter(x => x.ruta === ruta).pop().cuerpo.sha, 'reemplaza la copia anterior');

  // Borró todo lo que había escrito: deja de contar como revisada.
  editar(estado, p.id, 'Hallazgos', 1, COL_DECISION, '', 6);
  editar(estado, p.id, 'Hallazgos', 2, COL_OBS, '', 6);
  r = plano(ctx.sincronizar());
  assert.equal(r.guardar.borradas, 1);
  assert.equal(estado.repo.has(ruta), false);
  assert.equal(estado.deletes.length, 1);
  sinAnomalias(estado);
});

test('lo que cambia en las columnas de la rutina no cuenta como revisión', () => {
  const { ctx, estado } = entorno({ github: repoConAgujas() });
  ctx.sincronizar();
  const p = planillas(estado)[0];
  editar(estado, p.id, 'Hallazgos', 1, 8, 'Alguien corrigió la observación de la rutina');
  ctx.sincronizar();
  assert.equal(estado.repo.has('revision/' + AGUJAS), false);
  // Las observaciones de marketplace sí son trabajo del inspector.
  editar(estado, p.id, 'Búsquedas Marketplace', 1, 6, 'https://ml.cl/p/1 aguja sin registro');
  ctx.sincronizar();
  assert.ok(estado.repo.has('revision/' + AGUJAS));
});

test('si se perdió el registro del script, la planilla que ya está en su carpeta se retoma sin crear otra', () => {
  const { ctx, estado } = entorno({
    github: repoConAgujas(),
    drive: [
      { id: 'raiz', name: 'Fiscalización web DM', mimeType: TIPO_CARPETA, parents: ['root'],
        permisos: ['emillan@ispch.cl', 'lgallegos@ispch.cl', 'mmedina@ispch.cl'].map(e => ({ emailAddress: e, role: 'writer' })) },
      { id: 'agujas', name: 'Agujas hipodérmicas', mimeType: TIPO_CARPETA, parents: ['raiz'] },
      { id: 'vieja', name: 'Fiscalizacion_Web_DM_agujas-hipodermicas_09-11-2026', mimeType: TIPO_PLANILLA,
        parents: ['agujas'], webViewLink: 'https://docs.google.com/spreadsheets/d/vieja/edit',
        hojas: JSON.parse(reporte()) },
    ],
  });
  ctx.sincronizar();
  assert.equal(planillas(estado).length, 1);
  assert.equal(avisos(estado).length, 0, 'al inspector ya le había llegado');
  assert.equal(registro(estado, AGUJAS).id, 'vieja');
  assert.equal(estado.permisosCreados, 0, 'la carpeta ya estaba compartida');
  sinAnomalias(estado);
});


// ─── Instalar y fallas ──────────────────────────────────────────────────────

test('instalar: comprueba GitHub y Drive, comparte la carpeta una sola vez y deja un solo activador', () => {
  const { ctx, estado } = entorno({ github: { 'revision/README.md': '# revision' } });
  ctx.instalar();
  ctx.instalar();
  assert.equal(estado.activadores.length, 1);
  assert.equal(estado.activadores[0].getHandlerFunction(), 'sincronizar');
  assert.equal(estado.activadores[0].minutos, 15);
  assert.equal([...estado.drive.values()].filter(f => f.name === 'Fiscalización web DM').length, 1);
  assert.equal(estado.permisosCreados, 3, 'a nadie le llega la invitación dos veces');
  assert.ok(estado.etiquetas.has('Fiscalización web/Revisión cargada'));
  assert.ok(estado.etiquetas.has('Fiscalización web/Revisión con problema'));
  assert.equal(estado.repo.size, 1, 'la prueba de permiso no escribe nada');
  ctx.desinstalar();
  assert.equal(estado.activadores.length, 0);
  sinAnomalias(estado);
});

test('sin el servicio Drive API: si la API responde, se instala igual', () => {
  const { ctx, estado } = entorno({ github: { 'revision/README.md': '# revision' }, sinServicioDrive: true });
  ctx.instalar();
  assert.equal(estado.activadores.length, 1);
  assert.ok(carpeta(estado, 'Fiscalización web DM'));
});

test('si la API de Drive no está activada, instalar falla y dice cómo activarla', () => {
  const { ctx, estado } = entorno({ github: { 'revision/README.md': '# revision' }, sinServicioDrive: true });
  estado.apiApagada = true;
  assert.throws(() => ctx.instalar(), /La API de Drive no está activada para el script\. En el editor: «Servicios» \(\+\) → Drive API/);
  assert.equal(estado.activadores.length, 0, 'no queda encendido a medias');
});

test('una cuenta con la que no se puede compartir: se dice cuál y qué hacer, y el resto queda compartido', () => {
  const { ctx, estado } = entorno({ github: { 'revision/README.md': '# revision' }, sinCuentaGoogle: ['mmedina@ispch.cl'] });
  ctx.instalar();
  const raiz = carpeta(estado, 'Fiscalización web DM');
  assert.deepEqual(raiz.permisos.map(p => p.emailAddress), ['emillan@ispch.cl', 'lgallegos@ispch.cl']);
  assert.equal(alertas(estado).length, 1);
  assert.match(alertas(estado)[0].asunto, /no se pudo compartir la carpeta con mmedina@ispch\.cl/);
  assert.match(alertas(estado)[0].cuerpo, /Usar mi dirección de correo electrónico actual/);
  assert.equal(estado.activadores.length, 1, 'igual queda encendido');
});

test('si Drive falla, el correo se revisa igual, se avisa una vez y la ejecución queda en rojo', () => {
  const { ctx, estado } = entorno({ github: repoConAgujas() });
  estado.fallaDrive = 500;
  assert.throws(() => ctx.sincronizar(), /publicar: .*Google Drive respondió 500/);
  assert.equal(estado.busquedasGmail, 1, 'la revisión del correo siguió');
  assert.equal(alertas(estado).length, 1);
  assert.match(alertas(estado)[0].asunto, /el script falló \(publicar\)/);
  assert.throws(() => ctx.sincronizar());
  assert.equal(alertas(estado).length, 1, 'el mismo día no se repite');

  estado.fallaDrive = null;
  ctx.sincronizar();
  assert.equal(planillas(estado).length, 1, 'cuando Drive vuelve, se publica');
  assert.equal(avisos(estado).length, 1);
});

test('sin token de GitHub: avisa una vez y no hace nada más', () => {
  const { ctx, estado } = entorno({ github: repoConAgujas(), props: { GITHUB_TOKEN: '' } });
  assert.deepEqual(plano(ctx.sincronizar()), { sinToken: true });
  ctx.sincronizar();
  assert.equal(alertas(estado).length, 1);
  assert.match(alertas(estado)[0].asunto, /falta el token de GitHub/);
  assert.equal(planillas(estado).length, 0);
  assert.equal(estado.busquedasGmail, 0);
});

test('el inspector sale del registro de ese reporte, no del otro bloque del mismo día', () => {
  const repo = {
    'revision/README.md': '# revision',
    ['resultados/' + AUTOTEST]: reporte(),
    'historial/2026-11-09_slot1.json': historial({ inspector: 'emillan@ispch.cl' }),
    'historial/2026-11-09_slot2.json': historial({
      categoria: 'autotest-vih', nombre: 'Autotest VIH', slot: 2, archivo: AUTOTEST, inspector: 'mmedina@ispch.cl',
    }),
  };
  const { ctx, estado } = entorno({ github: repo });
  ctx.sincronizar();
  const [c] = avisos(estado);
  assert.equal(c.para, 'mmedina@ispch.cl');
  assert.equal(c.asunto, 'Fiscalización web DM — Autotest VIH — 09-11-2026');
  assert.deepEqual(carpeta(estado, 'Autotest VIH').parents, [carpeta(estado, 'Fiscalización web DM').id]);
});

test('el registro de las planillas de hace más de 400 días se olvida, y esos reportes no se vuelven a publicar', () => {
  const { ctx, estado } = entorno({ github: repoConAgujas() });
  ctx.sincronizar();
  assert.ok(estado.props['planilla:' + AGUJAS]);
  estado.ahora = Date.parse('2027-12-20T12:00:00Z');  // 406 días después
  ctx.sincronizar();
  assert.equal(estado.props['planilla:' + AGUJAS], undefined);
  assert.equal(planillas(estado).length, 1, 'no se publica de nuevo');
  assert.equal(avisos(estado).length, 1);
  sinAnomalias(estado);
});
