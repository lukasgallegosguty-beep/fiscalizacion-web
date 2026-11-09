"""
Los turnos de las rutinas contra el plan de Microsoft Planner del equipo.

turnos_planner.csv tiene una fila por semana, de septiembre de 2026 a diciembre
de 2027, transcrita del Planner: el lunes, si la semana es de búsqueda o de
cierre, quién revisa y a qué periodo pertenece. Septiembre y octubre de 2026 ya
se ejecutaron con la regla del miércoles y están en la tabla para comprobar que
siguen dando lo mismo.

Correr desde la raíz del repositorio:

    python3 -m unittest discover -s tests -v
"""

import csv
import os
import sys
import unittest
from datetime import date, timedelta

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(AQUI), "scripts"))

import rotacion  # noqa: E402

TABLA = os.path.join(AQUI, "turnos_planner.csv")

# Regla 2 del Planner, escrita aquí y no tomada de rotacion.py: el test tiene que
# poder decir que el código está mal, no repetir lo que el código dice.
CORREO = {
    "Emilio Millán": "emillan@ispch.cl",
    "Lukas Gallegos": "lgallegos@ispch.cl",
    "María Inés Medina": "mmedina@ispch.cl",
}


def leer_tabla():
    with open(TABLA, encoding="utf-8", newline="") as fh:
        filas = list(csv.DictReader(fh))
    for f in filas:
        f["lunes"] = date.fromisoformat(f["lunes"])
    return filas


def anio_mes(periodo):
    anio, mes = periodo.split("-")
    return int(anio), int(mes)


def por_periodo(filas):
    grupos = {}
    for f in filas:
        grupos.setdefault(f["periodo"], []).append(f)
    return grupos


def meses(desde, hasta):
    anio, mes = desde
    while (anio, mes) <= hasta:
        yield anio, mes
        anio, mes = (anio + 1, 1) if mes == 12 else (anio, mes + 1)


class TablaDelPlanner(unittest.TestCase):
    """Que la tabla esté bien formada. Si tiene un error, el resto no prueba nada."""

    @classmethod
    def setUpClass(cls):
        cls.filas = leer_tabla()

    def test_semanas_seguidas_sin_huecos(self):
        lunes = [f["lunes"] for f in self.filas]
        self.assertTrue(all(d.weekday() == 0 for d in lunes), "hay una fecha que no es lunes")
        for a, b in zip(lunes, lunes[1:]):
            self.assertEqual(b - a, timedelta(weeks=1), f"hueco o desorden entre {a} y {b}")

    def test_valores_validos(self):
        for f in self.filas:
            with self.subTest(lunes=f["lunes"].isoformat()):
                self.assertIn(f["tipo"], ("busqueda", "cierre"))
                if f["tipo"] == "cierre":
                    self.assertEqual(f["revisa"], "")
                else:
                    self.assertIn(f["revisa"], CORREO)

    def test_un_solo_cierre_por_mes_y_al_final(self):
        for periodo, semanas in por_periodo(self.filas).items():
            with self.subTest(periodo=periodo):
                tipos = [s["tipo"] for s in semanas]
                self.assertEqual(tipos.count("cierre"), 1)
                self.assertEqual(tipos[-1], "cierre")


class TurnosContraElPlanner(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.filas = leer_tabla()

    def test_semanas_de_cada_mes(self):
        """Cada mes tiene exactamente las semanas del Planner, en orden."""
        for periodo, semanas in por_periodo(self.filas).items():
            with self.subTest(periodo=periodo):
                self.assertEqual(rotacion.semanas_del_mes(*anio_mes(periodo)),
                                 [s["lunes"] for s in semanas])

    def test_plan_de_cada_dia_habil_y_bloque(self):
        """Lunes a viernes, bloques 1 y 2: el tipo, el inspector y el periodo de la tabla."""
        for f in self.filas:
            for i in range(5):
                dia = f["lunes"] + timedelta(days=i)
                for slot in (1, 2):
                    with self.subTest(dia=dia.isoformat(), bloque=slot):
                        plan = rotacion.construir_plan(dia, slot)
                        self.assertEqual(plan["periodo"], f["periodo"])
                        if f["tipo"] == "busqueda":
                            self.assertTrue(plan["habil"])
                            self.assertEqual(plan["modo_semana"], "busqueda")
                            self.assertEqual(plan["inspector"]["nombre"], f["revisa"])
                            self.assertEqual(plan["inspector"]["email"], CORREO[f["revisa"]])
                        else:
                            self.assertFalse(plan["habil"])
                            self.assertEqual(plan["modo_semana"], "consolidacion")
                            self.assertIsNone(plan.get("inspector"))

    def test_cierre_el_martes_de_su_semana(self):
        """El cierre cae el martes de la semana CIERRE y ese día es_hoy es true."""
        for f in self.filas:
            if f["tipo"] != "cierre":
                continue
            martes = f["lunes"] + timedelta(days=1)
            with self.subTest(periodo=f["periodo"]):
                self.assertEqual(rotacion.martes_consolidacion(*anio_mes(f["periodo"])), martes)
                plan = rotacion.plan_consolidacion(martes)
                self.assertTrue(plan["es_hoy"])
                self.assertEqual(plan["periodo"], f["periodo"])
                self.assertEqual(plan["fecha"], martes.isoformat())

    def test_reportes_esperados_del_cierre(self):
        """La cobertura del consolidado espera los mismos bloques e inspectores que el correo.

        bloques_del_mes e inspector_de usan la misma función; si se separan, la
        hoja de cobertura le atribuye un reporte a quien no lo recibió.
        """
        for periodo, semanas in por_periodo(self.filas).items():
            esperado = {}
            for f in semanas:
                if f["tipo"] != "busqueda":
                    continue
                for i in range(5):
                    dia = (f["lunes"] + timedelta(days=i)).isoformat()
                    for slot in (1, 2):
                        esperado[(dia, slot)] = CORREO[f["revisa"]]
            obtenido = {(b["fecha"], b["slot"]): b["inspector"]
                        for b in rotacion.bloques_del_mes(*anio_mes(periodo))}
            with self.subTest(periodo=periodo):
                self.assertEqual(obtenido, esperado)


class ReglaFueraDeLaTabla(unittest.TestCase):
    """Lo que la tabla no cubre: que la regla no deje semanas sueltas ni repetidas."""

    def test_cada_semana_en_un_solo_mes_hasta_2028(self):
        dueño = {}
        for anio, mes in meses((2026, 9), (2028, 12)):
            semanas = rotacion.semanas_del_mes(anio, mes)
            with self.subTest(periodo=f"{anio}-{mes:02d}"):
                self.assertIn(len(semanas), (4, 5))
            for lunes in semanas:
                self.assertNotIn(lunes, dueño, f"el lunes {lunes} está en dos meses")
                dueño[lunes] = (anio, mes)
        lunes = date(2026, 8, 31)
        while lunes <= date(2028, 12, 25):
            self.assertIn(lunes, dueño, f"el lunes {lunes} no pertenece a ningún mes")
            lunes += timedelta(weeks=1)

    def test_cuarta_semana_fuera_de_la_tabla_es_de_emilio(self):
        for anio, mes in meses((2028, 1), (2035, 12)):
            semanas = rotacion.semanas_del_mes(anio, mes)
            if len(semanas) == 5 and (anio, mes) not in rotacion.CUARTA_SEMANA:
                insp = rotacion.inspector_de(semanas[3])
                self.assertEqual(insp["email"], CORREO["Emilio Millán"], f"{anio}-{mes:02d}")
                return
        self.fail("no apareció ningún mes de cinco semanas fuera de la tabla")


if __name__ == "__main__":
    unittest.main()
