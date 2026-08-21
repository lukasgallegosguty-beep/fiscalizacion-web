#!/usr/bin/env python3
"""
Generador del Excel de hallazgos de fiscalización web (formato estándar ANDIM).

Toma un JSON con los hallazgos de la jornada y produce el .xlsx con el formato
que define la skill: 10 columnas fijas, hoja secundaria "Búsquedas Marketplace"
y fila "Sin hallazgos" cuando la búsqueda no arroja resultados.

Uso:
    python3 scripts/generar_reporte.py --entrada hallazgos.json --salida ruta.xlsx
    python3 scripts/generar_reporte.py --entrada hallazgos.json --auto

Estructura del JSON de entrada (todas las claves son opcionales salvo `categoria`):

    {
      "categoria": "Guantes quirúrgicos de látex",
      "fecha": "19-08-2026",
      "hallazgos": [
        {
          "nombre_dm": "...",           "url": "https://...",
          "titulo": "...",              "oferente": "...",
          "coincidencia": "NO",         "producto_isp": "",
          "registro_isp": "",           "clasificacion": "NO REGISTRADO",
          "observaciones": "..."
        }
      ],
      "marketplace": [
        {
          "marketplace": "Mercado Libre Chile", "url_busqueda": "https://...",
          "palabras_clave": "...",              "marcas_detectadas": "...",
          "cantidad_aprox": "~120",             "observaciones": "..."
        }
      ]
    }
"""

import argparse
import json
import os
import sys
from datetime import date

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Objetivo de esfuerzo de búsqueda (ver SKILL.md). No es una cuota a rellenar.
OBJETIVO = 20

# Paleta institucional: azul ISP para encabezados.
AZUL_ISP = "003366"
FILA_ALT = "F2F6FA"
VERDE = "D7F0D7"   # REGISTRADO
ROJO = "F8D7D7"    # NO REGISTRADO
AMARILLO = "FFF6CC"  # "Decisión final": requiere input humano
GRIS = "EDEDED"

COLUMNAS = [
    ("Nombre de DM ofertado", 34, "nombre_dm"),
    ("URL", 46, "url"),
    ("Título de la publicación", 40, "titulo"),
    ("Oferente", 26, "oferente"),
    ("Coincidencia", 14, "coincidencia"),
    ("Nombre del producto con el que coincide", 34, "producto_isp"),
    ("Registro del producto con el que coincide", 22, "registro_isp"),
    ("Clasificación", 18, "clasificacion"),
    ("Observaciones", 60, "observaciones"),
    ("Decisión final", 22, "decision_final"),
    ("Observaciones del inspector", 60, "obs_inspector"),
]

COLUMNAS_MKT = [
    ("Marketplace", 24, "marketplace"),
    ("URL de búsqueda", 52, "url_busqueda"),
    ("Palabras clave usadas", 34, "palabras_clave"),
    ("Marcas detectadas en filtros", 40, "marcas_detectadas"),
    ("Cantidad aprox. de publicaciones", 18, "cantidad_aprox"),
    ("Observaciones para el fiscalizador", 70, "observaciones"),
    ("Observaciones del inspector", 60, "obs_inspector"),
]

BORDE = Border(*[Side(style="thin", color="C8CDD4")] * 4)


def _encabezados(ws, columnas):
    fuente = Font(bold=True, color="FFFFFF", size=11)
    relleno = PatternFill("solid", fgColor=AZUL_ISP)
    for i, (titulo, ancho, _) in enumerate(columnas, 1):
        celda = ws.cell(row=1, column=i, value=titulo)
        celda.font = fuente
        celda.fill = relleno
        celda.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        celda.border = BORDE
        ws.column_dimensions[get_column_letter(i)].width = ancho
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "A2"


def _escribir_filas(ws, columnas, filas, colorear_clasificacion=True):
    for n, item in enumerate(filas, start=2):
        alterna = (n % 2 == 0)
        for i, (_, _, clave) in enumerate(columnas, 1):
            valor = item.get(clave, "")
            celda = ws.cell(row=n, column=i, value=valor)
            celda.alignment = Alignment(vertical="top", wrap_text=True)
            celda.border = BORDE
            if alterna:
                celda.fill = PatternFill("solid", fgColor=FILA_ALT)

        if colorear_clasificacion:
            clasif = str(item.get("clasificacion", "")).strip().upper()
            col_clasif = next(i for i, c in enumerate(columnas, 1) if c[2] == "clasificacion")
            celda = ws.cell(row=n, column=col_clasif)
            if clasif == "REGISTRADO":
                celda.fill = PatternFill("solid", fgColor=VERDE)
                celda.font = Font(bold=True, color="1E6B1E")
            elif clasif == "NO REGISTRADO":
                celda.fill = PatternFill("solid", fgColor=ROJO)
                celda.font = Font(bold=True, color="A11B1B")
            else:
                celda.fill = PatternFill("solid", fgColor=GRIS)

        # Las columnas que llena el inspector van en amarillo, en ambas hojas.
        for clave in ("decision_final", "obs_inspector"):
            col = next((i for i, c in enumerate(columnas, 1) if c[2] == clave), None)
            if col is not None:
                ws.cell(row=n, column=col).fill = PatternFill("solid", fgColor=AMARILLO)


def _fila_sin_hallazgos(fecha, categoria):
    """Fila testigo: deja constancia de que la categoría SÍ se revisó ese día."""
    return {
        "nombre_dm": "Sin hallazgos",
        "url": "",
        "titulo": "",
        "oferente": "",
        "coincidencia": "",
        "producto_isp": "",
        "registro_isp": "",
        "clasificacion": "SIN HALLAZGOS",
        "observaciones": (
            f"Revisión de la categoría «{categoria}» realizada el {fecha} sin detectar "
            "publicaciones individuales de productos no registrados. La ausencia de "
            "hallazgos no descarta ofertas no indexadas por los buscadores ni las "
            "alojadas en sitios con acceso restringido."
        ),
        "decision_final": "",
        "obs_inspector": "",
    }


def generar(datos, salida):
    categoria = datos.get("categoria", "(sin categoría)")
    fecha = datos.get("fecha") or date.today().strftime("%d-%m-%Y")
    hallazgos = datos.get("hallazgos") or []
    marketplace = datos.get("marketplace") or []

    wb = Workbook()
    ws = wb.active
    ws.title = "Hallazgos"
    _encabezados(ws, COLUMNAS)

    filas = hallazgos if hallazgos else [_fila_sin_hallazgos(fecha, categoria)]
    _escribir_filas(ws, COLUMNAS, filas)
    ws.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNAS))}{len(filas) + 1}"

    if marketplace:
        ws2 = wb.create_sheet("Búsquedas Marketplace")
        _encabezados(ws2, COLUMNAS_MKT)
        _escribir_filas(ws2, COLUMNAS_MKT, marketplace, colorear_clasificacion=False)

    os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
    wb.save(salida)

    return {
        "archivo": salida,
        "total": len(hallazgos),
        "no_registrado": sum(
            1 for h in hallazgos
            if str(h.get("clasificacion", "")).strip().upper() == "NO REGISTRADO"
        ),
        "registrado": sum(
            1 for h in hallazgos
            if str(h.get("clasificacion", "")).strip().upper() == "REGISTRADO"
        ),
        "marketplace": len(marketplace),
        "sin_hallazgos": not hallazgos,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--entrada", required=True, help="JSON con los hallazgos")
    ap.add_argument("--salida", help="ruta del .xlsx a generar")
    ap.add_argument(
        "--auto",
        action="store_true",
        help="deducir la ruta de salida desde scripts/rotacion.py",
    )
    ap.add_argument("--slot", type=int, choices=(1, 2), default=1,
                    help="bloque del día, usado junto con --auto")
    ap.add_argument("--fecha", help="fecha YYYY-MM-DD, usada junto con --auto")
    args = ap.parse_args()

    with open(args.entrada, encoding="utf-8") as fh:
        datos = json.load(fh)

    salida = args.salida
    if not salida:
        if not args.auto:
            print("Falta --salida (o usa --auto).", file=sys.stderr)
            return 1
        sys.path.insert(0, os.path.join(RAIZ, "scripts"))
        import rotacion
        from datetime import date as _date
        fecha = _date.fromisoformat(args.fecha) if args.fecha else None
        plan = rotacion.construir_plan(fecha, args.slot)
        if not plan.get("habil"):
            print(f"{plan['dia']} {plan['fecha']}: {plan['motivo']}", file=sys.stderr)
            return 3
        salida = plan["archivo_salida"]
        datos.setdefault("categoria", plan["categoria"])
        datos.setdefault("fecha", plan["fecha"])

    resumen = generar(datos, salida)

    # Contraste contra el objetivo de esfuerzo. Es informativo: si la realidad no
    # alcanza la meta se reporta el número real, nunca se rellena ni se reclasifica.
    total = resumen["total"]
    resumen["objetivo_hallazgos"] = OBJETIVO
    resumen["alcanza_objetivo"] = total >= OBJETIVO
    if total:
        resumen["pct_no_registrado"] = round(100 * resumen["no_registrado"] / total, 1)
        resumen["pct_registrado"] = round(100 * resumen["registrado"] / total, 1)
    if total < OBJETIVO:
        resumen["aviso"] = (
            f"Se encontraron {total} hallazgos, bajo el objetivo de {OBJETIVO}. "
            "Informar el número real en la notificación; no completar con casos "
            "inventados ni con páginas de búsqueda."
        )

    print(json.dumps(resumen, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
