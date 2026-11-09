'use strict';
// Tests de la recepción por correo de planillas.gs (el respaldo para devolver un
// Excel), con Gmail, GitHub y el resto de Apps Script simulados. La publicación
// de planillas y su copia a revision/ están en planillas.test.js.
//
// Correr desde la raíz del repositorio:
//     node --test integraciones/planillas-google/*.test.js
// python3 -m unittest discover -s tests también los corre, si hay Node.

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
const AUT_OK = 'mx.google.com; dkim=pass header.i=@ispch.cl header.s=selector1 header.b=AbC; ' +
  'spf=pass (google.com: domain of emillan@ispch.cl designates 40.107.1.1 as permitted sender) ' +
  'smtp.mailfrom=emillan@ispch.cl; dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=ispch.cl';

const firmados = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));  // como getBytes() de Apps Script
const sinSigno = bytes => Buffer.from(bytes.map(b => (b + 256) % 256));
const shaGit = buf => crypto.createHash('sha1')
  .update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');
const plano = o => JSON.parse(JSON.stringify(o));  // objetos del contexto vm -> de este contexto

function entorno({ hilos = [], github = {}, props = {}, fallaGithub = null } = {}) {
  const estado = {
    alertas: [], puts: [], gets: 0, busquedas: [], anomalias: [], activadores: [], fallaGithub,
    props: Object.assign({ GITHUB_TOKEN: 'github_pat_prueba' }, props),
    repo: new Map(Object.entries(github).map(([k, v]) => [k, Buffer.from(v)])),
    etiquetas: new Set(),
  };
  const respuesta = (codigo, cuerpo) => ({
    getResponseCode: () => codigo, getContentText: () => JSON.stringify(cuerpo || {}),
  });
  const ctx = {
    console: { log() {} },
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
      DigestAlgorithm: { SHA_1: 'sha1' },
      computeDigest: (alg, bytes) => firmados(crypto.createHash(alg).update(sinSigno(bytes)).digest()),
      formatDate: d => d.toISOString(),
    },
    GmailApp: {
      search(consulta, inicio, max) { estado.busquedas.push(consulta); return hilos.slice(inicio, inicio + max); },
      sendEmail(para, asunto, cuerpo) { estado.alertas.push({ para, asunto, cuerpo }); },
      getUserLabelByName: n => (estado.etiquetas.has(n) ? { n } : null),
      createLabel(n) { estado.etiquetas.add(n); return { n }; },
    },
    UrlFetchApp: { fetch(url, op = {}) {
      const m = url.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/contents\/([^?]+)(?:\?ref=(.*))?$/);
      if (!m || m[1] !== REPO) { estado.anomalias.push('URL inesperada: ' + url); return respuesta(400); }
      if (op.headers.Authorization !== 'Bearer ' + estado.props.GITHUB_TOKEN) estado.anomalias.push('sin token');
      const ruta = decodeURIComponent(m[2]);
      if ((op.method || 'get') === 'get') {
        estado.gets++;
        if (m[3] !== 'main') estado.anomalias.push('GET sin ref=main');
        if (estado.fallaGithub) return respuesta(estado.fallaGithub, { message: 'falla simulada' });
        return estado.repo.has(ruta) ? respuesta(200, { sha: shaGit(estado.repo.get(ruta)) })
          : respuesta(404, { message: 'Not Found' });
      }
      const cuerpo = JSON.parse(op.payload);
      estado.puts.push({ url, ruta, cuerpo });
      if (estado.fallaGithub) return respuesta(estado.fallaGithub, { message: 'falla simulada' });
      if (!cuerpo.content) return respuesta(422, { message: 'Invalid request. "content" wasn\'t supplied.' });
      const existe = estado.repo.has(ruta);
      if (existe && cuerpo.sha !== shaGit(estado.repo.get(ruta))) return respuesta(409, { message: 'sha distinto' });
      if (!existe && cuerpo.sha) return respuesta(422, { message: 'sha de un archivo que no existe' });
      estado.repo.set(ruta, Buffer.from(cuerpo.content, 'base64'));
      return respuesta(existe ? 200 : 201, { content: { path: ruta } });
    } },
    ScriptApp: {
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
  vm.createContext(ctx);
  vm.runInContext(CODIGO, ctx);
  return { ctx, estado };
}

let contador = 0;
function correo({ de, asunto, cuerpo = '', adjuntos = [], autenticacion = AUT_OK }) {
  const id = 'm' + (++contador);
  const cabeceras = ['Delivered-To: ' + YO];
  // Plegada en varias líneas, como llega de verdad.
  if (autenticacion !== null) cabeceras.push('Authentication-Results: ' + autenticacion.replace(/; /g, ';\r\n       '));
  const m = {
    respuestas: [],
    getId: () => id,
    getFrom: () => de,
    getSubject: () => asunto,
    getDate: () => new Date('2026-11-10T12:00:00Z'),
    getBody: () => cuerpo,
    getPlainBody: () => cuerpo.replace(/<[^>]+>/g, ' '),
    getAttachments: () => adjuntos.map(a => {
      const buf = Buffer.from(a.contenido === undefined ? 'contenido de ' + a.nombre : a.contenido);
      return {
        getName: () => a.nombre, getBytes: () => firmados(buf),
        getSize: () => (a.tamano === undefined ? buf.length : a.tamano),
        getContentType: () => a.tipo || TIPO_XLSX,
      };
    }),
    getRawContent: () => cabeceras.concat(['From: ' + de, 'Subject: ' + asunto, '', 'cuerpo']).join('\r\n'),
    reply(texto) { m.respuestas.push(texto); },
  };
  return m;
}

function hilo(...mensajes) {
  const h = {
    etiquetas: [],
    getFirstMessageSubject: () => mensajes[0].getSubject(),
    getMessages: () => mensajes,
    addLabel(e) { h.etiquetas.push(e.n); },
    getPermalink: () => 'https://mail.google.com/mail/#all/hilo',
  };
  return h;
}

/** El correo que manda la rutina, con el enlace de descarga del reporte. */
function reporte(archivo, asunto) {
  const url = `https://github.com/${REPO}/raw/main/resultados/${archivo}`;
  return correo({ de: YO, asunto, cuerpo: `<p>Descarga: <a href="${url}">${url}</a></p>` });
}
const REPORTE = 'Fiscalizacion_Web_DM_autotest-vih_09-11-2026.xlsx';
const ASUNTO = 'Fiscalización web DM — Autotest VIH — 09-11-2026';
const EMILIO = 'Emilio Millán <emillan@ispch.cl>';

function respuestaDeEmilio(adjuntos, extra = {}) {
  return correo(Object.assign({ de: EMILIO, asunto: 'RE: ' + ASUNTO, adjuntos }, extra));
}

function sinAnomalias(estado) {
  assert.deepEqual(estado.anomalias, []);
}


test('respuesta con el nombre original: se sube tal cual, a nombre del inspector, y se le confirma', () => {
  const r = reporte(REPORTE, ASUNTO);
  const resp = respuestaDeEmilio([{ nombre: 'Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx', contenido: 'revisado' }]);
  const h = hilo(r, resp);
  const { ctx, estado } = entorno({ hilos: [h] });

  assert.deepEqual(plano(ctx.procesarRevisiones()), { cargados: 1, problemas: 0, pendientes: 0, retenidos: 0 });

  const ruta = 'revision/Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx';
  assert.equal(estado.repo.get(ruta).toString(), 'revisado');
  const put = estado.puts[0];
  assert.match(put.url, /\/contents\/revision\/Fiscalizacion_Web_DM_autotest-vih_09-11-2026%20EJMS\.xlsx$/);
  assert.equal(put.cuerpo.branch, 'main');
  assert.deepEqual(put.cuerpo.author, { name: 'Emilio Millán', email: 'emillan@ispch.cl' });
  assert.match(put.cuerpo.message, /de emillan@ispch\.cl/);
  assert.equal(resp.respuestas.length, 1);
  assert.match(resp.respuestas[0], /^Hola, Emilio Millán:/);
  assert.match(resp.respuestas[0], /Tu revisión quedó cargada/);
  assert.match(resp.respuestas[0], /blob\/main\/revision\/Fiscalizacion_Web_DM_autotest-vih_09-11-2026%20EJMS\.xlsx/);
  assert.equal(r.respuestas.length, 0, 'al correo de la rutina no se le responde');
  assert.deepEqual(h.etiquetas, ['Fiscalización web/Revisión cargada']);
  assert.deepEqual(estado.alertas, []);
  sinAnomalias(estado);

  // La corrida siguiente no vuelve a tocar el mismo correo.
  assert.deepEqual(plano(ctx.procesarRevisiones()), { cargados: 0, problemas: 0, pendientes: 0, retenidos: 0 });
  assert.equal(estado.puts.length, 1);
  assert.equal(resp.respuestas.length, 1);
});

test('la búsqueda pide solo correos del dominio y recientes', () => {
  const { ctx, estado } = entorno();
  ctx.procesarRevisiones();
  assert.equal(estado.busquedas.length, 1);
  assert.match(estado.busquedas[0], /^from:ispch\.cl newer_than:10d \{filename:xlsx /);
});

test('adjunto renombrado sin pistas: toma el nombre del correo original y el sufijo del remitente', () => {
  const resp = respuestaDeEmilio([{ nombre: 'Libro1.xlsx' }]);
  const { ctx, estado } = entorno({ hilos: [hilo(reporte(REPORTE, ASUNTO), resp)] });
  ctx.procesarRevisiones();
  assert.deepEqual([...estado.repo.keys()], ['revision/Fiscalizacion_Web_DM_autotest-vih_09-11-2026_emillan.xlsx']);
  assert.match(resp.respuestas[0], /Fiscalizacion_Web_DM_autotest-vih_09-11-2026_emillan\.xlsx/);
});

test('respuesta que Gmail no juntó con el reporte: toma el nombre del enlace citado', () => {
  const url = `https://github.com/${REPO}/raw/main/resultados/${REPORTE}`;
  const resp = respuestaDeEmilio([{ nombre: 'Libro1.xlsx' }],
    { cuerpo: `<p>Revisado.</p><blockquote>De: qf.lukasgallegos@gmail.com<br>Descarga: ${url}</blockquote>` });
  const { ctx, estado } = entorno({ hilos: [hilo(resp)] });  // el hilo trae solo la respuesta
  ctx.procesarRevisiones();
  assert.deepEqual([...estado.repo.keys()], ['revision/Fiscalizacion_Web_DM_autotest-vih_09-11-2026_emillan.xlsx']);
});

test('adjunto que contradice al hilo: no se adivina, se le pregunta al inspector', () => {
  for (const nombre of ['guantes 09-11-2026.xlsx', 'Revisión jeringas.xlsx', 'autotest 16-11-2026.xlsx',
    'consolidado.xlsx']) {
    const resp = respuestaDeEmilio([{ nombre }]);
    const h = hilo(reporte(REPORTE, ASUNTO), resp);
    const { ctx, estado } = entorno({ hilos: [h] });
    assert.deepEqual(plano(ctx.procesarRevisiones()), { cargados: 0, problemas: 1, pendientes: 0, retenidos: 0 }, nombre);
    assert.equal(estado.puts.length, 0, nombre);
    assert.match(resp.respuestas[0], /no sé a qué reporte corresponde/, nombre);
    assert.match(resp.respuestas[0], /Responde el correo original del reporte/, nombre);
    assert.deepEqual(h.etiquetas, ['Fiscalización web/Revisión con problema'], nombre);
  }
});

test('adjunto con pistas del mismo reporte: usa el nombre del hilo', () => {
  for (const nombre of ['Revisión autotest VIH.xlsx', 'autotest 09-11-2026 revisado.xlsx', 'Fiscalizacion_Web_DM_autotest-vih.xlsx']) {
    const resp = respuestaDeEmilio([{ nombre }]);
    const { ctx, estado } = entorno({ hilos: [hilo(reporte(REPORTE, ASUNTO), resp)] });
    ctx.procesarRevisiones();
    assert.deepEqual([...estado.repo.keys()], ['revision/Fiscalizacion_Web_DM_autotest-vih_09-11-2026_emillan.xlsx'], nombre);
  }
});

test('dos adjuntos: el que se reconoce se sube y del otro se explica qué hacer', () => {
  const resp = respuestaDeEmilio([
    { nombre: 'Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx' },
    { nombre: 'Libro1.xlsx' },  // con dos Excel, el nombre del hilo no sirve para ninguno
  ]);
  const h = hilo(reporte(REPORTE, ASUNTO), resp);
  const { ctx, estado } = entorno({ hilos: [h] });
  assert.deepEqual(plano(ctx.procesarRevisiones()), { cargados: 0, problemas: 1, pendientes: 0, retenidos: 0 });
  assert.deepEqual([...estado.repo.keys()], ['revision/Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx']);
  assert.match(resp.respuestas[0], /Tu revisión quedó cargada/);
  assert.match(resp.respuestas[0], /Pero no pude cargar:\n\n {2}• Libro1\.xlsx: no sé a qué reporte corresponde/);
  assert.deepEqual(h.etiquetas, ['Fiscalización web/Revisión con problema']);
});

test('correo nuevo (no es respuesta) con el nombre bien puesto: se sube igual', () => {
  const nuevo = correo({ de: 'Lukas Gallegos <lgallegos@ispch.cl>', asunto: 'RV: revisiones de octubre',
    autenticacion: AUT_OK.replace(/emillan/g, 'lgallegos'),
    adjuntos: [
      { nombre: 'Fiscalizacion_Web_DM_jeringas-hipodermicas_08-10-2026 EJMS.xlsx' },
      { nombre: 'Fiscalizacion_Web_DM_guantesquirurgicos_07102026 MMV.xlsx' },
    ] });
  const { ctx, estado } = entorno({ hilos: [hilo(nuevo)] });
  assert.deepEqual(plano(ctx.procesarRevisiones()), { cargados: 1, problemas: 0, pendientes: 0, retenidos: 0 });
  assert.deepEqual([...estado.repo.keys()].sort(), [
    'revision/Fiscalizacion_Web_DM_guantesquirurgicos_07102026 MMV.xlsx',
    'revision/Fiscalizacion_Web_DM_jeringas-hipodermicas_08-10-2026 EJMS.xlsx',
  ]);
  assert.match(nuevo.respuestas[0], /Tus revisiones quedaron cargadas/);
  assert.equal(estado.puts[0].cuerpo.author.email, 'lgallegos@ispch.cl');
});

test('el consolidado completado: con su nombre, o con el del hilo si viene renombrado', () => {
  const asunto = 'Consolidado mensual fiscalización web DM — octubre 2026';
  for (const [adjunto, esperado] of [
    ['Consolidado_Mensual_DM_10-2026.xlsx', 'Consolidado_Mensual_DM_10-2026.xlsx'],
    ['Consolidado_Mensual_DM_10-2026_1.xlsx', 'Consolidado_Mensual_DM_10-2026_1.xlsx'],
    ['acta reunión.xlsx', 'Consolidado_Mensual_DM_10-2026_emillan.xlsx'],
  ]) {
    const resp = correo({ de: EMILIO, asunto: 'RE: ' + asunto, adjuntos: [{ nombre: adjunto }] });
    const { ctx, estado } = entorno({ hilos: [hilo(reporte('Consolidado_Mensual_DM_10-2026.xlsx', asunto), resp)] });
    ctx.procesarRevisiones();
    assert.deepEqual([...estado.repo.keys()], ['revision/' + esperado], adjunto);
  }
});

test('la misma revisión dos veces: no crea otro commit', () => {
  const ruta = 'revision/Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx';
  const resp = respuestaDeEmilio([{ nombre: 'Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx', contenido: 'igual' }]);
  const { ctx, estado } = entorno({ hilos: [hilo(reporte(REPORTE, ASUNTO), resp)], github: { [ruta]: 'igual' } });
  ctx.procesarRevisiones();
  assert.equal(estado.puts.length, 0);
  assert.match(resp.respuestas[0], /ya estaba cargado, idéntico/);
});

test('una versión corregida con el mismo nombre: reemplaza a la anterior', () => {
  const ruta = 'revision/Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx';
  const resp = respuestaDeEmilio([{ nombre: 'Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx', contenido: 'v2' }]);
  const { ctx, estado } = entorno({ hilos: [hilo(reporte(REPORTE, ASUNTO), resp)], github: { [ruta]: 'v1' } });
  ctx.procesarRevisiones();
  assert.equal(estado.repo.get(ruta).toString(), 'v2');
  assert.equal(estado.puts[0].cuerpo.sha, shaGit(Buffer.from('v1')));
  assert.match(resp.respuestas[0], /reemplazó la versión anterior/);
});

test('GitHub caído: el correo queda pendiente, se avisa una vez y se carga cuando vuelve', () => {
  const resp = respuestaDeEmilio([{ nombre: 'Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx' }]);
  const { ctx, estado } = entorno({ hilos: [hilo(reporte(REPORTE, ASUNTO), resp)], fallaGithub: 503 });

  assert.deepEqual(plano(ctx.procesarRevisiones()), { cargados: 0, problemas: 0, pendientes: 1, retenidos: 0 });
  assert.equal(resp.respuestas.length, 0, 'no se confirma lo que no se cargó');
  assert.equal(estado.alertas.length, 1);
  assert.equal(estado.alertas[0].para, 'lgallegos@ispch.cl');
  assert.match(estado.alertas[0].asunto, /^ALERTA — planillas en línea fiscalización web DM: no se pudo cargar/);
  assert.match(estado.alertas[0].cuerpo, /GitHub respondió 503/);

  ctx.procesarRevisiones();
  assert.equal(estado.alertas.length, 1, 'el mismo error no se vuelve a avisar el mismo día');

  estado.fallaGithub = null;
  assert.deepEqual(plano(ctx.procesarRevisiones()), { cargados: 1, problemas: 0, pendientes: 0, retenidos: 0 });
  assert.equal(resp.respuestas.length, 1);
  assert.equal(estado.repo.size, 1);
});

test('token vencido: el aviso dice qué hacer', () => {
  const resp = respuestaDeEmilio([{ nombre: 'Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx' }]);
  const { ctx, estado } = entorno({ hilos: [hilo(reporte(REPORTE, ASUNTO), resp)], fallaGithub: 401 });
  ctx.procesarRevisiones();
  assert.match(estado.alertas[0].cuerpo, /rechazó el token \(401\): probablemente venció/);
});

test('sin token: avisa una sola vez y no toca el correo', () => {
  const resp = respuestaDeEmilio([{ nombre: 'Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx' }]);
  const { ctx, estado } = entorno({ hilos: [hilo(reporte(REPORTE, ASUNTO), resp)], props: { GITHUB_TOKEN: '' } });
  ctx.procesarRevisiones();
  ctx.procesarRevisiones();
  assert.equal(estado.alertas.length, 1);
  assert.match(estado.alertas[0].asunto, /falta el token/);
  assert.equal(estado.busquedas.length, 0);
});

test('alguien de ispch.cl que no está en la lista: no se carga y se avisa a Lukas', () => {
  const resp = correo({ de: 'Otra Persona <otra@ispch.cl>', asunto: 'RE: ' + ASUNTO,
    adjuntos: [{ nombre: 'Fiscalizacion_Web_DM_autotest-vih_09-11-2026.xlsx' }] });
  const { ctx, estado } = entorno({ hilos: [hilo(reporte(REPORTE, ASUNTO), resp)] });
  assert.deepEqual(plano(ctx.procesarRevisiones()), { cargados: 0, problemas: 1, pendientes: 0, retenidos: 0 });
  assert.equal(estado.puts.length, 0);
  assert.equal(resp.respuestas.length, 0);
  assert.match(estado.alertas[0].cuerpo, /otra@ispch\.cl, que no está en la lista/);
});

test('remitente que Google no autenticó: se retiene sin responderle y se avisa a Lukas una vez', () => {
  for (const autenticacion of [
    'mx.google.com; dkim=none; spf=softfail (google.com: domain of transitioning emillan@ispch.cl does not ' +
      'designate 1.2.3.4 as permitted sender) smtp.mailfrom=emillan@ispch.cl; dmarc=fail (p=NONE) header.from=ispch.cl',
    // El comentario de ARC repite un dmarc=pass de otro servidor: no cuenta.
    'mx.google.com; arc=pass (i=1 spf=pass spfdomain=ispch.cl dkim=pass dkdomain=ispch.cl dmarc=pass fromdomain=ispch.cl); ' +
      'spf=fail smtp.mailfrom=emillan@ispch.cl; dmarc=fail header.from=ispch.cl',
    // Firmas válidas, pero de otro dominio.
    'mx.google.com; dkim=pass header.i=@ispch.onmicrosoft.com; spf=pass smtp.mailfrom=rebote@ispch.cl.malo.com',
    null,  // sin cabecera de autenticación
  ]) {
    const resp = respuestaDeEmilio([{ nombre: 'Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx' }], { autenticacion });
    const { ctx, estado } = entorno({ hilos: [hilo(reporte(REPORTE, ASUNTO), resp)] });
    assert.deepEqual(plano(ctx.procesarRevisiones()), { cargados: 0, problemas: 0, pendientes: 0, retenidos: 1 }, String(autenticacion));
    assert.equal(estado.puts.length, 0);
    assert.equal(resp.respuestas.length, 0);
    assert.match(estado.alertas[0].asunto, /Excel retenido/);
    ctx.procesarRevisiones();
    assert.equal(estado.alertas.length, 1, 'el aviso de un correo retenido no se repite');
  }
});

test('basta con una verificación a nombre del dominio o de un subdominio', () => {
  const { ctx } = entorno();
  for (const valor of [
    'mx.google.com; dmarc=pass (p=NONE) header.from=ispch.cl',
    'mx.google.com; dkim=pass header.d=ispch.cl header.s=s1',
    'mx.google.com; dkim=pass header.i=@correo.ispch.cl',
    'mx.google.com; spf=pass (google.com: domain of x@ispch.cl designates 1.1.1.1) smtp.mailfrom=x@ispch.cl',
    'mx.google.com; spf=pass smtp.mailfrom=ispch.cl',
  ]) assert.equal(ctx.autenticaDominio_(valor, 'ispch.cl'), true, valor);
  for (const valor of [
    'mx.google.com; dkim=pass header.i=@noispch.cl',
    'mx.google.com; dkim=pass header.i=@ispch.cl.malo.com',
    'mx.google.com; spf=pass smtp.mailfrom=x@ispch.cl.malo.com',
    'mx.google.com; dkim=fail header.d=ispch.cl; spf=neutral smtp.mailfrom=x@ispch.cl',
    // El dominio verificado es el que va después de la última arroba.
    'mx.google.com; spf=pass smtp.mailfrom="x@ispch.cl"@malo.com',
    // Lo que va entre paréntesis lo escribe el remitente, no Google.
    'mx.google.com; spf=pass smtp.mailfrom=x@malo.com (reenviado por smtp.mailfrom=x@ispch.cl )',
  ]) assert.equal(ctx.autenticaDominio_(valor, 'ispch.cl'), false, valor);
});

test('al apagar la verificación, lo retenido se carga solo en la corrida siguiente', () => {
  const resp = respuestaDeEmilio([{ nombre: 'Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx' }], { autenticacion: null });
  const { ctx, estado } = entorno({ hilos: [hilo(reporte(REPORTE, ASUNTO), resp)] });
  ctx.procesarRevisiones();
  assert.equal(estado.repo.size, 0);
  vm.runInContext('CONFIG.verificarRemitente = false', ctx);
  assert.deepEqual(plano(ctx.procesarRevisiones()), { cargados: 1, problemas: 0, pendientes: 0, retenidos: 0 });
  assert.equal(estado.repo.size, 1);
  assert.match(resp.respuestas[0], /Tu revisión quedó cargada/);
});

test('respuesta en el hilo del reporte con un adjunto que no es .xlsx: se le avisa al inspector', () => {
  const resp = respuestaDeEmilio([{ nombre: 'winmail.dat', tipo: 'application/ms-tnef' }]);
  const { ctx, estado } = entorno({ hilos: [hilo(reporte(REPORTE, ASUNTO), resp)] });
  ctx.procesarRevisiones();
  assert.match(resp.respuestas[0], /no traía un Excel \(\.xlsx\).*Llegó: winmail\.dat/s);
  assert.equal(estado.puts.length, 0);
});

test('lo que no es una revisión se ignora en silencio', () => {
  const casos = [
    // un «gracias» con la firma como adjunto
    respuestaDeEmilio([{ nombre: 'image001.png', tipo: 'image/png' }]),
    // un correo de un inspector que no tiene que ver con los reportes
    correo({ de: EMILIO, asunto: 'Reunión de equipo', adjuntos: [{ nombre: 'Agenda.docx', tipo: 'application/msword' }] }),
    // alguien del ISP fuera de la lista, en un correo que no tiene que ver
    correo({ de: 'otra@ispch.cl', asunto: 'Presupuesto', adjuntos: [{ nombre: 'Presupuesto 2027.xlsx' }] }),
  ];
  for (const c of casos) {
    const h = c.getSubject().startsWith('RE: ') ? hilo(reporte(REPORTE, ASUNTO), c) : hilo(c);
    const { ctx, estado } = entorno({ hilos: [h] });
    assert.deepEqual(plano(ctx.procesarRevisiones()), { cargados: 0, problemas: 0, pendientes: 0, retenidos: 0 }, c.getSubject());
    assert.equal(c.respuestas.length, 0);
    assert.deepEqual(estado.alertas, []);
    assert.equal(estado.puts.length, 0);
  }
});

test('un inspector que manda un Excel sin relación con un reporte recibe la explicación', () => {
  const c = correo({ de: EMILIO, asunto: 'planilla', adjuntos: [{ nombre: 'Libro1.xlsx' }] });
  const { ctx, estado } = entorno({ hilos: [hilo(c)] });
  ctx.procesarRevisiones();
  assert.equal(estado.puts.length, 0);
  assert.match(c.respuestas[0], /no sé a qué reporte corresponde/);
});

test('un adjunto demasiado grande no se sube', () => {
  const resp = respuestaDeEmilio([{ nombre: 'Fiscalizacion_Web_DM_autotest-vih_09-11-2026.xlsx', tamano: 11 * 1024 * 1024 }]);
  const { ctx, estado } = entorno({ hilos: [hilo(reporte(REPORTE, ASUNTO), resp)] });
  ctx.procesarRevisiones();
  assert.equal(estado.puts.length, 0);
  assert.match(resp.respuestas[0], /pesa más de 10 MB/);
});

test('los nombres se limpian: sin carpetas, sin caracteres prohibidos y con .xlsx en minúscula', () => {
  const { ctx } = entorno();
  assert.equal(ctx.limpiarNombre_('../../x/Fiscalizacion_Web_DM_a_09-11-2026.XLSX'), 'Fiscalizacion_Web_DM_a_09-11-2026.xlsx');
  assert.equal(ctx.limpiarNombre_('  a<b>:c?  d.xlsx '), 'abc d.xlsx');
  assert.equal(ctx.limpiarNombre_('...oculto.xlsx'), 'oculto.xlsx');
});

test('olvida lo procesado hace más de 60 días y conserva lo reciente', () => {
  const viejo = new Date(Date.now() - 61 * 864e5).toISOString();
  const nuevo = new Date().toISOString();
  const { ctx, estado } = entorno({ props: { 'procesado:a': viejo, 'procesado:b': nuevo, 'alertado:c': viejo, OTRA: viejo } });
  ctx.procesarRevisiones();
  assert.deepEqual(Object.keys(estado.props).sort(), ['GITHUB_TOKEN', 'OTRA', 'procesado:b']);
});

test('probarConexion falla con un mensaje claro si el token no puede escribir', () => {
  const { ctx, estado } = entorno({ github: { 'revision/README.md': '# revision' } });
  estado.fallaGithub = 403;
  assert.throws(() => ctx.probarConexion(), /negó el permiso \(403\)/);
});

test('un Excel de un reporte que ya tiene planilla: no se carga y se le contesta con el enlace', () => {
  // Con el nombre del reporte, o renombrado sin pistas («Libro1.xlsx»): en los
  // dos casos el reporte es el del hilo, y ese reporte se trabaja en línea.
  const planilla = { id: 'p1', url: 'https://docs.google.com/spreadsheets/d/p1/edit', sha: 'abc', avisado: true };
  for (const nombre of ['Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx', 'Libro1.xlsx']) {
    const resp = respuestaDeEmilio([{ nombre }]);
    const { ctx, estado } = entorno({
      hilos: [hilo(reporte(REPORTE, ASUNTO), resp)],
      props: { ['planilla:' + REPORTE]: JSON.stringify(planilla) },
    });
    assert.deepEqual(plano(ctx.procesarRevisiones()), { cargados: 0, problemas: 1, pendientes: 0, retenidos: 0 }, nombre);
    assert.equal(estado.puts.length, 0, nombre);
    assert.match(resp.respuestas[0], /se trabaja en su planilla en línea/, nombre);
    assert.ok(resp.respuestas[0].includes(planilla.url), nombre);
    assert.doesNotMatch(resp.respuestas[0], /Para que se cargue solo/, nombre);
  }
});

test('un reporte que volvió por correo antes de tener planilla se sigue cargando como siempre', () => {
  // El registro dice que ese reporte no tiene planilla: la guardia no aplica.
  const resp = respuestaDeEmilio([{ nombre: 'Fiscalizacion_Web_DM_autotest-vih_09-11-2026 EJMS.xlsx' }]);
  const { ctx, estado } = entorno({
    hilos: [hilo(reporte(REPORTE, ASUNTO), resp)],
    props: { ['planilla:' + REPORTE]: JSON.stringify({ sha: 'abc', revisadoPorCorreo: true }) },
  });
  assert.deepEqual(plano(ctx.procesarRevisiones()), { cargados: 1, problemas: 0, pendientes: 0, retenidos: 0 });
  assert.equal(estado.puts.length, 1);
});
