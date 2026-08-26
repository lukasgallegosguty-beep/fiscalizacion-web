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
El reporte lleva un TOPE DE 10 HALLAZGOS, pero eso NO es un tope de búsqueda.
Busca de forma exhaustiva igual que siempre: agota las capas, prueba sinónimos y
variantes en inglés, recorre tiendas chicas y marketplaces. Si te detienes al
llegar a 10 vas a entregar los 10 primeros y no los 10 que más importan, porque
las tiendas grandes y formales son las que mejor indexan y son las que sí
cumplen.
Clasifica TODO lo que encuentres y pásalo completo al generador: el script aplica
el tope solo, poniendo primero los NO REGISTRADO y mandando el resto a una hoja
de anexo que reaparecerá en la próxima corrida.
NUNCA inventes hallazgos, repitas URLs para llenar el cupo, registres páginas de
búsqueda ni reclasifiques un producto para que calce una proporción. Si al agotar
la búsqueda hay 4, reporta 4.
Respeta las dos reglas críticas: solo publicaciones individuales de producto, y
solo ofertas con alcance real en Chile.
Si al terminar TODOS los hallazgos salieron REGISTRADO, no cierres: es señal de
que la búsqueda se quedó en las tiendas grandes y formales, que son las que sí
cumplen. Haz otra ronda buscando publicaciones sin marca en el título, tiendas
pequeñas, marketplaces y venta al público general de productos de uso profesional.
DOS REGLAS DE CRUCE QUE FALLARON EL 24-08:
  - Que la marca esté en el listado NO basta para marcar REGISTRADO. El registro
    ampara calibres y medidas concretos: verifica que la presentación ofertada
    esté entre las que declara ese registro. Se clasificó una aguja 32G x 4mm
    como registrada citando un registro que solo cubre 18G a 27G en pulgadas.
  - No arrastres productos de otra familia. El listado de agujas hipodérmicas no
    cubre agujas de lapicera de insulina ni de mesoterapia (32G x 4mm, 32G x 6mm
    y similares en milímetros), aunque se publiquen como "hipodérmicas".

PASO 4 — REPORTE
Arma el JSON de hallazgos y genera el Excel:
  python3 scripts/generar_reporte.py --entrada <hallazgos.json> --auto --slot 1
En "Nombre de DM ofertado" va el nombre del producto TAL COMO APARECE PUBLICADO,
con marca y presentación. NUNCA el nombre de la categoría: si todas las filas
dicen lo mismo, el inspector no puede distinguir un producto de otro.
Si el script imprime "avisos_calidad", corrige el JSON y vuelve a generar antes
de enviar. Son errores que el inspector no puede resolver por su cuenta.
Deja en blanco "Decisión final" y "Observaciones del inspector": las llena el
inspector. Si no hay hallazgos, pasa "hallazgos": [] igual.

PASO 5 — PERSISTIR EN GIT (OBLIGATORIO)
En este orden exacto:
  1. python3 scripts/rotacion.py --slot 1 --avanzar --hallazgos <incluidos> --detectados <total>
  2. git add resultados/ historial/
  3. git commit -m "fiscalización: <categoria> <DD-MM-YYYY>"
  4. Empuja a main reintentando, porque el otro bloque del día corre casi a la
     misma hora y puede haber empujado antes que tú. Ya no hay archivo
     compartido entre bloques, así que el rebase no debería conflictuar:
       for intento in 1 2 3; do
         git push origin main && break
         git pull --rebase origin main
       done
     Si aun así el rebase falla, NO abandones el push: resuelve el conflicto
     conservando ambos lados y vuelve a intentar. Que el reporte quede en una
     rama suelta significa que el inspector no lo recibe.
  5. Verifica que git status no muestre commits sin subir, y anota en qué rama
     quedó finalmente el archivo: lo necesitas para el enlace del paso 6.
Si el push falla, dilo en la notificación con el error textual. Nunca termines en
silencio dando por hecho que se guardó.

PASO 6 — AVISAR AL INSPECTOR
Con el push ya confirmado, escribe por Gmail al inspector que devolvió el paso 1
(campo inspector.email). No fijes el destinatario a mano: rota cada 3 semanas.

NO ADJUNTES EL ARCHIVO. Manda un ENLACE de descarga.
Adjuntarlo obliga a transcribir el binario en base64 y basta un carácter distinto
para que el Excel llegue irrecuperable. Ya pasó el 24-08-2026: los dos reportes
llegaron corruptos y el original estaba intacto en el repositorio.

El enlace se arma con la ruta del archivo que acabas de empujar:
  https://github.com/lukasgallegosguty-beep/fiscalizacion-web/raw/main/resultados/<archivo>.xlsx
El repositorio es público: el inspector no necesita cuenta ni permisos.
Si el push a main no se completó y el archivo quedó en otra rama, reemplaza main
por el nombre de esa rama en la URL y dilo en el cuerpo.

  Asunto: Fiscalización web DM — <Categoría> — <DD-MM-YYYY>
  Cuerpo: el enlace de descarga bien visible; categoría y fecha; CUÁNTAS OFERTAS
    SE REVISARON EN TOTAL y cuántas se incluyen (el tope es 10, informa el total
    detectado para que dimensione el problema); desglose por clasificación sobre
    el total; los 3 casos más relevantes; descartados por jurisdicción;
    marketplaces que bloquearon el acceso. Si hubo anexo, aclara que esas
    ofertas NO requieren revisión esta semana. Cierra recordando que debe
    completar "Decisión final" y "Observaciones del inspector" y subir el archivo
    a la carpeta revision/ del repositorio.
Si el envío falla, informa el error. No deshagas el commit: el reporte ya está en
el repositorio.

PASO 7 — NOTIFICACIÓN
Informa: categoría y bloque; ofertas revisadas en total y cuántas se incluyeron
tras el tope de 10; desglose por clasificación; los 3 casos más relevantes; descartados por jurisdicción; marketplaces
bloqueados; confirmación del push; y a quién se envió el correo.
```
