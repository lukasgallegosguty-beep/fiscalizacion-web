#!/usr/bin/env python3
"""
Planificador de la fiscalización web de DM (ISP/ANDIM).

La asignación es por **calendario fijo**: cada día hábil se fiscalizan dos
categorías, en dos bloques independientes. No es una rotación secuencial, así
que una corrida que falle no descoloca al resto de la semana: el lunes siguiente
vuelve a tocar lo mismo que este lunes.

    Lunes      1) Agujas hipodérmicas          2) Autotest VIH
    Martes     1) Desfibriladores (DEA)        2) Guantes de examinación
    Miércoles  1) Guantes quirúrgicos          2) Jeringas con agujas
    Jueves     1) Jeringas hipodérmicas        2) Kits VIH uso profesional
    Viernes    1) Preservativos masculinos     2) Preservativos femeninos

El mes se organiza en semanas de búsqueda más una de cierre, igual que en el plan
de Microsoft Planner del equipo (noviembre de 2026 a diciembre de 2027):

    Semana 1     búsqueda   revisa Emilio Millán
    Semana 2     búsqueda   revisa Lukas Gallegos
    Semana 3     búsqueda   revisa María Inés Medina
    (Semana 4)   búsqueda   solo en los meses de 5 semanas; quién revisa lo dice
                 la tabla CUARTA_SEMANA, y fuera de ella le toca a Emilio
    ÚLTIMA       SIN BÚSQUEDA. El martes se emite el consolidado mensual a los
                 tres y se reúnen a las 09:00 a resolver qué se denuncia.

A qué mes pertenece una semana de lunes a viernes (ver periodo_de_semana):

  - Desde el periodo 2026-11, al mes de su VIERNES, que es como la cuenta el
    Planner. La semana del lunes 28-12-2026 termina el viernes 01-01-2027: es la
    semana 1 de enero, no la quinta de diciembre.
  - Hasta 2026-10, al mes de su MIÉRCOLES, donde cae la mayoría de sus días
    hábiles. Septiembre y octubre de 2026 se ejecutaron con esa regla y tienen
    que seguir dando lo mismo: de ella dependen los consolidados ya emitidos y a
    qué mes se atribuye cada revisión devuelta.

Antes de la regla del miércoles la semana pertenecía al mes de su lunes, y eso
dejaba semanas muertas: la del 31-08-2026 quedó fuera del ciclo y el miércoles
02-09 las rutinas no fiscalizaron nada.

NO se puede garantizar que todo mes tenga exactamente 4 semanas: 12 x 4 = 48 y el
año tiene 52 o 53. Cuatro o cinco veces al año un mes tiene cinco (en 2027 son
cinco: enero, abril, julio, octubre y diciembre). Por eso el cierre no es "la
semana 4" sino LA ÚLTIMA semana del mes: así el mes siempre cierra al final y
ninguna semana queda sin trabajo.

Uso:
    python3 scripts/rotacion.py --slot 1              # bloque 1 de hoy
    python3 scripts/rotacion.py --slot 2 --json       # bloque 2, salida JSON
    python3 scripts/rotacion.py --semana              # plan de la semana
    python3 scripts/rotacion.py --estado              # cobertura histórica
    python3 scripts/rotacion.py --slot 1 --avanzar --hallazgos 21
    python3 scripts/rotacion.py --slot 1 --fecha 2026-08-24   # simular un día
"""

import argparse
import calendar
import glob
import json
import os
import re
import sys
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_ISP = os.path.join(RAIZ, "registros-isp")
DIR_RESULTADOS = os.path.join(RAIZ, "resultados")
DIR_REVISION = os.path.join(RAIZ, "revision")
DIR_HISTORIAL = os.path.join(RAIZ, "historial")
ARCHIVO_ESTADO = os.path.join(RAIZ, "estado-rotacion.json")

# Orden canónico del ciclo de fiscalización. El `slug` es la clave estable que
# se persiste en estado-rotacion.json: NO usar el nombre del archivo, porque el
# ISP le cambia la fecha en cada actualización y rompería el emparejamiento.
CATEGORIAS = [
    {
        "slug": "guantes-quirurgicos",
        "nombre": "Guantes quirúrgicos de látex",
        "patron": "Lista-de-Guantes-Quirurgicos-*.xlsx",
        "hoja": None,
        "in_vitro": False,
    },
    {
        "slug": "guantes-examinacion",
        "nombre": "Guantes de examen médico",
        "patron": "Lista-de-Guantes-de-Examinacion-*.xlsx",
        "hoja": None,
        "in_vitro": False,
    },
    {
        "slug": "preservativos-masculinos",
        "nombre": "Preservativos masculinos (látex y sintéticos)",
        "patron": "Lista-de-Preservativos-de-latex-y-Sinteticos-*.xlsx",
        "hoja": None,
        "in_vitro": False,
    },
    {
        "slug": "preservativos-femeninos",
        "nombre": "Preservativos femeninos",
        "patron": "Lista-de-Preservativos-Femeninos-*.xlsx",
        "hoja": None,
        "in_vitro": False,
    },
    {
        "slug": "agujas-hipodermicas",
        "nombre": "Agujas hipodérmicas",
        "patron": "Lista-de-Agujas-Hipodermicas-*.xlsx",
        "hoja": None,
        "in_vitro": False,
    },
    {
        "slug": "jeringas-hipodermicas",
        "nombre": "Jeringas hipodérmicas",
        "patron": "Lista-de-Jeringas-Hipodermicas-*.xlsx",
        "hoja": None,
        "in_vitro": False,
    },
    {
        "slug": "jeringas-con-agujas",
        "nombre": "Jeringas con agujas hipodérmicas",
        "patron": "Lista-de-Jeringas-con-Agujas-Hipodermicas-*.xlsx",
        "hoja": None,
        "in_vitro": False,
    },
    {
        "slug": "desfibriladores-dea",
        "nombre": "Desfibriladores externos automáticos (DEA)",
        "patron": "Lista-de-Desfibriladores-*.xlsx",
        "hoja": None,
        "in_vitro": False,
    },
    {
        "slug": "autotest-vih",
        "nombre": "Autotest VIH",
        "patron": "Lista-de-Autotest-*.xlsx",
        "hoja": "Autotest VIH",
        "in_vitro": True,
    },
    {
        "slug": "kits-vih-profesional",
        "nombre": "Kits VIH uso profesional",
        "patron": "Lista-Kits-Registro-Sanitario-VIH-*.xlsx",
        "hoja": "KITS VIH USO PROFESIONAL",
        "in_vitro": True,
    },
]

POR_SLUG = {c["slug"]: c for c in CATEGORIAS}

# Calendario fijo: día de la semana (0=lunes) -> [bloque 1, bloque 2].
# Las 10 categorías quedan cubiertas de lunes a viernes, dos por día.
CALENDARIO = {
    0: ["agujas-hipodermicas", "autotest-vih"],
    1: ["desfibriladores-dea", "guantes-examinacion"],
    2: ["guantes-quirurgicos", "jeringas-con-agujas"],
    3: ["jeringas-hipodermicas", "kits-vih-profesional"],
    4: ["preservativos-masculinos", "preservativos-femeninos"],
}

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]

# Inspector que revisa los hallazgos, según el número de semana DEL MES. No es
# una rotación acumulativa: cada mes vuelve a empezar en Emilio, así que un mes
# con una corrida caída no descoloca la asignación del mes siguiente.
EMILIO = {"nombre": "Emilio Millán", "email": "emillan@ispch.cl"}
LUKAS = {"nombre": "Lukas Gallegos", "email": "lgallegos@ispch.cl"}
MARIA_INES = {"nombre": "María Inés Medina", "email": "mmedina@ispch.cl"}
INSPECTORES = [EMILIO, LUKAS, MARIA_INES]
INSPECTOR_POR_SEMANA = {1: EMILIO, 2: LUKAS, 3: MARIA_INES}

# La cuarta semana solo existe en los meses de cinco semanas, y el Planner del
# equipo la reparte mes a mes. Un mes de cinco semanas que no esté en la tabla
# se la da a Emilio, como antes del Planner.
# AMPLIAR esta tabla cuando se arme el Planner de 2028: sin ella, todas las
# cuartas semanas de 2028 en adelante quedan para Emilio.
CUARTA_SEMANA = {
    (2027, 1): LUKAS,
    (2027, 4): MARIA_INES,
    (2027, 7): LUKAS,
    (2027, 10): MARIA_INES,
    (2027, 12): EMILIO,
}
CUARTA_SEMANA_POR_OMISION = EMILIO

# Primer periodo en que una semana pertenece al mes de su viernes, como en el
# Planner. Los anteriores conservan la regla del miércoles: ver periodo_de_semana.
INICIO_REGLA_VIERNES = (2026, 11)

# Quien organiza la reunión mensual y firma la invitación de calendario.
ORGANIZADOR = {"nombre": "Lukas Gallegos", "email": "lgallegos@ispch.cl"}

# El cierre va siempre en la ÚLTIMA semana del mes, sea la cuarta o la quinta.
# Todas las anteriores fiscalizan: así ninguna semana queda sin trabajo.
DIA_CONSOLIDACION = 1        # martes (0 = lunes)
HORA_CONSOLIDACION = "07:30"  # envío del consolidado
HORA_REUNION = (9, 0)         # inicio de la reunión mensual
DURACION_REUNION_MIN = 60
# La reunión va en Google Calendar como un evento INDIVIDUAL por mes, no como
# uno recurrente: la única recurrencia que expresa estas fechas es RDATE (fechas
# explícitas), porque el martes de la última semana no siempre es el "cuarto
# martes del mes": entre 2027 y 2036 no lo es en 9 de los 120 meses, y en el
# Planner, en septiembre de 2027. Outlook no soporta RDATE y rechaza la
# invitación entera, así que un evento por mes es lo único que abre en ambos.

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

# Objetivo de esfuerzo de búsqueda, no una cuota a rellenar. Ver SKILL.md:
# si la realidad no da para tanto, se informa el número real; nunca se inventan
# hallazgos ni se reclasifica para calzar la proporción.
OBJETIVO_HALLAZGOS = 20
OBJETIVO_NO_REGISTRADO = 0.60
OBJETIVO_REGISTRADO = 0.40


def lunes_de(fecha):
    return fecha - timedelta(days=fecha.weekday())


def periodo_de_semana(lunes):
    """El mes (año, mes) al que pertenece la semana de lunes a viernes de `lunes`.

    Desde 2026-11 es el mes de su VIERNES, que es como cuenta las semanas el
    Planner del equipo. Hasta 2026-10 fue el mes de su MIÉRCOLES: septiembre y
    octubre de 2026 ya se ejecutaron así y deben seguir dando lo mismo.

    Se decide mirando el viernes: si cae en 2026-11 o después, manda el viernes;
    si no, el miércoles. En 2026 el corte es limpio porque el 31-10 es sábado:
    ninguna semana tiene el miércoles en octubre y el viernes en noviembre, así
    que octubre conserva sus cuatro semanas y noviembre empieza el lunes 02-11.
    """
    viernes = lunes + timedelta(days=4)
    if (viernes.year, viernes.month) >= INICIO_REGLA_VIERNES:
        return viernes.year, viernes.month
    miercoles = lunes + timedelta(days=2)
    return miercoles.year, miercoles.month


def semanas_del_mes(anio, mes):
    """Los lunes de las semanas que pertenecen a ese mes, en orden: cuatro o cinco.

    Es la inversa de periodo_de_semana(): recorre los lunes que pueden caer en
    el mes —desde el de la semana del día 1 hasta el último día— y se queda con
    los que le pertenecen. No hay una segunda fórmula que pueda separarse de esa.
    """
    primero = date(anio, mes, 1)
    ultimo = date(anio, mes, calendar.monthrange(anio, mes)[1])
    semanas, lunes = [], lunes_de(primero)
    while lunes <= ultimo:
        if periodo_de_semana(lunes) == (anio, mes):
            semanas.append(lunes)
        lunes += timedelta(weeks=1)
    return semanas


def semana_de(fecha):
    """Ubica la fecha en el calendario mensual.

    `n` es el número de semana dentro del mes y `total` cuántas tiene ese mes.
    La última es siempre la de cierre, tenga el mes cuatro semanas o cinco.
    El mes es el de periodo_de_semana(), que no siempre es el de la fecha: el
    lunes 28-12-2026 pertenece a enero de 2027.
    """
    lunes = lunes_de(fecha)
    anio, mes = periodo_de_semana(lunes)
    semanas = semanas_del_mes(anio, mes)
    n = semanas.index(lunes) + 1
    return {
        "n": n,
        "total": len(semanas),
        "ultima": n == len(semanas),
        "lunes": lunes.isoformat(),
        "anio": anio,
        "mes": mes,
        "mes_nombre": MESES[mes - 1],
        "periodo": f"{anio}-{mes:02d}",
    }


def modo_de(fecha):
    """Qué se hace esa semana: buscar o consolidar. Nunca 'nada'."""
    return "consolidacion" if semana_de(fecha)["ultima"] else "busqueda"


def inspector_de_semana(anio, mes, n, total):
    """Quién revisa la semana `n` de las `total` del mes, o None si es la de cierre.

    Es la única fuente de la asignación: inspector_de() y bloques_del_mes() la
    llaman las dos. Antes bloques_del_mes repetía la fórmula por su cuenta, y la
    lista de reportes esperados del cierre podía decir otro inspector que el que
    recibió el correo.

    Semanas 1, 2 y 3: Emilio, Lukas y María Inés. La cuarta solo existe en los
    meses de cinco semanas y sale de CUARTA_SEMANA (Emilio si el mes no está).
    """
    if n == total:
        return None
    if n in INSPECTOR_POR_SEMANA:
        return dict(INSPECTOR_POR_SEMANA[n])
    if n == 4:
        return dict(CUARTA_SEMANA.get((anio, mes), CUARTA_SEMANA_POR_OMISION))
    raise ValueError(f"semana {n} de {total} en {anio}-{mes:02d}: un mes no tiene más de cinco")


def inspector_de(fecha):
    """Inspector a cargo de la semana de `fecha`, o None si es la semana de cierre."""
    sem = semana_de(fecha)
    insp = inspector_de_semana(sem["anio"], sem["mes"], sem["n"], sem["total"])
    if insp is None:
        return None
    insp["semana_mes"] = sem["n"]
    insp["lunes_semana"] = sem["lunes"]
    insp["periodo"] = sem["periodo"]
    return insp


ARCHIVO_FERIADOS = os.path.join(RAIZ, "feriados.json")


def _cargar_feriados():
    """Los feriados legales chilenos que caen en día hábil, desde feriados.json.

    Si el archivo no está o está roto, devuelve {} en vez de reventar: quedarse
    sin el calendario de feriados degrada el informe del cierre, pero no puede
    voltear una corrida de fiscalización.
    """
    try:
        with open(ARCHIVO_FERIADOS, encoding="utf-8") as fh:
            return json.load(fh).get("feriados", {})
    except (OSError, ValueError):
        return {}


FERIADOS = _cargar_feriados()


def feriado_de(fecha):
    """Nombre del feriado de esa fecha, o None si es un día hábil corriente.

    La rutina fiscaliza igual en feriado —la búsqueda es automática y no le
    cuesta a nadie—, pero el reporte queda excusado de revisión: no hay
    inspector trabajando. El cierre mensual lo informa como feriado y no como
    un pendiente, que es la diferencia entre "no correspondía" y "no cumplió".
    """
    return FERIADOS.get(fecha.isoformat())


def lunes_cierre(anio, mes):
    """El lunes de la semana de cierre: la última del mes."""
    return semanas_del_mes(anio, mes)[-1]


def martes_consolidacion(anio, mes):
    """El martes de la última semana: día del consolidado y de la reunión."""
    return lunes_cierre(anio, mes) + timedelta(days=DIA_CONSOLIDACION)


def instante_utc(fecha, hhmm):
    """El momento UTC que corresponde a esa hora local chilena, en RFC3339.

    Chile cambia de huso dos veces al año (UTC-4 en invierno, UTC-3 en verano),
    y el cron del trigger se guarda en UTC sin campo de zona horaria: nadie lo
    ajusta solo. Calcularlo aquí evita que el cierre se corra una hora cada vez
    que cambia la hora, que es exactamente lo que pasó en septiembre de 2026.
    """
    h, m = (int(x) for x in hhmm.split(":"))
    local = datetime.combine(fecha, time(h, m), tzinfo=ZoneInfo("America/Santiago"))
    return local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def proximo_cierre(despues_de):
    """El cierre mensual siguiente al de `despues_de`. Nunca devuelve el mismo."""
    anio, mes = despues_de.year, despues_de.month
    for _ in range(3):
        mes += 1
        if mes > 12:
            mes, anio = 1, anio + 1
        siguiente = martes_consolidacion(anio, mes)
        if siguiente > despues_de:
            return siguiente
    raise RuntimeError("no se pudo calcular el próximo cierre")


def categorias_del_dia(fecha):
    """Las dos categorías que tocan ese día, o [] si es fin de semana."""
    return [POR_SLUG[s] for s in CALENDARIO.get(fecha.weekday(), [])]


def categoria_de(fecha, slot):
    """Categoría del bloque `slot` (1 o 2) para esa fecha."""
    delDia = categorias_del_dia(fecha)
    if not delDia:
        return None
    if slot not in (1, 2):
        raise ValueError("slot debe ser 1 o 2")
    return delDia[slot - 1]



def leer_historial():
    """Lee el historial desde historial/, un archivo por corrida.

    Antes las dos corridas del día editaban el mismo estado-rotacion.json. Como
    corren con dos minutos de diferencia y empujan a la misma rama, la segunda
    chocaba en ese archivo: el `git pull --rebase` del reintento fallaba por el
    conflicto y el push a main nunca ocurría, dejando el reporte varado en una
    rama suelta. Pasó el 25 y el 26 de agosto.

    Con un archivo por corrida no hay archivo compartido y el conflicto no puede
    producirse.
    """
    entradas = []
    for ruta in sorted(glob.glob(os.path.join(DIR_HISTORIAL, "*.json"))):
        try:
            with open(ruta, encoding="utf-8") as fh:
                entradas.append(json.load(fh))
        except (json.JSONDecodeError, OSError):
            continue  # un registro ilegible no debe tumbar la corrida
    # Compatibilidad con el estado antiguo, para no perder lo ya registrado.
    if os.path.exists(ARCHIVO_ESTADO):
        try:
            with open(ARCHIVO_ESTADO, encoding="utf-8") as fh:
                entradas.extend(json.load(fh).get("historial", []))
        except (json.JSONDecodeError, OSError):
            pass
    vistos, out = set(), []
    for h in sorted(entradas, key=lambda x: (x.get("fecha", ""), x.get("slot", 0))):
        k = (h.get("categoria"), h.get("fecha"), h.get("slot"))
        if k not in vistos:
            vistos.add(k)
            out.append(h)
    return out


def cargar_estado():
    """Lee estado-rotacion.json tolerando el esquema antiguo y el archivo ausente."""
    if not os.path.exists(ARCHIVO_ESTADO):
        return {"ultima_categoria": "", "ultima_fecha": "", "historial": []}
    try:
        with open(ARCHIVO_ESTADO, encoding="utf-8") as fh:
            estado = json.load(fh)
    except (json.JSONDecodeError, OSError):
        # Un estado corrupto no debe abortar la rutina: se reinicia el ciclo.
        return {"ultima_categoria": "", "ultima_fecha": "", "historial": []}
    estado.setdefault("ultima_categoria", "")
    estado.setdefault("ultima_fecha", "")
    estado.setdefault("historial", [])
    return estado


def guardar_estado(estado):
    with open(ARCHIVO_ESTADO, "w", encoding="utf-8") as fh:
        json.dump(estado, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def _sin_tildes(texto):
    return (
        texto.lower()
        .replace("á", "a").replace("é", "e").replace("í", "i")
        .replace("ó", "o").replace("ú", "u").replace("ü", "u").replace("ñ", "n")
    )


def _tokens(texto):
    return {t for t in re.split(r"[^a-z0-9]+", _sin_tildes(texto)) if t}


def normalizar_slug(valor):
    """Acepta un slug, un nombre de categoría o un nombre de archivo heredado.

    Devuelve None si el valor está vacío o no se puede atribuir sin ambigüedad;
    quien llama lo interpreta como "sin categoría previa" y reinicia el ciclo.
    """
    if not valor:
        return None
    valor = valor.strip()
    if valor in POR_SLUG:
        return valor

    plano = _sin_tildes(valor)

    # Nombre completo de la categoría, ignorando tildes y mayúsculas.
    for cat in CATEGORIAS:
        if plano == _sin_tildes(cat["nombre"]):
            return cat["slug"]

    # Nombre de archivo heredado: el prefijo del patrón identifica la categoría
    # sin ambigüedad (p. ej. "Lista-de-Jeringas-Hipodermicas-" nunca coincide con
    # un archivo "Lista-de-Jeringas-con-Agujas-Hipodermicas-...").
    for cat in CATEGORIAS:
        if plano.startswith(_sin_tildes(cat["patron"].split("*")[0])):
            return cat["slug"]

    # Último recurso: la categoría cuyos tokens estén todos contenidos en el
    # valor. Gana la más específica; un empate se considera ambiguo.
    tokens = _tokens(valor)
    candidatos = []
    for cat in CATEGORIAS:
        propios = _tokens(cat["slug"])
        if propios <= tokens:
            candidatos.append((len(propios), cat["slug"]))
    if not candidatos:
        return None
    candidatos.sort(reverse=True)
    if len(candidatos) > 1 and candidatos[0][0] == candidatos[1][0]:
        return None
    return candidatos[0][1]


RE_FECHA_ARCHIVO = re.compile(r"(\d{2})[-_. ]?(\d{2})[-_. ]?(\d{4})")


def _compacto(texto):
    """Deja solo letras y dígitos, sin tildes: 'Guantes-Quirúrgicos' -> 'guantesquirurgicos'."""
    return re.sub(r"[^a-z0-9]", "", _sin_tildes(texto))


def atribuir_archivo(ruta):
    """Deduce (slug, fecha) del nombre de un Excel devuelto por un inspector.

    Los inspectores renombran los archivos a mano antes de subirlos. En agosto
    volvieron como "..._31-08-2026_LGG.xlsx", "...guantesquirurgicos_26082026
    EJMS.xlsx" y "...jeringasconagujas_26082026 EMS.xlsx": sin guiones en el
    slug, sin guiones en la fecha y con las iniciales pegadas al final. El glob
    por nombre exacto perdía dos de los doce archivos SIN AVISAR, que es la peor
    forma de perderlos. Aquí se compara todo compactado a letras y dígitos.

    Devuelve None si no se puede atribuir; quien llama debe reportarlo, nunca
    descartarlo en silencio.
    """
    nombre = os.path.basename(ruta)
    base = os.path.splitext(nombre)[0]
    plano = _compacto(base)

    # La categoría más específica que aparezca en el nombre. Un empate entre dos
    # categorías del mismo largo se considera ambiguo y no se adivina.
    candidatos = sorted(
        ((len(_compacto(c["slug"])), c["slug"]) for c in CATEGORIAS
         if _compacto(c["slug"]) in plano),
        reverse=True,
    )
    if not candidatos:
        return None
    if len(candidatos) > 1 and candidatos[0][0] == candidatos[1][0]:
        return None
    slug = candidatos[0][1]

    fecha = None
    m = RE_FECHA_ARCHIVO.search(base)
    if m:
        d, mes, anio = (int(x) for x in m.groups())
        try:
            fecha = date(anio, mes, d)
        except ValueError:
            fecha = None
    return {"slug": slug, "fecha": fecha, "archivo": nombre, "ruta": ruta}


def archivos_revisados(slug=None, anio=None, mes=None):
    """Excels de revision/ atribuidos por contenido del nombre, no por glob.

    Devuelve (atribuidos, no_atribuidos). El segundo nunca se descarta: es lo
    que hay que mostrarle a quien opera la rutina para que corrija el nombre.
    """
    ok, fallidos = [], []
    for ruta in sorted(glob.glob(os.path.join(DIR_REVISION, "*.xlsx"))):
        if os.path.basename(ruta).startswith("~$"):
            continue  # archivo temporal de Excel
        if os.path.basename(ruta).lower().startswith("consolidado_mensual"):
            # El consolidado completado en la reunión también se sube aquí, pero
            # no es la revisión de un inspector: es el acta de decisiones del mes.
            # Sin esta excepción caía en "no atribuidos" y el cierre siguiente
            # pedía renombrar un archivo que estaba bien nombrado.
            continue
        info = atribuir_archivo(ruta)
        if info is None:
            fallidos.append(os.path.basename(ruta))
            continue
        if slug and info["slug"] != slug:
            continue
        if anio and mes:
            # El mes del CICLO, no el del calendario: el de periodo_de_semana(),
            # vía semana_de(). La semana del lunes 31-08-2026 es la semana 1 de
            # septiembre y la del lunes 28-12-2026, la 1 de enero de 2027.
            # Filtrando por mes calendario, las revisiones del 31-08 quedaban
            # fuera del consolidado de septiembre: la hoja de cobertura las daba
            # por no devueltas y sus casos confirmados —infracciones que un
            # inspector ya había validado— desaparecían del cierre sin aviso.
            if info["fecha"] is None:
                continue
            sem = semana_de(info["fecha"])
            if (sem["anio"], sem["mes"]) != (anio, mes):
                continue
        ok.append(info)
    ok.sort(key=lambda i: (i["fecha"] or date.min, i["archivo"]))
    return ok, fallidos


# Las clasificaciones que el inspector tiene que confirmar o corregir. Las
# filas FUERA DE ALCANCE y SIN HALLAZGOS no piden «Decisión final»: el
# consolidado no las usa, y en los Excel devueltos los inspectores las dejaron
# muchas veces con solo una observación.
CLASIFICACIONES_A_DECIDIR = ("REGISTRADO", "NO REGISTRADO")

_SIN_DECIDIR = {}  # por (ruta, fecha de modificación, tamaño): cada archivo se lee una vez


def sin_decidir(ruta):
    """Filas REGISTRADO y NO REGISTRADO de «Hallazgos» que siguen sin «Decisión final».

    Desde que la revisión se hace en planillas en línea, revision/ ya no recibe
    solo archivos terminados: la planilla se copia ahí apenas el inspector
    escribe algo. Una revisión a medias está en revision/ pero no está revisada,
    y el cierre tiene que poder decirlo en vez de contarla como devuelta.

    0 es una revisión completa. En los 86 Excel devueltos hasta noviembre de 2026
    no hay ninguna fila REGISTRADO o NO REGISTRADO sin decisión, así que la regla
    no cambia nada de lo anterior. Contar todas las filas con enlace sí lo
    cambiaba: tres filas FUERA DE ALCANCE de septiembre y octubre tienen solo una
    observación del inspector, y sus reportes pasaban a figurar a medias.
    Un archivo que no se puede leer cuenta como completo, como antes de las
    planillas: no hay filas que contar, e inventar un faltante sería peor.
    feedback.py y consolidado.py lo leen igual y fallan a la vista si está
    dañado.
    """
    try:
        clave = (ruta, os.path.getmtime(ruta), os.path.getsize(ruta))
    except OSError:
        return 0
    if clave not in _SIN_DECIDIR:
        _SIN_DECIDIR[clave] = _contar_sin_decidir(ruta)
    return _SIN_DECIDIR[clave]


def _contar_sin_decidir(ruta):
    try:
        from openpyxl import load_workbook
        wb = load_workbook(ruta, read_only=True, data_only=True)
    except Exception:  # vacío o dañado
        return 0
    try:
        if "Hallazgos" not in wb.sheetnames:
            return 0
        filas = wb["Hallazgos"].iter_rows(values_only=True)
        encabezado = [_sin_tildes(str(v or "")).strip() for v in next(filas, ())]
        if "clasificacion" not in encabezado or "decision final" not in encabezado:
            return 0
        i_cla, i_dec = encabezado.index("clasificacion"), encabezado.index("decision final")
        n = 0
        for f in filas:
            clasificacion = f[i_cla] if len(f) > i_cla else None
            decision = f[i_dec] if len(f) > i_dec else None
            if (str(clasificacion or "").strip().upper() in CLASIFICACIONES_A_DECIDIR
                    and not str(decision or "").strip()):
                n += 1
        return n
    except Exception:
        return 0
    finally:
        wb.close()


def resolver_excel(cat):
    """Devuelve el Excel ISP vigente de la categoría (el más reciente si hay varios)."""
    coincidencias = sorted(glob.glob(os.path.join(DIR_ISP, cat["patron"])))
    if not coincidencias:
        return None
    # Si el usuario dejó varias versiones, gana la de fecha de modificación mayor.
    return max(coincidencias, key=os.path.getmtime)



def reportes_previos(cat):
    """Reportes anteriores de la categoría, los revisados primero.

    `revision/` tiene prioridad: son los archivos que el inspector ya evaluó, y
    su feedback vale más que el reporte crudo que generó la rutina.
    """
    patron = f"Fiscalizacion_Web_DM_{cat['slug']}_*.xlsx"
    # Los devueltos se buscan por atribución, no por glob: llegan renombrados.
    revisados = [i["ruta"] for i in reversed(archivos_revisados(cat["slug"])[0])]
    # Ordenar por la fecha DEL NOMBRE, no por mtime: el contenedor clona el
    # repositorio en cada corrida, así que todos los archivos quedan con la
    # misma fecha de modificación y el orden sale arbitrario. Peor aún al
    # rescatar un reporte viejo varado en una rama: entra con mtime de hoy y se
    # cuela como "el más reciente" por delante de los que sí lo son.
    crudos = sorted(
        glob.glob(os.path.join(DIR_RESULTADOS, patron)),
        key=lambda r: (atribuir_archivo(r) or {}).get("fecha") or date.min,
        reverse=True,
    )
    return {"revisados": revisados, "crudos": crudos}


def reporte_previo(cat):
    """El reporte más reciente de la categoría, priorizando los ya revisados."""
    p = reportes_previos(cat)
    if p["revisados"]:
        return p["revisados"][0]
    return p["crudos"][0] if p["crudos"] else None


def construir_plan(fecha=None, slot=1):
    """Plan de trabajo para un bloque de un día concreto."""
    fecha = fecha or date.today()
    sem = semana_de(fecha)
    modo = modo_de(fecha)
    base = {
        "dia": DIAS[fecha.weekday()],
        "fecha": fecha.strftime("%d-%m-%Y"),
        "fecha_iso": fecha.isoformat(),
        "slot": slot,
        "semana_mes": sem["n"],
        "semanas_del_mes": sem["total"],
        "periodo": sem["periodo"],
        "modo_semana": modo,
    }

    # La última semana del mes, sea la cuarta o la quinta, no se fiscaliza. Se
    # responde habil: false igual que un fin de semana, para que la rutina de
    # búsqueda corte en el paso 1 sin gastar la corrida.
    if modo != "busqueda":
        martes = martes_consolidacion(sem["anio"], sem["mes"])
        base["motivo"] = (
            f"semana {sem['n']} de {sem['n']} de {sem['mes_nombre']}: última semana "
            f"del mes, reservada al análisis mensual. No se fiscaliza. El consolidado "
            f"se emite el martes {martes.strftime('%d-%m-%Y')} a las {HORA_CONSOLIDACION}."
        )
        base["fecha_consolidacion"] = martes.isoformat()
        return dict(habil=False, **base)

    cat = categoria_de(fecha, slot)
    if cat is None:
        return dict(habil=False, motivo="fin de semana: no hay fiscalización programada", **base)

    excel = resolver_excel(cat)
    previos = reportes_previos(cat)
    return {
        "habil": True,
        "dia": DIAS[fecha.weekday()],
        "slot": slot,
        "semana_mes": sem["n"],
        "semanas_del_mes": sem["total"],
        "periodo": sem["periodo"],
        "modo_semana": modo,
        "slug": cat["slug"],
        "categoria": cat["nombre"],
        "excel_isp": excel,
        "excel_encontrado": excel is not None,
        "hoja": cat["hoja"],
        "in_vitro": cat["in_vitro"],
        "fecha": fecha.strftime("%d-%m-%Y"),
        "fecha_iso": fecha.isoformat(),
        "archivo_salida": os.path.join(
            DIR_RESULTADOS,
            f"Fiscalizacion_Web_DM_{cat['slug']}_{fecha.strftime('%d-%m-%Y')}.xlsx",
        ),
        "otra_categoria_del_dia": [
            c["nombre"] for c in categorias_del_dia(fecha) if c["slug"] != cat["slug"]
        ],
        "reporte_previo": reporte_previo(cat),
        "reportes_revisados": previos["revisados"],
        "reportes_crudos": previos["crudos"],
        "inspector": inspector_de(fecha),
        # Si hoy es feriado se fiscaliza igual —la búsqueda es automática— pero
        # el inspector no está trabajando. El correo tiene que decírselo: que
        # llegue un "revisa esto" un 18 de septiembre es una molestia evitable,
        # y el cierre ya no lo cuenta como pendiente suyo.
        "feriado": feriado_de(fecha),
        "objetivo_hallazgos": OBJETIVO_HALLAZGOS,
        "objetivo_no_registrado": OBJETIVO_NO_REGISTRADO,
        "objetivo_registrado": OBJETIVO_REGISTRADO,
    }


def plan_semana(fecha=None):
    """Las 10 asignaciones de la semana que contiene `fecha`."""
    fecha = fecha or date.today()
    lunes = lunes_de(fecha)
    filas = []
    for i in range(5):
        d = lunes + timedelta(days=i)
        for slot in (1, 2):
            cat = categoria_de(d, slot)
            filas.append(
                {
                    "fecha": d.isoformat(),
                    "dia": DIAS[d.weekday()],
                    "slot": slot,
                    "slug": cat["slug"],
                    "categoria": cat["nombre"],
                }
            )
    sem = semana_de(fecha)
    return {
        "lunes": lunes.isoformat(),
        "semana_mes": sem["n"],
        "semanas_del_mes": sem["total"],
        "periodo": sem["periodo"],
        "modo_semana": modo_de(fecha),
        "inspector": inspector_de(fecha),
        "feriados": {d.isoformat(): feriado_de(d)
                     for d in (lunes_de(fecha) + timedelta(days=i) for i in range(5))
                     if feriado_de(d)},
        "bloques": filas if modo_de(fecha) == "busqueda" else [],
    }


def bloques_del_mes(anio, mes):
    """Las 30 asignaciones de búsqueda del mes: 10 por cada semana 1, 2 y 3.

    Son todas las semanas del mes menos la última, que es la de cierre. En los
    meses de cinco semanas eso da 40 bloques en vez de 30.
    """
    semanas = semanas_del_mes(anio, mes)
    filas = []
    for n, lunes in enumerate(semanas[:-1], start=1):
        insp = inspector_de_semana(anio, mes, n, len(semanas))
        for i in range(5):
            d = lunes + timedelta(days=i)
            for slot in (1, 2):
                cat = categoria_de(d, slot)
                filas.append({
                    "fecha": d.isoformat(),
                    "fecha_dmy": d.strftime("%d-%m-%Y"),
                    "dia": DIAS[d.weekday()],
                    "semana_mes": n,
                    "slot": slot,
                    "slug": cat["slug"],
                    "categoria": cat["nombre"],
                    "inspector": insp["email"],
                    "archivo": f"Fiscalizacion_Web_DM_{cat['slug']}_{d.strftime('%d-%m-%Y')}.xlsx",
                })
    return filas


def plan_consolidacion(fecha=None):
    """Plan del cierre mensual: qué mes se consolida, cuándo y con qué insumos.

    `es_hoy` es lo que debe mirar la rutina: sale True solo el martes de la
    última semana del mes. El trigger se dispara todos los martes y este campo
    es el filtro real. (Del 14 al 29-09-2026 fue un disparo único que se
    reprogramaba con `proximo_cierre_utc`; falló porque la rutina disparada no
    tiene las herramientas para reprogramarse. Ver RUTINA.md.)
    """
    fecha = fecha or date.today()
    sem = semana_de(fecha)
    martes = martes_consolidacion(sem["anio"], sem["mes"])
    proximo_siguiente = proximo_cierre(martes)
    reunion = datetime.combine(martes, time(*HORA_REUNION))
    esperados = bloques_del_mes(sem["anio"], sem["mes"])

    # Los devueltos se buscan por ATRIBUCIÓN, no por nombre exacto: los
    # inspectores renombran los archivos antes de subirlos y vuelven como
    # "...desfibriladoresdea_08-09-2026 MMV.xlsx" o "..._26082026 EJMS.xlsx".
    # Con os.path.exists() esta cobertura daba 0 revisados de 32 teniendo 28 en
    # revision/, y el correo del cierre le habría dicho a los tres inspectores
    # que no había revisado nadie.
    devueltos = {}
    for i in archivos_revisados()[0]:
        devueltos.setdefault((i["slug"], i["fecha"]), []).append(i["ruta"])

    for b in esperados:
        b["reporte"] = os.path.exists(os.path.join(DIR_RESULTADOS, b["archivo"]))
        rutas = devueltos.get((b["slug"], date.fromisoformat(b["fecha"])), [])
        # Revisado es revisado ENTERO. Una planilla a medias también está en
        # revision/ (se copia sola apenas el inspector escribe), pero sigue
        # pendiente. Si hay dos archivos del mismo reporte, vale el más completo.
        b["sin_decidir"] = min(sin_decidir(r) for r in rutas) if rutas else 0
        b["revisado"] = bool(rutas) and b["sin_decidir"] == 0
        b["feriado"] = feriado_de(date.fromisoformat(b["fecha"]))

    return {
        "periodo": sem["periodo"],
        "mes_nombre": sem["mes_nombre"],
        "anio": sem["anio"],
        "mes": sem["mes"],
        "semana_mes": sem["n"],
        "semanas_del_mes": sem["total"],
        "es_semana_consolidacion": sem["ultima"],
        "es_hoy": fecha == martes,
        "fecha": martes.isoformat(),
        "fecha_dmy": martes.strftime("%d-%m-%Y"),
        "hora_envio": HORA_CONSOLIDACION,
        "instante_utc": instante_utc(martes, HORA_CONSOLIDACION),
        # Informativos. La rutina ya NO se reprograma con esto (ver el docstring):
        # sirven para decir en la notificación cuándo es el próximo cierre, y
        # para rearmar a mano si alguna vez vuelve a usarse un disparo único.
        "proximo_cierre": proximo_siguiente.isoformat(),
        "proximo_cierre_dmy": proximo_siguiente.strftime("%d-%m-%Y"),
        "proximo_cierre_utc": instante_utc(proximo_siguiente, HORA_CONSOLIDACION),
        "reunion_inicio": reunion.isoformat(),
        "reunion_fin": (reunion + timedelta(minutes=DURACION_REUNION_MIN)).isoformat(),
        "duracion_min": DURACION_REUNION_MIN,
        "destinatarios": [i["email"] for i in INSPECTORES],
        "organizador": ORGANIZADOR,
        "archivo_salida": os.path.join(
            DIR_RESULTADOS, f"Consolidado_Mensual_DM_{sem['mes']:02d}-{sem['anio']}.xlsx"
        ),
        "archivo_ics": os.path.join(
            DIR_RESULTADOS, f"Reunion_Mensual_DM_{sem['mes']:02d}-{sem['anio']}.ics"
        ),
        "bloques_esperados": esperados,
        "reportes_emitidos": sum(1 for b in esperados if b["reporte"]),
        "reportes_revisados": sum(1 for b in esperados if b["revisado"]),
        # Un reporte de feriado NO es un pendiente del inspector: se separa para
        # que el correo del cierre no lo cuente como incumplimiento.
        "sin_revisar": [b["archivo"] for b in esperados
                        if b["reporte"] and not b["revisado"] and not b["feriado"]],
        # Los de sin_revisar que el inspector ya empezó: lo ya decidido sí
        # aporta casos, pero faltan filas.
        "revision_incompleta": [{"archivo": b["archivo"], "fecha": b["fecha_dmy"],
                                 "categoria": b["categoria"], "inspector": b["inspector"],
                                 "sin_decidir": b["sin_decidir"]}
                                for b in esperados
                                if b["reporte"] and b["sin_decidir"] and not b["feriado"]],
        "excusados_feriado": [{"archivo": b["archivo"], "fecha": b["fecha_dmy"],
                               "categoria": b["categoria"], "feriado": b["feriado"]}
                              for b in esperados
                              if b["reporte"] and not b["revisado"] and b["feriado"]],
        "sin_emitir": [b["archivo"] for b in esperados if not b["reporte"]],
    }


# Septiembre de 2026 es el primer mes con ciclo completo: lo de agosto se revisó
# antes de que existiera el cierre mensual.
PRIMER_MES_CON_CICLO = (2026, 9)


def pendientes(fecha=None, desde=PRIMER_MES_CON_CICLO):
    """Los reportes emitidos hasta `fecha` que todavía no tienen su revisión.

    Mes por mes, del ciclo `desde` al de `fecha`, con la misma cobertura que usa
    el cierre (plan_consolidacion): un reporte está pendiente si está en
    resultados/, no tiene revisión atribuida en revision/ y su día no fue
    feriado. Se agrupan por el inspector que recibió el correo, que es quien
    tiene que devolverlo.
    """
    fecha = fecha or date.today()
    sem = semana_de(fecha)
    por_mes, por_inspector = {}, {}
    anio, mes = desde
    while (anio, mes) <= (sem["anio"], sem["mes"]):
        plan = plan_consolidacion(martes_consolidacion(anio, mes))
        faltan = [b for b in plan["bloques_esperados"]
                  if date.fromisoformat(b["fecha"]) <= fecha
                  and b["reporte"] and not b["revisado"] and not b["feriado"]]
        por_mes[plan["periodo"]] = len(faltan)
        for b in faltan:
            b["periodo"] = plan["periodo"]
            por_inspector.setdefault(b["inspector"], []).append(b)
        anio, mes = (anio + 1, 1) if mes == 12 else (anio, mes + 1)
    orden = [i["email"] for i in INSPECTORES]
    nombres = {i["email"]: i["nombre"] for i in INSPECTORES}
    return {
        "fecha": fecha.isoformat(),
        "total": sum(por_mes.values()),
        "por_mes": por_mes,
        "por_inspector": [
            {"email": e, "nombre": nombres.get(e, e), "pendientes": por_inspector[e]}
            for e in sorted(por_inspector, key=lambda e: orden.index(e) if e in orden else len(orden))
        ],
    }


def avanzar(fecha=None, slot=1, hallazgos=None, notas="", detectados=None):
    """Registra el bloque como procesado. Llamar SOLO tras un push exitoso.

    Escribe un archivo propio en historial/, nunca un archivo compartido: es lo
    que evita que las dos corridas del día choquen al empujar a la misma rama.
    """
    plan = construir_plan(fecha, slot)
    if not plan["habil"]:
        return plan

    entrada = {
        "categoria": plan["slug"],
        "nombre": plan["categoria"],
        "fecha": plan["fecha_iso"],
        "dia": plan["dia"],
        "slot": slot,
        "archivo": os.path.basename(plan["archivo_salida"]),
        "inspector": plan["inspector"]["email"],
    }
    if hallazgos is not None:
        entrada["hallazgos"] = hallazgos
    if detectados is not None:
        entrada["detectados"] = detectados
    if notas:
        entrada["notas"] = notas
    # El script de las planillas arma el correo al inspector con este registro:
    # si fue feriado, el correo lo dice y no le pone plazo.
    if plan.get("feriado"):
        entrada["feriado"] = plan["feriado"]

    os.makedirs(DIR_HISTORIAL, exist_ok=True)
    destino = os.path.join(DIR_HISTORIAL, f"{plan['fecha_iso']}_slot{slot}.json")
    with open(destino, "w", encoding="utf-8") as fh:
        json.dump(entrada, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    plan["registro"] = destino
    return plan


def cobertura():
    """Qué categorías tienen reporte y cuáles fueron revisadas por un inspector."""
    hist = leer_historial()
    filas = []
    for cat in CATEGORIAS:
        previos = reportes_previos(cat)
        dia = next(
            (f"{DIAS[d]} b{s}" for d, pair in CALENDARIO.items()
             for s, slug in enumerate(pair, 1) if slug == cat["slug"]),
            "-",
        )
        filas.append(
            {
                "slug": cat["slug"],
                "nombre": cat["nombre"],
                "programada": dia,
                "excel_isp": os.path.basename(resolver_excel(cat) or "") or "FALTA",
                "reportes": len(previos["crudos"]),
                "revisados": len(previos["revisados"]),
                "ultimo": os.path.basename(reporte_previo(cat) or "") or "nunca",
                "corridas": sum(1 for h in hist if h.get("categoria") == cat["slug"]),
            }
        )
    return filas


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--slot", type=int, choices=(1, 2), default=1, help="bloque del día")
    ap.add_argument("--fecha", help="fecha YYYY-MM-DD (por defecto hoy)")
    ap.add_argument("--json", action="store_true", help="salida JSON")
    ap.add_argument("--avanzar", action="store_true", help="registrar como procesado")
    ap.add_argument("--semana", action="store_true", help="plan de la semana")
    ap.add_argument("--estado", action="store_true", help="cobertura histórica")
    ap.add_argument("--pendientes", action="store_true",
                    help="revisiones que faltan devolver, por inspector")
    ap.add_argument("--consolidacion", action="store_true",
                    help="plan del cierre mensual (última semana del mes)")
    ap.add_argument("--hallazgos", type=int, default=None, help="n.º de hallazgos incluidos")
    ap.add_argument("--detectados", type=int, default=None, help="n.º de ofertas detectadas en total")
    ap.add_argument("--notas", default="", help="nota libre para el historial")
    args = ap.parse_args()

    fecha = date.fromisoformat(args.fecha) if args.fecha else date.today()

    if args.semana:
        sem = plan_semana(fecha)
        if args.json:
            print(json.dumps(sem, ensure_ascii=False, indent=2))
        else:
            insp = sem["inspector"]
            quien = f"revisa: {insp['nombre']} <{insp['email']}>" if insp else "sin inspector asignado"
            print(f"Semana {sem['semana_mes']}/{sem['semanas_del_mes']} de {sem['periodo']} "
                  f"(lunes {sem['lunes']})  ·  {quien}")
            if sem["modo_semana"] != "busqueda":
                print(f"  {construir_plan(fecha, 1)['motivo']}")
            # En semana de cierre no se busca, con o sin feriado: decir "se
            # fiscaliza" ahí sería falso (pasa con la Navidad de 2026).
            nota = ("Se fiscaliza, no se revisa." if sem["modo_semana"] == "busqueda"
                    else "Semana de cierre: no hay búsqueda.")
            for f, nombre in sorted(sem["feriados"].items()):
                dia = DIAS[date.fromisoformat(f).weekday()]
                print(f"  FERIADO {dia} {f}: {nombre}. {nota}")
            for b in sem["bloques"]:
                print(f"  {b['dia']:<10} bloque {b['slot']}  {b['categoria']}")
        return 0

    if args.consolidacion:
        con = plan_consolidacion(fecha)
        if args.json:
            print(json.dumps(con, ensure_ascii=False, indent=2))
            return 0 if con["es_hoy"] else 3
        print(f"Periodo        : {con['mes_nombre']} {con['anio']}  ({con['periodo']})")
        print(f"Consolidado    : martes {con['fecha_dmy']} a las {con['hora_envio']}")
        print(f"Reunión        : {con['reunion_inicio'][11:16]}-{con['reunion_fin'][11:16]} "
              f"({con['duracion_min']} min)")
        print(f"Destinatarios  : {', '.join(con['destinatarios'])}")
        print(f"Hoy es el día  : {'sí' if con['es_hoy'] else 'no'}")
        print(f"Reportes del mes: {con['reportes_emitidos']}/{len(con['bloques_esperados'])} emitidos  ·  "
              f"{con['reportes_revisados']} revisados por el inspector")
        if con["sin_revisar"]:
            print(f"  Sin revisar ({len(con['sin_revisar'])}): no aportan casos al consolidado")
            for a in con["sin_revisar"][:5]:
                print(f"    - {a}")
        if con["revision_incompleta"]:
            print(f"  De esos, revisados a medias ({len(con['revision_incompleta'])}): "
                  "lo ya decidido sí aporta casos")
            for b in con["revision_incompleta"][:5]:
                print(f"    - {b['archivo']}: {b['sin_decidir']} fila(s) sin «Decisión final»")
        if con["sin_emitir"]:
            print(f"  Sin emitir ({len(con['sin_emitir'])}): la corrida no llegó a generarlos")
            for a in con["sin_emitir"][:5]:
                print(f"    - {a}")
        print(f"Salida         : {con['archivo_salida']}")
        return 0 if con["es_hoy"] else 3

    if args.pendientes:
        pen = pendientes(fecha)
        if args.json:
            print(json.dumps(pen, ensure_ascii=False, indent=2))
            return 0
        meses = ", ".join(f"{p}: {n}" for p, n in pen["por_mes"].items())
        print(f"Revisiones pendientes al {fecha.strftime('%d-%m-%Y')}: {pen['total']}  ({meses})")
        for insp in pen["por_inspector"]:
            print(f"\n{insp['nombre']} <{insp['email']}>: {len(insp['pendientes'])}")
            for b in insp["pendientes"]:
                medias = (f"  (a medias: {b['sin_decidir']} fila(s) sin «Decisión final»)"
                          if b.get("sin_decidir") else "")
                print(f"  {b['fecha_dmy']}  {b['dia']:<10} bloque {b['slot']}  {b['categoria']}{medias}")
        if pen["total"]:
            print("\nCada una se completa en su planilla en línea, cuyo enlace llegó en el correo "
                  "«Fiscalización web DM — <categoría> — <fecha>». Las anteriores a las planillas se "
                  "devuelven respondiendo ese correo con el Excel revisado.")
        return 0

    if args.estado:
        filas = cobertura()
        if args.json:
            print(json.dumps(filas, ensure_ascii=False, indent=2))
        else:
            for f in filas:
                print(
                    f"{f['slug']:<26} {f['programada']:<14} "
                    f"reportes:{f['reportes']:<3} revisados:{f['revisados']:<3} último: {f['ultimo']}"
                )
        return 0

    plan = avanzar(fecha, args.slot, args.hallazgos, args.notas, args.detectados) if args.avanzar else construir_plan(fecha, args.slot)

    if args.json:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0 if plan.get("habil") else 3

    if not plan["habil"]:
        print(f"{plan['dia'].capitalize()} {plan['fecha']}: {plan['motivo']}")
        return 3

    insp = plan["inspector"]
    print(f"Día            : {plan['dia']} {plan['fecha']}  ·  bloque {plan['slot']}  "
          f"·  semana {plan['semana_mes']}/{plan['semanas_del_mes']} de {plan['periodo']}")
    print(f"Categoría      : {plan['categoria']}  ({plan['slug']})")
    print(f"Excel ISP      : {plan['excel_isp'] or '*** NO ENCONTRADO ***'}")
    print(f"Hoja           : {plan['hoja'] or '(primera hoja)'}")
    print(f"Objetivo       : {plan['objetivo_hallazgos']} hallazgos "
          f"({plan['objetivo_no_registrado']:.0%} no registrado / {plan['objetivo_registrado']:.0%} registrado)")
    print(f"Revisados      : {len(plan['reportes_revisados'])} en revision/  ·  "
          f"{len(plan['reportes_crudos'])} en resultados/")
    print(f"Reporte previo : {os.path.basename(plan['reporte_previo']) if plan['reporte_previo'] else '(ninguno)'}")
    print(f"Inspector      : {insp['nombre']} <{insp['email']}>  "
          f"(semana {insp['semana_mes']} del mes)")
    print(f"Salida         : {plan['archivo_salida']}")
    if args.avanzar:
        print(f"\nCorrida registrada en {os.path.relpath(plan.get('registro',''), RAIZ)}")
    if not plan["excel_encontrado"]:
        print(f"\nADVERTENCIA: falta el Excel ISP ({POR_SLUG[plan['slug']]['patron']})", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
