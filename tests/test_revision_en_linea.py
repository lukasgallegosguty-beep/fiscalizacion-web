"""
Lo que cambia en la rutina con las planillas en línea.

revision/ se llena sola: el script de Google copia cada planilla ahí apenas el
inspector escribe algo (integraciones/planillas-google/). Eso cambia tres cosas,
que se prueban aquí con carpetas de prueba en vez de las del repositorio:

- Una revisión a medias no cuenta como revisada, ni en pendientes ni en el
  cierre; lo ya decidido sí aporta casos al consolidado.
- Los enlaces de los reportes anteriores no se vuelven a reportar aunque nadie
  los haya revisado todavía. Los del anexo y los del día, sí.
- El historial guarda el feriado, que el script usa para el correo.

Correr desde la raíz del repositorio:

    python3 -m unittest discover -s tests -v
"""

import json
import os
import sys
import tempfile
import unittest
from datetime import date

from openpyxl import Workbook, load_workbook

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(AQUI), "scripts"))

import consolidado  # noqa: E402
import feedback  # noqa: E402
import rotacion  # noqa: E402

ENCABEZADO = ["Nombre de DM ofertado", "URL", "Título de la publicación", "Oferente", "Coincidencia",
              "Nombre del producto con el que coincide", "Registro del producto con el que coincide",
              "Clasificación", "Observaciones", "Decisión final", "Observaciones del inspector"]


def fila(url, clasificacion="NO REGISTRADO", decision="", nombre="Aguja 30G"):
    return [nombre, url, nombre, "Tienda", "", "", "", clasificacion, "Observación de la rutina", decision, ""]


SIN_HALLAZGOS = ["Sin hallazgos", "", "", "", "", "", "", "SIN HALLAZGOS", "Revisión sin hallazgos", "", ""]


def reporte(ruta, filas, anexo=(), marketplace=""):
    wb = Workbook()
    ws = wb.active
    ws.title = "Hallazgos"
    ws.append(ENCABEZADO)
    for f in filas:
        ws.append(f)
    if anexo:
        wa = wb.create_sheet("Anexo — sobre el tope")
        wa.append(["Nombre de DM ofertado", "URL", "Oferente", "Clasificación", "Observaciones"])
        for url in anexo:
            wa.append(["Aguja del anexo", url, "Otra", "REGISTRADO", ""])
    wm = wb.create_sheet("Búsquedas Marketplace")
    wm.append(["Marketplace", "URL de búsqueda", "Observaciones del inspector"])
    wm.append(["Mercado Libre", "https://ml.cl/buscar", marketplace])
    wb.save(ruta)


def nombre(slug, dmy):
    return f"Fiscalizacion_Web_DM_{slug}_{dmy}.xlsx"


class ConCarpetasDePrueba(unittest.TestCase):

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

    def tearDown(self):
        (rotacion.DIR_RESULTADOS, rotacion.DIR_REVISION, rotacion.DIR_HISTORIAL,
         feedback.DIR_REVISION) = self.originales
        self.tmp.cleanup()

    def emitido(self, slug, dmy, filas, revisadas=None, **kw):
        """El reporte en resultados/ y, si se da `revisadas`, su planilla copiada a revision/."""
        reporte(os.path.join(self.resultados, nombre(slug, dmy)), filas, **kw)
        if revisadas is not None:
            reporte(os.path.join(self.revision, nombre(slug, dmy)), revisadas, **kw)


class RevisionAMedias(ConCarpetasDePrueba):
    """Semana 1 de noviembre de 2026, de Emilio."""

    def setUp(self):
        super().setUp()
        # A medias: una fila decidida (un NO REGISTRADO confirmado) y otra no.
        self.emitido("agujas-hipodermicas", "02-11-2026",
                     [fila("https://t.cl/1"), fila("https://t.cl/2")],
                     revisadas=[fila("https://t.cl/1", decision="Correcto"), fila("https://t.cl/2")])
        # Completa: la fila FUERA DE ALCANCE no pide decisión (en septiembre y
        # octubre los inspectores las dejaron con solo una observación).
        self.emitido("autotest-vih", "02-11-2026", [fila("https://v.cl/1"), fila("https://v.cl/9", "FUERA DE ALCANCE")],
                     revisadas=[fila("https://v.cl/1", decision="Correcto"), fila("https://v.cl/9", "FUERA DE ALCANCE")])
        # Emitido y sin tocar: no está en revision/.
        self.emitido("desfibriladores-dea", "03-11-2026", [fila("https://d.cl/1")])
        # Sin hallazgos y con la revisión de marketplace hecha: la fila sin
        # enlace no necesita decisión.
        self.emitido("preservativos-femeninos", "06-11-2026", [SIN_HALLAZGOS],
                     revisadas=[SIN_HALLAZGOS], marketplace="Revisé Mercado Libre: nada nuevo.")

    def bloque(self, plan, slug, fecha):
        return next(b for b in plan["bloques_esperados"] if b["slug"] == slug and b["fecha"] == fecha)

    def test_el_cierre_no_la_cuenta_como_revisada(self):
        plan = rotacion.plan_consolidacion(date(2026, 11, 24))
        medias = self.bloque(plan, "agujas-hipodermicas", "2026-11-02")
        self.assertFalse(medias["revisado"])
        self.assertEqual(medias["sin_decidir"], 1)
        self.assertTrue(self.bloque(plan, "autotest-vih", "2026-11-02")["revisado"])
        self.assertTrue(self.bloque(plan, "preservativos-femeninos", "2026-11-06")["revisado"])
        self.assertFalse(self.bloque(plan, "desfibriladores-dea", "2026-11-03")["revisado"])
        self.assertEqual(plan["sin_revisar"], [nombre("agujas-hipodermicas", "02-11-2026"),
                                               nombre("desfibriladores-dea", "03-11-2026")])
        self.assertEqual([(b["archivo"], b["sin_decidir"]) for b in plan["revision_incompleta"]],
                         [(nombre("agujas-hipodermicas", "02-11-2026"), 1)])
        self.assertEqual(plan["reportes_revisados"], 2)

    def test_sigue_pendiente_para_su_inspector(self):
        pen = rotacion.pendientes(date(2026, 11, 9))
        [emilio] = pen["por_inspector"]
        self.assertEqual(emilio["email"], "emillan@ispch.cl")
        self.assertEqual([(b["archivo"], b["sin_decidir"]) for b in emilio["pendientes"]],
                         [(nombre("agujas-hipodermicas", "02-11-2026"), 1),
                          (nombre("desfibriladores-dea", "03-11-2026"), 0)])

    def test_lo_decidido_entra_al_consolidado_y_la_cobertura_lo_dice(self):
        plan = rotacion.plan_consolidacion(date(2026, 11, 24))
        datos = consolidado.recopilar(2026, 11)
        self.assertEqual(sorted(c["url"] for c in datos["casos"]), ["https://t.cl/1", "https://v.cl/1"])
        salida = os.path.join(self.tmp.name, "Consolidado_Mensual_DM_11-2026.xlsx")
        consolidado.generar(2026, 11, datos, plan, salida)
        ws = load_workbook(salida)["Cobertura del mes"]
        cab = [c.value for c in ws[1]]
        filas = {(f[cab.index("Fecha")], f[cab.index("Categoría")]): f for f in ws.iter_rows(min_row=2, values_only=True)}
        medias = filas[("02-11-2026", "Agujas hipodérmicas")]
        self.assertEqual(medias[cab.index("Revisado y devuelto")], "En parte")
        self.assertIn("Revisión a medias: 1 fila(s) REGISTRADO o NO REGISTRADO sin «Decisión final»", medias[cab.index("Estado")])
        self.assertEqual(filas[("02-11-2026", "Autotest VIH")][cab.index("Revisado y devuelto")], "Sí")
        resumen = consolidado.resumir(2026, 11, datos, plan, salida)
        self.assertEqual([b["sin_decidir"] for b in resumen["revision_incompleta"]], [1])


class NoRepetirEnlaces(ConCarpetasDePrueba):

    def setUp(self):
        super().setUp()
        # Sin revisar, con un anexo.
        self.emitido("agujas-hipodermicas", "26-10-2026", [fila("https://a.cl/1"), fila("https://a.cl/2")],
                     anexo=["https://a.cl/anexo"])
        # Revisado.
        self.emitido("agujas-hipodermicas", "02-11-2026", [fila("https://a.cl/3")],
                     revisadas=[fila("https://a.cl/3", decision="Correcto")])
        # El de hoy, y uno de otra categoría.
        self.emitido("agujas-hipodermicas", "09-11-2026", [fila("https://a.cl/hoy")])
        self.emitido("autotest-vih", "26-10-2026", [fila("https://v.cl/otra")])

    def test_los_reportes_sin_revisar_tambien_excluyen_sus_enlaces(self):
        r = feedback.analizar("agujas-hipodermicas", hoy=date(2026, 11, 9))
        self.assertEqual(r["urls_excluidas"], ["https://a.cl/3", "https://a.cl/1", "https://a.cl/2"])
        self.assertEqual(r["urls_de_reportes_sin_revisar"], 2)
        self.assertEqual(r["archivos_revisados"], [nombre("agujas-hipodermicas", "02-11-2026")])
        self.assertTrue(r["hay_feedback"])

    def test_el_anexo_y_el_reporte_del_dia_no(self):
        r = feedback.analizar("agujas-hipodermicas", hoy=date(2026, 11, 9))
        self.assertNotIn("https://a.cl/anexo", r["urls_excluidas"], "el anexo vuelve en la próxima corrida")
        self.assertNotIn("https://a.cl/hoy", r["urls_excluidas"], "repetir la corrida de hoy no se excluye a sí misma")
        self.assertIn("https://a.cl/hoy", feedback.analizar("agujas-hipodermicas", hoy=date(2026, 11, 16))["urls_excluidas"])

    def test_sin_revisiones_igual_hay_que_excluir(self):
        r = feedback.analizar("autotest-vih", hoy=date(2026, 11, 9))
        self.assertEqual(r["urls_excluidas"], ["https://v.cl/otra"])
        self.assertEqual(r["archivos_revisados"], [])
        self.assertTrue(r["hay_feedback"], "no es la primera corrida de la categoría")


class FeriadoEnElHistorial(ConCarpetasDePrueba):

    def test_el_historial_guarda_el_feriado(self):
        rotacion.avanzar(date(2026, 12, 8), slot=1, hallazgos=3, detectados=5)
        with open(os.path.join(self.historial, "2026-12-08_slot1.json"), encoding="utf-8") as fh:
            entrada = json.load(fh)
        self.assertEqual(entrada["feriado"], "Inmaculada Concepción")
        self.assertEqual(entrada["inspector"], "lgallegos@ispch.cl")
        self.assertEqual(entrada["archivo"], nombre("desfibriladores-dea", "08-12-2026"))

    def test_un_dia_corriente_no_lo_menciona(self):
        rotacion.avanzar(date(2026, 12, 9), slot=1, hallazgos=3, detectados=5)
        with open(os.path.join(self.historial, "2026-12-09_slot1.json"), encoding="utf-8") as fh:
            self.assertNotIn("feriado", json.load(fh))


if __name__ == "__main__":
    unittest.main()
