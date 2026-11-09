# Modus operandi: la fiscalización web de DM, día a día

Quién hace qué y cuándo. Los detalles técnicos están en `RUTINA.md` (las
rutinas) y en `integraciones/recepcion-correo/INSTALAR.md` (la recepción de
revisiones por correo).

**En una línea:** a las 07:30 las rutinas buscan y le mandan el reporte al
inspector de turno; el inspector lo revisa y responde el correo con el Excel; el
martes de la última semana del mes llega el consolidado y los tres deciden qué se
denuncia.

## Lo que pasa solo

| Cuándo | Qué pasa |
|---|---|
| Lunes a viernes, 07:30 | Las rutinas «bloque 1» y «bloque 2» buscan una categoría cada una, guardan el Excel en el repositorio y le mandan el enlace por correo al inspector de turno. |
| Cada 15 minutos | La recepción revisa el correo: cada Excel revisado que llega como respuesta queda en `revision/`, y el inspector recibe la confirmación. |
| En cada búsqueda | La rutina usa lo que devolvieron los inspectores de esa categoría y lo que se resolvió en las reuniones de cierre: no repite enlaces ya revisados o ya decididos, y sigue las observaciones y las justificaciones. |
| Semana de cierre | No hay búsquedas. Las rutinas igual se despiertan, ven que es semana de cierre y se detienen: es lo esperado. |
| Martes de la semana de cierre, temprano | Llega a los tres el consolidado del mes, con lo que confirmaron los inspectores. A las 09:00 es la reunión, que ya está en el calendario. |
| Feriados | La búsqueda corre igual. Ese día no se exige la revisión, y el cierre no la cuenta como pendiente. |

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
«Fiscalización web DM — *categoría* — *fecha*».

1. Descarga el Excel desde el enlace del correo.
2. En la hoja de hallazgos, completa cada fila:
   - **Decisión final:** si la clasificación de la rutina es correcta o no.
   - **Observaciones del inspector:** lo que la próxima búsqueda de esa
     categoría tiene que tener en cuenta, como sitios a mirar, marcas a vigilar
     o criterios a afinar. La rutina lo lee como una instrucción.
3. En la hoja «Búsquedas Marketplace», anota en observaciones las publicaciones
   que encuentres a mano, con su enlace. Entran al consolidado como POR VERIFICAR.
4. **Responde ese mismo correo con el Excel adjunto.** No le cambies el nombre;
   si quieres, agrégale tus iniciales al final. Responde desde tu correo del ISP.
5. En unos minutos te llega «Tu revisión quedó cargada». Si en una hora no llegó
   nada, avísale a Lukas.

**Plazo.** Devuelve cada reporte antes de que vuelva a tocar su categoría, es
decir, el mismo día de la semana siguiente: así tus observaciones ya entran en
esa búsqueda. Y siempre antes del martes de cierre, porque lo que no esté
devuelto ese día no entra al consolidado.

**Si te equivocaste,** responde de nuevo con el archivo corregido y el mismo
nombre: reemplaza al anterior.

**Si revisas por otra persona** (vacaciones, licencia), manda el Excel desde tu
correo del ISP a qf.lukasgallegos@gmail.com, con el nombre original del archivo.
Se carga igual.

## Coordinación (Lukas)

**Cada día, en dos minutos.** Confirma que llegaron las notificaciones de las dos
rutinas de bloque. Si una no avisó, o avisó un error, el inspector no recibió ese
reporte. Si llegó una ALERTA, mira la tabla de abajo.

**Cada lunes.** Revisa qué falta devolver y recuérdaselo a quien corresponda:

```bash
python3 scripts/rotacion.py --pendientes
```

O, en una sesión de Claude Code sobre este repositorio: «¿qué revisiones faltan?».

**Lunes de la semana de cierre.** Lo mismo, con urgencia: lo que no esté devuelto
el martes por la mañana no entra al consolidado.

**Martes de cierre.**
- Temprano llega el consolidado; la reunión es a las 09:00.
- En la reunión se completan «¿Se procesa como denuncia?» y «Justificación de la
  decisión».
- Después, se responde el correo del consolidado con el archivo completado.
  Queda como acta del mes en `revision/`, y sus decisiones entran en las
  búsquedas siguientes. Por eso conviene que cada justificación sea clara y no
  contradiga la decisión: la rutina la lee como criterio.

**Dos veces al año: el primer fin de semana de abril y el de septiembre.** Chile
cambia la hora, y las rutinas de bloque tienen la hora fijada a mano. Hay que
corregirla, o empiezan a correr a las 06:30 (ver «Sobre el horario y el cambio de
hora» en `RUTINA.md`).

**Una vez al año.**
- Renovar el token de GitHub de la recepción antes de que venza. Si se pasa la
  fecha, llega una ALERTA.
- En diciembre de 2027, cuando esté el Planner de 2028: cargar la tabla de la
  cuarta semana (`CUARTA_SEMANA` en `scripts/rotacion.py`) y los feriados de 2028
  en `feriados.json`. Hoy los feriados llegan hasta el 08-12-2027.

## Cuando llega una ALERTA

Todas llegan a lgallegos@ispch.cl.

| Asunto | Qué pasó | Qué hacer |
|---|---|---|
| «ALERTA — cierre mensual…», paso 0 | La rutina del consolidado perdió el repositorio adjunto. | Adjuntarlo en <https://claude.ai/code/routines/trig_01SWEY7vJV9ZEYvE9vjajD43>. Si era día de cierre, pedirle a Claude que genere el consolidado a mano. |
| «ALERTA — cierre mensual…», otro paso | El consolidado no se generó o no se envió. | La alerta trae el error. Pedirle a Claude que lo genere y lo envíe. |
| «ALERTA — recepción…: falta el token de GitHub» | El script no tiene dónde leer el permiso para escribir en el repositorio. | Guardarlo (`INSTALAR.md`, paso 3). |
| «ALERTA — recepción…: no se pudo cargar una revisión» | Falló GitHub. | Si dice que el token venció (401): renovarlo (`INSTALAR.md`, «Mantención»). Si no, nada: se reintenta solo cada 15 minutos. |
| «ALERTA — recepción…: Excel retenido» | Google no pudo verificar que el correo venía de ispch.cl. | Si es legítimo, subir el archivo a mano. Si pasa con todos, apagar la verificación (`INSTALAR.md`, paso 5). |
| «ALERTA — recepción…: … no está en la lista» | Mandó un Excel alguien del ISP que no es uno de los tres. | Si es un inspector con otra dirección, agregarla (`INSTALAR.md`, «Mantención»). |
| «ALERTA — recepción…: el script falló» | Error inesperado del script. | Se reintenta solo. Si se repite, pedirle a Claude que lo revise con el error de la alerta. |

## Cuando algo cambia

- **Un turno o el Planner:** `scripts/rotacion.py`. Pídeselo a Claude: el test
  `tests/test_turnos_planner.py` compara el calendario con el Planner semana por
  semana.
- **Un inspector o su correo:** hay que cambiarlo en tres lugares, listados en
  `INSTALAR.md`, «Mantención». Uno de los tres es el script en script.google.com.
- **El texto de una rutina:** las de bloque solo se editan a mano en claude.ai.
  Copia el texto en las dos el mismo día y actualiza `RUTINA.md`. Si no, el
  repositorio dice una cosa y las rutinas hacen otra.
- **Un feriado nuevo:** `feriados.json`.
