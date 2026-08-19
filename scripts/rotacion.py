#!/usr/bin/env python3
"""
Motor de rotación de categorías para la fiscalización web de DM (ISP/ANDIM).

Resuelve de forma determinista qué categoría toca fiscalizar hoy, sin depender
del orden que devuelva `ls` (que varía según la collation del sistema) ni del
nombre exacto del archivo Excel (que cambia cada vez que el ISP publica una
actualización, porque lleva la fecha embebida).

Uso:
    python3 scripts/rotacion.py            # muestra la categoría que toca hoy
    python3 scripts/rotacion.py --json     # idem, salida JSON para parsear
    python3 scripts/rotacion.py --avanzar  # registra la categoría como procesada
    python3 scripts/rotacion.py --estado   # muestra cobertura del ciclo actual
"""

import argparse
import glob
import json
import os
import re
import sys
from datetime import date

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_ISP = os.path.join(RAIZ, "registros-isp")
DIR_RESULTADOS = os.path.join(RAIZ, "resultados")
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


def siguiente_categoria(estado):
    """La categoría posterior a la última procesada; reinicia el ciclo al llegar al final."""
    ultimo = normalizar_slug(estado.get("ultima_categoria"))
    if ultimo is None:
        return CATEGORIAS[0]
    idx = next(i for i, c in enumerate(CATEGORIAS) if c["slug"] == ultimo)
    return CATEGORIAS[(idx + 1) % len(CATEGORIAS)]


def reporte_previo(cat):
    """Último Excel de resultados de esta categoría, para el ciclo de retroalimentación."""
    patron = os.path.join(DIR_RESULTADOS, f"Fiscalizacion_Web_DM_{cat['slug']}_*.xlsx")
    previos = glob.glob(patron)
    if not previos:
        return None
    return max(previos, key=os.path.getmtime)


def construir_plan():
    estado = cargar_estado()
    cat = siguiente_categoria(estado)
    excel = resolver_excel(cat)
    hoy = date.today()
    return {
        "slug": cat["slug"],
        "categoria": cat["nombre"],
        "excel_isp": excel,
        "excel_encontrado": excel is not None,
        "hoja": cat["hoja"],
        "in_vitro": cat["in_vitro"],
        "fecha": hoy.strftime("%d-%m-%Y"),
        "fecha_iso": hoy.isoformat(),
        "archivo_salida": os.path.join(
            DIR_RESULTADOS,
            f"Fiscalizacion_Web_DM_{cat['slug']}_{hoy.strftime('%d-%m-%Y')}.xlsx",
        ),
        "reporte_previo": reporte_previo(cat),
        "ultima_categoria_previa": estado.get("ultima_categoria", ""),
        "ultima_fecha_previa": estado.get("ultima_fecha", ""),
    }


def avanzar(hallazgos=None, notas=""):
    estado = cargar_estado()
    plan = construir_plan()
    estado["ultima_categoria"] = plan["slug"]
    estado["ultima_fecha"] = plan["fecha_iso"]
    entrada = {
        "categoria": plan["slug"],
        "nombre": plan["categoria"],
        "fecha": plan["fecha_iso"],
        "archivo": os.path.basename(plan["archivo_salida"]),
    }
    if hallazgos is not None:
        entrada["hallazgos"] = hallazgos
    if notas:
        entrada["notas"] = notas
    estado["historial"].append(entrada)
    guardar_estado(estado)
    return plan


def cobertura():
    """Qué categorías ya se cubrieron y cuáles faltan, mirando ./resultados/."""
    filas = []
    for cat in CATEGORIAS:
        previo = reporte_previo(cat)
        filas.append(
            {
                "slug": cat["slug"],
                "nombre": cat["nombre"],
                "excel_isp": os.path.basename(resolver_excel(cat) or "") or "FALTA",
                "ultimo_reporte": os.path.basename(previo) if previo else "nunca",
            }
        )
    return filas


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json", action="store_true", help="salida JSON")
    ap.add_argument("--avanzar", action="store_true", help="registrar como procesada")
    ap.add_argument("--estado", action="store_true", help="mostrar cobertura del ciclo")
    ap.add_argument("--hallazgos", type=int, default=None, help="n.º de hallazgos a registrar")
    ap.add_argument("--notas", default="", help="nota libre para el historial")
    args = ap.parse_args()

    if args.estado:
        filas = cobertura()
        if args.json:
            print(json.dumps(filas, ensure_ascii=False, indent=2))
        else:
            for f in filas:
                print(f"{f['slug']:<26} ISP: {f['excel_isp']:<62} último reporte: {f['ultimo_reporte']}")
        return 0

    plan = avanzar(args.hallazgos, args.notas) if args.avanzar else construir_plan()

    if args.json:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0

    print(f"Categoría      : {plan['categoria']}  ({plan['slug']})")
    print(f"Fecha          : {plan['fecha']}")
    print(f"Excel ISP      : {plan['excel_isp'] or '*** NO ENCONTRADO ***'}")
    print(f"Hoja           : {plan['hoja'] or '(primera hoja)'}")
    print(f"Reporte previo : {plan['reporte_previo'] or '(ninguno)'}")
    print(f"Salida         : {plan['archivo_salida']}")
    if args.avanzar:
        print("\nEstado actualizado en estado-rotacion.json")
    if not plan["excel_encontrado"]:
        print(
            f"\nADVERTENCIA: no hay Excel ISP que haga match con {POR_SLUG[plan['slug']]['patron']}",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
