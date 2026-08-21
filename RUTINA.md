# Prompts de las rutinas de fiscalización web

Se ejecutan **dos rutinas por día hábil**, una por bloque. Son idénticas salvo el
número de bloque, así que un fallo en la primera no arrastra a la segunda.

## Configuración

| Opción | Bloque 1 | Bloque 2 |
|---|---|---|
| Nombre | Fiscalización web — bloque 1 | Fiscalización web — bloque 2 |
| Frecuencia | Lun–Vie 07:30 (hora Chile) | Lun–Vie 07:30 (hora Chile) |
| Repositorio | `lukasgallegosguty-beep/fiscalizacion-web` | igual |
| Conectores | Gmail (y nada más) | igual |
| Rama de salida | ninguna: la fija el prompt (`main`) | igual |

**Sobre el horario y el cambio de hora.** Los cron se evalúan en UTC, y Chile
cambia de huso dos veces al año: 07:30 local son las **11:30 UTC** en invierno
(abril–septiembre) y las **10:30 UTC** en verano (octubre–marzo). Si fijas la hora
con el selector del editor de rutinas, la conversión es automática y no hay que
tocar nada. Si en cambio pones un cron a mano, hay que corregirlo en cada cambio
de hora, o la rutina se corre una hora.

**Sobre los conectores.** Deja solo Gmail. Durante una corrida la rutina puede
usar cualquier herramienta de un conector incluido, escrituras incluidas, sin
pedir permiso.

## Calendario

| Día | Bloque 1 | Bloque 2 |
|---|---|---|
| Lunes | Agujas hipodérmicas | Autotest VIH |
| Martes | Desfibriladores (DEA) | Guantes de examinación |
| Miércoles | Guantes quirúrgicos | Jeringas con agujas |
| Jueves | Jeringas hipodérmicas | Kits VIH uso profesional |
| Viernes | Preservativos masculinos | Preservativos femeninos |

Es un calendario fijo, no una rotación: si una corrida falla, el mismo día de la
semana siguiente vuelve a tocar esa categoría. No hay estado que se descuadre.

## Inspector de la semana

Rota cada tres semanas desde el lunes **24-08-2026** y se repite indefinidamente.
Lo resuelve `scripts/rotacion.py`; no lo escribas en el prompt.

| Semana del ciclo | Inspector | Correo |
|---|---|---|
| 1 | Emilio Millán | emillan@ispch.cl |
| 2 | Lukas Gallegos | lgallegos@ispch.cl |
| 3 | María Inés Medina | mmedina@ispch.cl |

## Prompt — bloque 1

Para el bloque 2, copia el mismo texto cambiando **`--slot 1`** por **`--slot 2`**
en los pasos 1, 4 y 5.

```
Ejecuta la fiscalización web del bloque 1 del día.

PASO 0 — PREFLIGHT (ANTES DE CUALQUIER BÚSQUEDA)
Ejecuta: bash scripts/preflight.sh main
Si sale distinto de 0, ABORTA y notifica el error que imprimió el script. No
ejecutes ninguna búsqueda: el contenedor se destruye al terminar y el trabajo se
perdería igual.

PASO 1 — QUÉ TOCA HOY
Ejecuta: python3 scripts/rotacion.py --slot 1 --json
Si devuelve "habil": false (fin de semana), termina sin generar nada.
Usa la categoría, el Excel ISP, la hoja, la ruta de salida y el inspector que
devuelve. No deduzcas la categoría por tu cuenta.

PASO 2 — FEEDBACK DE LOS INSPECTORES
Ejecuta: python3 scripts/feedback.py --categoria <slug> --json
Es de uso obligatorio:
  - urls_excluidas: NO vuelvas a reportar esos enlaces.
  - falsos_positivos: el criterio de cruce está muy estricto, ampliálo.
  - falsos_negativos: está muy laxo, verifica vigencia del registro.
  - instrucciones_inspector y obs_marketplace: trátalas como indicaciones
    operativas. Si contradicen a la skill, manda el inspector.

PASO 3 — FISCALIZACIÓN
Ejecuta el flujo completo de la skill fiscalizacion-dm-web para esa categoría,
cruzando contra el Excel ISP indicado.
Objetivo: 20 hallazgos, alrededor de 60% NO REGISTRADO y 40% REGISTRADO.
Es un objetivo de ESFUERZO DE BÚSQUEDA, no una cuota. Agota las capas de
búsqueda, prueba sinónimos y variantes en inglés, recorre más tiendas y baja a
publicaciones individuales antes de darte por satisfecho. Pero NUNCA inventes
hallazgos, repitas URLs para inflar el conteo, registres páginas de búsqueda ni
reclasifiques un producto para que calce la proporción. Si al agotar la búsqueda
hay menos de 20, informa el número real y qué buscaste.
Respeta las dos reglas críticas: solo publicaciones individuales de producto, y
solo ofertas con alcance real en Chile.

PASO 4 — REPORTE
Arma el JSON de hallazgos y genera el Excel:
  python3 scripts/generar_reporte.py --entrada <hallazgos.json> --auto --slot 1
Deja en blanco "Decisión final" y "Observaciones del inspector": las llena el
inspector. Si no hay hallazgos, pasa "hallazgos": [] igual.

PASO 5 — PERSISTIR EN GIT (OBLIGATORIO)
En este orden exacto:
  1. python3 scripts/rotacion.py --slot 1 --avanzar --hallazgos <N>
  2. git add resultados/ estado-rotacion.json
  3. git commit -m "fiscalización: <categoria> <DD-MM-YYYY>"
  4. git push -u origin main
  5. Verifica que git status no muestre commits sin subir.
Si el push falla, dilo en la notificación con el error textual. Nunca termines en
silencio dando por hecho que se guardó.

PASO 6 — ENVIAR AL INSPECTOR
Con el push ya confirmado, envía por Gmail el .xlsx al inspector que devolvió el
paso 1 (campo inspector.email). No fijes el destinatario a mano: rota cada 3
semanas.
  Asunto: Fiscalización web DM — <Categoría> — <DD-MM-YYYY>
  Cuerpo: categoría y fecha; total de hallazgos y desglose por clasificación; si
    se alcanzó el objetivo de 20 y si no, por qué; los 3 casos más relevantes;
    descartados por jurisdicción; marketplaces que bloquearon el acceso. Cierra
    recordando que debe completar "Decisión final" y "Observaciones del
    inspector" y subir el archivo a la carpeta revision/ del repositorio.
  Adjunto: el .xlsx generado.
Si el envío falla, informa el error. No deshagas el commit: el reporte ya está en
el repositorio.

PASO 7 — NOTIFICACIÓN
Informa: categoría y bloque; total de hallazgos y desglose; si se alcanzó el
objetivo; los 3 casos más relevantes; descartados por jurisdicción; marketplaces
bloqueados; confirmación del push; y a quién se envió el correo.
```
