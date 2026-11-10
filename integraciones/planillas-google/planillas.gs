/**
 * Planillas en línea · fiscalización web de DM (ISP / ANDIM)
 *
 * Corre cada 15 minutos en la cuenta de Google desde la que salen los correos de
 * las rutinas (qf.lukasgallegos@gmail.com) y hace tres cosas:
 *
 * 1. PUBLICA. Cada reporte que una rutina deja en resultados/, y cada
 *    consolidado mensual, se convierte en una planilla de Google en la carpeta
 *    «Fiscalización web DM» de ese Drive, que se abre con su enlace, sin cuenta
 *    de Google. Al inspector de turno le llega un correo con el enlace; el del
 *    consolidado, a los tres.
 * 2. GUARDA. Lo que se escribe en las planillas se copia solo a revision/ del
 *    repositorio, con el nombre del reporte, unos minutos después de la última
 *    edición. Las búsquedas y el consolidado leen esa carpeta: así trabajan con
 *    lo último que escribieron los inspectores, sin que nadie suba nada.
 * 3. RECIBE POR CORREO, como respaldo. Un Excel que llega respondiendo un correo
 *    se carga en revision/ como antes, salvo que su reporte tenga planilla: en
 *    ese caso se le contesta con el enlace, para que no haya dos versiones de la
 *    misma revisión.
 *
 * Los archivos pasan entre GitHub y Google directamente, sin la rutina de Claude
 * de por medio. Un binario que pasa por el modelo como texto llega corrupto: así
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

  // Los inspectores. Tiene que coincidir con INSPECTORES en scripts/rotacion.py:
  // tests/test_planillas_google.py lo comprueba. El sufijo se usa en la
  // recepción por correo, cuando el adjunto no dice a qué reporte corresponde.
  inspectores: {
    'emillan@ispch.cl': { nombre: 'Emilio Millán', sufijo: 'emillan' },
    'lgallegos@ispch.cl': { nombre: 'Lukas Gallegos', sufijo: 'lgallegos' },
    'mmedina@ispch.cl': { nombre: 'María Inés Medina', sufijo: 'mmedina' },
  },
  dominio: 'ispch.cl',

  // A quién se avisa cuando algo falla.
  avisarA: 'lgallegos@ispch.cl',

  // ── Planillas en línea ────────────────────────────────────────────────────
  // La carpeta del Drive donde quedan las planillas, en «Mi unidad». Se crea sola.
  carpetaDrive: 'Fiscalización web DM',
  // Cómo se abren las planillas: con su enlace, sin cuenta de Google. Cualquiera
  // que tenga el enlace puede editar; los enlaces solo van en los correos a los
  // inspectores, y la carpeta queda privada. Así se decidió el 10-11-2026,
  // porque Google no deja compartir con las cuentas del ISP: ispch.cl no recibe
  // archivos externos, y Emilio y María Inés no tienen cuenta de Google con ese
  // correo.
  compartirConEnlace: true,
  // Cuentas de Google con las que, además, se comparte la carpeta (opcional).
  // Las @ispch.cl no sirven, por lo mismo.
  cuentasGoogle: [],
  // Los reportes anteriores no se publican: se revisaron con el Excel.
  publicarDesde: '2026-11-09',
  // Lo escrito en una planilla se copia a revision/ cuando lleva este tiempo sin
  // editarse: una sesión de revisión queda en un cambio, y no en uno por celda.
  minutosSinEditar: 5,

  // ── Recepción por correo (respaldo) ───────────────────────────────────────
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
// rutina después no va a poder atribuir, y para nombrar las carpetas.
const CATEGORIAS = [
  'guantes-quirurgicos', 'guantes-examinacion', 'preservativos-masculinos',
  'preservativos-femeninos', 'agujas-hipodermicas', 'jeringas-hipodermicas',
  'jeringas-con-agujas', 'desfibriladores-dea', 'autotest-vih', 'kits-vih-profesional',
];
const NOMBRES_CATEGORIA = {
  'guantes-quirurgicos': 'Guantes quirúrgicos de látex',
  'guantes-examinacion': 'Guantes de examen médico',
  'preservativos-masculinos': 'Preservativos masculinos (látex y sintéticos)',
  'preservativos-femeninos': 'Preservativos femeninos',
  'agujas-hipodermicas': 'Agujas hipodérmicas',
  'jeringas-hipodermicas': 'Jeringas hipodérmicas',
  'jeringas-con-agujas': 'Jeringas con agujas hipodérmicas',
  'desfibriladores-dea': 'Desfibriladores externos automáticos (DEA)',
  'autotest-vih': 'Autotest VIH',
  'kits-vih-profesional': 'Kits VIH uso profesional',
};
const CARPETA_CONSOLIDADOS = 'Consolidados mensuales';

const API = 'https://api.github.com/repos/';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_ABOUT = 'https://www.googleapis.com/drive/v3/about';
const SUBIDA = 'https://www.googleapis.com/upload/drive/v3/files';
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TIPO_PLANILLA = 'application/vnd.google-apps.spreadsheet';
const TIPO_CARPETA = 'application/vnd.google-apps.folder';

// Lo que el script recuerda, en las propiedades del proyecto.
const PROCESADO = 'procesado:';        // un correo ya procesado
const ALERTADO = 'alertado:';          // un aviso ya enviado
const PLANILLA = 'planilla:';          // cada planilla publicada, por el nombre del Excel
const CARPETA_DE = 'carpeta:';         // las carpetas del Drive: raiz, consolidados, <slug>
const ESPEJO_HASTA = 'espejo:hasta';   // hasta cuándo se revisaron las ediciones
const DIAS_MEMORIA = 60;
// Un reporte de hace más de esto ya no se publica, y el registro de su planilla
// se olvida: las propiedades del proyecto admiten 500 KB y el registro crece unos
// 130 KB por año. A esa altura el reporte está cerrado hace rato.
const DIAS_PLANILLAS = 400;

const MARCA_ASUNTO = 'fiscalizacion web dm';
const ETIQUETA_CARGADA = 'Fiscalización web/Revisión cargada';
const ETIQUETA_PROBLEMA = 'Fiscalización web/Revisión con problema';
const RE_CONSOLIDADO = /^Consolidado_Mensual_DM_.*\d{2}[-_. ]?\d{4}/i;
const RE_FECHA = /(\d{2})[-_. ]?(\d{2})[-_. ]?(\d{4})/;
const RE_MES = /(\d{2})[-_. ]?(\d{4})/;
const RE_ENLACE = /resultados\/((?:Fiscalizacion_Web_DM|Consolidado_Mensual_DM)_[^\s"'<>\/?#&]+?\.xlsx)/gi;
// Los nombres exactos que dejan las rutinas en resultados/.
const RE_REPORTE_EXACTO = /^Fiscalizacion_Web_DM_([a-z0-9-]+)_(\d{2})-(\d{2})-(\d{4})\.xlsx$/;
const RE_CONSOLIDADO_EXACTO = /^Consolidado_Mensual_DM_(\d{2})-(\d{4})\.xlsx$/;

// Las columnas que llenan las personas, por hoja. Si alguna tiene algo escrito,
// la planilla tiene trabajo y se copia a revision/.
const COLUMNAS_DE_PERSONAS = [
  { hoja: /^Hallazgos$/, columnas: ['decision final', 'observaciones del inspector'] },
  { hoja: /^Búsquedas/, columnas: ['observaciones del inspector'] },
  { hoja: /^Casos del mes$/, columnas: ['decision final', 'justificacion de la decision'] },
];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Las palabras que delatan una categoría en un nombre mal puesto («guantes»,
// «jeringas»...). Las de menos de cuatro letras (con, dea, vih) se dejan fuera
// porque aparecen dentro de cualquier palabra.
const PALABRAS_CATEGORIA = CATEGORIAS.join('-').split('-')
  .filter((p, i, todas) => p.length >= 4 && todas.indexOf(p) === i);

const ACTIVADORES = ['sincronizar', 'procesarRevisiones'];


// ─── Lo que se ejecuta ──────────────────────────────────────────────────────

/**
 * Lo llama el activador cada 15 minutos: publica los reportes nuevos, guarda lo
 * que se escribió en las planillas y revisa el correo. Si una de las tres partes
 * falla, las otras siguen; se avisa por correo y la ejecución queda en rojo.
 */
function sincronizar() {
  return conCandado_(props => {
    const token = tokenDeGithub_(props);
    if (!token) return { sinToken: true };
    const partes = [
      ['publicar', 'La publicación de los reportes nuevos', publicar_],
      ['guardar', 'La copia de las planillas a revision/', guardarPlanillas_],
      ['correo', 'La revisión del correo', procesar_],
    ];
    const resumen = {};
    const errores = [];
    for (const [parte, descripcion, paso] of partes) {
      try {
        resumen[parte] = paso(props, token);
      } catch (e) {
        resumen[parte] = { error: mensajeDe_(e) };
        errores.push(parte + ': ' + mensajeDe_(e));
        // Un error que queda solo en el registro de ejecuciones no lo ve nadie.
        alertarUnaVez_(props, 'error:' + parte + ':' + hoy_(), 'el script falló (' + parte + ')',
          descripcion + ' se cayó con este error:\n\n' + (e && e.stack ? e.stack : String(e)) +
          '\n\nLo demás siguió funcionando. Se vuelve a intentar sola cada 15 minutos; ' +
          'este aviso no se repite hoy.');
      }
    }
    console.log(JSON.stringify(resumen));
    if (errores.length) throw new Error(errores.join(' | '));
    return resumen;
  });
}

/** Solo el correo, como la recepción de antes. Se puede ejecutar a mano. */
function procesarRevisiones() {
  return conCandado_(props => {
    const token = tokenDeGithub_(props);
    if (!token) return { cargados: 0, problemas: 0, pendientes: 0, retenidos: 0, sinToken: true };
    try {
      return procesar_(props, token);
    } catch (e) {
      alertarUnaVez_(props, 'error:correo:' + hoy_(), 'el script falló (correo)',
        'La revisión del correo se cayó con este error:\n\n' + (e && e.stack ? e.stack : String(e)) +
        '\n\nSe vuelve a intentar sola cada 15 minutos. Este aviso no se repite hoy.');
      throw e;
    }
  });
}

/**
 * Una vez, al instalar (y cada vez que cambie CONFIG): comprueba GitHub y Drive,
 * crea la carpeta de las planillas, la comparte con los inspectores, deja un
 * solo activador y crea las etiquetas del correo.
 */
function instalar() {
  probarConexion();
  probarDrive_();
  const props = PropertiesService.getScriptProperties();
  const raiz = carpetaRaiz_(props);
  const compartida = compartirCarpeta_(props, raiz);
  for (const t of ScriptApp.getProjectTriggers()) {
    if (ACTIVADORES.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  }
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(15).create();
  etiqueta_(ETIQUETA_CARGADA);
  etiqueta_(ETIQUETA_PROBLEMA);
  console.log('Carpeta de las planillas: ' + urlCarpeta_(raiz) + ' — compartida con: ' +
    (compartida.con.join(', ') || 'nadie') + '.' +
    (CONFIG.compartirConEnlace ? ' Cada planilla se abre con su enlace, sin cuenta de Google.' : ''));
  if (compartida.fallidas.length) {
    console.log('NO se pudo compartir con: ' +
      compartida.fallidas.map(f => f.cuenta + ' (' + f.error + ')').join('; ') +
      '. Ver «Si un inspector no puede abrir la planilla» en INSTALAR.md.');
  }
  console.log('Listo: cada 15 minutos se publican los reportes nuevos, se guarda lo que se escribe ' +
    'en las planillas y se revisa el correo. Sigue con el paso 6 de INSTALAR.md.');
}

/** Apaga todo: borra el activador. Las planillas, el correo y el repositorio no se tocan. */
function desinstalar() {
  let n = 0;
  for (const t of ScriptApp.getProjectTriggers()) {
    if (ACTIVADORES.indexOf(t.getHandlerFunction()) !== -1) { ScriptApp.deleteTrigger(t); n++; }
  }
  console.log(n ? 'Apagado: ya no se publica, ni se guarda, ni se revisa el correo.' : 'No había nada encendido.');
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

/**
 * Comprueba que el script puede usar Google Drive. No exige el servicio
 * avanzado «Drive API»: si la API ya responde sin él, se sigue. Si no responde,
 * el error dice qué hacer (errorDrive_).
 */
function probarDrive_() {
  DriveApp.getRootFolder();
  const yo = driveJson_('get', DRIVE_ABOUT + '?fields=user(emailAddress)', null, 'leer la cuenta de Drive');
  console.log('Conexión con Google Drive: OK (' + yo.user.emailAddress + ').' +
    (typeof Drive === 'undefined' ? ' Sin el servicio «Drive API», que en esta cuenta no hace falta.' : ''));
  return true;
}

/**
 * No se ejecuta nunca: está para que Google pida el permiso de Drive completo.
 * Apps Script decide qué permisos pedir leyendo el código, y si de DriveApp solo
 * ve lecturas, pide Drive en solo lectura. Con eso el script no puede crear la
 * carpeta ni las planillas, que se crean con la API de Drive y el mismo
 * permiso: en la primera instalación, el 10-11-2026, falló así («Request had
 * insufficient authentication scopes»). tests/test_planillas_google.py exige que
 * siga aquí.
 */
function pedirPermisoDeEscrituraEnDrive_() {
  DriveApp.createFolder('(no se ejecuta)');
}

function conCandado_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.log('Hay otra corrida en curso: esta se salta.');
    return null;
  }
  try {
    const props = PropertiesService.getScriptProperties();
    olvidarAntiguos_(props);
    return fn(props);
  } finally {
    lock.releaseLock();
  }
}

function tokenDeGithub_(props) {
  const token = props.getProperty('GITHUB_TOKEN');
  if (!token) {
    alertarUnaVez_(props, 'sin-token', 'falta el token de GitHub',
      'El script no tiene GITHUB_TOKEN en las propiedades del proyecto, así que no puede publicar ' +
      'reportes, guardar planillas ni cargar revisiones. Ver INSTALAR.md, pasos 1 y 3.');
  }
  return token;
}


// ─── Publicar: de resultados/ a una planilla ────────────────────────────────

function publicar_(props, token) {
  const arbol = arbolDelRepo_(token);
  const yaRevisados = revisadosEnElRepo_(arbol);
  const resumen = { publicadas: 0, reemplazadas: 0, conservadas: 0, avisadas: 0, omitidas: 0 };
  const errores = [];
  for (const item of arbol) {
    if (item.carpeta !== 'resultados') continue;
    const info = reporteDe_(item.nombre);
    if (!info || !publicable_(info)) continue;
    try {
      let reg = registro_(props, item.nombre);
      if (!reg) {
        reg = retomar_(props, item, info);
        if (!reg && yaRevisados.has(info.clave)) {
          // Volvió revisado por correo antes de tener planilla: ya no hace falta.
          guardarRegistro_(props, item.nombre, { sha: item.sha, revisadoPorCorreo: true });
          resumen.omitidas++;
          continue;
        }
        if (!reg) {
          reg = crearYRegistrar_(props, token, item, info, false);
          resumen.publicadas++;
        }
      } else if (reg.id && reg.sha !== item.sha) {
        resumen[regenerar_(props, token, item, info, reg)]++;
        reg = registro_(props, item.nombre);
      }
      // Antes del correo: el enlace tiene que abrir. También arregla las planillas
      // que se publicaron antes de abrirlas con enlace (las primeras, el 10-11-2026).
      if (reg.id && CONFIG.compartirConEnlace && !reg.enlace) {
        abrirConEnlace_(reg.id);
        reg.enlace = true;
        guardarRegistro_(props, item.nombre, reg);
        resumen.abiertas = (resumen.abiertas || 0) + 1;
      }
      if (reg.id && !reg.avisado && avisar_(props, token, arbol, item, info, reg)) resumen.avisadas++;
    } catch (e) {
      // Uno que falla no detiene a los demás. Sin aviso, queda para la corrida siguiente.
      errores.push(item.nombre + ': ' + mensajeDe_(e));
    }
  }
  if (errores.length) throw new Error(errores.join(' | '));
  return resumen;
}

/**
 * Qué es un archivo de resultados/: un reporte o un consolidado, con lo que hace
 * falta para publicarlo. null si no es ninguno de los dos.
 */
function reporteDe_(nombre) {
  let m = nombre.match(RE_REPORTE_EXACTO);
  if (m) {
    const slug = m[1], d = m[2], mes = m[3], anio = m[4];
    if (CATEGORIAS.indexOf(slug) === -1 || !fechaValida_(+anio, +mes, +d)) return null;
    const fecha = anio + '-' + mes + '-' + d;
    return {
      tipo: 'reporte', nombre: nombre, slug: slug, fecha: fecha, dmy: d + '-' + mes + '-' + anio,
      clave: slug + '|' + fecha, titulo: nombre.replace(/\.xlsx$/, ''), carpeta: NOMBRES_CATEGORIA[slug],
    };
  }
  m = nombre.match(RE_CONSOLIDADO_EXACTO);
  if (m && +m[1] >= 1 && +m[1] <= 12) {
    return {
      tipo: 'consolidado', nombre: nombre, mes: +m[1], anio: +m[2], periodo: m[2] + '-' + m[1],
      clave: 'consolidado|' + m[2] + '-' + m[1], titulo: nombre.replace(/\.xlsx$/, ''),
      carpeta: CARPETA_CONSOLIDADOS,
    };
  }
  return null;
}

function publicable_(info) {
  return vigente_(info) && (info.tipo === 'reporte'
    ? info.fecha >= CONFIG.publicarDesde
    : info.periodo >= CONFIG.publicarDesde.slice(0, 7));
}

/** Si el reporte es de los últimos DIAS_PLANILLAS días. */
function vigente_(info) {
  const limite = new Date(Date.now() - DIAS_PLANILLAS * 864e5).toISOString().slice(0, 10);
  return info.tipo === 'reporte' ? info.fecha >= limite : info.periodo >= limite.slice(0, 7);
}

/** Los reportes que ya tienen una revisión en revision/, por categoría y fecha. */
function revisadosEnElRepo_(arbol) {
  const claves = new Set();
  for (const i of arbol) {
    if (i.carpeta !== CONFIG.carpeta || !/\.xlsx$/i.test(i.nombre)) continue;
    if (/^Consolidado_Mensual/i.test(i.nombre)) {
      const m = i.nombre.match(RE_MES);
      if (m) claves.add('consolidado|' + m[2] + '-' + m[1]);
    } else {
      const a = atribuir_(i.nombre);
      if (a) claves.add(a.slug + '|' + a.fecha);
    }
  }
  return claves;
}

/**
 * Si la planilla ya existe en su carpeta (porque se perdió el registro del
 * script), se retoma en vez de crear otra y volver a escribirle al inspector.
 */
function retomar_(props, item, info) {
  const carpeta = carpetaPara_(props, info);
  const f = buscarEnDrive_("name = '" + comillas_(info.titulo) + "' and '" + carpeta + "' in parents and " +
    "mimeType = '" + TIPO_PLANILLA + "' and trashed = false", 'id,webViewLink')[0];
  if (!f) return null;
  const reg = { id: f.id, url: f.webViewLink, sha: item.sha, sinc: '', avisado: true, retomada: true };
  guardarRegistro_(props, item.nombre, reg);
  return reg;
}

function crearYRegistrar_(props, token, item, info, reemplazo) {
  const archivo = crearPlanilla_(info.titulo, carpetaPara_(props, info), blobDeGithub_(token, item.sha));
  const reg = { id: archivo.id, url: archivo.webViewLink, sha: item.sha, sinc: archivo.modifiedTime, avisado: false };
  if (reemplazo) reg.reemplazo = true;
  guardarRegistro_(props, item.nombre, reg);
  return reg;
}

/**
 * La rutina volvió a generar un reporte que ya tenía planilla (una corrida
 * repetida a mano). Si nadie alcanzó a escribir en ella, se cambia por la nueva
 * y se avisa. Si ya tiene trabajo, se conserva: perder una revisión es peor que
 * quedarse con la versión anterior del reporte.
 */
function regenerar_(props, token, item, info, reg) {
  const viva = vivo_(reg.id);
  if (viva && reg.conservada === item.sha) return 'conservadas';  // ya se avisó
  if (viva && tieneTrabajo_(contenido_(reg.id))) {
    alertarUnaVez_(props, 'conservada:' + item.nombre + ':' + item.sha,
      'un reporte se volvió a generar y su planilla ya tenía revisión',
      'La rutina volvió a generar ' + item.nombre + ', pero su planilla ya tiene lo que escribió el ' +
      'inspector, así que no la reemplacé: sigue siendo la del primer correo.\n\n' +
      'Planilla: ' + reg.url + '\nReporte nuevo: ' + urlGithub_('resultados/' + item.nombre) + '\n\n' +
      'Si el que vale es el reporte nuevo, mueve la planilla a la papelera: en la corrida siguiente ' +
      'se publica la nueva y le llega al inspector.');
    reg.conservada = item.sha;
    guardarRegistro_(props, item.nombre, reg);
    return 'conservadas';
  }
  const anterior = reg.id;
  // Una copia que quedó en revision/ de la planilla anterior ya no corresponde
  // a nada: si se queda, el reporte nuevo contaría como revisado.
  if (reg.espejo) borrarDeGithub_(token, CONFIG.carpeta + '/' + item.nombre, 'planilla en línea reemplazada: ' + item.nombre);
  crearYRegistrar_(props, token, item, info, true);
  if (viva) {
    try {
      driveJson_('patch', DRIVE + '/' + encodeURIComponent(anterior) + '?fields=id', { trashed: true },
        'mover a la papelera la planilla anterior');
    } catch (e) {
      console.log('No se pudo mover a la papelera ' + anterior + ': ' + mensajeDe_(e));
    }
  }
  return 'reemplazadas';
}


// ─── El correo con el enlace ────────────────────────────────────────────────

function avisar_(props, token, arbol, item, info, reg) {
  const hojas = contenido_(reg.id);
  const correo = info.tipo === 'consolidado'
    ? correoDelConsolidado_(info, reg, hojas)
    : correoDelReporte_(info, reg, hojas, historialDe_(token, arbol, info));
  enviar_(correo);
  reg.avisado = true;
  reg.para = correo.para;
  guardarRegistro_(props, item.nombre, reg);
  return true;
}

/** Lo que dejó la rutina en historial/ al guardar el reporte: inspector, feriado, cifras. */
function historialDe_(token, arbol, info) {
  for (const h of arbol) {
    if (h.carpeta !== 'historial' || h.nombre.indexOf(info.fecha + '_') !== 0 || !/\.json$/.test(h.nombre)) continue;
    try {
      const entrada = JSON.parse(textoDe_(blobDeGithub_(token, h.sha)));
      if (entrada.archivo === info.nombre) return entrada;
    } catch (e) {
      console.log('No se pudo leer ' + h.nombre + ': ' + mensajeDe_(e));
    }
  }
  return null;
}

function correoDelReporte_(info, reg, hojas, h) {
  const conInspector = !!(h && h.inspector);
  const para = conInspector ? h.inspector : CONFIG.avisarA;
  const persona = CONFIG.inspectores[para];
  const categoria = (h && h.nombre) || NOMBRES_CATEGORIA[info.slug];
  const r = resumenDelReporte_(hojas);
  const antes = [];
  if (!conInspector) {
    antes.push('No encontré en historial/ a qué inspector le toca este reporte, así que te llega a ti. ' +
      'Reenvíaselo a quien corresponda: los tres pueden abrir la planilla.');
  }
  antes.push('Hola' + (persona ? ', ' + persona.nombre : '') + ':');
  if (h && h.feriado) {
    antes.push('Hoy es feriado (' + h.feriado + '). La búsqueda corrió igual, pero la revisión no corre: ' +
      'este reporte no se te cuenta como pendiente en el cierre del mes.');
  }
  if (reg.reemplazo) {
    antes.push('El reporte se volvió a generar: esta planilla reemplaza a la del correo anterior, que quedó en la papelera.');
  }
  antes.push('La planilla de ' + categoria + ' del ' + info.dmy + ' ya está en línea:');

  const despues = [];
  if (r.sinHallazgos) {
    despues.push('La búsqueda no encontró publicaciones para revisar: la hoja «Hallazgos» trae una sola fila, «Sin hallazgos».');
  } else {
    const detectados = h && typeof h.detectados === 'number' ? h.detectados : r.incluidos + r.anexo;
    let t = 'Se revisaron ' + detectados + ' ofertas en total';
    t += detectados > r.incluidos ? '; la planilla trae las ' + r.incluidos + ' más relevantes (el tope es 10).' : '.';
    t += '\nDe esas ' + r.incluidos + ': ' + r.desglose + '.';
    if (r.anexo) t += '\nLas otras ' + r.anexo + ' están en la hoja «Anexo»: no requieren revisión esta semana.';
    despues.push(t);
    if (r.relevantes.length) {
      despues.push('Los casos más relevantes:\n' + r.relevantes.map((x, i) => '  ' + (i + 1) + '. ' + x).join('\n'));
    }
  }
  if (h && h.notas) despues.push('Notas de la búsqueda: ' + h.notas);
  despues.push('Qué hacer, directamente en la planilla:\n' +
    (r.sinHallazgos
      ? '  1. En «Hallazgos» hay una sola fila. Cuando termines la revisión, escribe «Sin hallazgos» en su ' +
        '«Decisión final»: con eso la planilla cuenta como revisada.\n'
      : '  1. En «Hallazgos», completa «Decisión final» en cada fila: Correcto si la clasificación está bien, ' +
        'Incorrecto si no. Lo que la próxima búsqueda tenga que considerar va en «Observaciones del ' +
        'inspector»: la rutina lo lee como una instrucción.\n') +
    '  2. En «Búsquedas Marketplace», anota en «Observaciones del inspector» las publicaciones que ' +
    'encuentres a mano, con su enlace.\n' +
    '  3. Nada más: no hay que descargar ni devolver nada. Lo que escribes se guarda solo y llega al ' +
    'repositorio unos minutos después de que dejas de editar.' +
    (r.sinHallazgos ? '' : '\nLa planilla cuenta como revisada cuando todas las filas REGISTRADO y NO REGISTRADO ' +
      'tienen su «Decisión final».'));
  if (!(h && h.feriado)) {
    despues.push('Plazo: antes del ' + fechaLarga_(sumarDias_(info.fecha, 7)) + ', cuando vuelve a tocar esta ' +
      'categoría, y siempre antes del martes de cierre del mes.');
  }
  despues.push('Respaldo del reporte en el repositorio: ' + urlGithub_('resultados/' + info.nombre));
  if (CONFIG.compartirConEnlace) despues.unshift(ACCESO_CON_ENLACE);
  return {
    para: para, asunto: 'Fiscalización web DM — ' + categoria + ' — ' + info.dmy,
    antes: antes, enlace: reg.url, textoEnlace: 'Abrir la planilla', despues: despues,
  };
}

function correoDelConsolidado_(info, reg, hojas) {
  const t = tabla_(hojas['Casos del mes']);
  const casos = t ? t.filas.filter(f => String(t.valor(f, 'url')).trim()).length : 0;
  const mes = MESES[info.mes - 1] + ' ' + info.anio;
  const antes = ['Hola:'];
  if (reg.reemplazo) antes.push('El consolidado se volvió a generar: esta planilla reemplaza a la del correo anterior.');
  antes.push('El consolidado de ' + mes + ' ya está en línea, para la reunión de cierre:');
  return {
    para: Object.keys(CONFIG.inspectores).join(','),
    asunto: 'Planilla en línea — Consolidado mensual fiscalización web DM — ' + mes,
    antes: antes, enlace: reg.url, textoEnlace: 'Abrir el consolidado',
    despues: (CONFIG.compartirConEnlace ? [ACCESO_CON_ENLACE] : []).concat([
      'Trae ' + casos + (casos === 1 ? ' caso' : ' casos') + ' en «Casos del mes». La cobertura del mes, las ' +
        'discrepancias y las notas de marketplace están en las otras hojas.',
      'En la reunión, completen en cada caso:\n' +
        '  • «Decisión final»: una de las cuatro de la lista (se genera nueva alerta; falta información, se ' +
        'consultará; se descarta; ya procesado anteriormente en una alerta).\n' +
        '  • «Justificación de la decisión»: el detalle, como el número de alerta o a quién se consulta.',
      'Se guarda solo: queda como acta del mes en el repositorio y sus decisiones entran en las búsquedas ' +
        'siguientes. No hay que devolver nada.',
      'Respaldo en el repositorio: ' + urlGithub_('resultados/' + info.nombre),
    ]),
  };
}

/** Las cifras del reporte, leídas de la planilla misma. */
function resumenDelReporte_(hojas) {
  const t = tabla_(hojas['Hallazgos']);
  const conEnlace = t ? t.filas.filter(f => String(t.valor(f, 'url')).trim()) : [];
  const clase = f => String(t.valor(f, 'clasificacion')).trim().toUpperCase() || 'SIN CLASIFICAR';
  const cuenta = {};
  for (const f of conEnlace) cuenta[clase(f)] = (cuenta[clase(f)] || 0) + 1;
  const orden = Object.keys(cuenta).sort((a, b) =>
    (a === 'NO REGISTRADO' ? 0 : a === 'REGISTRADO' ? 1 : 2) - (b === 'NO REGISTRADO' ? 0 : b === 'REGISTRADO' ? 1 : 2));
  let anexo = 0;
  for (const nombre of Object.keys(hojas)) {
    if (!/^Anexo/.test(nombre)) continue;
    const a = tabla_(hojas[nombre]);
    if (a) anexo += a.filas.filter(f => String(a.valor(f, 'url')).trim()).length;
  }
  return {
    incluidos: conEnlace.length,
    desglose: orden.map(c => cuenta[c] + ' ' + c).join(', '),
    anexo: anexo,
    relevantes: conEnlace.filter(f => clase(f) === 'NO REGISTRADO').slice(0, 3).map(f => {
      const oferente = String(t.valor(f, 'oferente')).trim();
      return String(t.valor(f, 'nombre de dm ofertado')).trim() + (oferente ? ' — ' + oferente : '');
    }),
    sinHallazgos: !conEnlace.length,
  };
}

function enviar_(c) {
  const texto = c.antes.concat([c.enlace], c.despues).join('\n\n') + FIRMA;
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2933">' +
    c.antes.map(t => parrafoHtml_(t)).join('') +
    '<p><a href="' + escapar_(c.enlace) + '" style="display:inline-block;background:#003366;color:#ffffff;' +
    'padding:10px 18px;border-radius:4px;text-decoration:none;font-weight:bold">' + escapar_(c.textoEnlace) +
    '</a><br><span style="font-size:12px;color:#52606d">' + escapar_(c.enlace) + '</span></p>' +
    c.despues.map(t => parrafoHtml_(t)).join('') +
    parrafoHtml_(FIRMA.trim(), 'color:#6b7280;font-size:12px') + '</div>';
  GmailApp.sendEmail(c.para, c.asunto, texto, { htmlBody: html, name: 'Fiscalización web DM' });
}

function parrafoHtml_(texto, estilo) {
  return '<p' + (estilo ? ' style="' + estilo + '"' : '') + '>' +
    enlazar_(escapar_(texto)).replace(/\n/g, '<br>') + '</p>';
}

function escapar_(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function enlazar_(html) {
  return html.replace(/https?:\/\/[^\s<]+/g, u => '<a href="' + u + '">' + u + '</a>');
}


// ─── Guardar: de la planilla a revision/ ────────────────────────────────────

/**
 * Las planillas editadas desde la última pasada se copian a revision/ como
 * Excel, con el nombre del reporte. Solo las que tienen algo escrito por una
 * persona: una planilla intacta en revision/ contaría como revisada.
 */
function guardarPlanillas_(props, token) {
  const porId = {};
  for (const [nombre, reg] of registros_(props)) if (reg.id) porId[reg.id] = nombre;
  const resumen = { guardadas: 0, borradas: 0, sinCambios: 0, esperando: 0 };
  if (!Object.keys(porId).length) return resumen;
  const ahora = Date.now();
  // Con una hora de margen: si una pasada falla o se salta, la siguiente igual
  // ve lo que se editó entremedio.
  const hasta = Date.parse(props.getProperty(ESPEJO_HASTA) || '') || ahora - 2 * 864e5;
  const desde = new Date(Math.min(hasta, ahora) - 3600e3).toISOString().replace(/\.\d+Z$/, 'Z');
  const errores = [];
  for (const f of buscarEnDrive_("mimeType = '" + TIPO_PLANILLA + "' and trashed = false and modifiedTime > '" +
    desde + "'", 'id,modifiedTime,lastModifyingUser(displayName,emailAddress)')) {
    const nombre = porId[f.id];
    if (!nombre) continue;
    try {
      const r = guardarUna_(props, token, nombre, f, ahora);
      if (r) resumen[r]++;
    } catch (e) {
      errores.push(nombre + ': ' + mensajeDe_(e));
    }
  }
  // Con errores no se avanza la marca: lo que falló se vuelve a intentar.
  if (errores.length) throw new Error(errores.join(' | '));
  props.setProperty(ESPEJO_HASTA, new Date(ahora).toISOString());
  return resumen;
}

function guardarUna_(props, token, nombre, f, ahora) {
  const reg = registro_(props, nombre);
  const editada = Date.parse(f.modifiedTime);
  if (reg.sinc && editada <= Date.parse(reg.sinc)) return null;                // ya vista
  if (ahora - editada < CONFIG.minutosSinEditar * 6e4) return 'esperando';     // la están editando
  const hojas = contenido_(f.id);
  const ruta = CONFIG.carpeta + '/' + nombre;
  let resultado = 'sinCambios';
  if (!tieneTrabajo_(hojas)) {
    // Si borraron todo lo que habían escrito, deja de contar como revisada.
    if (reg.espejo) {
      borrarDeGithub_(token, ruta, 'planilla en línea vaciada: ' + nombre);
      reg.espejo = false;
      reg.huella = '';
      resultado = 'borradas';
    }
  } else {
    const huella = huella_(hojas);
    if (!reg.espejo || huella !== reg.huella) {
      const quien = f.lastModifyingUser || {};
      subirAGithub_(token, ruta, exportar_(f.id),
        'planilla en línea: ' + nombre + (quien.displayName ? ' (editó ' + quien.displayName + ')' : ''),
        quien.emailAddress ? { name: quien.displayName || quien.emailAddress, email: quien.emailAddress } : null);
      reg.espejo = true;
      reg.huella = huella;
      resultado = 'guardadas';
    }
  }
  reg.sinc = f.modifiedTime;
  guardarRegistro_(props, nombre, reg);
  return resultado;
}

/** Todas las hojas de una planilla: nombre → filas, con el encabezado en la primera. */
function contenido_(id) {
  const hojas = {};
  for (const h of SpreadsheetApp.openById(id).getSheets()) hojas[h.getName()] = h.getDataRange().getValues();
  return hojas;
}

/** Una hoja con encabezado: las filas con algo escrito y el valor de una columna por su nombre. */
function tabla_(valores) {
  if (!valores || !valores.length) return null;
  const celda = v => (v === null || v === undefined ? '' : v);
  const encabezado = valores[0].map(v => sinTildes_(String(celda(v)).trim()));
  return {
    filas: valores.slice(1).filter(f => f.some(v => String(celda(v)).trim() !== '')),
    valor: (fila, columna) => {
      const i = encabezado.indexOf(columna);
      return i === -1 ? '' : celda(fila[i]);
    },
  };
}

/** Si alguien escribió en alguna de las columnas que llenan las personas. */
function tieneTrabajo_(hojas) {
  return Object.keys(hojas).some(nombre => {
    const regla = COLUMNAS_DE_PERSONAS.find(r => r.hoja.test(nombre));
    const t = regla && tabla_(hojas[nombre]);
    return !!t && t.filas.some(f => regla.columnas.some(c => String(t.valor(f, c)).trim() !== ''));
  });
}

/** Una huella del contenido, para no hacer un commit cuando no cambió nada. */
function huella_(hojas) {
  const datos = JSON.stringify(Object.keys(hojas).sort().map(n => [n, hojas[n]]));
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, datos, Utilities.Charset.UTF_8)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function exportar_(id) {
  const r = UrlFetchApp.fetch(DRIVE + '/' + encodeURIComponent(id) + '/export?mimeType=' + encodeURIComponent(TIPO_XLSX),
    { method: 'get', headers: autorizacionDrive_(), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) {
    throw new Error(errorDrive_(r.getResponseCode(), r.getContentText(), 'exportar la planilla ' + id));
  }
  return r.getContent();
}


// ─── Registro de las planillas ──────────────────────────────────────────────

function registro_(props, nombre) {
  const v = props.getProperty(PLANILLA + nombre);
  return v ? JSON.parse(v) : null;
}

function guardarRegistro_(props, nombre, reg) {
  props.setProperty(PLANILLA + nombre, JSON.stringify(reg));
}

function registros_(props) {
  const todas = props.getProperties();
  return Object.keys(todas).filter(k => k.indexOf(PLANILLA) === 0)
    .map(k => [k.slice(PLANILLA.length), JSON.parse(todas[k])]);
}

/** La planilla del reporte al que corresponde un nombre de archivo, aunque venga renombrado. */
function planillaDelReporte_(props, nombre) {
  let canonico = null;
  if (/^Consolidado_Mensual/i.test(nombre)) {
    const m = nombre.match(RE_MES);
    if (m) canonico = 'Consolidado_Mensual_DM_' + m[1] + '-' + m[2] + '.xlsx';
  } else {
    const a = atribuir_(nombre);
    if (a) {
      const p = a.fecha.split('-');
      canonico = 'Fiscalizacion_Web_DM_' + a.slug + '_' + p[2] + '-' + p[1] + '-' + p[0] + '.xlsx';
    }
  }
  const reg = canonico ? registro_(props, canonico) : null;
  return reg && reg.id ? reg : null;
}


// ─── Google Drive ───────────────────────────────────────────────────────────

/** La carpeta «Fiscalización web DM». Si no existe, se crea y se comparte. */
function carpetaRaiz_(props) {
  const guardada = props.getProperty(CARPETA_DE + 'raiz');
  if (guardada && vivo_(guardada)) return guardada;
  const id = buscarOCrearCarpeta_(CONFIG.carpetaDrive, 'root');
  props.setProperty(CARPETA_DE + 'raiz', id);
  compartirCarpeta_(props, id);
  return id;
}

/** La subcarpeta de la categoría, o la de los consolidados. */
function carpetaPara_(props, info) {
  const raiz = carpetaRaiz_(props);
  const clave = CARPETA_DE + (info.tipo === 'consolidado' ? 'consolidados' : info.slug);
  const guardada = props.getProperty(clave);
  if (guardada && vivo_(guardada)) return guardada;
  const id = buscarOCrearCarpeta_(info.carpeta, raiz);
  props.setProperty(clave, id);
  return id;
}

function buscarOCrearCarpeta_(nombre, padre) {
  const f = buscarEnDrive_("name = '" + comillas_(nombre) + "' and mimeType = '" + TIPO_CARPETA + "' and '" +
    padre + "' in parents and trashed = false", 'id')[0];
  if (f) return f.id;
  return driveJson_('post', DRIVE + '?fields=id', { name: nombre, mimeType: TIPO_CARPETA, parents: [padre] },
    'crear la carpeta ' + nombre).id;
}

/**
 * Que cualquiera con el enlace pueda editar la planilla, sin cuenta de Google.
 * No queda visible en búsquedas: hay que tener el enlace. Si ya estaba abierta,
 * no hace nada.
 */
function abrirConEnlace_(id) {
  const actuales = driveJson_('get', DRIVE + '/' + encodeURIComponent(id) + '/permissions?fields=' +
    encodeURIComponent('permissions(type,role)'), null, 'leer cómo está compartida la planilla').permissions || [];
  if (actuales.some(p => p.type === 'anyone' && p.role === 'writer')) return false;
  driveJson_('post', DRIVE + '/' + encodeURIComponent(id) + '/permissions?fields=id',
    { type: 'anyone', role: 'writer', allowFileDiscovery: false }, 'abrir la planilla con su enlace');
  return true;
}

/**
 * Comparte la carpeta con las cuentas de CONFIG.cuentasGoogle, como editores, y
 * les quita el permiso de compartirla con otros: lo que escriben en las
 * planillas la rutina lo lee como instrucciones. A quien ya la tiene no se le
 * vuelve a compartir (le llegaría otra invitación).
 */
function compartirCarpeta_(props, id) {
  const actuales = driveJson_('get', DRIVE + '/' + encodeURIComponent(id) + '/permissions?fields=' +
    encodeURIComponent('permissions(emailAddress,role)'), null, 'leer con quién está compartida la carpeta').permissions || [];
  const ya = actuales.filter(p => p.role === 'writer' || p.role === 'owner')
    .map(p => String(p.emailAddress || '').toLowerCase());
  const resultado = { con: [], fallidas: [] };
  for (const cuenta of CONFIG.cuentasGoogle) {
    const c = cuenta.toLowerCase();
    if (ya.indexOf(c) !== -1) { resultado.con.push(c); continue; }
    try {
      driveJson_('post', DRIVE + '/' + encodeURIComponent(id) + '/permissions?sendNotificationEmail=true&emailMessage=' +
        encodeURIComponent('Aquí quedan las planillas de la fiscalización web de DM. Cada reporte te llega además ' +
          'por correo, con su enlace.') + '&fields=id',
        { type: 'user', role: 'writer', emailAddress: c }, 'compartir la carpeta con ' + c);
      resultado.con.push(c);
    } catch (e) {
      resultado.fallidas.push({ cuenta: c, error: mensajeDe_(e) });
      alertarUnaVez_(props, 'compartir:' + c, 'no se pudo compartir la carpeta con ' + c,
        'No pude compartir la carpeta de las planillas (' + urlCarpeta_(id) + ') con ' + c + ':\n\n' +
        mensajeDe_(e) + '\n\nSi esa dirección no tiene cuenta de Google, el inspector tiene que crear una con su ' +
        'correo del ISP (accounts.google.com → Crear cuenta → «Usar mi dirección de correo electrónico actual»), ' +
        'o darte la dirección con la que entra a Google para ponerla en CONFIG.cuentasGoogle. Después, ejecuta ' +
        'instalar() de nuevo.');
    }
  }
  driveJson_('patch', DRIVE + '/' + encodeURIComponent(id) + '?fields=id', { writersCanShare: false },
    'restringir quién comparte la carpeta');
  return resultado;
}

/** Convierte el Excel en una planilla de Google, dentro de la carpeta. */
function crearPlanilla_(titulo, carpeta, bytes) {
  const limite = 'limite' + Utilities.getUuid().replace(/-/g, '');
  const meta = { name: titulo, mimeType: TIPO_PLANILLA, parents: [carpeta], writersCanShare: false };
  const cabeza = '--' + limite + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(meta) + '\r\n--' + limite + '\r\nContent-Type: ' + TIPO_XLSX + '\r\n\r\n';
  const cola = '\r\n--' + limite + '--';
  const cuerpo = Utilities.newBlob(cabeza).getBytes().concat(bytes, Utilities.newBlob(cola).getBytes());
  const r = UrlFetchApp.fetch(SUBIDA + '?uploadType=multipart&fields=id,webViewLink,modifiedTime', {
    method: 'post', contentType: 'multipart/related; boundary=' + limite, payload: cuerpo,
    headers: autorizacionDrive_(), muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) {
    throw new Error(errorDrive_(r.getResponseCode(), r.getContentText(), 'crear la planilla ' + titulo));
  }
  return JSON.parse(r.getContentText());
}

function buscarEnDrive_(consulta, campos) {
  const archivos = [];
  let pagina = '';
  do {
    const r = driveJson_('get', DRIVE + '?q=' + encodeURIComponent(consulta) + '&fields=' +
      encodeURIComponent('nextPageToken,files(' + campos + ')') + '&pageSize=200' +
      (pagina ? '&pageToken=' + encodeURIComponent(pagina) : ''), null, 'buscar en Drive');
    archivos.push.apply(archivos, r.files || []);
    pagina = r.nextPageToken || '';
  } while (pagina);
  return archivos;
}

/** Si el archivo existe y no está en la papelera. */
function vivo_(id) {
  const r = UrlFetchApp.fetch(DRIVE + '/' + encodeURIComponent(id) + '?fields=id,trashed',
    { method: 'get', headers: autorizacionDrive_(), muteHttpExceptions: true });
  if (r.getResponseCode() === 404) return false;
  if (r.getResponseCode() !== 200) throw new Error(errorDrive_(r.getResponseCode(), r.getContentText(), 'revisar el archivo ' + id));
  return !JSON.parse(r.getContentText()).trashed;
}

function driveJson_(metodo, url, cuerpo, que) {
  const op = { method: metodo, headers: autorizacionDrive_(), muteHttpExceptions: true };
  if (cuerpo) {
    op.contentType = 'application/json';
    op.payload = JSON.stringify(cuerpo);
  }
  const r = UrlFetchApp.fetch(url, op);
  const codigo = r.getResponseCode();
  if (codigo < 200 || codigo >= 300) throw new Error(errorDrive_(codigo, r.getContentText(), que));
  const texto = r.getContentText();
  return texto ? JSON.parse(texto) : {};
}

function autorizacionDrive_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
}

function errorDrive_(codigo, texto, que) {
  let detalle = String(texto || '');
  try { detalle = JSON.parse(texto).error.message || detalle; } catch (e) { /* no era JSON */ }
  const base = 'Google Drive respondió ' + codigo + ' al ' + que + ': ' + detalle.slice(0, 300);
  if (codigo === 403 && /has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(String(texto))) {
    return base + ' — La API de Drive no está activada para el script. En el editor: «Servicios» (+) → ' +
      'Drive API → Agregar; si el + no deja, ver INSTALAR.md, paso 4.';
  }
  if (codigo === 401 || (codigo === 403 && /insufficient/i.test(String(texto)))) {
    return base + ' — Falta el permiso de Drive completo. Pega de nuevo el código del script (INSTALAR.md, ' +
      'paso 2), ejecuta instalar() y acepta los permisos que pide, incluido el de editar archivos de Drive.';
  }
  return base;
}

function urlCarpeta_(id) {
  return 'https://drive.google.com/drive/folders/' + id;
}

function comillas_(texto) {
  return String(texto).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}


// ─── El recorrido del correo (respaldo) ─────────────────────────────────────

function procesar_(props, token) {
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
      '(en script.google.com y en integraciones/planillas-google/planillas.gs) y en INSPECTORES ' +
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
    const enLinea = r.nombre ? planillaDelReporte_(props, r.nombre) : null;
    if (!r.nombre) {
      r.problema = 'sin-identificar';
    } else if (enLinea) {
      // Su reporte se trabaja en la planilla. Cargar el Excel dejaría dos
      // versiones de la misma revisión, y la siguiente copia de la planilla
      // pisaría a esta sin que nadie se entere.
      r.problema = 'en-linea';
      r.planilla = enLinea.url;
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

/** Un hilo que empezó con un correo de la rutina o de este script: un reporte o el consolidado. */
function esHiloDeLaRutina_(hilo, mensajes, yo) {
  return sinTildes_(hilo.getFirstMessageSubject()).indexOf(MARCA_ASUNTO) !== -1 &&
    mensajes.some(m => correoDe_(m.getFrom()) === yo);
}

/**
 * El nombre del Excel que enlazaba el correo original, o null. Si Gmail no
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
 * tests/test_planillas_google.py compara las dos con los nombres reales.
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
  if (!fechaValida_(+m[3], +m[2], +m[1])) return null;
  return { slug: candidatos[0][1], fecha: m[3] + '-' + m[2] + '-' + m[1] };
}

function fechaValida_(anio, mes, dia) {
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  return f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia;
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

/** Los archivos de las carpetas de primer nivel del repositorio, con su sha. */
function arbolDelRepo_(token) {
  const r = UrlFetchApp.fetch(API + CONFIG.repositorio + '/git/trees/' + encodeURIComponent(CONFIG.rama) +
    '?recursive=1', { method: 'get', headers: cabeceras_(token), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error(errorGithub_(r.getResponseCode(), r.getContentText()));
  const datos = JSON.parse(r.getContentText());
  if (datos.truncated) throw new Error('GitHub devolvió incompleta la lista de archivos del repositorio.');
  return datos.tree
    .filter(e => e.type === 'blob' && e.path.split('/').length === 2)
    .map(e => ({ carpeta: e.path.split('/')[0], nombre: e.path.split('/')[1], sha: e.sha }));
}

function blobDeGithub_(token, sha) {
  const r = UrlFetchApp.fetch(API + CONFIG.repositorio + '/git/blobs/' + sha,
    { method: 'get', headers: cabeceras_(token), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error(errorGithub_(r.getResponseCode(), r.getContentText()));
  return Utilities.base64Decode(JSON.parse(r.getContentText()).content.replace(/\s/g, ''));
}

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
  const resultado = { url: urlGithub_(ruta) };
  if (sha && sha === shaBlob_(bytes)) return Object.assign(resultado, { igual: true });

  const cuerpo = { message: mensaje, content: Utilities.base64Encode(bytes), branch: CONFIG.rama };
  if (autor) cuerpo.author = autor;
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

function borrarDeGithub_(token, ruta, mensaje) {
  const url = urlContenido_(ruta);
  const actual = UrlFetchApp.fetch(url + '?ref=' + encodeURIComponent(CONFIG.rama),
    { method: 'get', headers: cabeceras_(token), muteHttpExceptions: true });
  if (actual.getResponseCode() === 404) return false;
  if (actual.getResponseCode() !== 200) throw new Error(errorGithub_(actual.getResponseCode(), actual.getContentText()));
  const r = UrlFetchApp.fetch(url, {
    method: 'delete', headers: cabeceras_(token), contentType: 'application/json',
    payload: JSON.stringify({ message: mensaje, sha: JSON.parse(actual.getContentText()).sha, branch: CONFIG.rama }),
    muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) throw new Error(errorGithub_(r.getResponseCode(), r.getContentText()));
  return true;
}

function urlContenido_(ruta) {
  return API + CONFIG.repositorio + '/contents/' + ruta.split('/').map(encodeURIComponent).join('/');
}

function urlGithub_(ruta) {
  return 'https://github.com/' + CONFIG.repositorio + '/blob/' + CONFIG.rama + '/' +
    ruta.split('/').map(encodeURIComponent).join('/');
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

const ACCESO_CON_ENLACE = 'La planilla se abre con el enlace, sin cuenta de Google. Si tu navegador está ' +
  'conectado a una cuenta del ISP y Google dice que no tienes acceso, ábrela en una ventana de incógnito. ' +
  'El enlace deja editar a quien lo tenga: no lo reenvíes fuera del equipo.';

const FIRMA = '\n\n— Planillas en línea · fiscalización web DM\n' +
  '(Lo envía un script. Si algo no calza, escríbele a ' + CONFIG.avisarA + '.)';

const MOTIVOS = {
  'sin-identificar': 'no sé a qué reporte corresponde.',
  'muy-grande': 'pesa más de ' + CONFIG.tamanoMaximoMB + ' MB; revisa que sea el Excel del reporte.',
  'en-linea': 'este reporte se trabaja en su planilla en línea, así que no cargué el Excel: quedarían dos ' +
    'versiones de la misma revisión. Escribe directamente en la planilla; se guarda sola.',
};

const AYUDA_NOMBRE =
  'Para que se cargue solo, haz una de estas dos cosas:\n' +
  '  1. Responde el correo original del reporte con el Excel adjunto.\n' +
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
      mal.map(r => '  • ' + r.adjunto + ': ' + MOTIVOS[r.problema] +
        (r.planilla ? '\n    ' + r.planilla : '')).join('\n');
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
  GmailApp.sendEmail(CONFIG.avisarA, 'ALERTA — planillas en línea fiscalización web DM: ' + asunto,
    cuerpo + '\n\n— Planillas en línea (script en script.google.com, ver ' +
    'integraciones/planillas-google/INSTALAR.md)');
}

function alertarUnaVez_(props, clave, asunto, cuerpo) {
  if (props.getProperty(ALERTADO + clave)) return false;
  alertar_(asunto, cuerpo);
  props.setProperty(ALERTADO + clave, new Date().toISOString());
  return true;
}

/**
 * Lo procesado y lo avisado hace más de DIAS_MEMORIA días se olvida, y el
 * registro de las planillas de reportes de hace más de DIAS_PLANILLAS.
 */
function olvidarAntiguos_(props) {
  const limite = Date.now() - DIAS_MEMORIA * 864e5;
  const todas = props.getProperties();
  for (const clave of Object.keys(todas)) {
    if (clave.indexOf(PLANILLA) === 0) {
      const info = reporteDe_(clave.slice(PLANILLA.length));
      if (info && !vigente_(info)) props.deleteProperty(clave);
      continue;
    }
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

function textoDe_(bytes) {
  return Utilities.newBlob(bytes).getDataAsString('UTF-8');
}

function mensajeDe_(e) {
  return e && e.message ? e.message : String(e);
}

function hoy_() {
  return new Date().toISOString().slice(0, 10);
}

/** 'AAAA-MM-DD' más n días, en el mismo formato. */
function sumarDias_(fecha, n) {
  const p = fecha.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}

/** 'AAAA-MM-DD' → 'lunes 16-11-2026'. */
function fechaLarga_(fecha) {
  const p = fecha.split('-').map(Number);
  return DIAS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] + ' ' + p[2].toString().padStart(2, '0') +
    '-' + p[1].toString().padStart(2, '0') + '-' + p[0];
}
