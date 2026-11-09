"""
Lo resuelto en las reuniones de cierre llega a la búsqueda siguiente.

feedback.analizar() lee las actas (los consolidados completados en la reunión,
en revision/): las URL de los casos de la categoría quedan excluidas y cada
decisión con su justificación entra como instrucción. Se prueba con un acta y
una revisión armadas a mano, en una carpeta de prueba.

Correr desde la raíz del repositorio:

    python3 -m unittest discover -s tests -v
"""

import os
import sys
import tempfile
import unittest

from openpyxl import Workbook

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(AQUI), "scripts"))

import feedback  # noqa: E402
import rotacion  # noqa: E402

def cabecera_acta(decision="Decisión final"):
    return ["Categoría", "Fecha de detección", "Nombre de DM ofertado", "URL",
            "Origen del caso", decision, "Justificación de la decisión"]


def acta(ruta, casos, decision="¿Se procesa como denuncia?"):
    """Por omisión, el formato de las actas hasta octubre de 2026 (SÍ/NO)."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Casos del mes"
    ws.append(cabecera_acta(decision))
    for c in casos:
        ws.append(c)
    wb.create_sheet("Cobertura del mes")
    wb.save(ruta)


def revision(ruta, urls):
    wb = Workbook()
    ws = wb.active
    ws.title = "Hallazgos"
    ws.append(["Nombre de DM ofertado", "URL", "Clasificación", "Decisión final", "Observaciones del inspector"])
    for u in urls:
        ws.append(["Aguja 30G", u, "NO REGISTRADO", "Correcto", ""])
    wb.save(ruta)


class DecisionesDeReunion(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.originales = (feedback.DIR_REVISION, rotacion.DIR_REVISION, rotacion.DIR_RESULTADOS)
        feedback.DIR_REVISION = rotacion.DIR_REVISION = self.tmp.name
        # resultados/ vacío: los reportes sin revisar también excluyen sus URL,
        # y aquí solo se prueban las revisiones y las actas.
        rotacion.DIR_RESULTADOS = os.path.join(self.tmp.name, "resultados")
        d = self.tmp.name
        revision(os.path.join(d, "Fiscalizacion_Web_DM_agujas-hipodermicas_05-10-2026 EJMS.xlsx"),
                 ["https://tienda.cl/a"])
        acta(os.path.join(d, "Consolidado_Mensual_DM_10-2026.xlsx"), [
            ["Agujas hipodérmicas", "05-10-2026", "Aguja manual", "https://ml.cl/b", "Detección manual",
             "SÍ", "Confirmar hallazgo con AYR y luego emitir alerta nueva."],
            ["Autotest VIH", "05-10-2026", "Autotest", "https://vih.cl/c", "Rutina",
             "NO", "Ya procesado en alerta N°054/26."],
            # En el acta quedó sin categoría: se atribuye por la URL, que está en la revisión.
            [None, "05-10-2026", "Aguja 30G", "https://tienda.cl/a", "Rutina",
             "NO", "Publicación no disponible (27-10)"],
            # Sin decisión: no hay nada que transmitir.
            ["Agujas hipodérmicas", "05-10-2026", "Otra aguja", "https://ml.cl/d", "Rutina", None, None],
        ])

    def tearDown(self):
        feedback.DIR_REVISION, rotacion.DIR_REVISION, rotacion.DIR_RESULTADOS = self.originales
        self.tmp.cleanup()

    def test_las_decisiones_llegan_a_su_categoria(self):
        r = feedback.analizar("agujas-hipodermicas")
        self.assertEqual(r["urls_excluidas"], ["https://tienda.cl/a", "https://ml.cl/b"])
        self.assertEqual([c["url"] for c in r["decisiones_reunion"]], ["https://ml.cl/b", "https://tienda.cl/a"])
        textos = [i["texto"] for i in r["instrucciones_inspector"]]
        self.assertTrue(any("reunión de cierre de 10-2026" in t and "SÍ" in t and "AYR" in t for t in textos))
        self.assertTrue(any("Publicación no disponible" in t for t in textos))
        self.assertFalse(any("ml.cl/d" in t for t in textos))

    def test_no_se_mezclan_categorias(self):
        r = feedback.analizar("autotest-vih")
        self.assertEqual(r["urls_excluidas"], ["https://vih.cl/c"])
        self.assertEqual(len(r["decisiones_reunion"]), 1)
        self.assertIn("alerta N°054/26", r["instrucciones_inspector"][0]["texto"])
        self.assertTrue(r["hay_feedback"], "una categoría con decisiones de cierre sí tiene feedback")

    def test_lee_el_formato_nuevo(self):
        """Desde noviembre de 2026 la columna es «Decisión final», con una de cuatro opciones."""
        acta(os.path.join(self.tmp.name, "Consolidado_Mensual_DM_11-2026.xlsx"), [
            ["Autotest VIH", "02-11-2026", "Autotest", "https://vih.cl/e", "Rutina",
             "Ya procesado anteriormente en una alerta", "Alerta N°054/26."],
        ], decision="Decisión final")
        r = feedback.analizar("autotest-vih")
        self.assertEqual(r["urls_excluidas"], ["https://vih.cl/c", "https://vih.cl/e"])
        self.assertIn("Decisión: Ya procesado anteriormente en una alerta.", r["instrucciones_inspector"][1]["texto"])

    def test_el_acta_sigue_sin_contar_como_revision(self):
        r = feedback.analizar("agujas-hipodermicas")
        self.assertEqual(r["archivos_revisados"], ["Fiscalizacion_Web_DM_agujas-hipodermicas_05-10-2026 EJMS.xlsx"])
        self.assertEqual(rotacion.archivos_revisados()[1], [])


if __name__ == "__main__":
    unittest.main()
