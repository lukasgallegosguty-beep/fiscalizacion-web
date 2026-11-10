"""
El generador del reporte quita los hallazgos que ya están en el circuito.

El prompt de la rutina exige no repetir las urls_excluidas de feedback.py, pero
el 10-11-2026 los dos reportes del día traían un enlace ya excluido cada uno, y
el de Autotest VIH del 09-11-2026 repetía los diez. generar_reporte.py --auto
ahora los quita solo. Se prueba con carpetas de prueba en vez de las del
repositorio.

Correr desde la raíz del repositorio:

    python3 -m unittest discover -s tests -v
"""

import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import date
from unittest import mock

from openpyxl import Workbook, load_workbook

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(AQUI), "scripts"))

import feedback  # noqa: E402
import generar_reporte  # noqa: E402
import rotacion  # noqa: E402

ENCABEZADO = [c[0] for c in generar_reporte.COLUMNAS]


def excel(ruta, urls, decision=""):
    wb = Workbook()
    ws = wb.active
    ws.title = "Hallazgos"
    ws.append(ENCABEZADO)
    for u in urls:
        ws.append(["Aguja", u, "", "Tienda", "", "", "", "NO REGISTRADO", "", decision, ""])
    wb.save(ruta)


def hallazgo(url, nombre="Aguja 30G x 13mm"):
    return {"nombre_dm": nombre, "url": url, "titulo": nombre, "oferente": "Tienda",
            "coincidencia": "NO", "clasificacion": "NO REGISTRADO", "observaciones": "Sin registro"}


class SinRepetidos(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.resultados, self.revision, self.historial = (
            os.path.join(self.tmp.name, d) for d in ("resultados", "revision", "historial"))
        for d in (self.resultados, self.revision, self.historial):
            os.makedirs(d)
        self.originales = (rotacion.DIR_RESULTADOS, rotacion.DIR_REVISION, rotacion.DIR_HISTORIAL,
                           feedback.DIR_REVISION)
        rotacion.DIR_RESULTADOS, rotacion.DIR_REVISION, rotacion.DIR_HISTORIAL = (
            self.resultados, self.revision, self.historial)
        feedback.DIR_REVISION = self.revision
        # Un reporte anterior que nadie revisó, uno revisado, y el reporte del
        # mismo día que se está repitiendo.
        excel(os.path.join(self.resultados, "Fiscalizacion_Web_DM_agujas-hipodermicas_26-10-2026.xlsx"),
              ["https://tienda.cl/aguja-30g"])
        excel(os.path.join(self.revision, "Fiscalizacion_Web_DM_agujas-hipodermicas_02-11-2026 EJMS.xlsx"),
              ["https://farmacia.cl/aguja-27g"], decision="Correcto")
        excel(os.path.join(self.resultados, "Fiscalizacion_Web_DM_agujas-hipodermicas_09-11-2026.xlsx"),
              ["https://hoy.cl/aguja"])

    def tearDown(self):
        (rotacion.DIR_RESULTADOS, rotacion.DIR_REVISION, rotacion.DIR_HISTORIAL,
         feedback.DIR_REVISION) = self.originales
        self.tmp.cleanup()

    def generar(self, hallazgos):
        entrada = os.path.join(self.tmp.name, "hallazgos.json")
        with open(entrada, "w", encoding="utf-8") as fh:
            json.dump({"hallazgos": hallazgos}, fh)
        salida = io.StringIO()
        argv = ["generar_reporte.py", "--entrada", entrada, "--auto", "--slot", "1", "--fecha", "2026-11-09"]
        with mock.patch.object(sys, "argv", argv), redirect_stdout(salida):
            self.assertEqual(generar_reporte.main(), 0)
        return json.loads(salida.getvalue())

    def filas(self):
        ws = load_workbook(os.path.join(self.resultados, "Fiscalizacion_Web_DM_agujas-hipodermicas_09-11-2026.xlsx"))["Hallazgos"]
        return [r for r in ws.iter_rows(min_row=2, values_only=True)]

    def test_quita_lo_ya_reportado_o_revisado_aunque_venga_escrito_distinto(self):
        resumen = self.generar([
            hallazgo("https://TIENDA.cl/aguja-30g/"),                       # reporte anterior, sin revisar
            hallazgo("https://farmacia.cl/aguja-27g#polycard_client=x"),     # revisado
            hallazgo("https://hoy.cl/aguja"),                                # el de hoy: se repite la corrida
            hallazgo("https://nueva.cl/aguja", nombre="Aguja nueva"),
        ])
        self.assertEqual([f[1] for f in self.filas()], ["https://hoy.cl/aguja", "https://nueva.cl/aguja"])
        self.assertEqual([h["url"] for h in resumen["repetidas_quitadas"]],
                         ["https://TIENDA.cl/aguja-30g/", "https://farmacia.cl/aguja-27g#polycard_client=x"])
        self.assertEqual(resumen["total"], 2)
        self.assertEqual(resumen["total_detectado"], 2, "las cifras ya no cuentan las repetidas")
        self.assertNotIn("avisos_calidad", resumen, "no es un aviso: ya está corregido")

    def test_si_todo_era_repetido_la_fila_testigo_lo_dice(self):
        resumen = self.generar([hallazgo("https://tienda.cl/aguja-30g"), hallazgo("https://farmacia.cl/aguja-27g")])
        [fila] = self.filas()
        self.assertEqual(fila[0], "Sin hallazgos")
        self.assertIn("volvió a encontrar 2 oferta(s) que ya estaban", fila[8])
        self.assertTrue(resumen["sin_hallazgos"])

    def test_sin_repetidas_el_resumen_no_cambia(self):
        resumen = self.generar([hallazgo("https://nueva.cl/aguja")])
        self.assertNotIn("repetidas_quitadas", resumen)
        self.assertNotIn("nota_repetidas", resumen)
        [fila] = self.filas()
        self.assertEqual(fila[1], "https://nueva.cl/aguja")

    def test_quitar_repetidas_a_secas(self):
        datos = {"hallazgos": [hallazgo("https://tienda.cl/aguja-30g"), hallazgo("https://otra.cl/x"), hallazgo("")]}
        quitadas = generar_reporte.quitar_repetidas(datos, "agujas-hipodermicas", date(2026, 11, 9))
        self.assertEqual([h["url"] for h in quitadas], ["https://tienda.cl/aguja-30g"])
        self.assertEqual([h["url"] for h in datos["hallazgos"]], ["https://otra.cl/x", ""])


if __name__ == "__main__":
    unittest.main()
