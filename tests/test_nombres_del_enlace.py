"""El nombre de un caso de marketplace cuando el inspector no lo escribió.

Se deduce del enlace. En el cierre de noviembre de 2026 salieron seis casos de
Yapo como «Salud belleza belleza» (la sección del sitio) y tres de Falabella como
«Falabella cl» (el país), porque se tomaba el primer tramo con guiones de la ruta
y no el del producto.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import consolidado  # noqa: E402


def nombre(url, texto=""):
    return consolidado._nombre_del_item(texto, url)


class NombreDeducidoDelEnlace(unittest.TestCase):
    def test_yapo_toma_el_producto_y_no_la_seccion(self):
        self.assertEqual(
            nombre("https://www.yapo.cl/salud-belleza-belleza/desfibrilador-externo-auto-dea-medicaltech-i-aed7/27157000"),
            "Desfibrilador externo auto dea medicaltech i aed7 (deducido del enlace)")

    def test_yapo_con_un_titulo_corto_tambien(self):
        """Empate de palabras con la sección: gana el producto, que va después."""
        self.assertEqual(
            nombre("https://www.yapo.cl/salud-belleza-belleza/desfibrilador-dea-usado/26398083"),
            "Desfibrilador dea usado (deducido del enlace)")

    def test_falabella_toma_el_producto_y_no_el_pais(self):
        self.assertEqual(
            nombre("https://www.falabella.com/falabella-cl/product/120301435/Aguja-Hipodermica-30G*-4MM-*-100-Unidades/120301436"),
            "Aguja Hipodermica 30G 4MM 100 Unidades (deducido del enlace)")

    def test_mercado_libre_sigue_igual(self):
        self.assertEqual(
            nombre("https://www.mercadolibre.cl/jeringa-desechable-luer-lock-jumala-20cc-21g-x-1-12-20-ml/p/MLC6882"),
            "Jeringa desechable luer lock jumala 20cc 21g x 1 12 20 ml (deducido del enlace)")

    def test_articulo_de_mercado_libre_sin_codigo(self):
        self.assertEqual(
            nombre("https://articulo.mercadolibre.cl/MLC-1743364847-guantes-de-procedimiento-desechables-de-latex-100pcs-_JM"),
            "Guantes de procedimiento desechables de latex 100pcs (deducido del enlace)")

    def test_el_nombre_que_escribio_el_inspector_manda(self):
        self.assertEqual(
            nombre("https://www.yapo.cl/salud-belleza-belleza/guantes/123",
                   "3. Guantes Sensitive Hygieina talla M: https://www.yapo.cl/salud-belleza-belleza/guantes/123"),
            "Guantes Sensitive Hygieina talla M")

    def test_sin_nada_que_deducir(self):
        self.assertEqual(nombre("https://www.ejemplo.cl/123"), "(no consignado por el inspector)")


if __name__ == "__main__":
    unittest.main()
