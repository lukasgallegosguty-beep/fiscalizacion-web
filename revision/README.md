# Carpeta `revision/`

Acá se cargan los Excel **ya revisados por los inspectores**: los mismos archivos
que la rutina deja en `resultados/`, pero con las columnas **"Decisión final"** y
**"Observaciones del inspector"** completadas.

La rutina lee esta carpeta al inicio de cada corrida y usa su contenido para:

1. **No volver a reportar URLs ya evaluadas.** Cualquier enlace que aparezca acá
   queda excluido de los hallazgos nuevos de esa categoría.
2. **Corregir el criterio de cruce.** Los falsos positivos y falsos negativos que
   marque el inspector ajustan la clasificación de la corrida siguiente.
3. **Incorporar las indicaciones del inspector.** El texto libre de
   "Observaciones del inspector" se lee como instrucción para la búsqueda: sitios
   a mirar, marcas a vigilar, criterios a afinar.

## Cómo cargar un archivo revisado

Sube el `.xlsx`. Lo ideal es no renombrarlo, porque el nombre original ya trae la
categoría y la fecha:

```
Fiscalizacion_Web_DM_agujas-hipodermicas_24-08-2026.xlsx
```

Pero el lector tolera cómo los renombran en la práctica. Todas estas funcionan:

```
Fiscalizacion_Web_DM_agujas-hipodermicas_24-08-2026_revisado.xlsx
Fiscalizacion_Web_DM_agujas-hipodermicas_31-08-2026_LGG.xlsx
Fiscalizacion_Web_DM_guantesquirurgicos_26082026 EJMS.xlsx
```

Se puede agregar un sufijo con iniciales, quitar los guiones del nombre de la
categoría o de la fecha, y usar espacios. Lo que **sí** tiene que sobrevivir en
el nombre son dos cosas:

- **La categoría**, aunque sea sin guiones (`guantesquirurgicos` vale).
- **La fecha del reporte**, como `26-08-2026` o `26082026`.

Sin la categoría el archivo no se puede atribuir y queda fuera del feedback y del
consolidado mensual. Cuando eso pasa, la rutina lo reporta con el nombre exacto
en vez de ignorarlo: en agosto dos archivos se perdieron en silencio por esto,
antes de que el lector tolerara los renombres.

Para comprobar que un archivo se está leyendo:

```bash
python3 -c "import sys; sys.path.insert(0,'scripts'); import rotacion; \
  print(rotacion.archivos_revisados())"
```

## Qué escribir en cada columna

| Columna | Quién la llena | Para qué sirve |
|---|---|---|
| Decisión final | Inspector | Confirma o corrige la clasificación automática. Detecta falsos positivos y negativos. |
| Observaciones del inspector | Inspector | Texto libre. Se lee como instrucción para las búsquedas siguientes de esa categoría. |

En la hoja "Búsquedas Marketplace" también hay una columna de observaciones del
inspector, con el mismo efecto. Esa hoja no lleva "Decisión final": son pistas
para investigación manual, no hallazgos clasificados.

## El consolidado mensual

El martes de la semana 4 llega por correo un Excel distinto,
`Consolidado_Mensual_DM_MM-AAAA.xlsx`, con los casos del mes que sobrevivieron a
la revisión. Ese archivo **no** lleva "Decisión final": lleva
**«¿Se procesa como denuncia?»** (SÍ / NO, con lista desplegable) y
**«Justificación de la decisión»**, y se completan entre los tres en la reunión
de las 09:00.

Sus otras hojas:

| Hoja | Qué trae |
|---|---|
| Casos del mes | Lo que hay que decidir. |
| Discrepancias sin resolver | Casos donde el inspector contradijo a la rutina pero el motivo fue un enlace caído o una publicación imposible de verificar. **No** son propuestas de denuncia. |
| Notas de marketplace | Observaciones sin enlaces, que no se pueden tabular pero explican qué se revisó a mano. |
| Cobertura del mes | Qué reportes se emitieron, cuáles volvieron revisados y cuántos casos aportó cada uno. |

El consolidado completado se sube a esta misma carpeta.

## Verificar qué está leyendo la rutina

```bash
python3 scripts/feedback.py --categoria agujas-hipodermicas
python3 scripts/consolidado.py --mes 2026-09
```
