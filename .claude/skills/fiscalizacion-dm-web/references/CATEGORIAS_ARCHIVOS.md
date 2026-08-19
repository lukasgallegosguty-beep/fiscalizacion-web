# Categorías de DM y Archivos Excel ISP

Referencia que vincula cada categoría de dispositivo médico con su archivo Excel del ISP y las URLs de descarga.

## DM con Registro Sanitario (no in vitro)

Fuente: https://www.ispch.cl/andim/listado-de-dispositivos-medicos-establecimientos-y-empresas/dispositivos-medicos-con-registro-sanitario/

| Categoría | Archivo Excel | Hoja principal | Columnas clave (fila 2) |
|---|---|---|---|
| Guantes quirúrgicos de látex | `Lista-de-Guantes-Quirurgicos-*.xlsx` | Hoja1 | N° REGISTRO, MARCA COMERCIAL, TITULAR, FABRICANTE, PAÍS, RESOLUCIÓN |
| Guantes de examen médico | `Lista-de-Guantes-de-Examinacion-*.xlsx` | Hoja1 | N° REGISTRO, MARCA COMERCIAL, TITULAR, FABRICANTE, PAÍS, RESOLUCIÓN |
| Preservativos masculinos (látex y sintéticos) | `Lista-de-Preservativos-de-latex-y-Sinteticos-*.xlsx` | Hoja1 | N° REGISTRO, MARCA COMERCIAL, TITULAR, FABRICANTE, PAÍS, RESOLUCIÓN |
| Preservativos femeninos | `Lista-de-Preservativos-Femeninos-*.xlsx` | Hoja1 | N° REGISTRO, MARCA COMERCIAL, TITULAR, FABRICANTE, PAÍS, RESOLUCIÓN |
| Agujas hipodérmicas | `Lista-de-Agujas-Hipodermicas-*.xlsx` | Hoja1 | N° REGISTRO, MARCA COMERCIAL, TITULAR, FABRICANTE, PAÍS, RESOLUCIÓN |
| Jeringas hipodérmicas | `Lista-de-Jeringas-Hipodermicas-*.xlsx` | Hoja1 | N° REGISTRO, MARCA COMERCIAL, TITULAR, FABRICANTE, PAÍS, RESOLUCIÓN |
| Jeringas con agujas hipodérmicas | `Lista-de-Jeringas-con-Agujas-Hipodermicas-*.xlsx` | Hoja1 | N° REGISTRO, MARCA COMERCIAL, TITULAR, FABRICANTE, PAÍS, RESOLUCIÓN |
| DEA | `Lista-de-Desfibriladores-*.xlsx` | Hoja1 | N° REGISTRO, MARCA COMERCIAL, TITULAR, FABRICANTE, PAÍS, RESOLUCIÓN |

## DM in vitro con Registro Sanitario

Fuente: https://www.ispch.cl/andim/listado-de-dispositivos-medicos-establecimientos-y-empresas/dispositivos-medicos-in-vitro-con-registro-sanitario/

| Categoría | Archivo Excel | Hoja principal | Columnas clave (fila 2) |
|---|---|---|---|
| Autotest VIH | `Lista-de-Autotest-para-la-deteccion-de-VIH-*.xlsx` | Autotest VIH | N° REGISTRO, MARCA COMERCIAL, TITULAR, FABRICANTE/PAÍS, RESOLUCIÓN, INSERTO, RÓTULO, VIDEO |
| Kits VIH uso profesional | `Lista-Kits-Registro-Sanitario-VIH-de-Uso-Profesional-*.xlsx` | KITS VIH USO PROFESIONAL | N° REGISTRO, FECHA INFORME, MARCA COMERCIAL, TITULAR, FABRICANTE, PAÍS, RESOLUCIÓN, INSERTO, RÓTULO |

## Notas sobre la estructura de los archivos

- Los nombres de archivo incluyen la fecha de actualización en formato DD-MM-YYYY.
- La fila 1 siempre contiene el título descriptivo de la lista (no es dato).
- La fila 2 contiene los encabezados de columna.
- Los datos comienzan en la fila 3.
- Algunos archivos tienen columnas adicionales vacías o hojas secundarias auxiliares que se pueden ignorar.
- La columna de resolución suele estar dividida en dos sub-columnas: número de resolución y fecha.
- Los archivos in vitro (Autotest y Kits VIH) incluyen columnas adicionales de inserto, rótulo y video autorizados.
