# Prompt de la rutina de fiscalización web

Este es el texto que va en el editor de la rutina programada. Reemplaza al
anterior, que fallaba por tres motivos: dejaba la persistencia para el final
(cuando ya era tarde), deducía la categoría listando el directorio a ojo, y
reescribía el generador de Excel en cada corrida.

## Configuración de la rutina

| Opción | Valor recomendado | Motivo |
|---|---|---|
| Frecuencia | Diaria, día hábil | El ciclo completo de 10 categorías se cubre en dos semanas hábiles. |
| Rama | `main`, indicado en el prompt | Los resultados son archivos de datos que se agregan, no código que revisar. Una rama nueva por día obliga a un merge diario sin ningún beneficio. |

**La rama no es una opción de configuración: se controla desde el prompt.** Por
defecto las rutinas empujan a ramas con prefijo `claude/`, que siempre se
aceptan. Si el prompt indica otra rama, el push se acepta salvo que la rama esté
protegida, que alguien tenga un PR abierto desde ella, o que tenga commits de
otra persona. Ninguna de las tres aplica a `main` en este repositorio.

Por eso el Paso 5 del prompt dice `git push -u origin main` de forma explícita.
Si prefieres una instancia formal de revisión antes de que el hallazgo entre al
repositorio, quita esa línea: la rutina volverá a empujar a una rama `claude/`
y podrás abrir el PR desde la sesión.

## Prompt

```
Activa la rutina de fiscalización web para la categoría de ISP que corresponda hoy.

PASO 0 — PREFLIGHT (ANTES DE CUALQUIER BÚSQUEDA)
Ejecuta: bash scripts/preflight.sh
Si sale con código distinto de 0, ABORTA la rutina de inmediato y notifica el
error que imprimió el script. No ejecutes ninguna búsqueda web: el contenedor se
destruye al terminar y el trabajo se perdería igual. No reintentes el push al
final "por si acaso": si el preflight falla, el push también va a fallar.

PASO 1 — CATEGORÍA DEL DÍA
Ejecuta: python3 scripts/rotacion.py --json
Usa la categoría, el Excel ISP, la hoja y la ruta de salida que devuelve.
No listes el directorio manualmente ni deduzcas la categoría por el nombre de
archivo: los nombres del ISP llevan la fecha embebida y cambian en cada
actualización.

PASO 2 — RETROALIMENTACIÓN
El campo "reporte_previo" del paso anterior indica el último reporte de esta
misma categoría. Si existe, ábrelo y revisa la columna "Decisión final":
  - No vuelvas a reportar URLs que el fiscalizador ya evaluó.
  - Si hubo falsos positivos, ajusta el criterio de cruce (era demasiado laxo).
  - Si hubo falsos negativos, amplía los términos de búsqueda.

PASO 3 — FISCALIZACIÓN
Ejecuta el flujo completo de la skill fiscalizacion-dm-web para esa categoría,
usando el Excel ISP indicado como base de cruce. Respeta las dos reglas críticas:
solo publicaciones individuales de producto (nunca páginas de búsqueda), y solo
ofertas con alcance real en Chile.

PASO 4 — REPORTE
Arma el JSON de hallazgos y genera el Excel con:
  python3 scripts/generar_reporte.py --entrada <hallazgos.json> --auto
Si no hay hallazgos, pasa "hallazgos": [] igual: el script emite el archivo con
la fila "Sin hallazgos" y la fecha de revisión.

PASO 5 — PERSISTIR EN GIT (OBLIGATORIO)
En este orden exacto:
  1. python3 scripts/rotacion.py --avanzar --hallazgos <N>
  2. git add resultados/ estado-rotacion.json
  3. git commit -m "fiscalización: <categoria> <DD-MM-YYYY>"
  4. git push -u origin main
  5. Verifica que el push quedó bien: git status no debe mostrar commits sin subir.
Si el push falla, dilo en la notificación con el error textual. Nunca termines en
silencio dando por hecho que se guardó.

PASO 6 — NOTIFICACIÓN
Adjunta el .xlsx generado e informa:
  - Categoría revisada y fecha.
  - Total de hallazgos y desglose por clasificación.
  - Los 3 casos más relevantes para revisión.
  - Descartados por jurisdicción (sitios extranjeros sin venta a Chile).
  - Marketplaces que bloquearon el acceso y quedaron para revisión manual.
  - Confirmación explícita de que el push tuvo éxito.
```
