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

Sube el `.xlsx` tal cual, sin renombrarlo. El nombre original identifica la
categoría y la fecha:

```
Fiscalizacion_Web_DM_agujas-hipodermicas_24-08-2026.xlsx
```

Si prefieres marcar que ya fue revisado, agrega el sufijo `_revisado`:

```
Fiscalizacion_Web_DM_agujas-hipodermicas_24-08-2026_revisado.xlsx
```

Ambas formas funcionan. Lo que **no** debe cambiarse es el tramo
`Fiscalizacion_Web_DM_<categoria>_`, porque de ahí se deduce a qué categoría
corresponde el feedback.

## Qué escribir en cada columna

| Columna | Quién la llena | Para qué sirve |
|---|---|---|
| Decisión final | Inspector | Confirma o corrige la clasificación automática. Detecta falsos positivos y negativos. |
| Observaciones del inspector | Inspector | Texto libre. Se lee como instrucción para las búsquedas siguientes de esa categoría. |

En la hoja "Búsquedas Marketplace" también hay una columna de observaciones del
inspector, con el mismo efecto. Esa hoja no lleva "Decisión final": son pistas
para investigación manual, no hallazgos clasificados.

## Verificar qué está leyendo la rutina

```bash
python3 scripts/feedback.py --categoria agujas-hipodermicas
```
