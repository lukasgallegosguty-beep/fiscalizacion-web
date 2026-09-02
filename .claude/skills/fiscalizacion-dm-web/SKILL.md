---
name: fiscalizacion-dm-web
description: "Fiscalización web de dispositivos médicos sin registro sanitario en Chile. Usa esta skill siempre que el usuario mencione: buscar dispositivos médicos en marketplaces o sitios web, verificar registro sanitario, fiscalización web de DM, cruzar productos con listados ISP/ANDIM, vigilancia de mercado online, productos médicos sin autorización sanitaria, guantes quirúrgicos/examen, jeringas, preservativos, desfibriladores DEA, autotest VIH, kits VIH profesional, o cualquier mención de ofertas web de productos sanitarios regulados en Chile. También activar cuando el usuario pida generar reportes de hallazgos de fiscalización web, verificar si un producto específico tiene registro sanitario vigente en ISP, o analizar imágenes de productos médicos ofertados online. ACTIVACIÓN DIRECTA: Si el usuario escribe 'Activa fiscalización web', activar esta skill inmediatamente y seguir el protocolo de inicio descrito en la sección 'Comando de activación directa'."
---

# Fiscalización Web de Dispositivos Médicos — ISP/ANDIM

Skill para asistir la vigilancia de mercado online de dispositivos médicos (DM) sujetos a registro sanitario en Chile, conforme a las competencias de fiscalización de la Agencia Nacional de Dispositivos Médicos (ANDIM) del Instituto de Salud Pública (ISP).

## Comando de activación directa

Cuando el usuario escriba **"Activa fiscalización web"** (o variantes como "activar fiscalización web", "activa fiscalizacion web", "iniciar fiscalización web"), Claude debe:

1. **Activar esta skill de forma exclusiva** para el resto de la conversación. Todas las respuestas posteriores deben seguir las instrucciones de esta skill.

2. **Mostrar el siguiente mensaje de bienvenida:**

   > **🔍 Fiscalización Web de Dispositivos Médicos — ISP/ANDIM**
   >
   > Sesión de fiscalización activada. En este chat trabajaremos exclusivamente en vigilancia de mercado online de DM sujetos a registro sanitario.
   >
   > **¿Qué categoría deseas fiscalizar?**
   >
   > 1. Guantes quirúrgicos de látex
   > 2. Guantes de examen médico
   > 3. Preservativos masculinos (látex y sintéticos)
   > 4. Preservativos femeninos
   > 5. Agujas hipodérmicas
   > 6. Jeringas hipodérmicas
   > 7. Jeringas con agujas hipodérmicas
   > 8. Desfibriladores externos automáticos (DEA)
   > 9. Autotest VIH
   > 10. Kits VIH uso profesional
   >
   > También puedes indicar un producto específico o una palabra clave libre.
   >
   > Si ya tienes los archivos Excel del ISP actualizados, súbelos ahora. Si no, intentaré descargarlos desde el sitio del ISP.

3. **Ejecutar el flujo completo de esta skill** (Pasos 1 a 5) según la categoría seleccionada por el usuario.

4. **Mantener el modo fiscalización** durante toda la conversación. Cada nueva solicitud del usuario en este chat se interpreta en el contexto de fiscalización de DM. Si el usuario quiere fiscalizar otra categoría, se reinicia desde el Paso 1 sin necesidad de volver a activar la skill.

5. **Si el usuario sube un Excel con la columna "Decisión final" completada**, analizarlo según la sección "Ciclo de retroalimentación" de esta skill.

## Modo rutina automatizada (desatendida)

Cuando esta skill se ejecuta desde una **rutina programada** (sin una persona
mirando), no hay nadie a quien preguntarle nada y **el contenedor se destruye al
terminar**: todo archivo que no quede empujado a GitHub se pierde. El orden de
los pasos cambia respecto del modo conversacional, y ese orden es obligatorio.

### Paso 0 — Preflight de persistencia (SIEMPRE PRIMERO)

**Antes de gastar una sola búsqueda web**, comprobar que el resultado se va a
poder guardar:

```bash
bash scripts/preflight.sh
```

- **Sale 0** → hay permiso de escritura. Continuar con la rutina normal.
- **Sale 1** → no hay permiso de escritura. **Abortar la fiscalización de
  inmediato** y notificar el problema con el diagnóstico que imprime el script.

Nunca ejecutar el flujo completo cuando el preflight falla. Una jornada de
búsqueda que no se puede persistir es trabajo destruido, y volver a intentar el
`git push` al final no cambia el resultado: el permiso no aparece solo.

### Paso 0-bis — Resolver qué toca hoy

La asignación es por **calendario fijo**, dos categorías por día hábil, en dos
bloques independientes. No la deduzcas listando el directorio:

```bash
python3 scripts/rotacion.py --slot 1 --json    # o --slot 2
```

Devuelve la categoría, el Excel ISP vigente, la hoja, la ruta de salida, el
inspector que revisa esta semana y los reportes previos ya revisados.

| Día | Bloque 1 | Bloque 2 |
|---|---|---|
| Lunes | Agujas hipodérmicas | Autotest VIH |
| Martes | Desfibriladores (DEA) | Guantes de examinación |
| Miércoles | Guantes quirúrgicos | Jeringas con agujas |
| Jueves | Jeringas hipodérmicas | Kits VIH uso profesional |
| Viernes | Preservativos masculinos | Preservativos femeninos |

Cuando el comando devuelve `"habil": false` y sale con código 3, hay que
**terminar sin generar nada y sin escribirle a nadie**. El campo `motivo` dice
por qué, y hay tres razones posibles:

- **Fin de semana.**
- **La última semana del mes.** Es la semana de análisis mensual: no se
  fiscaliza. El martes se emite el consolidado y a las 09:00 se reúnen los tres a
  decidir qué se denuncia.

No hay un tercer motivo. Todo día hábil que no sea de la semana de cierre es día
de fiscalización.

### El mes, no solo la semana

Una semana pertenece al mes donde cae la **mayoría de sus días hábiles**, que es
el mes de su **miércoles**. La semana del lunes 31-08-2026 tiene cuatro de sus
cinco días en septiembre: es la semana 1 de septiembre.

| Semana | Qué pasa | Quién revisa |
|---|---|---|
| 1 | Fiscalización | Emilio Millán |
| 2 | Fiscalización | Lukas Gallegos |
| 3 | Fiscalización | María Inés Medina |
| 4 | Solo en meses de 5 semanas | Emilio Millán |
| Última | Consolidado + reunión | Los tres |

El cierre es **la última semana del mes**, no «la cuarta». Doce meses por cuatro
semanas son 48 y el año tiene 52: cuatro veces al año un mes tiene cinco semanas.
Anclar el cierre al final es lo que evita que sobre una semana sin trabajo.

El inspector **no** se deduce ni se fija a mano: sale de `rotacion.py`.

### Paso 0-ter — Leer lo que revisaron los inspectores

```bash
python3 scripts/feedback.py --categoria <slug> --json
```

Lee los Excel que los inspectores dejaron en `revision/` y devuelve cuatro cosas
que **son de uso obligatorio** en la corrida:

1. `urls_excluidas` — enlaces que un inspector ya evaluó. **No volver a
   reportarlos**, aunque sigan activos y sigan siendo infracción. Ya están en el
   circuito; repetirlos le hace perder tiempo al inspector.
2. `falsos_positivos` — la rutina acusó y el inspector desmintió. El criterio de
   cruce está **demasiado estricto**: ampliar la coincidencia flexible (variantes
   de marca, razón social del titular, nombres comerciales alternativos).
3. `falsos_negativos` — la rutina dio por registrado algo que sí era infracción.
   El criterio está **demasiado laxo**: verificar vigencia del registro, no solo
   que la marca aparezca en el listado.
4. `instrucciones_inspector` — texto libre que escribió el inspector. Tratarlo
   como indicación operativa: sitios que pidió mirar, marcas a vigilar, criterios
   a afinar. Si contradice a esta skill, **manda el inspector**.

### Tope de 10 hallazgos por reporte

Cada reporte lleva **como máximo 10 hallazgos**. Es un límite de **carga de
revisión para el inspector**, no un límite de esfuerzo de búsqueda. La distinción
es la que hace que el tope funcione:

- **La búsqueda sigue siendo exhaustiva.** Agotar las capas, probar sinónimos y
  variantes en inglés, recorrer tiendas chicas y marketplaces. Detenerse al
  encontrar 10 daría los 10 primeros, no los 10 que más importan: las tiendas
  grandes y formales son las que mejor indexan, así que una búsqueda corta
  devuelve sobre todo productos que sí cumplen.
- **El recorte se hace al final**, sobre todo lo encontrado y ya clasificado.

`scripts/generar_reporte.py` aplica el tope solo: ordena poniendo primero los NO
REGISTRADO y corta en 10. Un NO REGISTRADO es un caso que hay que investigar; un
REGISTRADO es una confirmación. Si hay que dejar algo fuera, se deja fuera la
confirmación, nunca una posible infracción.

Lo que excede el tope va a una hoja **«Anexo — sobre el tope»**, marcada como que
no requiere revisión esa semana. Como esas ofertas no quedan registradas como
evaluadas, `scripts/feedback.py` no las excluye y **vuelven a considerarse en la
corrida siguiente** de la categoría. No se pierden.

**En el correo y en la notificación se informa sobre el total detectado, no sobre
los 10.** Si se revisaron 16 ofertas y se incluyen 10, hay que decirlo: el
inspector necesita saber el tamaño real de lo encontrado para dimensionar el
problema.

La mezcla registrado / no registrado se calcula también sobre el total detectado,
porque sigue siendo la señal de calidad de la búsqueda:

- **Todo NO REGISTRADO** → probablemente el cruce esté fallando. Revisar el
  emparejamiento de marcas antes de emitir el reporte.
- **Todo REGISTRADO** → la búsqueda se quedó en las tiendas grandes y formales,
  que son justamente las que sí cumplen. Es un falso «todo en orden». Antes de
  cerrar, hacer otra ronda buscando publicaciones sin marca declarada en el
  título, tiendas pequeñas y no especializadas, marketplaces, y venta al público
  general de productos de uso profesional. Ocurrió con Autotest VIH el
  24-08-2026: 9 hallazgos, los 9 registrados; una segunda ronda encontró 3 sin
  registro.

Nunca inventar hallazgos, repetir una URL para llenar el cupo, registrar páginas
de búsqueda como si fueran publicaciones, ni reclasificar un producto para que
calce una proporción. Si al agotar la búsqueda hay 4 hallazgos, se reportan 4.

### Paso 5-bis — Persistir en Git (OBLIGATORIO)

Al terminar, en este orden:

```bash
python3 scripts/rotacion.py --slot <N> --avanzar --hallazgos <M> --detectados <T>
git add resultados/ historial/
git commit -m "fiscalización: <categoria> <DD-MM-YYYY>"

# Los dos bloques del día corren casi a la misma hora y empujan a la misma rama,
# así que el push puede ser rechazado por no ser fast-forward. Cada corrida
# registra su historial en un archivo propio (historial/<fecha>_slot<N>.json),
# de modo que el rebase no encuentra archivo compartido que conflictuar.
for intento in 1 2 3; do
  git push origin main && break
  git pull --rebase origin main
done
```

**Verificar que el push terminó bien** (`git status` debe quedar sin commits
pendientes de subir). Si falla, decirlo explícitamente en la notificación con el
error textual — nunca terminar en silencio dando por hecho que se guardó.

Registrar la categoría como procesada **solo si el push tuvo éxito**. Si se
avanza el estado y el push falla, la categoría queda marcada como hecha sin que
exista el reporte, y la rotación se la salta en el ciclo siguiente.

**Por qué el historial va en archivos separados.** Hasta el 26-08-2026 las dos
corridas del día editaban el mismo `estado-rotacion.json`. Como corren con dos
minutos de diferencia y empujan a la misma rama, la segunda chocaba en ese
archivo: el `git pull --rebase` fallaba por el conflicto, el push a `main` no
ocurría y el reporte quedaba varado en una rama suelta que nadie miraba. Pasó dos
días seguidos, con Desfibriladores y con Jeringas con agujas. Ahora cada corrida
escribe `historial/<fecha>_slot<N>.json`, un archivo que ninguna otra toca.

### El cierre mensual (semana 4)

Esa semana no se busca. El martes a las 07:30 corre `scripts/consolidado.py`, que
junta en un solo Excel todo lo que el mes dejó en pie, y a las 09:00 los tres
deciden qué se procesa como denuncia.

Dos reglas que gobiernan qué entra a ese archivo:

**Un hallazgo entra solo si un inspector lo confirmó.** Que la rutina lo haya
marcado NO REGISTRADO no basta: hace falta el *Correcto* del inspector en
«Decisión final». Lo que nadie revisó no aporta casos, y el consolidado lo dice
en su hoja de cobertura en vez de callarlo. La diferencia entre «no hubo
hallazgos» y «no alcanzamos a revisarlo» no se puede perder.

**Que el inspector contradiga a la rutina NO es una infracción confirmada.**
Cuando la rutina dijo REGISTRADO y el inspector marcó *Incorrecto*, la tentación
es leerlo como una infracción que se escapó. No lo es. Los cinco casos así de
agosto decían *"el enlace arroja Error - 404"* y *"no es posible confirmar
mediante imágenes si el producto cuenta con registro vigente"*: son
verificaciones que no se pudieron completar. Denunciar por un enlace caído sería
acusar sin sustento. Van a una hoja aparte, sin columna de denuncia.

Lo que el inspector encontró navegando a mano —las URLs que escribe en
«Observaciones del inspector» de la hoja de marketplace— sí entra, porque suele
ser lo único que hay de Mercado Libre, que le responde 403 a la rutina. Pero
entra marcado **POR VERIFICAR**: nadie lo cruzó contra el listado ISP todavía, y
el archivo tiene que decirlo en vez de mezclarlo con lo confirmado.

### Paso 5-ter — Enviar el reporte al inspector de la semana

Después de que el push haya quedado confirmado, avisar por Gmail al inspector que
devuelve `scripts/rotacion.py` en el campo `inspector`. Cambia según la semana
del mes; no fijarlo a mano.

**El Excel va como ENLACE, nunca como adjunto.** Adjuntar el archivo obliga a
transcribir su contenido binario en base64 dentro de la llamada a la herramienta,
y una sola diferencia de carácter en esos miles de caracteres deja el archivo
irrecuperable. Ya ocurrió: los dos reportes del 24-08-2026 llegaron corruptos por
esta vía, con el original intacto en el repositorio. No es un riesgo teórico ni
depende de cuánto cuidado se ponga: el formato no tolera el error.

El enlace de descarga directa se arma con la ruta del archivo ya empujado:

```
https://github.com/lukasgallegosguty-beep/fiscalizacion-web/raw/main/resultados/<nombre-del-archivo>.xlsx
```

El repositorio es público, así que el inspector no necesita cuenta de GitHub ni
permisos: el enlace descarga el archivo directamente.

- **Asunto**: `Fiscalización web DM — <Categoría> — <DD-MM-YYYY>`
- **Cuerpo**: el enlace de descarga en un lugar visible; categoría y fecha; total
  de hallazgos con el desglose por clasificación; si se alcanzó el objetivo de 20
  y si no, por qué; los 3 casos más relevantes; los descartados por jurisdicción;
  y los marketplaces que bloquearon el acceso. Cerrar recordando que las columnas
  "Decisión final" y "Observaciones del inspector" se completan y el archivo se
  sube a `revision/`.

Enviar **un correo por bloque**, no uno diario con los dos.

Si el push a `main` no llegó a completarse, el enlace a `main` no va a existir.
En ese caso, enlazar la rama donde sí quedó el archivo, reemplazando `main` por
el nombre de esa rama en la URL, y decirlo en el cuerpo.

Si el envío falla, informarlo en la notificación con el error. No es motivo para
deshacer el commit: el reporte ya está en el repositorio.

### Adjuntar el reporte a la notificación

Aunque el push funcione, adjuntar el `.xlsx` generado en la notificación final.
Es la única copia que sobrevive si algo falla en la persistencia.

## Contexto regulatorio

En Chile, ciertos dispositivos médicos requieren registro sanitario ante el ISP para poder ser comercializados. El ISP publica listados oficiales de DM con registro vigente, organizados por categoría. Productos ofertados sin figurar en estos listados representan potenciales infracciones regulatorias.

### Categorías fiscalizadas y palabras clave de búsqueda

Cada categoría tiene un conjunto de términos en español e inglés para búsqueda web:

| Categoría | Palabras clave ES | Palabras clave EN |
|---|---|---|
| Guantes quirúrgicos de látex | guantes quirúrgicos, guantes cirugía látex, guantes estériles quirúrgicos | surgical gloves, latex surgical gloves, sterile surgical gloves |
| Guantes de examen médico | guantes examen, guantes látex examen, guantes nitrilo examen | examination gloves, medical exam gloves, nitrile exam gloves |
| Preservativos masculinos (látex y sintéticos) | preservativos, condones, condones látex, condones sintéticos | condoms, latex condoms, synthetic condoms |
| Preservativos femeninos | preservativo femenino, condón femenino | female condom, internal condom |
| Agujas hipodérmicas | agujas hipodérmicas, agujas estériles desechables | hypodermic needles, sterile disposable needles |
| Jeringas hipodérmicas | jeringas hipodérmicas, jeringas desechables estériles | hypodermic syringes, disposable sterile syringes |
| Jeringas con agujas hipodérmicas | jeringas con aguja, jeringa aguja hipodérmica | syringes with needles, needle syringe combo |
| DEA (Desfibriladores externos automáticos) | desfibrilador externo automático, DEA, desfibrilador portátil | AED, automated external defibrillator, portable defibrillator |
| Autotest VIH | autotest VIH, test rápido VIH autodiagnóstico, prueba VIH casera | HIV self-test, HIV home test, HIV rapid self-test |
| Kits VIH uso profesional | kit diagnóstico VIH, test VIH profesional, reactivo VIH | HIV diagnostic kit, HIV professional test, HIV reagent kit |

## Flujo de trabajo

### Paso 1 — Definir alcance de la búsqueda

Pregunta al usuario qué categoría(s) de DM quiere fiscalizar. Si no especifica, ofrece la lista completa para que elija. El usuario también puede indicar una palabra clave libre o un producto específico.

**Fuentes de búsqueda:** La fiscalización abarca todo tipo de sitio web donde se oferte el producto, no solo marketplaces. Incluye como mínimo:
- **Marketplaces**: Mercado Libre Chile, Falabella, Ripley, Paris
- **Tiendas online**: e-commerce de distribuidoras médicas, farmacias online, tiendas de insumos
- **Páginas web generales**: Cualquier sitio chileno o que venda a Chile donde se ofrezca el producto o servicio

El usuario puede agregar o restringir sitios específicos.

### Paso 2 — Descargar listados ISP actualizados

**Antes de iniciar la búsqueda de productos, siempre descargar las versiones más recientes de los listados oficiales.** Los listados se actualizan sin previo aviso, por lo que es fundamental trabajar con la versión vigente al momento de la fiscalización.

Usa `web_fetch` para acceder a las siguientes páginas y localizar los links de descarga de los archivos Excel:

**DM generales (no in vitro):**
`https://www.ispch.cl/andim/listado-de-dispositivos-medicos-establecimientos-y-empresas/dispositivos-medicos-con-registro-sanitario/`

**DM in vitro:**
`https://www.ispch.cl/andim/listado-de-dispositivos-medicos-establecimientos-y-empresas/dispositivos-medicos-in-vitro-con-registro-sanitario/`

Descarga los archivos Excel correspondientes a la(s) categoría(s) que se van a fiscalizar.

**Estrategia de carga de archivos ISP (en orden de prioridad):**
1. **Descarga directa**: Intenta descargar el Excel desde la URL del ISP usando `web_fetch`.
2. **Archivos subidos por el usuario**: Si la descarga falla por restricciones técnicas, busca en `/mnt/user-data/uploads/` si el usuario ya subió archivos del ISP en la conversación. Usa el más reciente disponible según la fecha en el nombre del archivo.
3. **Solicitar al usuario**: Si no hay archivos disponibles, solicita al usuario que suba el archivo manualmente desde el sitio del ISP y advierte que debe ser la versión más reciente.

Los archivos Excel del ISP siguen esta estructura estándar:
- **Fila 1**: Título descriptivo de la lista
- **Fila 2**: Encabezados de columna
- **Fila 3 en adelante**: Datos

Las columnas clave para el cruce son:
- `N° DE REGISTRO SANITARIO` — identificador único del registro
- `MARCA COMERCIAL` — nombre/marca del producto autorizado
- `TITULAR DEL REGISTRO SANITARIO` — empresa responsable en Chile
- `NOMBRE FABRICANTE LEGAL` — fabricante
- `PAÍS DE ORIGEN` — país de fabricación

Consulta `references/CATEGORIAS_ARCHIVOS.md` para saber qué archivo Excel corresponde a cada categoría de DM.

### Paso 3 — Búsqueda web de ofertas

Usa `web_search` para buscar productos combinando las palabras clave de la categoría con términos que indiquen oferta o venta en Chile. No limites la búsqueda a un solo tipo de sitio.

**Estrategia de búsqueda en capas:**

1. **Marketplaces conocidos** — Queries dirigidas:
   - `guantes quirúrgicos latex mercadolibre.cl`
   - `desfibrilador DEA falabella.com`
   - `autotest VIH ripley.cl`

2. **Búsqueda abierta en web chilena** — Queries generales:
   - `comprar guantes quirúrgicos latex Chile`
   - `venta desfibrilador externo automático Chile`
   - `autotest VIH comprar online Chile`
   - `[palabra clave] venta Chile`
   - `[palabra clave] precio Chile tienda online`

3. **Variantes en inglés** (algunos sitios publican en inglés):
   - `buy surgical gloves Chile`
   - `AED defibrillator sale Chile`

#### REGLA CRÍTICA: Solo publicaciones de producto, nunca páginas de búsqueda interna

Cada hallazgo registrado en el reporte DEBE corresponder a una **publicación individual de un producto o servicio concreto** con una URL que apunte directamente a esa oferta específica.

**NUNCA registrar como hallazgo:**
- URLs de resultados de búsqueda internos de marketplaces (ej: `listado.mercadolibre.cl/test-rapido-vih`, `www.falabella.com/falabella-cl/search?Ntt=...`)
- Páginas de categoría general de un sitio
- Páginas de búsqueda de Google u otros buscadores
- Páginas informativas, gubernamentales o educativas que no ofertan productos

**SÍ registrar:**
- URLs de publicaciones individuales de producto (ej: `www.mercadolibre.cl/panbio-autotest-vih-abbott/up/MLCU383756869`)
- Páginas de producto en tiendas online (ej: `salcobrand.cl/products/autotes-vih-mylan`)
- Ofertas específicas en sitios e-commerce (ej: `www.jfvmedical.cl/products/test-rapido-vih-4ta-gen-aria`)

Si una página de resultados de búsqueda de un marketplace muestra marcas de interés en los filtros laterales (ej: marcas como "All Test", "Hightop" en Mercado Libre), usa esa información para hacer búsquedas más específicas que lleguen a publicaciones individuales. No incluyas la página de resultados como hallazgo en la hoja principal.

#### REGLA CRÍTICA: Solo ofertas con alcance en Chile

La competencia fiscalizadora de ANDIM alcanza a los productos **ofertados en
Chile**. Una tienda extranjera que no vende ni despacha a Chile queda fuera de
alcance, por más que su producto no figure en el listado ISP.

**Antes de registrar un hallazgo, confirmar al menos uno de estos indicios:**
- Dominio `.cl`, o sitio con versión/tienda explícita para Chile.
- Precios en pesos chilenos (CLP, `$` con formato chileno).
- Despacho, retiro, cobertura o direcciones declaradas en Chile.
- Datos de la empresa en Chile (RUT, dirección, teléfono +56).

**Descartar** los sitios cuya operación es de otro país (México, Venezuela,
España, Estados Unidos, etc.) sin evidencia de venta a Chile. Estos casos **no
se registran como hallazgo**, pero conviene dejarlos anotados en el resumen de
texto bajo "Descartados por jurisdicción", con el motivo, para que quede trazable
por qué no aparecen en el Excel y no se vuelvan a revisar en la corrida siguiente.

Cuidado con los buscadores: una consulta en español devuelve muchísimo resultado
de tiendas mexicanas y españolas que se parecen a lo buscado pero no venden en
Chile. Acotar las queries con `Chile`, `site:.cl` o `precio CLP` reduce bastante
ese ruido.

#### Hallazgos en marketplaces con acceso restringido (robots.txt)

Algunos marketplaces (Mercado Libre, Falabella, Ripley, entre otros) bloquean el acceso directo a publicaciones individuales mediante robots.txt. Cuando esto ocurra, la información visible en las páginas de resultados de búsqueda sigue siendo valiosa para el fiscalizador. En estos casos:

1. **Registrar los hallazgos en una hoja separada del Excel llamada "Búsquedas Marketplace"** con las siguientes columnas:
   - **Marketplace**: Nombre del sitio (ej: Mercado Libre Chile)
   - **URL de búsqueda**: Link a la página de resultados consultada
   - **Palabras clave usadas**: Query de búsqueda utilizada
   - **Marcas detectadas en filtros**: Marcas que aparecen en los filtros laterales del marketplace
   - **Cantidad aprox. de publicaciones**: Número de resultados indicado por el marketplace
   - **Observaciones del inspector**: Dejar en blanco. Texto libre que completa el
     inspector y que se lee en la corrida siguiente. Esta hoja **no lleva columna
     "Decisión final"**: son pistas para investigación manual, no hallazgos
     clasificados.
   - **Observaciones para el fiscalizador**: Descripción detallada de lo observado, incluyendo:
     - Qué marcas aparecen y cuántas publicaciones tiene cada una
     - Cuáles de esas marcas NO figuran en el listado ISP (marcar como prioritarias)
     - Cuáles SÍ figuran (para referencia)
     - Rango de precios observado
     - Cualquier otro patrón relevante (ej: vendedores recurrentes, productos de uso profesional ofertados al público)
     - Instrucciones específicas para que el fiscalizador investigue manualmente (ej: "Buscar en Mercado Libre 'test VIH All Test' y revisar las ~7 publicaciones de esta marca que no tiene registro ISP como autotest")

2. **En el resumen de texto**, incluir una sección separada titulada "Hallazgos pendientes en marketplaces (requieren verificación manual)" que liste las marcas/productos detectados que no pudieron verificarse por restricciones de acceso.

Este enfoque permite que el fiscalizador use la inteligencia recopilada de las búsquedas para guiar su propia investigación manual en los marketplaces.

#### Registro de cada hallazgo

Para cada publicación individual relevante, registra:
- **Nombre del producto tal como aparece publicado (título de la publicación)**
- **URL directa a la publicación del producto**
- **Nombre del oferente / vendedor / tienda** (si está visible)
- **Sitio web / marketplace**
- **Fecha de consulta** (fecha actual)

Usa `web_fetch` para obtener más detalle de publicaciones específicas cuando el título del resultado de búsqueda no sea suficiente para identificar la marca o producto.

#### No repetir URLs

Cada URL debe aparecer una sola vez en el reporte. Si un mismo producto aparece en múltiples búsquedas, registrarlo solo la primera vez.

### Paso 4 — Cruce y verificación con doble checkeo

El cruce se realiza en dos niveles para maximizar la detección. El objetivo es determinar si el producto ofertado coincide con algún producto con registro sanitario vigente en los listados ISP.

#### Nivel 1 — Cruce por texto de la publicación

Compara el nombre/marca del producto ofertado (título de la publicación, descripción) contra los listados ISP:

1. **Busca por marca comercial**: Compara contra la columna `MARCA COMERCIAL`. Usa coincidencia flexible (parcial, case-insensitive, sin tildes, considerando abreviaciones).
2. **Busca por fabricante**: Si el producto menciona fabricante, cruza contra `NOMBRE FABRICANTE LEGAL`.
3. Si se encuentra coincidencia clara → marcar `Coincidencia: SÍ`, registrar el nombre del producto ISP y su N° de registro sanitario.
4. Si no se encuentra coincidencia → pasar al Nivel 2.

#### Nivel 2 — Cruce por reconocimiento de texto en imágenes del producto

Cuando el cruce textual del Nivel 1 no produce coincidencia, realizar un segundo checkeo visual:

1. Accede a la publicación con `web_fetch` para obtener las imágenes del producto.
2. Analiza las imágenes buscando texto visible: nombres de marca, modelos, fabricante, números de registro, textos en el empaque o etiquetado.
3. Compara el texto extraído de las imágenes contra los listados ISP con la misma lógica del Nivel 1.
4. Si la imagen revela una marca o fabricante que sí coincide con el registro ISP → marcar `Coincidencia: SÍ` y anotar en observaciones que la coincidencia se identificó por imagen.
5. Si tampoco hay coincidencia por imagen → marcar `Coincidencia: NO`.

Este doble checkeo es importante porque muchas publicaciones usan nombres genéricos o comerciales que no coinciden con la marca registrada, pero las imágenes del producto sí muestran la marca real del fabricante en el empaque.

#### La marca coincidente NO basta: el registro debe cubrir ESE producto

Encontrar la marca en el listado ISP es el primer paso, no la conclusión. Cada
registro sanitario ampara **presentaciones concretas**: calibres, medidas y tipo
de producto. Un producto de marca registrada cuya presentación no está en el
registro **no está amparado por él**.

Antes de marcar REGISTRADO, verificar que la presentación ofertada aparezca entre
las que declara el registro. La columna de marca comercial del Excel ISP las
lista después del nombre de marca.

**Caso real (24-08-2026).** Se clasificó como REGISTRADO una «Aguja Pentapoint
32G x 4mm BD Ultra-Fine» citando el registro `DM/10AG/0219/09`. Ese registro
ampara calibres 18G a 27G en longitudes de pulgada, y el listado completo de
agujas hipodérmicas no contiene ningún 32G ni ninguna medida en milímetros. La
coincidencia fue solo por la marca «Becton Dickinson». En términos regulatorios
eso es dar por autorizado un producto que no lo está.

Si la marca coincide pero la presentación no está amparada, **no es REGISTRADO**:
anotarlo en Observaciones indicando qué calibres sí cubre el registro citado y
cuál es el ofertado, para que el fiscalizador lo resuelva.

#### Mantenerse dentro de la categoría fiscalizada

Cada listado ISP cubre una familia de producto concreta. Productos parecidos pero
de otra familia tienen su propio marco regulatorio y no se cruzan contra este
listado.

En agujas, el listado cubre **agujas hipodérmicas** de 16G a 30G en longitudes de
pulgada. Quedan fuera:

- **Agujas para lapicera de insulina** (32G x 4mm, 32G x 6mm, 31G x 5mm y
  similares, en milímetros).
- **Agujas de mesoterapia** (32G x 4/6mm), aunque se publiquen como
  «hipodérmicas».

Si la búsqueda arrastra productos de otra familia, no clasificarlos contra este
listado. Registrarlos aparte en Observaciones como fuera de categoría, o dejarlos
fuera del reporte. El 24-08-2026, seis de diecisiete hallazgos eran agujas de
lapicera y mesoterapia mezcladas con las hipodérmicas.

Ante la duda de si un producto pertenece a la categoría, mirar los calibres y
unidades que usa el listado ISP: si el producto está fuera de ese rango o usa
otra unidad de medida, casi siempre es de otra familia.

#### Guantes: el alcance es la INTERSECCIÓN de uso médico y látex

Regla cerrada por el ISP el 01-09-2026. La regulación cubre **solo los guantes
de examinación y quirúrgicos fabricados en látex (caucho)**. Es una intersección,
y hay que verificar sus dos lados antes de clasificar:

| | Látex / caucho | Nitrilo, vinilo, neopreno, otros |
|---|---|---|
| **Examinación o quirúrgico** | **DENTRO** — clasificar normal | FUERA DE ALCANCE |
| **Otro uso** (tatuaje, cosmetología, aseo, industrial) | FUERA DE ALCANCE | FUERA DE ALCANCE |

Un guante que cae en cualquiera de las tres casillas grises **no es una
infracción**, tenga o no registro sanitario. No clasificarlo NO REGISTRADO: no
incluirlo en el reporte, o incluirlo con la clasificación **FUERA DE ALCANCE** y
explicar en Observaciones cuál de los dos lados falla —el material o el uso—.

Esto explica por qué los 57 registros del listado de examinación y los 46 del de
quirúrgicos dicen todos «guante de caucho»: no es que falten los de nitrilo, es
que el nitrilo no está bajo control obligatorio.

**Los dos lados fallaron en producción, uno por semana.**

*El material (25-08-2026).* El reporte de Guantes de examinación acusó 13
productos de nitrilo y vinilo razonando que sus marcas —HEALTH TOUCH, MUNCARE,
TRESOR, TOP GLOVE— figuran en el listado solo como látex. El razonamiento sobre
los registros era correcto y la conclusión igual estaba mal: ninguno de esos 13
está regulado. El inspector marcó los 13 como «Incorrecto».

*El uso (01-09-2026).* El mismo reporte acusó dos publicaciones de guantes
**negros de látex** de 50 unidades, marcas Maxcare y Obopekal. Son látex, pero se
venden para tatuaje y uso general, no para examinación. El inspector marcó las
dos como «Incorrecto». Que el material calce no basta si el guante no es de uso
médico.

**Cómo se detecta cada lado.** El material suele estar en el título de la
publicación; cuando no está, mirar las imágenes del envase antes de asumir látex.
El uso se reconoce por el envase y el canal de venta: los guantes de examinación
y quirúrgicos se publican como tales y en tiendas médicas o farmacias; los negros
de 50 o 100 unidades en tiendas de tatuaje, belleza o ferretería casi nunca lo
son. Ante la duda del uso, no acusar: dejarlo FUERA DE ALCANCE y explicarlo.

**La señal de alerta general** sigue valiendo para las otras categorías: si el
listado ISP entero describe un material o una presentación y varios hallazgos son
de otra, revisar el alcance de la regulación antes de emitir el reporte, en vez
de deducirlo del listado.

#### Clasificación

Solo dos categorías:
- **REGISTRADO**: Se encontró coincidencia (por texto o por imagen) con un producto en los listados ISP.
- **NO REGISTRADO**: No se encontró coincidencia por ningún medio.

### Paso 5 — Generar reportes de hallazgos

Genera **dos outputs**:

#### A) Excel de hallazgos

Crea un archivo `.xlsx` con las siguientes columnas exactas, en este orden:

| # | Columna | Descripción |
|---|---|---|
| 1 | Nombre de DM ofertado | Nombre del producto **tal como aparece publicado**, con marca y presentación. **Nunca el nombre de la categoría.** Si todas las filas dicen «Autotest VIH», el inspector no puede distinguir un producto de otro y el reporte no sirve. Ocurrió el 24-08-2026: las 9 filas decían lo mismo. |
| 2 | URL | Link directo a la publicación individual del producto (nunca a páginas de búsqueda) |
| 3 | Título de la publicación | Título completo de la publicación/oferta |
| 4 | Oferente | Nombre del vendedor, tienda o sitio web (si está disponible) |
| 5 | Coincidencia | SÍ / NO — Indica si se encontró coincidencia con algún producto del listado ISP |
| 6 | Nombre del producto con el que coincide | Marca comercial del producto ISP con el que coincide (vacío si no aplica) |
| 7 | Registro del producto con el que coincide | N° de registro sanitario ISP del producto coincidente (vacío si no aplica) |
| 8 | Clasificación | REGISTRADO / NO REGISTRADO |
| 9 | Observaciones | Notas y consejos para el fiscalizador (ver guía abajo) |
| 10 | Decisión final | **Dejar en blanco** — Campo reservado para el feedback manual del fiscalizador |
| 11 | Observaciones del inspector | **Dejar en blanco** — Texto libre del inspector. Se lee en la corrida siguiente como indicación operativa. |

**Guía para la columna Observaciones:**
La columna Observaciones debe aportar contexto útil al fiscalizador. Ejemplos de lo que incluir:
- Si el producto parece ser de uso profesional pero se oferta al público general, indicarlo (ej: "Producto aparenta ser de uso profesional, no autotest. Verificar si corresponde a categoría distinta.")
- Si la coincidencia se detectó por imagen y no por texto de la publicación, señalarlo.
- Si el título de la publicación es genérico y no permite identificar la marca, mencionarlo.
- Si el precio es inusualmente bajo o hay indicios de producto irregular, anotarlo.
- Si el vendedor es reincidente o tiene múltiples publicaciones similares, señalarlo.
- Si la publicación muestra señales de venta a consumidor final de un producto que solo debería venderse a profesionales, indicarlo.
- Si no fue posible verificar por imagen (imágenes de baja calidad, sin texto visible), indicarlo.

**Formato del Excel:**
- Encabezados en negrita con fondo azul ISP (RGB: 0, 51, 102) y texto blanco
- Filas con color alterno suave para legibilidad
- Columna "Clasificación": fondo verde claro para REGISTRADO, fondo rojo claro para NO REGISTRADO
- Columna "Decisión final" con fondo amarillo claro para señalar que requiere input humano
- Ancho de columnas autoajustado
- Nombre de archivo: `Fiscalizacion_Web_DM_[CATEGORIA]_[DD-MM-YYYY].xlsx`, donde
  `[CATEGORIA]` es el **slug estable** de la categoría (el campo `slug` que devuelve
  `scripts/rotacion.py`, p. ej. `kits-vih-profesional`), no el nombre largo. Usar el
  slug mantiene los reportes de una misma categoría agrupados y permite que la rutina
  encuentre el reporte anterior para el ciclo de retroalimentación.

**Generación del archivo.** No reescribir el generador en cada corrida: el
repositorio incluye `scripts/generar_reporte.py`, que ya produce este formato
exacto (las 10 columnas, la hoja "Búsquedas Marketplace", los colores y la fila
"Sin hallazgos"). Se le pasa un JSON con los hallazgos:

```bash
python3 scripts/generar_reporte.py --entrada hallazgos.json --auto --slot 1
```

`--auto --slot N` deduce la categoría, la fecha y la ruta de salida desde
`scripts/rotacion.py`.

El script imprime un campo `avisos_calidad` cuando detecta problemas: filas que
usan el nombre de la categoría en vez del producto, REGISTRADO sin número de
registro, URLs repetidas o páginas de búsqueda. **Corregir el JSON y regenerar
antes de enviar**: son errores que el inspector no puede resolver por su cuenta. Si no hay hallazgos, basta con `"hallazgos": []`: el script
emite igualmente el archivo con la fila "Sin hallazgos" y la fecha de revisión,
que es lo que deja constancia de que la categoría sí se revisó ese día.

Para casos fuera de este formato estándar, consulta la skill
`/mnt/skills/public/xlsx/SKILL.md`.

#### B) Resumen en texto

Después de presentar el Excel, proporciona un resumen conciso en el chat que incluya:
- Total de productos encontrados (solo publicaciones individuales, no páginas de búsqueda)
- Desglose por clasificación (Registrado / No Registrado)
- Desglose por fuente (marketplace, tienda online, otro sitio)
- Casos donde la coincidencia se detectó por imagen y no por texto
- Hallazgos más relevantes (productos no registrados)
- Recomendaciones de siguiente paso para el fiscalizador

## Ciclo de retroalimentación

El feedback dejó de ser manual: los inspectores suben los Excel completados a la
carpeta `revision/` del repositorio y `scripts/feedback.py` los lee al inicio de
cada corrida (ver "Paso 0-ter"). Las URL ya evaluadas se excluyen automáticamente
y las correcciones del inspector ajustan el criterio de cruce.

Los campos "Decisión final" y "Observaciones del inspector" permiten registrar la
evaluación manual de cada caso. Este feedback es valioso para mejorar la skill:

- Si el fiscalizador marca un caso que la skill clasificó como NO REGISTRADO pero que en realidad sí lo está (falso negativo), esto indica que los criterios de coincidencia deben ampliarse.
- Si el fiscalizador marca un caso como NO REGISTRADO que la skill clasificó como REGISTRADO (falso positivo), esto indica que los criterios de coincidencia son demasiado laxos.
- El usuario puede compartir el Excel completado para refinar las reglas de cruce y las palabras clave.

**Aprendizajes de retroalimentaciones anteriores:**
- Distinguir entre test de autodiagnóstico (autotest) y test de uso profesional. Son categorías regulatorias distintas. Si un producto parece ser de uso profesional, anotar en Observaciones.
- **Alcance territorial**: los resultados de buscadores mezclan tiendas de México,
  Venezuela, España y EE.UU. con las chilenas. Un producto de marca no registrada
  en una tienda que no vende a Chile **no es hallazgo**; descartarlo y dejar
  constancia del descarte en el resumen (ver "Solo ofertas con alcance en Chile").
- **Marketplaces bloqueados**: Mercado Libre y Falabella devuelven 403 a la
  obtención directa de publicaciones. No insistir ni tratarlo como error de la
  corrida: registrar lo observable en la hoja "Búsquedas Marketplace" y seguir.
- Algunos productos pueden tener registro sanitario en una categoría distinta a la que se está fiscalizando (ej: un test VIH de uso profesional tiene registro en la lista de Kits VIH profesional, no en la de Autotest). Verificar cruzando con las listas de categorías relacionadas.

Cuando el usuario proporcione un Excel con la columna "Decisión final" completada, analiza las discrepancias entre la clasificación automática y la decisión del fiscalizador, e identifica patrones para proponer mejoras a la skill.

## Notas importantes

- Esta skill es una **herramienta de apoyo** a la fiscalización. La decisión final sobre si un producto infringe o no la normativa corresponde siempre al fiscalizador de ANDIM.
- Los resultados de web_search pueden no capturar todos los productos disponibles. La búsqueda web complementa pero no reemplaza la fiscalización manual.
- **Siempre descargar los listados ISP al inicio de cada sesión de fiscalización.** No asumir que los archivos subidos previamente están actualizados.
- No almacenes ni reproduzcas datos personales de vendedores más allá de lo visible públicamente en las publicaciones.
- El reconocimiento de texto en imágenes depende de la calidad y resolución de las imágenes disponibles en las publicaciones. Si la imagen es de baja calidad, anotar esta limitación en observaciones.
