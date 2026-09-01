# Prompts de las rutinas de fiscalización web

Son **tres rutinas**. Dos fiscalizan (una por bloque, para que un fallo en la
primera no arrastre a la segunda) y una cierra el mes.

## Configuración

| Opción | Bloque 1 | Bloque 2 | Consolidado mensual |
|---|---|---|---|
| Nombre | Fiscalización web — bloque 1 | Fiscalización web — bloque 2 | Fiscalización web — consolidado mensual |
| Frecuencia | Lun–Vie 07:30 (hora Chile) | Lun–Vie 07:30 | **Martes** 07:30 |
| Repositorio | `lukasgallegosguty-beep/fiscalizacion-web` | igual | igual |
| Conectores | Gmail | Gmail | Gmail **y Google Calendar** |
| Rama de salida | ninguna: la fija el prompt (`main`) | igual | igual |

Las tres se disparan más veces de las que trabajan, y eso es a propósito: cron no
sabe expresar "semana 4 del mes". Los bloques cortan en el paso 1 durante la
semana 4, y el consolidado corta en el paso 1 los martes de las semanas 1 a 3.
El filtro vive en `scripts/rotacion.py`, no en el cron.

**Sobre el horario y el cambio de hora.** Los cron se evalúan en UTC, y Chile
cambia de huso dos veces al año: 07:30 local son las **11:30 UTC** en invierno
(abril–septiembre) y las **10:30 UTC** en verano (octubre–marzo). Si fijas la hora
con el selector del editor de rutinas, la conversión es automática y no hay que
tocar nada. Si en cambio pones un cron a mano, hay que corregirlo en cada cambio
de hora, o la rutina se corre una hora.

**Sobre los conectores.** Deja solo Gmail. Durante una corrida la rutina puede
usar cualquier herramienta de un conector incluido, escrituras incluidas, sin
pedir permiso.

## Calendario del mes

El mes se divide en cuatro semanas, contadas **por el lunes de cada semana**:

| Semana | Qué pasa | Quién revisa |
|---|---|---|
| 1 | Fiscalización, 10 categorías | Emilio Millán · emillan@ispch.cl |
| 2 | Fiscalización, 10 categorías | Lukas Gallegos · lgallegos@ispch.cl |
| 3 | Fiscalización, 10 categorías | María Inés Medina · mmedina@ispch.cl |
| 4 | **Sin búsquedas.** Martes 07:30 consolidado, 09:00 reunión | Los tres |

Una semana pertenece al mes **de su lunes**. La semana del lunes 28-09-2026 es de
septiembre aunque el jueves ya caiga en octubre. Sin esa regla la misma semana se
contaría en dos meses y el inspector cambiaría a media semana.

Por eso el martes de la semana 4 **no es** siempre el "cuarto martes del mes":
en septiembre de 2026 la semana 4 empieza el lunes 28 y la reunión cae el 29,
mientras que el cuarto martes es el 22 — que bajo este esquema todavía es semana
3 y María Inés sigue fiscalizando. Divergen en 5 de cada 36 meses.

Cuatro veces al año hay un quinto lunes. Esa semana queda **fuera del ciclo**: el
mes ya se cerró en la semana 4 y una cuarta semana de búsqueda no tendría
inspector asignado. Para correrla igual, agrega el `4` a `SEMANAS_BUSQUEDA` en
`scripts/rotacion.py` y define quién revisa.

## Calendario de la semana

| Día | Bloque 1 | Bloque 2 |
|---|---|---|
| Lunes | Agujas hipodérmicas | Autotest VIH |
| Martes | Desfibriladores (DEA) | Guantes de examinación |
| Miércoles | Guantes quirúrgicos | Jeringas con agujas |
| Jueves | Jeringas hipodérmicas | Kits VIH uso profesional |
| Viernes | Preservativos masculinos | Preservativos femeninos |

Es un calendario fijo, no una rotación: si una corrida falla, el mismo día de la
semana siguiente vuelve a tocar esa categoría. No hay estado que se descuadre.

## La semana 4: cierre del mes

No se fiscaliza. El martes:

- **07:30** — `scripts/consolidado.py` arma un Excel con todos los casos del mes
  que sobrevivieron a la revisión, y se envía a los tres por correo.
- **09:00** — reunión de una hora (evento recurrente ya creado en Google
  Calendar, con Meet) para decidir caso por caso qué se procesa como denuncia.

Al consolidado entran dos cosas:

1. Hallazgos que la rutina marcó **NO REGISTRADO** y el inspector confirmó con un
   *Correcto* en «Decisión final».
2. URLs que el inspector escribió a mano en «Observaciones del inspector» de la
   hoja de marketplace. Son productos que él encontró navegando y que la rutina
   no pudo ver, porque Mercado Libre le devuelve 403. Entran marcados **POR
   VERIFICAR**: nadie los cruzó todavía contra el listado ISP.

No entra lo que la rutina dio por REGISTRADO y el inspector marcó *Incorrecto*.
Es tentador leerlo como una infracción que la rutina dejó pasar, pero al revisar
los cinco casos de agosto el inspector estaba diciendo otra cosa: *"el enlace
arroja Error - 404"*, *"no es posible confirmar mediante imágenes si el producto
cuenta con registro vigente"*. Son verificaciones que no se pudieron completar,
no productos ilegales. Van a la hoja «Discrepancias sin resolver», sin columna de
denuncia.

Tampoco entra lo que sigue sin revisar. Un reporte que el inspector no devolvió
no aporta casos, y eso se dice en la hoja «Cobertura del mes» y en el correo:
es la diferencia entre *no hubo hallazgos* y *no alcanzamos a revisarlo*.

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
Si devuelve "habil": false, TERMINA sin generar nada y sin escribirle a nadie.
Puede ser fin de semana, la semana 4 del mes (reservada al análisis mensual: esa
semana NO se fiscaliza) o un quinto lunes fuera del ciclo. El campo "motivo" dice
cuál es; repítelo en la notificación y no hagas nada más.
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
(campo inspector.email). No fijes el destinatario a mano: cambia según la semana
del mes.

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

## Prompt — consolidado mensual

Rutina aparte, **martes 07:30**, con los conectores **Gmail y Google Calendar**.

```
Ejecuta el cierre mensual de la fiscalización web de DM.

PASO 0 — PREFLIGHT (ANTES DE NADA)
Ejecuta: bash scripts/preflight.sh main
Si sale distinto de 0, ABORTA y notifica el error textual que imprimió.

PASO 1 — ¿TOCA HOY?
Ejecuta: python3 scripts/rotacion.py --consolidacion --json
Esta rutina se dispara TODOS los martes porque cron no sabe expresar "semana 4
del mes". El filtro real es este paso: si "es_hoy" es false, TERMINA de inmediato
sin generar nada y sin escribirle a nadie. No es un error: es lo que pasa la
mayoría de los martes. Dilo en la notificación en una línea y cierra.

PASO 2 — CONSOLIDAR
Ejecuta: python3 scripts/consolidado.py --json
Genera el Excel del mes en resultados/. NO lo edites a mano y NO completes las
columnas de decisión: las llenan los tres en la reunión.
Si "archivos_no_atribuidos" trae algo, hay Excel en revision/ cuyo nombre no
permite deducir la categoría. Nómbralos textualmente en el correo: son casos que
quedaron fuera del consolidado y alguien tiene que renombrarlos.

PASO 3 — PERSISTIR EN GIT (OBLIGATORIO)
  1. git add resultados/
  2. git commit -m "consolidado mensual: <MM-YYYY>"
  3. for intento in 1 2 3; do
       git push origin main && break
       git pull --rebase origin main
     done
  4. Verifica que git status no muestre commits sin subir.
Si el push falla, dilo con el error textual y NO sigas al paso 4: sin push no hay
enlace que enviar y el correo llegaría roto.

PASO 4 — ENVIAR A LOS TRES
Un solo correo por Gmail, con los tres destinatarios que devolvió el paso 1
(campo "destinatarios") en el campo "para".

NO ADJUNTES EL ARCHIVO. Manda el ENLACE de descarga:
  https://github.com/lukasgallegosguty-beep/fiscalizacion-web/raw/main/resultados/<archivo>.xlsx
El repositorio es público: no necesitan cuenta ni permisos.

  Asunto: Consolidado mensual fiscalización web DM — <mes> <año>
  Cuerpo:
    - El enlace de descarga bien visible.
    - Cuántos casos trae y de dónde salen: hallazgos NO REGISTRADO confirmados
      por el inspector, y detecciones manuales de marketplace. Aclara que estas
      últimas van marcadas POR VERIFICAR porque no pasaron por el cruce contra
      el listado ISP y hay que comprobarlas antes de resolver.
    - Desglose por categoría.
    - Qué reportes del mes quedaron SIN REVISAR y por lo tanto no aportaron
      casos (campo "pendientes_de_revision"). Esto va sí o sí: es la diferencia
      entre "no hubo hallazgos" y "no alcanzamos a revisarlo".
    - Si hay discrepancias sin resolver, di cuántas y que están en una hoja
      aparte, sin proponerse como denuncia.
    - Cierra recordando que en la reunión de las 09:00 hay que completar
      "¿Se procesa como denuncia?" y "Justificación de la decisión", y que el
      archivo completado se sube a la carpeta revision/.

PASO 5 — REUNIÓN: CONFIRMAR HOY Y EXTENDER EL HORIZONTE
Las reuniones están creadas en Google Calendar como eventos INDIVIDUALES, uno por
mes, con título "Fiscalización web DM — revisión mensual de casos (<mes> <año>)",
09:00-10:00 y los tres invitados.
No son un evento recurrente a propósito: la recurrencia solo se puede expresar
con RDATE (fechas explícitas), porque el martes de la semana 4 no coincide con el
"cuarto martes del mes" en 5 de cada 36 meses. Y Outlook no soporta RDATE: la
invitación llega y no se puede agregar. Un evento por mes es lo único que abre
bien en los dos calendarios.

  a) Busca el evento de HOY. Si existe, confirma que los tres siguen invitados.
     Si no existe, créalo hoy de 09:00 a 10:00 e invita a los tres.
  b) Extiende el horizonte: mira 12 meses hacia adelante y, si al último mes le
     falta su evento, créalo. La fecha exacta la da:
       python3 scripts/rotacion.py --consolidacion --fecha <YYYY-MM-DD> --json
     (campo "fecha"). NO la calcules como "cuarto martes": no es lo mismo.
  c) BUSCA ANTES DE CREAR, siempre. Duplicar la reunión es peor que no tenerla:
     nadie sabe a cuál de las dos ir. Si ya existe, no toques nada.

PASO 6 — NOTIFICACIÓN
Informa: periodo consolidado; casos totales y desglose por origen; las categorías
con más casos; qué reportes quedaron sin revisar; confirmación del push; a
quiénes se envió el correo; y si la reunión de hoy estaba agendada.
```
