"""
Las revisiones pendientes (rotacion.pendientes, o rotacion.py --pendientes)
con carpetas de prueba en vez de resultados/ y revision/.

Correr desde la raíz del repositorio:

    python3 -m unittest discover -s tests -v
"""

import os
import sys
import tempfile
import unittest
from datetime import date

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(AQUI), "scripts"))

import rotacion  # noqa: E402


def reporte(slug, dmy):
    return f"Fiscalizacion_Web_DM_{slug}_{dmy}.xlsx"


class Pendientes(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.resultados = os.path.join(self.tmp.name, "resultados")
        self.revision = os.path.join(self.tmp.name, "revision")
        os.makedirs(self.resultados)
        os.makedirs(self.revision)
        self.originales = (rotacion.DIR_RESULTADOS, rotacion.DIR_REVISION)
        rotacion.DIR_RESULTADOS, rotacion.DIR_REVISION = self.resultados, self.revision

    def tearDown(self):
        rotacion.DIR_RESULTADOS, rotacion.DIR_REVISION = self.originales
        self.tmp.cleanup()

    def crear(self, carpeta, nombre):
        open(os.path.join(carpeta, nombre), "w").close()

    def test_emitido_sin_revision_y_sin_feriado(self):
        # Emilio, lunes 05-10: el bloque 1 volvió revisado (renombrado), el 2 no.
        self.crear(self.resultados, reporte("agujas-hipodermicas", "05-10-2026"))
        self.crear(self.resultados, reporte("autotest-vih", "05-10-2026"))
        self.crear(self.revision, "Fiscalizacion_Web_DM_agujasHipodermicas_05102026 EJMS.xlsx")
        # Lukas: el lunes 12-10 fue feriado y no se le exige; el martes 13-10 sí.
        self.crear(self.resultados, reporte("agujas-hipodermicas", "12-10-2026"))
        self.crear(self.resultados, reporte("desfibriladores-dea", "13-10-2026"))
        # María Inés: un reporte posterior a la fecha consultada todavía no cuenta.
        self.crear(self.resultados, reporte("agujas-hipodermicas", "19-10-2026"))

        pen = rotacion.pendientes(date(2026, 10, 14))

        self.assertEqual(pen["total"], 2)
        self.assertEqual(pen["por_mes"], {"2026-09": 0, "2026-10": 2})
        self.assertEqual(
            [(i["email"], [b["archivo"] for b in i["pendientes"]]) for i in pen["por_inspector"]],
            [("emillan@ispch.cl", [reporte("autotest-vih", "05-10-2026")]),
             ("lgallegos@ispch.cl", [reporte("desfibriladores-dea", "13-10-2026")])],
        )

    def test_sin_reportes_no_hay_pendientes(self):
        pen = rotacion.pendientes(date(2026, 11, 9))
        self.assertEqual(pen["total"], 0)
        self.assertEqual(pen["por_inspector"], [])
        self.assertEqual(list(pen["por_mes"]), ["2026-09", "2026-10", "2026-11"])

    def test_cuenta_por_el_mes_del_ciclo(self):
        """El lunes 28-12-2026 es la semana 1 de enero de 2027, de Emilio."""
        self.crear(self.resultados, reporte("agujas-hipodermicas", "28-12-2026"))
        pen = rotacion.pendientes(date(2026, 12, 28))
        self.assertEqual(pen["por_mes"]["2026-12"], 0)
        self.assertEqual(pen["por_mes"]["2027-01"], 1)
        self.assertEqual(pen["por_inspector"][0]["email"], "emillan@ispch.cl")
        self.assertEqual(pen["por_inspector"][0]["pendientes"][0]["periodo"], "2027-01")


if __name__ == "__main__":
    unittest.main()
