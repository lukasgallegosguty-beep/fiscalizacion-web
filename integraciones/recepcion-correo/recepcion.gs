/**
 * Recepción de revisiones por correo · fiscalización web de DM (ISP / ANDIM)
 *
 * Los inspectores devuelven el Excel revisado respondiendo el correo del
 * reporte. Este script corre cada 15 minutos en la cuenta de Gmail desde la que
 * las rutinas envían los reportes: sube cada Excel recibido a la carpeta
 * revision/ del repositorio y le confirma al inspector que quedó cargado.
 *
 * El archivo pasa de Gmail a GitHub directamente, sin la rutina de Claude de
 * por medio. Un binario que pasa por el modelo como texto llega corrupto: así
 * se dañaron los adjuntos de salida del 24-08-2026.
 *
 * Instalación y mantención: INSTALAR.md, en la misma carpeta del repositorio.
 *
 * Esta es la copia versionada. La que corre es la que está pegada en
 * script.google.com: si cambias este archivo, vuelve a pegarlo allá.
 */

const CONFIG = {
  repositorio: 'lukasgallegosguty-beep/fiscalizacion-web',
  rama: 'main',
  carpeta: 'revision',

  // Quiénes pueden devolver revisiones. Tiene que coincidir con INSPECTORES en
  // scripts/rotacion.py: tests/test_recepcion_correo.py lo comprueba.
  // El sufijo se agrega al nombre del archivo solo cuando el adjunto no dice a
  // qué reporte corresponde y hay que sacarlo del correo original.
  inspectores: {
    'emillan@ispch.cl': { nombre: 'Emilio Millán', sufijo: 'emillan' },
    'lgallegos@ispch.cl': { nombre: 'Lukas Gallegos', sufijo: 'lgallegos' },
    'mmedina@ispch.cl': { nombre: 'María Inés Medina', sufijo: 'mmedina' },
  },
  dominio: 'ispch.cl',

  // A quién se avisa cuando algo no se pudo cargar.
  avisarA: 'lgallegos@ispch.cl',

  // Exige que Google haya autenticado el correo como enviado desde el dominio
  // (SPF, DKIM o DMARC). Sin esto cualquiera podría hacerse pasar por un
  // inspector, y la rutina lee las observaciones del inspector como
  // instrucciones para la búsqueda.
  verificarRemitente: true,

  diasHaciaAtras: 10,
  maxMensajesPorCorrida: 25,
  tamanoMaximoMB: 10,
};

// Las categorías, iguales a CATEGORIAS de scripts/rotacion.py (el test también
// lo comprueba). Sirven para no confirmarle al inspector un archivo que la
// rutina después no va a poder atribuir.
const CATEGORIAS = [
  'guantes-quirurgicos', 'guantes-examinacion', 'preservativos-masculinos',
  'preservativos-femeninos', 'agujas-hipodermicas', 'jeringas-hipodermicas',
  'jeringas-con-agujas', 'desfibriladores-dea', 'autotest-vih', 'kits-vih-profesional',
];

const API = 'https://api.github.com/repos/';
const PROCESADO = 'procesado:';
const ALERTADO = 'alertado:';
const DIAS_MEMORIA = 60;
const MARCA_ASUNTO = 'fiscalizacion web dm';
const ETIQUETA_CARGADA = 'Fiscalización web/Revisión cargada';
const ETIQUETA_PROBLEMA = 'Fiscalización web/Revisión con problema';
const RE_CONSOLIDADO = /^Consolidado_Mensual_DM_.*\d{2}[-_. ]?\d{4}/i;
const RE_FECHA = /(\d{2})[-_. ]?(\d{2})[-_. ]?(\d{4})/;
const RE_MES = /(\d{2})[-_. ]?(\d{4})/;
const RE_ENLACE = /resultados\/((?:Fiscalizacion_Web_DM|Consolidado_Mensual_DM)_[^\s"'<>\/?#&]+?\.xlsx)/gi;

// Las palabras que delatan una categoría en un nombre mal puesto («guantes»,
// «jeringas»...). Las de menos de cuatro letras (con, dea, vih) se dejan fuera
// porque aparecen dentro de cualquier palabra.
const PALABRAS_CATEGORIA = CATEGORIAS.join('-').split('-')
  .filter((p, i, todas) => p.length >= 4 && todas.indexOf(p) === i);


// ─── Lo que se ejecuta ──────────────────────────────────────────────────────

/** Lo llama el activador cada 15 minutos. También se puede ejecutar a mano. */
function procesarRevisiones() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.log('Hay otra corrida en curso: esta se salta.');
    return null;
  }
  try {
    return procesar_();
  } catch (e) {
    // Un error que queda solo en el registro de ejecuciones no lo ve nadie.
    alertarUnaVez_(PropertiesService.getScriptProperties(), 'error:' + hoy_(),
      'el script falló',
      'La recepción de revisiones se cayó con este error y no terminó de revisar el correo:\n\n' +
      (e && e.stack ? e.stack : String(e)) +
      '\n\nSe vuelve a intentar sola cada 15 minutos. Este aviso no se repite hoy.');
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/** Una vez, al instalar: comprueba el token, crea el activador y las etiquetas. */
function instalar() {
  probarConexion();
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === 'procesarRevisiones') ScriptApp.deleteTrigger(t);
  }
  ScriptApp.newTrigger('procesarRevisiones').timeBased().everyMinutes(15).create();
  etiqueta_(ETIQUETA_CARGADA);
  etiqueta_(ETIQUETA_PROBLEMA);
  console.log('Listo: el script revisa el correo cada 15 minutos. ' +
    'Sigue con la prueba del paso 5 de INSTALAR.md.');
}

/** Apaga la recepción: borra el activador. El correo y el repositorio no se tocan. */
function desinstalar() {
  let n = 0;
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === 'procesarRevisiones') { ScriptApp.deleteTrigger(t); n++; }
  }
  console.log(n ? 'Apagado: ya no se revisa el correo.' : 'No había nada encendido.');
}

/** Comprueba que el token puede leer y escribir en el repositorio. */
function probarConexion() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    throw new Error('Falta GITHUB_TOKEN en las propiedades del proyecto (INSTALAR.md, paso 3).');
  }
  const lectura = UrlFetchApp.fetch(urlContenido_(CONFIG.carpeta + '/README.md') +
    '?ref=' + encodeURIComponent(CONFIG.rama),
    { method: 'get', headers: cabeceras_(token), muteHttpExceptions: true });
  if (lectura.getResponseCode() !== 200) {
    throw new Error(errorGithub_(lectura.getResponseCode(), lectura.getContentText()));
  }
  // Una escritura sin contenido: GitHub revisa el permiso antes que el
  // contenido, así que un 422 significa «tienes permiso, pero falta el
  // archivo», sin crear nada en el repositorio.
  const escritura = UrlFetchApp.fetch(urlContenido_(CONFIG.carpeta + '/.prueba-de-permiso'), {
    method: 'put', headers: cabeceras_(token), contentType: 'application/json',
    payload: JSON.stringify({ message: 'prueba de permiso', branch: CONFIG.rama }),
    muteHttpExceptions: true,
  });
  if (escritura.getResponseCode() !== 422) {
    throw new Error(errorGithub_(escritura.getResponseCode(), escritura.getContentText()));
  }
  console.log('Conexión con GitHub: OK. El token puede leer y escribir en ' + CONFIG.repositorio + '.');
  return true;
}


// ─── El recorrido del correo ────────────────────────────────────────────────

function procesar_() {
  const props = PropertiesService.getScriptProperties();
  olvidarAntiguos_(props);
  const token = props.getProperty('GITHUB_TOKEN');
  if (!token) {
    alertarUnaVez_(props, 'sin-token', 'falta el token de GitHub',
      'El script no tiene GITHUB_TOKEN en las propiedades del proyecto, así que no puede ' +
      'cargar ninguna revisión. Ver INSTALAR.md, pasos 1 y 3.');
    return { cargados: 0, problemas: 0, pendientes: 0, retenidos: 0, sinToken: true };
  }
  const yo = Session.getEffectiveUser().getEmail().toLowerCase();
  const resumen = { cargados: 0, problemas: 0, pendientes: 0, retenidos: 0 };
  let vistos = 0;
  for (const hilo of buscarHilos_()) {
    const mensajes = hilo.getMessages();
    for (const msg of mensajes) {
      const clave = PROCESADO + msg.getId();
      if (props.getProperty(clave)) continue;
      const remitente = correoDe_(msg.getFrom());
      if (!remitente.endsWith('@' + CONFIG.dominio)) continue;
      if (vistos >= CONFIG.maxMensajesPorCorrida) return resumen;  // el resto, en la próxima
      vistos++;
      const r = procesarMensaje_(props, token, yo, hilo, mensajes, msg, remitente);
      // Lo pendiente y lo retenido no se marcan: se vuelven a mirar en la
      // próxima corrida, mientras tengan menos de diasHaciaAtras días.
      if (r === 'pendiente') { resumen.pendientes++; continue; }
      if (r === 'retenido') { resumen.retenidos++; continue; }
      props.setProperty(clave, new Date().toISOString());
      if (r === 'cargado') resumen.cargados++;
      if (r === 'problema') resumen.problemas++;
    }
  }
  console.log(JSON.stringify(resumen));
  return resumen;
}

function buscarHilos_() {
  const consulta = 'from:' + CONFIG.dominio + ' newer_than:' + CONFIG.diasHaciaAtras + 'd ' +
    '{filename:xlsx filename:xls filename:xlsm filename:ods filename:dat ' +
    'subject:fiscalización subject:fiscalizacion}';
  const hilos = [];
  for (let inicio = 0; inicio < 200; inicio += 50) {
    const pagina = GmailApp.search(consulta, inicio, 50);
    hilos.push.apply(hilos, pagina);
    if (pagina.length < 50) break;
  }
  return hilos;
}

/**
 * Devuelve 'cargado', 'problema' o 'ignorado' (el correo queda procesado),
 * 'pendiente' (falló GitHub) o 'retenido' (no se pudo verificar el remitente).
 * Los dos últimos se reintentan en la próxima corrida.
 */
function procesarMensaje_(props, token, yo, hilo, mensajes, msg, remitente) {
  const adjuntos = msg.getAttachments({ includeInlineImages: false, includeAttachments: true });
  // «~$...» es el archivo de bloqueo que deja Excel abierto, no la planilla.
  const esExcel = a => /\.xlsx$/i.test(limpiarNombre_(a.getName())) && !/^~\$/.test(limpiarNombre_(a.getName()));
  const excels = adjuntos.filter(esExcel);
  const delReporte = esHiloDeLaRutina_(hilo, mensajes, yo);
  const inspector = CONFIG.inspectores[remitente];

  if (!inspector) {
    const pareceRevision = delReporte || excels.some(a => nombreValido_(limpiarNombre_(a.getName())));
    if (!pareceRevision) return 'ignorado';  // un correo del ISP que no es una revisión
    alertar_('Excel de una dirección que no está en la lista',
      'Llegó un Excel de ' + remitente + ', que no está en la lista de inspectores del script, ' +
      'y no se cargó.\n\n' +
      'Si es un inspector que escribe desde otra dirección, agrégala en CONFIG.inspectores ' +
      '(en script.google.com y en integraciones/recepcion-correo/recepcion.gs) y en INSPECTORES ' +
      'de scripts/rotacion.py, y pídele que lo vuelva a enviar.\n\n' + describir_(msg, hilo));
    etiquetar_(hilo, ETIQUETA_PROBLEMA);
    return 'problema';
  }

  const otros = adjuntos.filter(a => !esExcel(a) && !/^image\//i.test(a.getContentType()));
  if (!excels.length && !(delReporte && otros.length)) {
    return 'ignorado';  // una respuesta sin archivo, o con la firma como único adjunto
  }

  if (CONFIG.verificarRemitente && !remitenteAutentico_(msg, remitente)) {
    const resultados = autenticaciones_(msg.getRawContent());
    alertarUnaVez_(props, 'retenido:' + msg.getId(), 'Excel retenido: no se pudo verificar quién lo mandó',
      'Llegó un Excel de ' + remitente + ' que Google no pudo autenticar como enviado desde ' +
      CONFIG.dominio + ' (ni SPF, ni DKIM, ni DMARC), y no se cargó. Puede ser alguien haciéndose ' +
      'pasar por un inspector: la rutina lee las observaciones del inspector como instrucciones.\n\n' +
      'El correo queda retenido, sin respuesta al remitente.\n' +
      '- Si es legítimo, sube el archivo a mano a revision/.\n' +
      '- Si esto pasa con todos los correos de ' + CONFIG.dominio + ', cambia verificarRemitente ' +
      'a false en el script, en script.google.com: los correos retenidos de los últimos ' +
      CONFIG.diasHaciaAtras + ' días se cargan solos en la corrida siguiente.\n\n' +
      'Resultado de la autenticación de Google:\n' +
      (resultados.length ? resultados.join('\n') : '(el correo no trae Authentication-Results de Google)') +
      '\n\n' + describir_(msg, hilo));
    etiquetar_(hilo, ETIQUETA_PROBLEMA);
    return 'retenido';
  }

  if (!excels.length) {
    msg.reply(textoSinExcel_(inspector, otros));
    etiquetar_(hilo, ETIQUETA_PROBLEMA);
    return 'problema';
  }

  // El nombre del correo original solo sirve si hay un único Excel: con dos,
  // no se sabe a cuál de los dos le corresponde.
  const delHilo = excels.length === 1 ? nombreDelHilo_(mensajes, yo, msg) : null;
  const resultados = excels.map(adj => {
    const r = { adjunto: limpiarNombre_(adj.getName()) };
    r.nombre = nombreDestino_(r.adjunto, delHilo, inspector);
    if (!r.nombre) {
      r.problema = 'sin-identificar';
    } else if (adj.getSize() > CONFIG.tamanoMaximoMB * 1024 * 1024) {
      r.problema = 'muy-grande';
    } else {
      try {
        Object.assign(r, subirAGithub_(token, CONFIG.carpeta + '/' + r.nombre, adj.getBytes(),
          'revisión por correo: ' + r.nombre + ' (de ' + remitente + ')',
          { name: inspector.nombre, email: remitente }));
      } catch (e) {
        r.error = e.message || String(e);
      }
    }
    return r;
  });

  const fallidos = resultados.filter(r => r.error);
  if (fallidos.length) {
    // No se le responde todavía al inspector: se reintenta en 15 minutos y la
    // confirmación sale cuando todo quede arriba. A Lukas se le avisa una vez
    // al día por cada error distinto, no en cada intento.
    alertarUnaVez_(props, 'falla:' + hoy_() + ':' + fallidos[0].error.slice(0, 60),
      'no se pudo cargar una revisión',
      'No pude cargar en GitHub la revisión que mandó ' + remitente + ':\n\n' +
      fallidos.map(r => '  • ' + r.nombre + ': ' + r.error).join('\n') +
      '\n\nEl correo queda pendiente y se reintenta solo cada 15 minutos; el inspector recibe la ' +
      'confirmación cuando se cargue. Este aviso no se repite hoy para el mismo error.\n\n' +
      describir_(msg, hilo));
    return 'pendiente';
  }

  msg.reply(textoConfirmacion_(inspector, resultados));
  const todoBien = resultados.every(r => !r.problema);
  etiquetar_(hilo, todoBien ? ETIQUETA_CARGADA : ETIQUETA_PROBLEMA);
  return todoBien ? 'cargado' : 'problema';
}


// ─── Qué archivo es ─────────────────────────────────────────────────────────

/** Un hilo que empezó con un correo de la rutina: un reporte o el consolidado. */
function esHiloDeLaRutina_(hilo, mensajes, yo) {
  return sinTildes_(hilo.getFirstMessageSubject()).indexOf(MARCA_ASUNTO) !== -1 &&
    mensajes.some(m => correoDe_(m.getFrom()) === yo);
}

/**
 * El nombre del Excel que enlazaba el correo de la rutina, o null. Si Gmail no
 * juntó la respuesta con el correo original en un mismo hilo, se busca el
 * enlace en el texto citado de la propia respuesta.
 */
function nombreDelHilo_(mensajes, yo, msg) {
  const deLaRutina = enlaces_(mensajes.filter(m => correoDe_(m.getFrom()) === yo));
  const lista = deLaRutina.length ? deLaRutina : enlaces_([msg]);
  return lista.length === 1 ? lista[0] : null;
}

function enlaces_(mensajes) {
  const nombres = {};
  for (const m of mensajes) {
    const texto = m.getBody() + '\n' + m.getPlainBody();
    for (const x of texto.matchAll(RE_ENLACE)) nombres[decodificar_(x[1])] = true;
  }
  return Object.keys(nombres);
}

/**
 * Con qué nombre queda en revision/. Si el adjunto ya dice a qué reporte
 * corresponde, se respeta (los inspectores le agregan sus iniciales). Si no, se
 * toma el del correo original y se le agrega el sufijo del remitente, siempre
 * que el nombre del adjunto no lo contradiga.
 */
function nombreDestino_(adjunto, delHilo, inspector) {
  if (nombreValido_(adjunto)) return adjunto;
  if (delHilo && compatibleConElHilo_(adjunto, delHilo)) {
    return delHilo.replace(/\.xlsx$/i, '') + '_' + inspector.sufijo + '.xlsx';
  }
  return null;
}

/**
 * Si el nombre del adjunto no contradice al reporte del hilo: ninguna palabra
 * de otra categoría y ninguna fecha distinta. «Libro1.xlsx» no dice nada y toma
 * el nombre del hilo. «guantes 09-11-2026.xlsx» en el hilo de Autotest VIH es
 * otro reporte: se le pregunta al inspector en vez de adivinar, porque una
 * revisión atribuida al reporte equivocado mueve casos de una categoría a otra.
 */
function compatibleConElHilo_(adjunto, delHilo) {
  const base = adjunto.replace(/\.[^.]*$/, '');
  const plano = compacto_(base);
  const reporte = atribuir_(delHilo);  // null si el hilo es el del consolidado
  const propias = reporte ? reporte.slug.split('-') : [];
  if (PALABRAS_CATEGORIA.some(p => plano.indexOf(p) !== -1 && propias.indexOf(p) === -1)) return false;
  if (reporte && plano.indexOf('consolidado') !== -1) return false;
  const re = reporte ? RE_FECHA : RE_MES;
  const fechaAdjunto = base.match(re);
  const fechaHilo = delHilo.match(re);
  return !fechaAdjunto || !fechaHilo || fechaAdjunto.slice(1).join('') === fechaHilo.slice(1).join('');
}

/** Un nombre que la rutina sabe atribuir: el consolidado, o un reporte con categoría y fecha. */
function nombreValido_(nombre) {
  if (/^Consolidado_Mensual/i.test(nombre)) return RE_CONSOLIDADO.test(nombre);
  return atribuir_(nombre) !== null;
}

/**
 * Lo mismo que atribuir_archivo() de scripts/rotacion.py: la categoría más
 * específica contenida en el nombre (empate = ambiguo) y una fecha válida.
 * tests/test_recepcion_correo.py compara las dos con los nombres reales.
 */
function atribuir_(nombre) {
  const base = nombre.replace(/\.[^.]*$/, '');
  const plano = compacto_(base);
  const candidatos = CATEGORIAS
    .filter(c => plano.indexOf(compacto_(c)) !== -1)
    .map(c => [compacto_(c).length, c])
    .sort((a, b) => b[0] - a[0] || (b[1] > a[1] ? 1 : -1));
  if (!candidatos.length) return null;
  if (candidatos.length > 1 && candidatos[0][0] === candidatos[1][0]) return null;
  const m = base.match(RE_FECHA);
  if (!m) return null;
  const d = +m[1], mes = +m[2], anio = +m[3];
  const f = new Date(Date.UTC(anio, mes - 1, d));
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return null;
  return { slug: candidatos[0][1], fecha: m[3] + '-' + m[2] + '-' + m[1] };
}

/** Como _sin_tildes() de rotacion.py: minúsculas y sin tildes ni eñes. */
function sinTildes_(texto) {
  return String(texto || '').toLowerCase()
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ü/g, 'u').replace(/ñ/g, 'n');
}

/** Como _compacto() de rotacion.py: solo letras y dígitos. */
function compacto_(texto) {
  return sinTildes_(texto).replace(/[^a-z0-9]/g, '');
}

function limpiarNombre_(nombre) {
  return String(nombre || '').split(/[\\/]/).pop()
    .replace(/[\u0000-\u001f\u007f:*?"<>|]/g, '')
    .replace(/\s+/g, ' ').trim()
    .replace(/^\.+/, '')
    .replace(/\.xlsx$/i, '.xlsx');
}


// ─── Quién lo mandó ─────────────────────────────────────────────────────────

function correoDe_(desde) {
  const m = String(desde || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(desde || '')).trim().toLowerCase();
}

function remitenteAutentico_(msg, remitente) {
  const dominio = remitente.split('@')[1];
  return autenticaciones_(msg.getRawContent()).some(v => autenticaDominio_(v, dominio));
}

/** Los Authentication-Results que agregó Google al recibir el correo. */
function autenticaciones_(crudo) {
  const corte = crudo.search(/\r?\n\r?\n/);
  const cabecera = (corte === -1 ? crudo : crudo.slice(0, corte)).replace(/\r?\n[ \t]+/g, ' ');
  return cabecera.split(/\r?\n/)
    .filter(l => /^authentication-results:/i.test(l))
    .map(l => l.replace(/^authentication-results:\s*/i, '').trim())
    .filter(v => /^mx\.google\.com\s*;/i.test(v));
}

/**
 * Si alguna de las tres verificaciones pasó a nombre del dominio (o de un
 * subdominio): DMARC por el From, DKIM por la firma, SPF por el remitente del
 * sobre.
 *
 * Cada propiedad se lee entera y el dominio es lo que va después de la ÚLTIMA
 * arroba: en un remitente como "x@ispch.cl"@malo.com, el dominio verificado es
 * malo.com. Lo que va entre paréntesis son comentarios y no cuenta, porque
 * Google copia ahí textos que vienen del remitente.
 */
function autenticaDominio_(valor, dominio) {
  dominio = dominio.toLowerCase();
  const esPropio = d => d === dominio || d.slice(-(dominio.length + 1)) === '.' + dominio;
  const dominioDe = v => v.replace(/["']/g, '').split('@').pop();
  return valor.toLowerCase().replace(/\([^)]*\)/g, ' ').split(';').some(clausula => {
    const partes = clausula.trim().split(/\s+/);
    const m = partes[0].match(/^(dmarc|dkim|spf)=pass$/);
    if (!m) return false;
    const p = {};
    for (const parte of partes.slice(1)) {
      const i = parte.indexOf('=');
      if (i > 0) p[parte.slice(0, i)] = parte.slice(i + 1);
    }
    const valores = m[1] === 'dmarc' ? [p['header.from']]
      : m[1] === 'dkim' ? [p['header.i'], p['header.d']]
      : [p['smtp.mailfrom']];
    return valores.some(v => v !== undefined && esPropio(dominioDe(v)));
  });
}


// ─── GitHub ─────────────────────────────────────────────────────────────────

function subirAGithub_(token, ruta, bytes, mensaje, autor) {
  const url = urlContenido_(ruta);
  const actual = UrlFetchApp.fetch(url + '?ref=' + encodeURIComponent(CONFIG.rama),
    { method: 'get', headers: cabeceras_(token), muteHttpExceptions: true });
  let sha = null;
  if (actual.getResponseCode() === 200) {
    sha = JSON.parse(actual.getContentText()).sha;
  } else if (actual.getResponseCode() !== 404) {
    throw new Error(errorGithub_(actual.getResponseCode(), actual.getContentText()));
  }
  const resultado = { url: 'https://github.com/' + CONFIG.repositorio + '/blob/' + CONFIG.rama + '/' +
    ruta.split('/').map(encodeURIComponent).join('/') };
  if (sha && sha === shaBlob_(bytes)) return Object.assign(resultado, { igual: true });

  const cuerpo = { message: mensaje, content: Utilities.base64Encode(bytes), branch: CONFIG.rama, author: autor };
  if (sha) cuerpo.sha = sha;
  const r = UrlFetchApp.fetch(url, {
    method: 'put', headers: cabeceras_(token), contentType: 'application/json',
    payload: JSON.stringify(cuerpo), muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200 && r.getResponseCode() !== 201) {
    throw new Error(errorGithub_(r.getResponseCode(), r.getContentText()));
  }
  return Object.assign(resultado, { reemplazo: sha !== null });
}

function urlContenido_(ruta) {
  return API + CONFIG.repositorio + '/contents/' + ruta.split('/').map(encodeURIComponent).join('/');
}

function cabeceras_(token) {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/** El SHA-1 con que git identifica el contenido: si coincide, el archivo ya está igual. */
function shaBlob_(bytes) {
  const cabecera = Array.from('blob ' + bytes.length + '\u0000', c => c.charCodeAt(0));
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, cabecera.concat(bytes))
    .map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function errorGithub_(codigo, texto) {
  let detalle = String(texto || '');
  try { detalle = JSON.parse(texto).message || detalle; } catch (e) { /* no era JSON */ }
  detalle = detalle.slice(0, 300);
  if (codigo === 401) {
    return 'GitHub rechazó el token (401): probablemente venció. Crea uno nuevo y reemplaza ' +
      'GITHUB_TOKEN (INSTALAR.md, pasos 1 y 3).';
  }
  if (codigo === 403) {
    return 'GitHub negó el permiso (403). El token tiene que tener «Contents: Read and write» ' +
      'sobre el repositorio. Detalle: ' + detalle;
  }
  if (codigo === 404) {
    return 'GitHub no encuentra el repositorio, o el token no tiene acceso a él (404). Revisa que ' +
      'el token incluya ' + CONFIG.repositorio + '.';
  }
  if (codigo === 409) return 'Conflicto al escribir en GitHub (409): el archivo cambió mientras se subía.';
  return 'GitHub respondió ' + codigo + ': ' + detalle;
}


// ─── Textos ─────────────────────────────────────────────────────────────────

const FIRMA = '\n\n— Recepción automática de revisiones · fiscalización web DM\n' +
  '(Lo envía un script. Si algo no calza, escríbele a ' + CONFIG.avisarA + '.)';

const MOTIVOS = {
  'sin-identificar': 'no sé a qué reporte corresponde.',
  'muy-grande': 'pesa más de ' + CONFIG.tamanoMaximoMB + ' MB; revisa que sea el Excel del reporte.',
};

const AYUDA_NOMBRE =
  'Para que se cargue solo, haz una de estas dos cosas:\n' +
  '  1. Responde el correo original del reporte (el que trae el enlace de descarga) con el Excel adjunto.\n' +
  '  2. O deja el nombre del archivo como venía: Fiscalizacion_Web_DM_<categoría>_<fecha>.xlsx. ' +
  'Puedes agregarle tus iniciales al final.';

function textoConfirmacion_(inspector, resultados) {
  const bien = resultados.filter(r => !r.problema);
  const mal = resultados.filter(r => r.problema);
  let t = 'Hola, ' + inspector.nombre + ':\n\n';
  if (bien.length) {
    t += (bien.length === 1 ? 'Tu revisión quedó cargada' : 'Tus revisiones quedaron cargadas') +
      ' en el repositorio:\n\n' +
      bien.map(r => '  • ' + r.nombre +
        (r.igual ? '  (ya estaba cargado, idéntico)' : r.reemplazo ? '  (reemplazó la versión anterior)' : '') +
        '\n    ' + r.url).join('\n') +
      '\n\nLa rutina ' + (bien.length === 1 ? 'la toma' : 'las toma') + ' desde su próxima corrida. ' +
      'Si necesitas corregir algo, responde de nuevo con el archivo con el mismo nombre: reemplaza al anterior.';
  }
  if (mal.length) {
    t += (bien.length ? '\n\nPero no' : 'No') + ' pude cargar:\n\n' +
      mal.map(r => '  • ' + r.adjunto + ': ' + MOTIVOS[r.problema]).join('\n');
    if (mal.some(r => r.problema === 'sin-identificar')) t += '\n\n' + AYUDA_NOMBRE;
  }
  return t + FIRMA;
}

function textoSinExcel_(inspector, otros) {
  return 'Hola, ' + inspector.nombre + ':\n\n' +
    'Tu respuesta no traía un Excel (.xlsx), así que no se cargó nada. Llegó: ' +
    otros.map(a => a.getName()).join(', ') + '.\n\n' +
    'Vuelve a responder este correo con el Excel revisado adjunto, en formato .xlsx. Si tu correo ' +
    'lo convierte en «winmail.dat», cambia el formato del mensaje a HTML antes de enviarlo.' + FIRMA;
}

function describir_(msg, hilo) {
  return 'Correo: «' + msg.getSubject() + '», ' +
    Utilities.formatDate(msg.getDate(), 'America/Santiago', 'dd-MM-yyyy HH:mm') + '\n' + hilo.getPermalink();
}


// ─── Utilidades ─────────────────────────────────────────────────────────────

function alertar_(asunto, cuerpo) {
  GmailApp.sendEmail(CONFIG.avisarA, 'ALERTA — recepción de revisiones fiscalización web DM: ' + asunto,
    cuerpo + '\n\n— Recepción automática de revisiones (script en script.google.com, ver ' +
    'integraciones/recepcion-correo/INSTALAR.md)');
}

function alertarUnaVez_(props, clave, asunto, cuerpo) {
  if (props.getProperty(ALERTADO + clave)) return false;
  alertar_(asunto, cuerpo);
  props.setProperty(ALERTADO + clave, new Date().toISOString());
  return true;
}

/** Lo procesado hace más de DIAS_MEMORIA días ya no aparece en la búsqueda. */
function olvidarAntiguos_(props) {
  const limite = Date.now() - DIAS_MEMORIA * 864e5;
  const todas = props.getProperties();
  for (const clave of Object.keys(todas)) {
    if (clave.indexOf(PROCESADO) !== 0 && clave.indexOf(ALERTADO) !== 0) continue;
    const t = Date.parse(todas[clave]);
    if (!isNaN(t) && t < limite) props.deleteProperty(clave);
  }
}

function etiqueta_(nombre) {
  const existente = GmailApp.getUserLabelByName(nombre);
  if (existente) return existente;
  const padre = nombre.split('/')[0];
  if (padre !== nombre && !GmailApp.getUserLabelByName(padre)) GmailApp.createLabel(padre);
  return GmailApp.createLabel(nombre);
}

function etiquetar_(hilo, nombre) {
  try {
    hilo.addLabel(etiqueta_(nombre));
  } catch (e) {
    console.log('No se pudo etiquetar el hilo: ' + e);  // la etiqueta es solo para mirar
  }
}

function decodificar_(texto) {
  try { return decodeURIComponent(texto); } catch (e) { return texto; }
}

function hoy_() {
  return new Date().toISOString().slice(0, 10);
}
