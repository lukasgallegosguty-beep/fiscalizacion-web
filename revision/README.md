# Carpeta `revision/`

Acá queda **lo que revisaron los inspectores**: los mismos reportes que la rutina
deja en `resultados/`, con las columnas **"Decisión final"** y **"Observaciones
del inspector"** completadas.

## Cómo llegan

**Solos, desde las planillas en línea.** Cada reporte se publica como planilla
de Google y el inspector trabaja ahí. Unos minutos después de que deja de
editar, un script copia la planilla a esta carpeta como Excel, con el mismo
nombre del reporte:

```
Fiscalizacion_Web_DM_agujas-hipodermicas_09-11-2026.xlsx
```

Una planilla en la que nadie escribió no se copia, porque contaría como
revisada. Si después se borra todo lo escrito, la copia también se borra. Cómo
funciona y cómo se instala: `integraciones/planillas-google/INSTALAR.md`.

Los reportes anteriores a las planillas (hasta el 06-11-2026) se devolvieron
como Excel, por correo o subidos a mano, y siguen acá. Para esos reportes las
dos vías siguen funcionando. Para uno que tiene planilla, el script no carga el
Excel que llegue por correo: le contesta al inspector con el enlace, para que no
haya dos versiones de la misma revisión.

## Para qué la usa la rutina

La rutina lee esta carpeta al inicio de cada corrida y la usa para:

1. **No volver a reportar URL.** Cualquier enlace que aparezca acá queda excluido
   de los hallazgos nuevos de esa categoría. También los de los reportes que
   todavía nadie revisa, porque cada uno es una planilla que alguien está por
   revisar. Los del anexo de un reporte, en cambio, sí vuelven a buscarse.
2. **Corregir el criterio de cruce.** Los falsos positivos y falsos negativos que
   marque el inspector ajustan la clasificación de la corrida siguiente.
3. **Incorporar las indicaciones del inspector.** El texto libre de
   "Observaciones del inspector" se lee como instrucción para la búsqueda: sitios
   a mirar, marcas a vigilar, criterios a afinar.

## Cuándo un reporte cuenta como revisado

Cuando todas sus filas **REGISTRADO** y **NO REGISTRADO** tienen "Decisión
final". Las filas FUERA DE ALCANCE y la fila "Sin hallazgos" no la exigen. En un
reporte sin hallazgos, basta con escribir "Sin hallazgos" en su "Decisión final"
al terminar la revisión de marketplace.

Una planilla a medias ya está en esta carpeta, pero sigue pendiente:

- `rotacion.py --pendientes` la lista con las filas que le faltan.
- En el consolidado aporta lo que ya se decidió, y la hoja «Cobertura del mes»
  la marca «En parte».

## Qué escribir en cada columna

| Columna | Quién la llena | Para qué sirve |
|---|---|---|
| Decisión final | Inspector | Confirma o corrige la clasificación automática (Correcto / Incorrecto). Detecta falsos positivos y negativos. |
| Observaciones del inspector | Inspector | Texto libre. Se lee como instrucción para las búsquedas siguientes de esa categoría. |

En la hoja "Búsquedas Marketplace" también hay una columna de observaciones del
inspector, con el mismo efecto. Esa hoja no lleva "Decisión final": son pistas
para investigación manual, no hallazgos clasificados.

## Nombres de los Excel de antes

Para los Excel devueltos a mano, lo ideal era no renombrar el archivo, pero el
lector tolera cómo los renombraron en la práctica. Todas estas funcionan:

```
Fiscalizacion_Web_DM_agujas-hipodermicas_24-08-2026_revisado.xlsx
Fiscalizacion_Web_DM_agujas-hipodermicas_31-08-2026_LGG.xlsx
Fiscalizacion_Web_DM_guantesquirurgicos_26082026 EJMS.xlsx
```

Lo que **sí** tiene que sobrevivir en el nombre es la categoría (aunque sea sin
guiones) y la fecha del reporte (`26-08-2026` o `26082026`). Sin la categoría el
archivo no se puede atribuir y queda fuera del feedback y del consolidado
mensual. Cuando eso pasa, la rutina lo reporta con el nombre exacto en vez de
ignorarlo: en agosto dos archivos se perdieron en silencio por esto, antes de
que el lector tolerara los renombres.

## El consolidado mensual

El martes de la última semana del mes llega a los tres, como planilla en línea,
el consolidado del mes: `Consolidado_Mensual_DM_MM-AAAA`, con los casos que
sobrevivieron a la revisión. Se completa entre los tres en la reunión de las
09:00, en dos columnas:

- **«Decisión final»**, una de cuatro opciones de una lista desplegable:
  - Se genera nueva alerta
  - Falta información, se consultará
  - Se descarta
  - Ya procesado anteriormente en una alerta
- **«Justificación de la decisión»**: el detalle, como el número de alerta, a
  quién se consulta o por qué se descarta.

No es la misma «Decisión final» de los reportes diarios. En el reporte diario,
el inspector dice si la rutina acertó (Correcto / Incorrecto); en el
consolidado, los tres deciden qué se hace con el caso. Hasta octubre de 2026 la
columna se llamaba «¿Se procesa como denuncia?» (SÍ / NO); las actas de
septiembre y octubre ya están pasadas a las cuatro opciones.

Sus otras hojas:

| Hoja | Qué trae |
|---|---|
| Casos del mes | Lo que hay que decidir. |
| Discrepancias sin resolver | Casos donde el inspector contradijo a la rutina pero el motivo fue un enlace caído o una publicación imposible de verificar. **No** son propuestas de denuncia. |
| Notas de marketplace | Observaciones sin enlaces, que no se pueden tabular pero explican qué se revisó a mano. |
| Cobertura del mes | Qué reportes se emitieron, cuáles se revisaron (enteros o «En parte») y cuántos casos aportó cada uno. |

Lo que se escribe en la planilla del consolidado se copia solo a esta carpeta y
queda como **acta del mes**, igual que las de septiembre y octubre, que se
devolvieron como Excel. La rutina no la cuenta como la revisión de un reporte,
pero sí usa lo que se decidió: las URL de sus casos no se vuelven a reportar, y
cada decisión con su justificación («ya procesado en alerta N°…», «no requiere
registro sanitario») llega como instrucción a la búsqueda siguiente de esa
categoría.

## Verificar qué está leyendo la rutina

```bash
python3 scripts/feedback.py --categoria agujas-hipodermicas
python3 scripts/consolidado.py --mes 2026-09
python3 scripts/rotacion.py --pendientes
```

Para comprobar que un archivo se está atribuyendo a su reporte:

```bash
python3 -c "import sys; sys.path.insert(0,'scripts'); import rotacion; \
  print(rotacion.archivos_revisados())"
```
