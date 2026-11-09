"""
El script de las planillas en línea contra rotacion.py.

integraciones/planillas-google/planillas.gs corre en Google, en JavaScript, así
que no puede importar rotacion.py: repite la lista de inspectores, la de
categorías con sus nombres y la regla que reconoce a qué reporte corresponde un
archivo. Si se separan, el script publica una planilla en una carpeta con otro
nombre, o le confirma al inspector una revisión que la rutina después no sabe
atribuir. Este test exige que sigan calzando y corre los tests del script con
Node, si está instalado.

Correr desde la raíz del repositorio:

    python3 -m unittest discover -s tests -v
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, os.path.join(RAIZ, "scripts"))

import rotacion  # noqa: E402

CARPETA = os.path.join(RAIZ, "integraciones", "planillas-google")
SCRIPT = os.path.join(CARPETA, "planillas.gs")
TESTS_JS = [os.path.join(CARPETA, n) for n in ("correo.test.js", "planillas.test.js")]
NODE = shutil.which("node")

# Carga planillas.gs en un contexto vacío y le pasa a atribuir_() cada nombre
# que llega por la entrada estándar. Al cargarse, el script no llama a ningún
# servicio de Google, así que no hace falta simularlos.
ATRIBUIR_JS = r"""
const fs = require('fs'), vm = require('vm');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), ctx);
const nombres = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(nombres.map(n => ctx.atribuir_(n))));
"""


def texto_del_script():
    with open(SCRIPT, encoding="utf-8") as fh:
        return fh.read()


def inspectores_del_script():
    patron = r"'([^']+@[^']+)':\s*\{\s*nombre:\s*'([^']+)',\s*sufijo:\s*'([^']+)'\s*\}"
    return {email: {"nombre": nombre, "sufijo": sufijo}
            for email, nombre, sufijo in re.findall(patron, texto_del_script())}


def categorias_del_script():
    bloque = re.search(r"const CATEGORIAS = \[(.*?)\];", texto_del_script(), re.S).group(1)
    return re.findall(r"'([a-z0-9-]+)'", bloque)


def nombres_del_script():
    bloque = re.search(r"const NOMBRES_CATEGORIA = \{(.*?)\};", texto_del_script(), re.S).group(1)
    return dict(re.findall(r"'([a-z0-9-]+)':\s*'([^']+)'", bloque))


def cuentas_google_del_script():
    bloque = re.search(r"cuentasGoogle: \[(.*?)\]", texto_del_script(), re.S).group(1)
    return re.findall(r"'([^']+)'", bloque)


def atribucion_de_rotacion(nombre):
    """Lo que el script debería responder: categoría y fecha, o nada."""
    info = rotacion.atribuir_archivo(nombre)
    if info is None or info["fecha"] is None:
        return None
    return {"slug": info["slug"], "fecha": info["fecha"].isoformat()}


class MismasListasQueRotacion(unittest.TestCase):

    def test_mismos_inspectores(self):
        self.assertEqual(
            {email: d["nombre"] for email, d in inspectores_del_script().items()},
            {i["email"]: i["nombre"] for i in rotacion.INSPECTORES},
        )

    def test_sufijos_distintos(self):
        sufijos = [d["sufijo"] for d in inspectores_del_script().values()]
        self.assertEqual(len(sufijos), len(set(sufijos)))

    def test_mismas_categorias(self):
        self.assertEqual(categorias_del_script(), [c["slug"] for c in rotacion.CATEGORIAS])

    def test_mismos_nombres_de_categoria(self):
        """Los nombres de las carpetas del Drive y del asunto de los correos."""
        self.assertEqual(nombres_del_script(), {c["slug"]: c["nombre"] for c in rotacion.CATEGORIAS})

    def test_la_carpeta_se_comparte_con_los_inspectores(self):
        """Por omisión, con la cuenta del ISP de cada uno. Si alguno entra a Google con
        otra dirección, se cambia ahí y este test deja de aplicar: hay que ajustarlo."""
        self.assertEqual(sorted(cuentas_google_del_script()), sorted(i["email"] for i in rotacion.INSPECTORES))


class NombresQueArmaElScript(unittest.TestCase):

    def test_rotacion_atribuye_los_nombres_con_sufijo(self):
        """El nombre que arma el script cuando el adjunto no trae categoría ni fecha."""
        for d in inspectores_del_script().values():
            for slug in categorias_del_script():
                nombre = f"Fiscalizacion_Web_DM_{slug}_09-11-2026_{d['sufijo']}.xlsx"
                with self.subTest(nombre=nombre):
                    self.assertEqual(atribucion_de_rotacion(nombre), {"slug": slug, "fecha": "2026-11-09"})

    def test_el_consolidado_devuelto_no_cuenta_como_revision(self):
        with tempfile.TemporaryDirectory() as carpeta:
            for d in inspectores_del_script().values():
                open(os.path.join(carpeta, f"Consolidado_Mensual_DM_10-2026_{d['sufijo']}.xlsx"), "w").close()
            original = rotacion.DIR_REVISION
            rotacion.DIR_REVISION = carpeta
            try:
                self.assertEqual(rotacion.archivos_revisados(), ([], []))
            finally:
                rotacion.DIR_REVISION = original


@unittest.skipUnless(NODE, "Node no está instalado: no se pueden correr los tests del script")
class ElScriptConNode(unittest.TestCase):

    def test_atribuye_igual_que_rotacion(self):
        """Los nombres reales de revision/ y casos difíciles, en Python y en JavaScript."""
        reales = sorted(n for n in os.listdir(os.path.join(RAIZ, "revision")) if n.endswith(".xlsx"))
        self.assertGreater(len(reales), 40, "revision/ debería tener los archivos de agosto y septiembre")
        dificiles = [
            "Fiscalizacion_Web_DM_guantes_09-11-2026.xlsx",                # categoría incompleta
            "guantes quirurgicos y guantes examinacion 09-11-2026.xlsx",   # empate: ambiguo
            "Fiscalizacion_Web_DM_jeringas-hipodermicas_31-02-2026.xlsx",  # fecha imposible
            "Fiscalizacion_Web_DM_autotest-vih.xlsx",                      # sin fecha
            "jeringas con agujas hipodermicas 09-11-2026.xlsx",            # dos categorías, gana la más larga
            "Revisión agujas hipodérmicas 09.11.2026.xlsx",                # tildes y puntos
            "guantes examiñación 09-11-2026.xlsx",                         # eñe tipeada por ene
            "Consolidado_Mensual_DM_10-2026_emillan.xlsx",                 # no es un reporte
            "Libro1.xlsx",
        ]
        nombres = reales + dificiles
        r = subprocess.run([NODE, "-e", ATRIBUIR_JS, SCRIPT], input=json.dumps(nombres),
                           capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        for nombre, js in zip(nombres, json.loads(r.stdout)):
            with self.subTest(nombre=nombre):
                self.assertEqual(js, atribucion_de_rotacion(nombre))

    def test_tests_del_script(self):
        r = subprocess.run([NODE, "--test"] + TESTS_JS, capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout[-3000:] + r.stderr[-2000:])


if __name__ == "__main__":
    unittest.main()
