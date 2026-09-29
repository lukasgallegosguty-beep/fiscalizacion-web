# Prompts de las rutinas de fiscalización web

Son **tres rutinas**. Dos fiscalizan (una por bloque, para que un fallo en la
primera no arrastre a la segunda) y una cierra el mes.

## Configuración

| Opción | Bloque 1 | Bloque 2 | Consolidado mensual |
|---|---|---|---|
| Nombre | Fiscalización web — bloque 1 | Fiscalización web — bloque 2 | Fiscalización web — consolidado mensual |
| Frecuencia | Lun–Vie 07:30 (hora Chile) | Lun–Vie 07:30 | **Todos los martes** 10:30 UTC; trabaja solo el de cierre |
| Repositorio | `lukasgallegosguty-beep/fiscalizacion-web` | igual | igual |
| Conectores | Gmail | Gmail | Gmail **y Google Calendar** |
| Rama de salida | ninguna: la fija el prompt (`main`) | igual | igual |

Los dos bloques diarios se disparan más veces de las que trabajan, y eso es a
propósito: cortan en el paso 1 durante la semana de cierre. El filtro vive en
`scripts/rotacion.py`, no en el cron.

El consolidado también se dispara de más: **todos los martes**, con cron
`30 10 * * 2`, y trabaja solo el martes de la última semana del mes. Los demás
martes corta en el paso 1 en una línea, sin escribirle a nadie.

**Por qué no un disparo único que se reprograme solo.** Así estuvo del 14 al 29
de septiembre de 2026, y falló el primer día que tenía que trabajar. El 29-09 la
rutina se disparó puntual a las 07:31, abortó a los 39 segundos y la plataforma
la marcó «exitosa»: no generó el consolidado, no mandó el correo y no se
reprogramó, así que quedó muerta también para octubre. El equipo llegó a la
reunión de las 09:00 sin el archivo; se generó a mano a las 14:15.

Dos supuestos del diseño eran falsos y ninguno se había probado en una rutina
real:

1. **Que el disparador traía el repositorio.** No lo traía. Los triggers creados
   desde una sesión (`create_trigger`) nacen sin repositorio adjunto; los bloques
   1 y 2, creados desde la interfaz, sí lo tienen. El prompt intentaba adjuntarlo
   con `add_repo`, pero esa herramienta no existe dentro de una rutina
   disparada.
2. **Que la rutina podía reprogramarse con `update_trigger`.** Tampoco existe ahí.
   Y aunque existiera, la reprogramación iba después del clonado: sin repositorio
   no se llegaba a ella, y un solo fallo mataba este mes y todos los siguientes.

El cron semanal no depende de nada de eso. Cuesta tres o cuatro corridas vacías
al mes —el disparador tiene las notificaciones apagadas— y a cambio no tiene una
cadena que se pueda cortar.

**El repositorio se adjunta a mano, en la interfaz.** Sin él, la rutina manda una
ALERTA a lgallegos@ispch.cl cada martes hasta que alguien lo adjunte:
https://claude.ai/code/routines/trig_01SWEY7vJV9ZEYvE9vjajD43

**Nada falla en silencio.** El prompt del cierre tiene una regla general: cada
punto donde puede fallar un día de cierre —repositorio, preflight, script, push,
correo— termina en un correo de ALERTA, no en una sesión «exitosa» que no hizo
nada. Un correo de más es barato; un cierre perdido no.

**Sobre el horario y el cambio de hora.** Los cron se evalúan en UTC, y Chile
cambia de huso dos veces al año: 07:30 local son las **11:30 UTC** en invierno
(abril–septiembre) y las **10:30 UTC** en verano (octubre–marzo). Si fijas la hora
con el selector del editor de rutinas, la conversión es automática y no hay que
tocar nada. Si en cambio pones un cron a mano, hay que corregirlo en cada cambio
de hora, o la rutina se corre una hora. Los bloques 1 y 2 tienen cron a mano, así
que van en esa lista de revisión dos veces al año.

El consolidado también tiene cron fijo, así que se corre una hora en invierno:
10:30 UTC son las 07:30 de Chile en verano y las 06:30 en invierno. Se dejó así a
propósito —en ambos casos llega antes de la reunión de las 09:00— para no tener
que tocarlo dos veces al año.

**Los prompts de los bloques 1 y 2 NO se pueden actualizar desde una sesión.**
Se crearon por la API, así que `update_trigger` los rechaza y solo el dueño puede
editarlos en https://claude.ai/code/routines/<trigger_id>. Consecuencia práctica:
**este archivo puede adelantarse a lo que las rutinas ejecutan de verdad.** El
25-09-2026 llevaban tres arreglos de retraso —el motivo de la semana de cierre en
el paso 1, la verificación del push contra `origin/main` y la nota de feriado en
el paso 6— porque se documentaron aquí y nunca se pegaron allá.

Cuando cambies algo de esos dos prompts, pégalo en las dos rutinas el mismo día.
Si no, el repositorio dice una cosa y el sistema hace otra, que es peor que no
haber documentado nada. El consolidado sí se puede editar desde una sesión (se creó
con `create_trigger`), pero a cambio nació sin repositorio: ver arriba.

**Sobre los conectores.** Deja solo Gmail. Durante una corrida la rutina puede
usar cualquier herramienta de un conector incluido, escrituras incluidas, sin
pedir permiso.

## Calendario del mes

El mes se divide en semanas de búsqueda más una de cierre:

| Semana | Qué pasa | Quién revisa |
|---|---|---|
| 1 | Fiscalización, 10 categorías | Emilio Millán · emillan@ispch.cl |
| 2 | Fiscalización, 10 categorías | Lukas Gallegos · lgallegos@ispch.cl |
| 3 | Fiscalización, 10 categorías | María Inés Medina · mmedina@ispch.cl |
| 4 | Solo en meses de 5 semanas: fiscalización | Emilio Millán |
| **Última** | **Sin búsquedas.** Martes 07:30 consolidado, 09:00 reunión | Los tres |

Una semana pertenece al mes donde cae la **mayoría de sus días hábiles**, que es
el mes de su **miércoles**. La semana del lunes 31-08-2026 tiene cuatro de sus
cinco días en septiembre, así que es la semana 1 de septiembre.

**Por qué no son siempre cuatro semanas.** Doce meses por cuatro semanas son 48,
y el año tiene 52. Cuatro veces al año un mes tiene cinco semanas y no hay forma
de evitarlo. Por eso el cierre no es «la semana 4» sino **la última semana del
mes**: el mes siempre cierra al final y ninguna semana queda sin trabajo. En los
meses de cinco, la cuarta también fiscaliza y le vuelve a tocar a Emilio, porque
la rotación es de tres.

**Qué pasaba antes.** La semana pertenecía al mes de su lunes y el cierre era
siempre la cuarta. Eso dejaba semanas muertas: la del 31-08-2026 quedó fuera del
ciclo y el miércoles 02-09 las dos rutinas dispararon, salieron en el paso 1 y no
fiscalizaron nada.

## Feriados

`feriados.json` lista los feriados legales chilenos que caen en día hábil.

La rutina **fiscaliza igual** esos días: la búsqueda es automática y no le cuesta
a nadie. Lo que cambia es la revisión — no hay inspector trabajando, así que el
reporte queda **excusado**: el cierre mensual lo informa como feriado y no lo
cuenta como pendiente. La diferencia importa, porque un pendiente es un
incumplimiento del inspector y un feriado no.

Pasó el **18-09-2026** (Independencia Nacional): las dos corridas de
preservativos salieron y quedaron registradas sin revisión.

**Hay que mantener el archivo a mano.** Los feriados no se calculan solos: los
movibles se corren al lunes según la Ley 19.973, el Día de los Pueblos Indígenas
sigue al solsticio y cada año aparecen feriados por elecciones. Antes de cada año
nuevo hay que contrastar la lista con el listado oficial de la Dirección del
Trabajo y agregar el año siguiente. Un feriado que falte sale como reporte sin
revisar; uno de más excusa una revisión que sí correspondía.

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

## La última semana: cierre del mes

No se fiscaliza. El martes:

- **07:30** — `scripts/consolidado.py` arma un Excel con todos los casos del mes
  que sobrevivieron a la revisión, y se envía a los tres por correo.
- **09:00** — reunión de una hora (evento en Google Calendar, con Meet) para
  decidir caso por caso qué se procesa como denuncia.

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
Sale con código 3 en ese caso: NO es un error, es el filtro funcionando.
Solo hay dos motivos posibles, y el campo "motivo" dice cuál:
  - fin de semana;
  - la ÚLTIMA semana del mes, reservada al análisis mensual. Esa semana el
    trigger igual se dispara todos los días hábiles, porque cron no sabe decir
    "salvo la última semana", y el filtro real es este paso. Despertar un lunes
    y que no haya que fiscalizar es lo esperado, no una falla.
Repite el motivo en la notificación, en una línea, y no hagas nada más: no
busques, no generes Excel, no escribas correos.
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
  5. COMPRUEBA QUE EL ARCHIVO ESTÁ EN main. Que git status quede limpio no
     prueba nada: el entorno puede redirigir el push a la rama de la sesión y
     devolver éxito igual. Eso pasó el 03-09-2026 y el reporte de Jeringas
     hipodérmicas estuvo ocho días perdido en una rama suelta sin que nadie se
     enterara. La única comprobación válida es:
       git fetch origin main -q
       git cat-file -e origin/main:resultados/<archivo>.xlsx && echo "OK en main"
     Si NO está: averigua en qué rama quedó (git branch -r --contains HEAD),
     dilo en la notificación con el nombre de la rama y arma el enlace del paso 6
     con esa rama en lugar de main.
Si el push falla, dilo en la notificación con el error textual. Nunca termines en
silencio dando por hecho que se guardó.

PASO 6 — AVISAR AL INSPECTOR
Con el push ya confirmado, escribe por Gmail al inspector que devolvió el paso 1
(campo inspector.email). No fijes el destinatario a mano: cambia según la semana
del mes.

Si el paso 1 devolvió "feriado" con un nombre, hoy es feriado legal: el correo va
igual —para que el reporte esté en su bandeja cuando vuelva— pero ABRE el cuerpo
diciendo que hoy es feriado (<nombre>), que la revisión no corre y que este
reporte no se le va a contar como pendiente en el cierre del mes.

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

Rutina aparte, **todos los martes** a las 10:30 UTC, con los conectores **Gmail
y Google Calendar** y el **repositorio adjunto**. Trabaja solo el martes de
cierre; los demás corta en el paso 1.

```
Ejecuta el cierre mensual de la fiscalización web de DM.

Este trigger se dispara TODOS LOS MARTES a las 10:30 UTC (07:30 en Chile en
verano, 06:30 en invierno). Solo uno de cada cuatro o cinco es día de cierre: el
martes de la última semana del mes. Los demás martes terminas en el paso 1, en
una línea y sin escribirle a nadie. Eso no es una falla: cron no sabe expresar
"el martes de la última semana" y el filtro real vive en el paso 1.

REGLA GENERAL: NADA FALLA EN SILENCIO. El 29-09-2026 esta rutina se disparó,
abortó a los 39 segundos por no tener el repositorio y terminó "exitosa" sin
avisarle a nadie: el equipo llegó a la reunión mensual sin el archivo. Por eso,
cada vez que abajo diga ALERTA, escribe por Gmail a lgallegos@ispch.cl con asunto
"ALERTA — cierre mensual fiscalización web DM" y en el cuerpo: qué paso falló, el
error textual y la fecha de hoy. Después detente. Nunca termines un día de cierre
sin haber enviado el consolidado o una ALERTA.

PASO 0 — EL REPOSITORIO
Ejecuta: ls scripts/rotacion.py
Si no existe, el trigger perdió el repositorio adjunto. ALERTA con este texto:
"El disparador del consolidado no tiene el repositorio adjunto. Hay que
adjuntarlo en https://claude.ai/code/routines/trig_01SWEY7vJV9ZEYvE9vjajD43".
Esta alerta sale aunque no sepas si hoy es día de cierre: sin repositorio no se
puede saber, y es preferible un correo de más a un cierre perdido.

PASO 1 — ¿TOCA HOY?
Ejecuta: python3 scripts/rotacion.py --consolidacion --json
Si "es_hoy" es false, TERMINA aquí: una línea en la notificación diciendo la
fecha del próximo cierre (campo "fecha") y nada más. No escribas correos. Sale
con código 3 en ese caso y NO es un error: lee el JSON igual.
Si "es_hoy" es true, sigue. Desde aquí, cualquier fallo es ALERTA.

PASO 2 — PREFLIGHT
Ejecuta: bash scripts/preflight.sh main
Si sale distinto de 0: ALERTA con el diagnóstico que imprimió.

PASO 3 — RESCATAR LO VARADO
Ejecuta: bash scripts/ramas_varadas.sh
Lista los reportes que se generaron pero nunca llegaron a main. Si imprime algo,
rescátalo ANTES de consolidar (git show <rama>:<ruta> > <ruta>, add, commit,
push): si no, el consolidado sale incompleto y nadie se entera.

PASO 4 — CONSOLIDAR
Ejecuta: python3 scripts/consolidado.py --json
SIN ARGUMENTOS. El script resuelve solo el mes y la ruta de salida; pasarle --mes
o --salida a mano es como se equivoca uno de periodo.
Genera el Excel del mes en resultados/. NO lo edites a mano, NO le agregues ni
quites columnas y NO completes las columnas de decisión: las llenan los tres en
la reunión. El formato se ensayó y se aprobó el 22-09-2026; si algo del archivo
te parece mejorable, dilo en la notificación en vez de cambiarlo.
Si "archivos_no_atribuidos" trae algo, hay Excel en revision/ cuyo nombre no
permite deducir la categoría. Nómbralos textualmente en el correo: son casos que
quedaron fuera del consolidado y alguien tiene que renombrarlos.
Si el script falla: ALERTA con el error.

PASO 5 — PERSISTIR EN GIT
  1. git add resultados/
  2. git commit -m "consolidado mensual: <MM-YYYY>"
  3. for intento in 1 2 3; do
       git push origin main && break
       git pull --rebase origin main
     done
  4. Comprueba que el archivo llegó DE VERDAD a main. Que git status quede limpio
     no lo prueba: el entorno puede redirigir el push a la rama de la sesión y
     devolver éxito igual. Eso pasó el 03-09-2026 y un reporte estuvo ocho días
     perdido. La única comprobación válida es:
       git fetch origin main -q
       git cat-file -e origin/main:resultados/<archivo>.xlsx && echo "OK en main"
Si el push falla o el archivo no está en main: ALERTA, indicando en qué rama
quedó (git branch -r --contains HEAD). No sigas al paso 6: sin el archivo en main
el enlace del correo llegaría roto.

PASO 6 — ENVIAR A LOS TRES
Un solo correo por Gmail, con los tres destinatarios del paso 1 (campo
"destinatarios") en el campo "para".

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
    - LA COBERTURA COMPLETA, con sus tres estados separados, porque si no las
      cuentas no cuadran y parece que alguien no hizo su trabajo:
        * cuántos reportes se emitieron de los esperados;
        * cuántos quedaron SIN REVISAR (campo "pendientes_de_revision"). Esto va
          sí o sí: es la diferencia entre "no hubo hallazgos" y "no alcanzamos a
          revisarlo";
        * cuántos NO correspondía revisar por feriado (campo
          "excusados_feriado"), nombrando la fecha y el feriado. Un feriado no
          es un incumplimiento y el correo tiene que decirlo con esas palabras.
    - Si hay discrepancias sin resolver, di cuántas y que están en una hoja
      aparte, sin proponerse como denuncia.
    - Si la columna "Veces que el inspector lo listó" trae valores mayores que 1,
      menciónalo: son publicaciones que el inspector anotó varias veces en su
      nota de marketplace. El consolidado ya las dejó en una sola fila; se avisa
      para que en la reunión no se revisen de nuevo una por una.
    - Cierra recordando que en la reunión de las 09:00 hay que completar
      "¿Se procesa como denuncia?" y "Justificación de la decisión", y que el
      archivo completado se sube a la carpeta revision/.
Si el envío falla: ALERTA (el archivo ya está en main; di el enlace en la alerta).

PASO 7 — REUNIÓN: CONFIRMAR HOY Y EXTENDER EL HORIZONTE
Las reuniones están en Google Calendar como eventos INDIVIDUALES, uno por mes,
título "Fiscalización web DM — revisión mensual de casos (<mes> <año>)",
09:00-10:00 y los tres invitados.
No son un evento recurrente a propósito: la recurrencia solo se puede expresar
con RDATE (fechas explícitas), porque el martes de la última semana no coincide
con el "cuarto martes del mes" en 5 de cada 36 meses. Y Outlook no soporta RDATE:
la invitación llega y no se puede agregar. Un evento por mes es lo único que abre
bien en los dos calendarios.

  a) Busca el evento de HOY. Si existe, confirma que los tres siguen invitados.
     Si no existe, créalo hoy de 09:00 a 10:00 e invita a los tres.
  b) Extiende el horizonte: mira 12 meses hacia adelante y, si al último mes le
     falta su evento, créalo. La fecha exacta la da:
       python3 scripts/rotacion.py --consolidacion --fecha <YYYY-MM-DD> --json
     (campo "fecha"). NO la calcules como "cuarto martes": no es lo mismo.
     Dos cosas de ese comando que NO son errores: sale con código 3 cuando la
     fecha consultada no es un día de cierre (lo normal al mirar hacia adelante)
     e imprime el JSON igual, así que lee la salida y no lo trates como fallo; y
     devuelve el cierre del mes del CICLO, que no siempre es el del calendario
     —una semana pertenece al mes de su miércoles—, así que consultar el
     31-08-2027 responde con el cierre de septiembre de 2027. Guíate por el
     campo "periodo" que viene en la misma respuesta.
  c) BUSCA ANTES DE CREAR, siempre. Duplicar la reunión es peor que no tenerla:
     nadie sabe a cuál de las dos ir. Si ya existe, no toques nada.
Si Calendar no está disponible, dilo en la notificación; no es ALERTA, porque el
consolidado ya salió.

PASO 8 — NOTIFICACIÓN
Periodo consolidado; casos totales y desglose por origen; las categorías con más
casos; reportes sin revisar y reportes excusados por feriado, como dos cifras
distintas; reportes rescatados de ramas varadas, si hubo; confirmación de que el
archivo está en main; a quiénes se envió el correo; y si la reunión de hoy estaba
agendada.
```
