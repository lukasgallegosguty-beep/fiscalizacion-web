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

El mes se organiza en cuatro semanas, contadas por el lunes de cada semana:

    Semana 1   búsqueda   revisa Emilio Millán
    Semana 2   búsqueda   revisa Lukas Gallegos
    Semana 3   búsqueda   revisa María Inés Medina
    Semana 4   SIN BÚSQUEDA. El martes se emite el consolidado mensual a los
               tres y se reúnen a las 09:00 a resolver qué se denuncia.

Una semana pertenece al mes de su LUNES. La semana del lunes 28-09 sigue siendo
de septiembre aunque el jueves ya caiga en octubre: sin esa regla una misma
semana se contaría en dos meses y el inspector cambiaría a media semana.

Uso:
    python3 scripts/rotacion.py --slot 1              # bloque 1 de hoy
    python3 scripts/rotacion.py --slot 2 --json       # bloque 2, salida JSON
    python3 scripts/rotacion.py --semana              # plan de la semana
    python3 scripts/rotacion.py --estado              # cobertura histórica
    python3 scripts/rotacion.py --slot 1 --avanzar --hallazgos 21
    python3 scripts/rotacion.py --slot 1 --fecha 2026-08-24   # simular un día
"""

import argparse
import glob
import json
import os
import re
import sys
from datetime import date, datetime, time, timedelta

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
INSPECTORES = [
    {"nombre": "Emilio Millán", "email": "emillan@ispch.cl"},
    {"nombre": "Lukas Gallegos", "email": "lgallegos@ispch.cl"},
    {"nombre": "María Inés Medina", "email": "mmedina@ispch.cl"},
]
INSPECTOR_POR_SEMANA = {1: INSPECTORES[0], 2: INSPECTORES[1], 3: INSPECTORES[2]}

# Quien organiza la reunión mensual y firma la invitación de calendario.
ORGANIZADOR = {"nombre": "Lukas Gallegos", "email": "lgallegos@ispch.cl"}

# Semanas del mes en que se fiscaliza, y semana reservada al análisis mensual.
SEMANAS_BUSQUEDA = (1, 2, 3)
SEMANA_CONSOLIDACION = 4
DIA_CONSOLIDACION = 1        # martes (0 = lunes)
HORA_CONSOLIDACION = "07:30"  # envío del consolidado
HORA_REUNION = (9, 0)         # inicio de la reunión mensual
DURACION_REUNION_MIN = 60
# La reunión va en Google Calendar como un evento INDIVIDUAL por mes, no como
# uno recurrente: la única recurrencia que expresa estas fechas es RDATE (fechas
# explícitas), porque el martes de la semana 4 no es el "cuarto martes del mes"
# en 5 de cada 36 meses. Outlook no soporta RDATE y rechaza la invitación
# entera, así que un evento por mes es lo único que abre en ambos calendarios.

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


def semana_de(fecha):
    """Ubica la fecha en el calendario mensual.

    La semana pertenece al mes de su LUNES. Es lo que hace que la asignación no
    cambie a media semana cuando el mes parte un miércoles, y que cada semana
    tenga un único número de mes sin ambigüedad.
    """
    lunes = lunes_de(fecha)
    n = (lunes.day - 1) // 7 + 1
    return {
        "n": n,
        "lunes": lunes.isoformat(),
        "anio": lunes.year,
        "mes": lunes.month,
        "mes_nombre": MESES[lunes.month - 1],
        "periodo": f"{lunes.year}-{lunes.month:02d}",
    }


def modo_de(fecha):
    """Qué se hace esa semana: buscar, consolidar o nada."""
    n = semana_de(fecha)["n"]
    if n in SEMANAS_BUSQUEDA:
        return "busqueda"
    if n == SEMANA_CONSOLIDACION:
        return "consolidacion"
    # Cuatro meses al año tienen un quinto lunes. Esa semana queda fuera del
    # ciclo: el mes ya se cerró con el consolidado de la semana 4 y abrir una
    # cuarta semana de búsqueda no tendría inspector asignado.
    return "sin-programacion"


def inspector_de(fecha):
    """Inspector a cargo de la semana, o None si esa semana no se fiscaliza."""
    sem = semana_de(fecha)
    base = INSPECTOR_POR_SEMANA.get(sem["n"])
    if base is None:
        return None
    insp = dict(base)
    insp["semana_mes"] = sem["n"]
    insp["lunes_semana"] = sem["lunes"]
    insp["periodo"] = sem["periodo"]
    return insp


def lunes_semana4(anio, mes):
    """El lunes de la semana 4 de ese mes.

    Siempre cae entre el 22 y el 28: son siete días consecutivos, así que
    contienen exactamente un lunes, y todo mes llega al 28. La función no puede
    devolver None.
    """
    for d in range(22, 29):
        f = date(anio, mes, d)
        if f.weekday() == 0:
            return f
    raise AssertionError(f"{anio}-{mes:02d} sin lunes entre el 22 y el 28")


def martes_consolidacion(anio, mes):
    """El martes de la semana 4: día del consolidado y de la reunión."""
    return lunes_semana4(anio, mes) + timedelta(days=DIA_CONSOLIDACION)


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
        info = atribuir_archivo(ruta)
        if info is None:
            fallidos.append(os.path.basename(ruta))
            continue
        if slug and info["slug"] != slug:
            continue
        if anio and mes:
            if info["fecha"] is None or (info["fecha"].year, info["fecha"].month) != (anio, mes):
                continue
        ok.append(info)
    ok.sort(key=lambda i: (i["fecha"] or date.min, i["archivo"]))
    return ok, fallidos


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
    crudos = sorted(glob.glob(os.path.join(DIR_RESULTADOS, patron)), key=os.path.getmtime, reverse=True)
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
        "periodo": sem["periodo"],
        "modo_semana": modo,
    }

    # La semana 4 y el quinto lunes no se fiscalizan. Se responde habil: false
    # igual que un fin de semana, para que la rutina de búsqueda corte en el
    # paso 1 sin gastar la corrida.
    if modo != "busqueda":
        if modo == "consolidacion":
            martes = martes_consolidacion(sem["anio"], sem["mes"])
            base["motivo"] = (
                f"semana {sem['n']} de {sem['mes_nombre']}: semana de análisis mensual, "
                f"no se fiscaliza. El consolidado se emite el martes "
                f"{martes.strftime('%d-%m-%Y')} a las {HORA_CONSOLIDACION}."
            )
            base["fecha_consolidacion"] = martes.isoformat()
        else:
            base["motivo"] = (
                f"semana {sem['n']} de {sem['mes_nombre']}: fuera del ciclo mensual. "
                f"El mes ya se cerró en la semana {SEMANA_CONSOLIDACION}; "
                "no hay fiscalización programada."
            )
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
        "periodo": sem["periodo"],
        "modo_semana": modo_de(fecha),
        "inspector": inspector_de(fecha),
        "bloques": filas if modo_de(fecha) == "busqueda" else [],
    }


def bloques_del_mes(anio, mes):
    """Las 30 asignaciones de búsqueda del mes: 10 por cada semana 1, 2 y 3.

    Los lunes se derivan restando semanas al lunes de la semana 4, no contando
    hacia adelante desde el día 1. Así el mes que empieza a mitad de semana no
    puede desalinear la cuenta respecto de `semana_de()`.
    """
    l4 = lunes_semana4(anio, mes)
    filas = []
    for n in SEMANAS_BUSQUEDA:
        lunes = l4 - timedelta(weeks=SEMANA_CONSOLIDACION - n)
        insp = INSPECTOR_POR_SEMANA[n]
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
    semana 4. La rutina se dispara todos los martes porque cron no sabe expresar
    "semana 4 del mes", así que el filtro real vive aquí.
    """
    fecha = fecha or date.today()
    sem = semana_de(fecha)
    martes = martes_consolidacion(sem["anio"], sem["mes"])
    reunion = datetime.combine(martes, time(*HORA_REUNION))
    esperados = bloques_del_mes(sem["anio"], sem["mes"])

    for b in esperados:
        b["reporte"] = os.path.exists(os.path.join(DIR_RESULTADOS, b["archivo"]))
        b["revisado"] = os.path.exists(os.path.join(DIR_REVISION, b["archivo"]))

    return {
        "periodo": sem["periodo"],
        "mes_nombre": sem["mes_nombre"],
        "anio": sem["anio"],
        "mes": sem["mes"],
        "semana_mes": sem["n"],
        "es_semana_consolidacion": sem["n"] == SEMANA_CONSOLIDACION,
        "es_hoy": fecha == martes,
        "fecha": martes.isoformat(),
        "fecha_dmy": martes.strftime("%d-%m-%Y"),
        "hora_envio": HORA_CONSOLIDACION,
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
        "sin_revisar": [b["archivo"] for b in esperados if b["reporte"] and not b["revisado"]],
        "sin_emitir": [b["archivo"] for b in esperados if not b["reporte"]],
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
    ap.add_argument("--consolidacion", action="store_true",
                    help="plan del cierre mensual (semana 4)")
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
            print(f"Semana {sem['semana_mes']} de {sem['periodo']} (lunes {sem['lunes']})  ·  {quien}")
            if sem["modo_semana"] != "busqueda":
                print(f"  {construir_plan(fecha, 1)['motivo']}")
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
        if con["sin_emitir"]:
            print(f"  Sin emitir ({len(con['sin_emitir'])}): la corrida no llegó a generarlos")
            for a in con["sin_emitir"][:5]:
                print(f"    - {a}")
        print(f"Salida         : {con['archivo_salida']}")
        return 0 if con["es_hoy"] else 3

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
          f"·  semana {plan['semana_mes']} de {plan['periodo']}")
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
