# Modus operandi: la fiscalización web de DM, día a día

Quién hace qué y cuándo. Los detalles técnicos están en `RUTINA.md` (las
rutinas) y en `integraciones/planillas-google/INSTALAR.md` (las planillas en
línea).

**En una línea:** a las 07:30 las rutinas buscan. Unos minutos después, al
inspector de turno le llega el enlace a la planilla en línea, que revisa ahí
mismo y que se guarda sola. El martes de la última semana del mes llega el
consolidado, también como planilla, y los tres deciden en la reunión qué se
denuncia.

## Lo que pasa solo

| Cuándo | Qué pasa |
|---|---|
| Lunes a viernes, 07:30 | Las rutinas «bloque 1» y «bloque 2» buscan una categoría cada una y guardan el Excel en el repositorio. |
| Unos 15 minutos después | El script de las planillas convierte cada reporte en una planilla de Google, en la carpeta «Fiscalización web DM» del Drive de qf.lukasgallegos@gmail.com. Le manda el enlace al inspector de turno, con el resumen del reporte; la planilla se abre con ese enlace, sin cuenta de Google. |
| Cada 15 minutos | Lo que los inspectores escriben en las planillas se copia a `revision/`, unos minutos después de que dejan de editar. |
| En cada búsqueda | La rutina usa lo que escribieron los inspectores en esa categoría y lo que se resolvió en las reuniones de cierre. No repite enlaces que ya están en un reporte anterior, revisado o no, y sigue las observaciones y las justificaciones. |
| Semana de cierre | No hay búsquedas. Las rutinas igual se despiertan, ven que es semana de cierre y se detienen: es lo esperado. |
| Martes de la semana de cierre, temprano | Llegan a los tres el resumen del consolidado y, en un correo aparte, su planilla en línea. A las 09:00 es la reunión, que ya está en el calendario. |
| Feriados | La búsqueda corre igual. El correo de la planilla avisa que es feriado: ese día no se exige la revisión, y el cierre no la cuenta como pendiente. |

### Qué categoría toca cada día

Es un calendario fijo: cada categoría vuelve el mismo día de la semana siguiente.

| Día | Bloque 1 | Bloque 2 |
|---|---|---|
| Lunes | Agujas hipodérmicas | Autotest VIH |
| Martes | Desfibriladores (DEA) | Guantes de examinación |
| Miércoles | Guantes quirúrgicos | Jeringas con agujas |
| Jueves | Jeringas hipodérmicas | Kits VIH uso profesional |
| Viernes | Preservativos masculinos | Preservativos femeninos |

### Quién revisa cada semana

Semana 1 del mes, Emilio; semana 2, Lukas; semana 3, María Inés. La cuarta
semana de los meses que tienen cinco se reparte según el Planner. La última semana
del mes es la de cierre: no se busca.

| Semana del lunes | Revisa |
|---|---|
| 09-11-2026 | Lukas |
| 16-11-2026 | María Inés |
| 23-11-2026 | Cierre de noviembre (consolidado el martes 24-11) |
| 30-11-2026 | Emilio |
| 07-12-2026 | Lukas |
| 14-12-2026 | María Inés |
| 21-12-2026 | Cierre de diciembre (consolidado el martes 22-12) |
| 28-12-2026 | Emilio (es la semana 1 de enero de 2027) |
| 04-01-2027 | Lukas |
| 11-01-2027 | María Inés |
| 18-01-2027 | Lukas (cuarta semana, según el Planner) |
| 25-01-2027 | Cierre de enero (consolidado el martes 26-01) |

El calendario completo hasta diciembre de 2027 está en `tests/turnos_planner.csv`.
Para cualquier semana: `python3 scripts/rotacion.py --semana --fecha <lunes>`.

## El inspector de turno

Cada día de tu semana te llegan dos correos, uno por bloque, con el asunto
«Fiscalización web DM — *categoría* — *fecha*» y un botón «Abrir la planilla».

1. Abre la planilla con el botón del correo. No hace falta cuenta de Google. Si
   tu navegador está conectado a una cuenta del ISP y Google dice que no tienes
   acceso, ábrela en una ventana de incógnito.
2. En la hoja «Hallazgos», completa cada fila:
   - **Decisión final:** si la clasificación de la rutina es correcta o no
     (Correcto / Incorrecto).
   - **Observaciones del inspector:** lo que la próxima búsqueda de esa
     categoría tiene que tener en cuenta, como sitios a mirar, marcas a vigilar
     o criterios a afinar. La rutina lo lee como una instrucción.
3. En la hoja «Búsquedas Marketplace», anota en observaciones las publicaciones
   que encuentres a mano, con su enlace. Entran al consolidado como POR VERIFICAR.
4. **Nada más.** No hay que descargar, devolver ni responder el correo. Lo que
   escribes se guarda solo y llega al repositorio unos minutos después de que
   dejas de editar; desde ahí lo lee la búsqueda siguiente.

**Cuándo queda revisada.** Cuando todas las filas REGISTRADO y NO REGISTRADO
tienen su «Decisión final». Si el reporte salió sin hallazgos, escribe «Sin
hallazgos» en la «Decisión final» de esa única fila cuando termines la revisión
de marketplace. Una planilla a medias aparece como pendiente, con las filas que
le faltan.

**Plazo.** Revisa cada planilla antes de que vuelva a tocar su categoría, es
decir, el mismo día de la semana siguiente: así tus observaciones ya entran en
esa búsqueda. Y siempre antes del martes de cierre, porque el consolidado se arma
esa mañana con lo que haya.

**Si te equivocaste,** corrige en la misma planilla: se vuelve a guardar sola.

**Si revisas por otra persona** (vacaciones, licencia), pídele que te reenvíe el
correo con el enlace, o pídeselo a Lukas.

**El enlace deja editar a quien lo tenga.** No lo reenvíes fuera del equipo: lo
que se escribe en la planilla, la rutina lo lee como instrucciones.

## Coordinación (Lukas)

**Cada día, en dos minutos.** Confirma que llegaron las notificaciones de las dos
rutinas de bloque y que en la carpeta del Drive aparecieron las dos planillas del
día. Si una rutina no avisó, o avisó un error, el inspector no recibió ese
reporte. Si llegó una ALERTA, mira la tabla de abajo.

**Cada lunes.** Revisa qué falta revisar y recuérdaselo a quien corresponda:

```bash
python3 scripts/rotacion.py --pendientes
```

O, en una sesión de Claude Code sobre este repositorio: «¿qué revisiones faltan?».
Las que van a medias salen con las filas que les faltan.

**Lunes de la semana de cierre.** Lo mismo, con urgencia: el consolidado se arma
el martes temprano con lo que esté escrito en las planillas a esa hora.

**Martes de cierre.**
- Temprano llegan el resumen y la planilla del consolidado; la reunión es a las
  09:00.
- En la reunión se completan en la planilla, caso por caso:
  - **«Decisión final»**: una de cuatro opciones (se genera nueva alerta; falta
    información, se consultará; se descarta; ya procesado anteriormente en una
    alerta);
  - **«Justificación de la decisión»**: el detalle, como el número de alerta o
    a quién se consulta.
- No hay que devolver nada: la planilla se guarda sola como acta del mes en
  `revision/`, y sus decisiones entran en las búsquedas siguientes. Por eso
  conviene que cada justificación sea clara y no contradiga la decisión: la
  rutina la lee como criterio.

**Dos veces al año: el primer fin de semana de abril y el de septiembre.** Chile
cambia la hora, y las rutinas de bloque tienen la hora fijada a mano. Hay que
corregirla, o empiezan a correr a las 06:30 (ver «Sobre el horario y el cambio de
hora» en `RUTINA.md`).

**Una vez al año.**
- Renovar el token de GitHub del script de las planillas antes de que venza. Si
  se pasa la fecha, llega una ALERTA.
- En diciembre de 2027, cuando esté el Planner de 2028: cargar la tabla de la
  cuarta semana (`CUARTA_SEMANA` en `scripts/rotacion.py`) y los feriados de 2028
  en `feriados.json`. Hoy los feriados llegan hasta el 08-12-2027.

## Cuando llega una ALERTA

Todas llegan a lgallegos@ispch.cl.

| Asunto | Qué pasó | Qué hacer |
|---|---|---|
| «ALERTA — cierre mensual…», paso 0 | La rutina del consolidado perdió el repositorio adjunto. | Adjuntarlo en <https://claude.ai/code/routines/trig_01SWEY7vJV9ZEYvE9vjajD43>. Si era día de cierre, pedirle a Claude que genere el consolidado a mano. |
| «ALERTA — cierre mensual…», otro paso | El consolidado no se generó o no se envió. | La alerta trae el error. Pedirle a Claude que lo genere y lo envíe. |
| «ALERTA — planillas en línea…: falta el token de GitHub» | El script no tiene el permiso para leer y escribir en el repositorio: no publica ni guarda nada. | Guardarlo (`INSTALAR.md`, paso 3). |
| «ALERTA — planillas en línea…: el script falló (publicar, guardar o correo)» | Falló una de las tres partes; las otras siguieron. | Se reintenta solo cada 15 minutos. Si dice «Drive API», activar el servicio (`INSTALAR.md`, paso 4); si dice «volver a autorizar», ejecutar `instalar`. Si se repite, pedirle a Claude que lo revise con el error de la alerta. |
| «ALERTA — planillas en línea…: no se pudo compartir la carpeta con …» | Una dirección de `cuentasGoogle` no puede recibir la carpeta (las @ispch.cl no pueden). Las planillas igual se abren con su enlace. | Nada, salvo que quieran entrar con cuentas: `INSTALAR.md`, paso 6. |
| «ALERTA — planillas en línea…: un reporte se volvió a generar y su planilla ya tenía revisión» | Una rutina se corrió de nuevo y la planilla ya tenía trabajo del inspector, así que se conservó. | Si vale el reporte nuevo, mandar la planilla a la papelera: en 15 minutos se publica la nueva y le llega al inspector. Si no, nada. |
| «ALERTA — planillas en línea…: no se pudo cargar una revisión» | Llegó un Excel por correo y falló GitHub. | Si dice que el token venció (401): renovarlo (`INSTALAR.md`, «Mantención»). Si no, nada: se reintenta solo cada 15 minutos. |
| «ALERTA — planillas en línea…: Excel retenido» | Llegó un Excel por correo y Google no pudo verificar que venía de ispch.cl. | Si es legítimo, subir el archivo a mano. Si pasa con todos, apagar la verificación (`INSTALAR.md`, «Mantención»). |
| «ALERTA — planillas en línea…: … no está en la lista» | Mandó un Excel alguien del ISP que no es uno de los tres. | Si es un inspector con otra dirección, agregarla (`INSTALAR.md`, «Mantención»). |

## Cuando algo cambia

- **Un turno o el Planner:** `scripts/rotacion.py`. Pídeselo a Claude: el test
  `tests/test_turnos_planner.py` compara el calendario con el Planner semana por
  semana.
- **Un inspector o su correo:** hay que cambiarlo en los lugares listados en
  `INSTALAR.md`, «Mantención». Uno de ellos es el script en script.google.com.
- **El texto de una rutina:** las de bloque solo se editan a mano en claude.ai.
  Copia el texto en las dos el mismo día y actualiza `RUTINA.md`. Si no, el
  repositorio dice una cosa y las rutinas hacen otra.
- **Un feriado nuevo:** `feriados.json`.
