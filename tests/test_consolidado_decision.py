"""
La «Decisión final» del consolidado mensual es una de cuatro opciones.

En la reunión de cierre se decide qué hacer con cada caso. La columna tiene una
lista desplegable cerrada, para que las cifras del reporte mensual salgan directo
de ella. Las opciones viven en una hoja oculta: una lleva coma, y en una lista
escrita en la regla la coma separa opciones.

Correr desde la raíz del repositorio:

    python3 -m unittest discover -s tests -v
"""

import os
import subprocess
import sys
import tempfile
import unittest

from openpyxl import load_workbook

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, os.path.join(RAIZ, "scripts"))

import consolidado  # noqa: E402

CUATRO = ("Se genera nueva alerta", "Falta información, se consultará",
          "Se descarta", "Ya procesado anteriormente en una alerta")


class DecisionDelConsolidado(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        salida = os.path.join(cls.tmp.name, "Consolidado_Mensual_DM_10-2026.xlsx")
        r = subprocess.run([sys.executable, os.path.join(RAIZ, "scripts", "consolidado.py"),
                            "--mes", "2026-10", "--salida", salida, "--json"],
                           capture_output=True, text=True, cwd=RAIZ)
        assert r.returncode == 0, r.stderr
        cls.wb = load_workbook(salida)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_las_cuatro_opciones(self):
        self.assertEqual(consolidado.DECISIONES, CUATRO)

    def test_columna_y_lista(self):
        ws = self.wb["Casos del mes"]
        cabecera = [c.value for c in ws[1]]
        self.assertIn("Decisión final", cabecera)
        self.assertNotIn("¿Se procesa como denuncia?", cabecera)
        letra = ws.cell(row=1, column=cabecera.index("Decisión final") + 1).column_letter
        [dv] = ws.data_validations.dataValidation
        self.assertEqual(dv.type, "list")
        # Sin «=» delante: así lo espera el formato de Excel para un rango.
        self.assertEqual(dv.formula1, "'Listas'!$A$1:$A$4")
        self.assertEqual(str(dv.sqref), f"{letra}2:{letra}{ws.max_row}")

    def test_hoja_oculta_al_final(self):
        self.assertEqual(self.wb.sheetnames[-1], "Listas")
        self.assertEqual(self.wb["Listas"].sheet_state, "hidden")
        self.assertEqual(tuple(c.value for c in self.wb["Listas"]["A"]), CUATRO)
        self.assertEqual(self.wb.sheetnames[:4], ["Casos del mes", "Discrepancias sin resolver",
                                                  "Notas de marketplace", "Cobertura del mes"])


if __name__ == "__main__":
    unittest.main()
