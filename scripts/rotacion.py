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

El inspector que revisa la semana rota cada 3 semanas desde el 24-08-2026.

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
from datetime import date, datetime, timedelta

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

# Inspector que revisa los hallazgos de la semana. Rota cada 3 semanas y se
# repite indefinidamente a partir del lunes de inicio.
INICIO_CICLO = date(2026, 8, 24)
INSPECTORES = [
    {"nombre": "Emilio Millán", "email": "emillan@ispch.cl"},
    {"nombre": "Lukas Gallegos", "email": "lgallegos@ispch.cl"},
    {"nombre": "María Inés Medina", "email": "mmedina@ispch.cl"},
]

# Objetivo de esfuerzo de búsqueda, no una cuota a rellenar. Ver SKILL.md:
# si la realidad no da para tanto, se informa el número real; nunca se inventan
# hallazgos ni se reclasifica para calzar la proporción.
OBJETIVO_HALLAZGOS = 20
OBJETIVO_NO_REGISTRADO = 0.60
OBJETIVO_REGISTRADO = 0.40


def lunes_de(fecha):
    return fecha - timedelta(days=fecha.weekday())


def inspector_de(fecha):
    """Inspector a cargo de la semana que contiene `fecha`."""
    semanas = (lunes_de(fecha) - INICIO_CICLO).days // 7
    insp = dict(INSPECTORES[semanas % len(INSPECTORES)])
    insp["semana_ciclo"] = (semanas % len(INSPECTORES)) + 1
    insp["semana_absoluta"] = semanas + 1
    insp["lunes_semana"] = lunes_de(fecha).isoformat()
    return insp


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
    revisados = sorted(glob.glob(os.path.join(DIR_REVISION, patron)), key=os.path.getmtime, reverse=True)
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
    cat = categoria_de(fecha, slot)

    if cat is None:
        return {
            "habil": False,
            "dia": DIAS[fecha.weekday()],
            "fecha": fecha.strftime("%d-%m-%Y"),
            "fecha_iso": fecha.isoformat(),
            "slot": slot,
            "motivo": "fin de semana: no hay fiscalización programada",
        }

    excel = resolver_excel(cat)
    previos = reportes_previos(cat)
    return {
        "habil": True,
        "dia": DIAS[fecha.weekday()],
        "slot": slot,
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
    return {"lunes": lunes.isoformat(), "inspector": inspector_de(fecha), "bloques": filas}


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
            print(f"Semana del {sem['lunes']}  ·  revisa: {insp['nombre']} <{insp['email']}>")
            for b in sem["bloques"]:
                print(f"  {b['dia']:<10} bloque {b['slot']}  {b['categoria']}")
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
    print(f"Día            : {plan['dia']} {plan['fecha']}  ·  bloque {plan['slot']}")
    print(f"Categoría      : {plan['categoria']}  ({plan['slug']})")
    print(f"Excel ISP      : {plan['excel_isp'] or '*** NO ENCONTRADO ***'}")
    print(f"Hoja           : {plan['hoja'] or '(primera hoja)'}")
    print(f"Objetivo       : {plan['objetivo_hallazgos']} hallazgos "
          f"({plan['objetivo_no_registrado']:.0%} no registrado / {plan['objetivo_registrado']:.0%} registrado)")
    print(f"Revisados      : {len(plan['reportes_revisados'])} en revision/  ·  "
          f"{len(plan['reportes_crudos'])} en resultados/")
    print(f"Reporte previo : {os.path.basename(plan['reporte_previo']) if plan['reporte_previo'] else '(ninguno)'}")
    print(f"Inspector      : {insp['nombre']} <{insp['email']}>  (semana {insp['semana_ciclo']}/3)")
    print(f"Salida         : {plan['archivo_salida']}")
    if args.avanzar:
        print(f"\nCorrida registrada en {os.path.relpath(plan.get('registro',''), RAIZ)}")
    if not plan["excel_encontrado"]:
        print(f"\nADVERTENCIA: falta el Excel ISP ({POR_SLUG[plan['slug']]['patron']})", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
