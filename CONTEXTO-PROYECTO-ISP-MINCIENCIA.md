# Contexto para formular una solución tecnológica de vigilancia de mercado online de dispositivos médicos

**Destinatario:** Claude, u otro asistente, al que se le pide ayuda para formular
un proyecto en el marco del convenio ISP – Ministerio de Ciencia, Tecnología,
Conocimiento e Innovación (MinCiencia).

**Autor de la operación descrita:** Lukas Gallegos, ANDIM / ISP.

**Fecha de corte de los datos:** 21 de septiembre de 2026.

---

## 0. Cómo usar este archivo

Este documento describe un **piloto operativo real** que lleva un mes funcionando,
con sus cifras medidas y sus fallos documentados. No es una propuesta: es la
evidencia sobre la cual se puede construir una.

Si se te pide redactar una postulación, una ficha de proyecto, un marco lógico o
una justificación técnica, usa esto como fuente primaria y respeta dos reglas:

1. **No inventes cifras.** Todas las de la sección 4 salen de contar archivos del
   repositorio. Si necesitas un dato que no está aquí, dilo como faltante, no lo
   estimes.
2. **No omitas la sección 6.** Las limitaciones del piloto son el argumento más
   fuerte para financiar una solución distinta. Una propuesta que presente el
   piloto como un éxito sin matices es más débil, no más fuerte, porque el
   evaluador va a preguntar exactamente por lo que se ocultó.

El repositorio operativo es público:
`https://github.com/lukasgallegosguty-beep/fiscalizacion-web`

---

## 1. El problema regulatorio

En Chile, determinados dispositivos médicos (DM) requieren **registro sanitario
vigente** ante el Instituto de Salud Pública para poder comercializarse. La
Agencia Nacional de Dispositivos Médicos (ANDIM) del ISP mantiene listados
públicos de productos registrados por categoría.

El comercio electrónico introdujo un problema que la fiscalización presencial no
cubre: **la oferta online es masiva, cambiante y geográficamente deslocalizada**.
Un producto sin registro puede estar publicado en un marketplace, en la tienda
web de un importador pequeño o en una farmacia online, y desaparecer o cambiar de
URL antes de que alguien lo revise. No existe un censo de la oferta: no se sabe
cuántas publicaciones hay, ni qué proporción cumple.

La fiscalización online, hecha a mano, consiste en que un inspector busque en
Google y en marketplaces, abra publicaciones una a una, identifique marca y
modelo —muchas veces solo visibles en las fotos— y los cruce contra un Excel del
ISP de entre 38 y 277 filas. Es un trabajo lento, repetitivo, y cuyo resultado no
queda registrado de forma comparable entre una vez y la siguiente.

### Marco de alcance (importante, y no trivial)

Qué está regulado no es obvio y define qué es un hallazgo válido. Ejemplo real
que costó corregir en el piloto:

> El Decreto Exento N°342/04 cubre **guantes de examinación y quirúrgicos de
> látex (caucho)**. No aplica a nitrilo, vinilo ni otros materiales. Tampoco
> aplica a guantes que, siendo de látex, no sean de examinación o quirúrgicos
> (es decir, sin fin médico).

Una solución tecnológica que no modele el alcance regulatorio por categoría
produce acusaciones fuera de competencia. En el piloto esto se resolvió con
verificaciones programáticas que marcan la fila antes de que llegue al inspector.

---

## 2. Qué se construyó y cómo opera hoy

Un piloto que automatiza la búsqueda y el cruce, y deja la decisión en manos
humanas. Corre sobre Claude Code con rutinas programadas; **no es una aplicación**
ni tiene interfaz: es un repositorio con scripts, un catálogo de instrucciones y
tres rutinas que se disparan solas.

### Ciclo diario

Dos bloques independientes por día hábil, 07:30 hora de Chile. Cada bloque
fiscaliza **una categoría**, de modo que las 10 categorías se recorren de lunes a
viernes:

| Día | Bloque 1 | Bloque 2 |
|---|---|---|
| Lunes | Agujas hipodérmicas | Autotest VIH |
| Martes | Desfibriladores (DEA) | Guantes de examinación |
| Miércoles | Guantes quirúrgicos | Jeringas con agujas |
| Jueves | Jeringas hipodérmicas | Kits VIH uso profesional |
| Viernes | Preservativos masculinos | Preservativos femeninos |

Es un **calendario fijo, no una rotación secuencial**: si una corrida falla, el
mismo día de la semana siguiente vuelve a tocar esa categoría. No hay estado
acumulado que se descuadre. Esta decisión de diseño se tomó después de que el
esquema secuencial se desalineara tras una corrida caída.

Cada corrida: busca en la web, clasifica cada oferta contra el listado ISP
vigente, genera un Excel con tope de 10 hallazgos (los excedentes van a una hoja
de anexo que reaparece en la corrida siguiente), lo empuja al repositorio y le
envía el enlace por correo al inspector de la semana.

### Ciclo mensual

Tres semanas de búsqueda, con un inspector distinto revisando cada una (Emilio
Millán, Lukas Gallegos, María Inés Medina). La **última semana del mes** no se
fiscaliza: el martes a las 07:30 se genera un consolidado con todo lo que
sobrevivió a la revisión, y a las 09:00 los tres se reúnen una hora a decidir,
caso por caso, qué se procesa como denuncia.

El cierre va en la **última** semana y no en «la cuarta» por una razón
aritmética: 12 meses × 4 semanas = 48, y el año tiene 52. Cuatro veces al año un
mes tiene cinco semanas. Anclar el cierre al final es lo que evita que sobre una
semana sin trabajo asignado.

### El ciclo de retroalimentación

Esto es lo más importante del diseño y lo que lo distingue de un scraper.

El inspector devuelve el Excel con dos columnas completadas: **«Decisión final»**
(Correcto / Incorrecto) y **«Observaciones del inspector»**. La corrida siguiente
de esa categoría lee esos archivos **antes de buscar** y usa cuatro señales:

- `urls_excluidas` — enlaces ya evaluados; no se vuelven a reportar aunque sigan
  siendo infracción. Repetirlos le hace perder tiempo al inspector.
- `falsos_positivos` — el sistema acusó y el inspector desmintió: el criterio de
  cruce está demasiado estricto, hay que ampliar la coincidencia flexible.
- `falsos_negativos` — el sistema dio por registrado algo que sí era infracción:
  el criterio está demasiado laxo.
- `instrucciones_inspector` — texto libre. Se trata como indicación operativa:
  **si contradice al catálogo de instrucciones, manda el inspector.**

El sistema aprende de la corrección humana, no de un reentrenamiento.

### Componentes

| Componente | Líneas | Función |
|---|---|---|
| `rotacion.py` | 934 | Planificador: qué categoría toca, qué semana es, quién revisa, cuándo cierra el mes, qué días son feriado |
| `consolidado.py` | 577 | Cierre mensual: reúne lo confirmado, lo separa de lo no verificable, informa cobertura |
| `generar_reporte.py` | 436 | Genera el Excel del inspector, aplica el tope y las verificaciones de alcance |
| `feedback.py` | 273 | Lee los Excel devueltos y extrae las cuatro señales |
| `SKILL.md` | 743 | Catálogo de instrucciones: criterios de clasificación, reglas de alcance, errores conocidos |
| `RUTINA.md` | 417 | Los prompts de las tres rutinas y la configuración |

Además: `feriados.json` (feriados legales que caen en día hábil),
`ramas_varadas.sh` (auditoría de trabajo que no llegó al repositorio),
`preflight.sh` (verifica que se pueda persistir antes de gastar búsquedas).

---

## 3. Fuentes de datos

**Listados oficiales ISP** (Excel descargados del sitio público), usados como
fuente de verdad del registro vigente:

| Categoría | Filas aprox. |
|---|---|
| Preservativos de látex y sintéticos | 277 |
| Guantes quirúrgicos | 90 |
| Guantes de examinación | 88 |
| Jeringas con agujas hipodérmicas | 87 |
| Agujas hipodérmicas | 76 |
| Desfibriladores | 67 |
| Jeringas hipodérmicas | 58 |
| Preservativos femeninos | 53 |
| Autotest VIH | 45 |
| Kits VIH uso profesional | 38 |

**Oferta online:** búsqueda web abierta. Tiendas propias de importadores,
farmacias online, marketplaces. Solo publicaciones individuales de producto
—nunca páginas de categoría o resultados de búsqueda— y solo ofertas con alcance
real en Chile.

---

## 4. Resultados medidos

Periodo: **19 de agosto a 21 de septiembre de 2026** (un mes de operación).
Todas las cifras salen de contar los archivos del repositorio.

### Volumen

| Métrica | Valor |
|---|---|
| Corridas ejecutadas | 36 |
| Reportes generados | 44 |
| Categorías cubiertas | 10 de 10 |
| Ofertas clasificadas | 340 filas |
| Ofertas detectadas antes del tope | 277 |
| Reportes devueltos por inspectores | 36 (82%) |
| Filas con veredicto humano | 282 |

### Clasificación automática de las 340 ofertas

| Clase | N | % |
|---|---|---|
| REGISTRADO | 172 | 51% |
| NO REGISTRADO | 162 | 48% |
| SIN HALLAZGOS | 5 | 1% |
| FUERA DE ALCANCE | 1 | 0% |

### Precisión del cruce automático, contrastada contra el inspector

Este es el dato central del piloto.

De las **148 filas clasificadas NO REGISTRADO que un inspector revisó, 68 fueron
confirmadas**. La precisión de la clase acusatoria es de **46%**.

Desglose por categoría:

| Categoría | Confirmados / revisados | Precisión |
|---|---|---|
| Autotest VIH | 8/10 | 80% |
| Desfibriladores (DEA) | 10/15 | 67% |
| Agujas hipodérmicas | 9/14 | 64% |
| Preservativos femeninos | 4/7 | 57% |
| Jeringas hipodérmicas | 13/29 | 45% |
| Guantes quirúrgicos | 8/19 | 42% |
| Jeringas con agujas | 7/21 | 33% |
| Preservativos masculinos | 3/10 | 30% |
| Guantes de examinación | 6/23 | 26% |
| **Total** | **68/148** | **46%** |

En sentido contrario: de **131 filas clasificadas REGISTRADO que se revisaron,
120 (92%) fueron confirmadas**. Las 11 restantes no son infracciones que se
escaparon — al leerlas, el inspector estaba diciendo *«el enlace arroja Error
404»* o *«no es posible confirmar mediante imágenes si el producto cuenta con
registro vigente»*: son verificaciones que no se pudieron completar.

**Lectura:** el sistema es conservador al absolver y ruidoso al acusar. Más de la
mitad de sus acusaciones no resisten la revisión humana. Esto **no invalida la
herramienta** —reduce un universo inabarcable a 10 casos revisables por
categoría— pero descarta de plano cualquier diseño que actúe sin revisión.

### Por qué falla el cruce

La causa dominante, identificada leyendo las observaciones de los inspectores:
**la marca no aparece en el título ni en el texto de la publicación, solo en la
fotografía del producto.** El inspector abre la imagen, lee «Cranberry», busca el
registro DM 328/11 y lo confirma. El sistema, que trabaja sobre texto, no puede.

En una corrida de jeringas hipodérmicas, 9 de 10 acusaciones cayeron por esto.

Causas secundarias documentadas:
- **El registro ampara calibres y medidas concretos.** Que la marca esté en el
  listado no basta. Se clasificó una aguja 32G × 4 mm como registrada citando un
  registro que solo cubre 18G a 27G en pulgadas.
- **Arrastre entre familias de producto.** El listado de agujas hipodérmicas no
  cubre agujas de lapicera de insulina ni de mesoterapia, aunque se publiquen
  como «hipodérmicas».
- **Titular vs. marca comercial.** El listado registra al titular (p. ej. Reutter
  S.A.) y la publicación muestra la marca (Cranberry).

### Aporte humano irreemplazable

| Métrica | Valor |
|---|---|
| Filas de búsqueda de marketplace registradas | 77 |
| Con acceso automatizado bloqueado (403 / captcha) | 43 (56%) |
| Con observación escrita por el inspector | 76 |
| **URLs aportadas a mano por los inspectores** | **126** |

Mercado Libre Chile responde 403 a la rutina de forma sistemática. Las 126 URLs
que los inspectores encontraron navegando a mano son oferta que el sistema
automatizado **no vio en absoluto**. En el consolidado de septiembre entran
marcadas POR VERIFICAR, porque no pasaron por el cruce contra el listado ISP.

### Consolidado de septiembre 2026 (simulado al 21-09)

| Métrica | Valor |
|---|---|
| Casos totales | 97 |
| NO REGISTRADO confirmados por inspector | 34 |
| Detección manual de marketplace (por verificar) | 63 |
| Discrepancias sin resolver (hoja aparte, no denunciables) | 6 |
| URLs repetidas omitidas por el ciclo de feedback | 39 |

---

## 5. Qué demostró el piloto

1. **La automatización de la búsqueda y el cruce es viable y útil.** En un mes,
   con tres personas dedicando una fracción de su jornada, se clasificaron 340
   ofertas de 10 categorías reguladas y se llegó a 34 infracciones confirmadas
   más 63 detecciones por verificar. Sin la herramienta, ese volumen requeriría
   un orden de magnitud más de horas-inspector.

2. **La revisión humana no es un trámite: es el 54% del valor.** Es lo que
   convierte 148 acusaciones en 68 casos sostenibles.

3. **El ciclo de retroalimentación funciona sin reentrenar nada.** 39 URLs
   repetidas se omitieron automáticamente por haber sido ya evaluadas.

4. **El cuello de botella es la lectura de imágenes, no la búsqueda.** La
   información que decide el caso —marca, modelo, número de registro— está en la
   fotografía. Este es el hallazgo con mayor implicancia para el diseño de una
   solución independiente.

5. **El bloqueo de marketplaces es un sesgo sistemático, no un inconveniente.**
   56% de los intentos bloqueados. Cualquier cifra de cobertura que no lo declare
   está sobreestimando.

6. **La trazabilidad es un requisito, no un adorno.** Ver sección 6.

---

## 6. Limitaciones y fallos observados

Esta sección es deliberadamente extensa. Cada punto es una brecha que una
solución independiente debería cerrar, y está documentado porque ocurrió.

### Límites de la evidencia

- **Un mes de operación.** 36 corridas. No es una serie temporal suficiente para
  afirmar tendencias del mercado.
- **No es una muestra estadística.** La búsqueda sigue el ranking de los
  buscadores, que favorece a tiendas grandes y formales —las que sí cumplen—.
  Las cifras describen lo encontrado, no el universo.
- **No hay medición de recall.** Se sabe cuántas acusaciones fueron correctas; no
  se sabe cuántas infracciones existen y no se detectaron. Sin un patrón de
  referencia, no se puede calcular.
- **La «verdad» es el juicio de un inspector.** No se midió acuerdo entre
  evaluadores. Un mismo caso revisado por dos personas podría recibir veredictos
  distintos, y no hay dato para descartarlo.
- **Muestras pequeñas por categoría.** Autotest VIH: 10 filas revisadas. Las
  precisiones por categoría son orientativas, no concluyentes.

### Fallos técnicos documentados

Todos ocurrieron realmente y están corregidos, pero describen clases de problema
que reaparecen:

- **Trabajo que se ejecuta y no llega a destino.** Tres reportes quedaron varados
  en ramas sueltas del repositorio: la operación de guardado terminó sin error, y
  aun así el archivo no llegó al destino esperado. Uno estuvo ocho días perdido;
  otros dos, tres semanas, y nadie los echó de menos. Se detectaron por una
  auditoría que se escribió *a propósito* para buscarlos.
- **Pérdida silenciosa por nombres de archivo.** Los inspectores renombran los
  Excel antes de subirlos (`..._26082026 EJMS.xlsx`). El cruce por nombre exacto
  perdía archivos sin avisar. Este mismo error apareció **tres veces en lugares
  distintos** del código; la tercera copia habría informado a los tres
  inspectores que ninguno de los 32 reportes del mes estaba revisado.
- **Vocabulario no controlado en la captura.** La columna «Decisión final» es
  texto libre: hay 2 filas con «incorreto». Con 282 filas es anecdótico; con
  10.000 es un problema de integridad.
- **Calendarios y husos horarios.** El cambio de hora de Chile desfasa las
  programaciones en UTC. Los feriados legales no se derivan de ningún cálculo y
  hay que mantenerlos a mano.
- **Fragilidad de la programación.** Ninguna expresión cron estándar puede decir
  «el martes de la última semana del mes». Hubo que reemplazarla por un disparo
  único que se reprograma a sí mismo, con su propia ruta de fallo.

### Límites operacionales

- **Tope de 10 hallazgos por reporte**, impuesto por la capacidad de revisión
  humana. Los excedentes esperan a la corrida siguiente. Con más categorías o
  más frecuencia, el cuello se estrecha.
- **Cobertura de revisión del 82%.** Con tres personas y otras funciones, un 18%
  de lo generado no alcanzó a revisarse en el mes.
- **Sin persistencia consultable.** Todo vive en archivos Excel dentro de un
  repositorio Git. No hay base de datos, no hay consultas, no hay series
  históricas, no hay tablero. Responder «¿cuántas veces apareció este vendedor?»
  requiere escribir un script.
- **Sin captura de evidencia.** No se guardan copias de las publicaciones. Si una
  oferta desaparece entre la detección y la denuncia, no queda respaldo. **Para
  un procedimiento sancionatorio esto es una debilidad grave.**
- **Dependencia de una plataforma comercial de terceros.** La operación corre
  sobre un producto de un proveedor externo, con sus límites de uso y su
  disponibilidad. Durante el piloto, un límite semanal de uso impidió ejecutar
  nueve corridas programadas, que hubo que reponer a mano.

---

## 7. Brechas que justifican una solución independiente

Derivadas una a una de la sección 6:

| # | Brecha | Qué exige |
|---|---|---|
| 1 | La información decisiva está en las imágenes | Análisis visual: extraer marca, modelo y número de registro de las fotografías de las publicaciones |
| 2 | 46% de precisión en la clase acusatoria | Mejorar el cruce: normalización titular↔marca comercial, validación de presentaciones y calibres amparados, desambiguación de familias de producto |
| 3 | 56% de los marketplaces bloquean el acceso | Vías de acceso legítimas: convenios o APIs con plataformas, en vez de scraping que será bloqueado |
| 4 | Sin evidencia preservada | Captura y sellado temporal de las publicaciones detectadas, con valor probatorio para el procedimiento sancionatorio |
| 5 | Sin persistencia consultable | Base de datos con historial de vendedores, productos y decisiones; series temporales; indicadores |
| 6 | Revisión limitada a 10 casos por reporte | Interfaz de revisión diseñada para el trabajo del inspector, con vocabulario controlado, no un Excel de ida y vuelta por correo |
| 7 | Trabajo que se pierde sin aviso | Arquitectura con confirmación de persistencia verificada, no asumida |
| 8 | Dependencia de plataforma comercial | Infraestructura propia o controlada por el ISP |
| 9 | Sin medición de recall | Diseño experimental con patrón de referencia y medición de acuerdo entre evaluadores |

---

## 8. Requisitos derivados de la evidencia

Si el proyecto define requisitos, estos salen de lo observado y no de supuestos:

1. **Humano en el circuito, obligatorio.** Ninguna acusación debe salir del
   sistema sin veredicto humano. La evidencia: 46% de precisión.
2. **El sistema tiene que declarar lo que no pudo ver.** Bloqueos, enlaces
   caídos, imágenes ilegibles. La diferencia entre «no hay infracciones» y «no
   pudimos mirar» no puede perderse.
3. **El alcance regulatorio se modela explícitamente por categoría.** Material,
   uso previsto, presentaciones amparadas. No es un filtro de texto.
4. **Nada se descarta en silencio.** Todo archivo, hallazgo o corrida que no se
   pueda procesar se reporta a un humano.
5. **Vocabulario controlado en la captura de decisiones.**
6. **Evidencia preservada desde la detección**, no desde la denuncia.
7. **La retroalimentación del inspector manda sobre el criterio automático.**
8. **Trazabilidad completa**: cada caso del consolidado debe poder rastrearse
   hasta la corrida, la fecha, el inspector y su observación literal.

---

## 9. Activos reutilizables

Lo que ya existe y no habría que rehacer:

- **Taxonomía operativa de 10 categorías** con sus listados ISP, patrones de
  archivo y particularidades (hojas específicas para productos in vitro).
- **Reglas de alcance regulatorio codificadas**, incluida la de guantes de látex.
- **Criterios de clasificación y errores conocidos** — 743 líneas destiladas de
  un mes de correcciones de inspectores.
- **Corpus etiquetado por humanos**: 282 filas con veredicto, con observación
  literal del inspector y URL. Es pequeño, pero es oro para evaluar cualquier
  clasificador y no existe en otra parte.
- **126 URLs de marketplace aportadas a mano**, oferta que ningún automatismo vio.
- **Diseño del ciclo mensual y de la retroalimentación**, validado en operación.
- **Catálogo de modos de fallo** (sección 6), que en un proyecto nuevo habría que
  descubrir otra vez a costa de meses.

---

## 10. Lo que NO se puede afirmar

Para que nadie lo escriba por descuido:

- No se puede afirmar qué proporción del mercado online incumple.
- No se puede afirmar que el sistema detecte la mayoría de las infracciones.
- No se puede afirmar que las precisiones por categoría sean estables.
- No se puede afirmar que el ahorro de tiempo sea de X%: no se midió el tiempo
  del proceso manual equivalente.
- No se puede presentar las 34 infracciones confirmadas como denuncias cursadas.
  Son casos que llegan a la mesa de decisión; la decisión aún no se toma.

---

## 11. Glosario

| Término | Significado |
|---|---|
| ANDIM | Agencia Nacional de Dispositivos Médicos, del ISP |
| DM / DMDIV | Dispositivo médico / de diagnóstico in vitro |
| Categoría | Una de las 10 familias de producto del ciclo |
| Corrida / bloque | Una ejecución automática: una categoría, un día |
| Hallazgo | Una oferta clasificada e incluida en el reporte |
| NO REGISTRADO | Clase acusatoria: no se halló registro vigente que ampare la oferta |
| FUERA DE ALCANCE | La oferta no está sujeta a registro (material o uso no cubierto) |
| Decisión final | Veredicto del inspector: Correcto / Incorrecto |
| Consolidado | Excel mensual con los casos que llegan a la mesa de decisión |
| Semana de cierre | Última del mes: sin búsquedas, con consolidado y reunión |
