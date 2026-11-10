# Planillas en línea

Con esto, cada reporte le llega al inspector como una **planilla de Google** en
una carpeta de tu Drive; se abre con el enlace del correo, sin cuenta de Google.
El inspector trabaja ahí, y lo
que escribe se copia solo a `revision/`: nadie descarga, devuelve ni sube nada.
Las búsquedas y el consolidado leen esa carpeta, así que siempre trabajan con lo
último que se escribió.

## Cómo funciona

1. La rutina deja el reporte en `resultados/`, como siempre, y anota en
   `historial/` a qué inspector le toca.
2. Cada 15 minutos, un script de Google que corre en **qf.lukasgallegos@gmail.com**
   ve el reporte nuevo y lo convierte en una planilla de Google en la carpeta
   «Fiscalización web DM» de ese Drive, en una subcarpeta por categoría. Después
   le manda el enlace al inspector de turno, con el resumen del reporte.
3. El inspector completa «Decisión final» y «Observaciones del inspector»
   directamente en la planilla.
4. Cuando lleva 5 minutos sin editarse, el script copia la planilla a
   `revision/` con el nombre del reporte. Desde ahí la leen la búsqueda siguiente
   de la categoría y el consolidado.
5. El consolidado mensual sigue el mismo camino: les llega a los tres como
   planilla, se completa en la reunión y queda solo como acta en `revision/`.

Los archivos pasan entre GitHub y Google directamente, sin la rutina de Claude de
por medio. Un binario que pasa por el modelo como texto llega corrupto: así se
dañaron los adjuntos de salida del 24-08-2026.

**Cada planilla se abre con su enlace, sin cuenta de Google**, y quien tenga el
enlace puede editarla. La carpeta queda privada: solo entra qf.lukasgallegos@gmail.com.
Se decidió así el 10-11-2026, porque Google no deja compartir con las cuentas
del ISP: el administrador de ispch.cl bloqueó recibir archivos de fuera, y Emilio
y María Inés no tienen cuenta de Google con ese correo.

El costo es que un enlace que se filtre deja editar a cualquiera, y lo que se
escribe en las planillas la rutina lo lee como instrucciones. Por eso los enlaces
solo van en los correos a los inspectores, el correo les pide no reenviarlos
fuera del equipo, y las planillas no aparecen en búsquedas. Si un enlace llega a
quien no corresponde, ver «Mantención».

### Qué hace en cada caso

| Pasa | Qué hace |
|---|---|
| Un reporte nuevo en `resultados/` | Crea su planilla en la carpeta de la categoría, la deja abierta con su enlace y le escribe al inspector que quedó en `historial/`. |
| El consolidado del mes | Lo publica en «Consolidados mensuales» y les escribe a los tres. |
| Un inspector escribe en una planilla | La copia a `revision/` cuando lleva 5 minutos sin editarse. Si no cambió ningún valor, no hace nada. |
| Solo cambió una columna de la rutina, o nada | No la copia: una planilla sin nada escrito por el inspector no cuenta como revisada. |
| Alguien borra todo lo que había escrito | Borra la copia de `revision/`: deja de contar como revisada. |
| Una rutina vuelve a generar un reporte (una corrida repetida a mano) | Si la planilla no tiene nada escrito, la reemplaza, manda la anterior a la papelera y le escribe al inspector con el enlace nuevo. Si ya tiene revisión, la conserva y te avisa a ti. |
| Un reporte anterior al 09-11-2026, o que ya volvió revisado por correo | No lo publica. |
| Un reporte de hace más de 400 días | Olvida su planilla: queda en el Drive, pero ya no se copia a `revision/`. Así el registro del script no crece sin límite. |
| Falta el registro en `historial/` | Te manda el enlace a ti, para que lo reenvíes. |
| Un inspector responde un correo con un Excel | Si su reporte tiene planilla, no lo carga y le contesta con el enlace. Si no (los de antes del cambio), lo carga en `revision/` como antes y le confirma. |
| GitHub o Drive no responden | Lo demás sigue. Reintenta cada 15 minutos y te avisa una vez al día. |

Los avisos llegan a **lgallegos@ispch.cl** con el asunto «ALERTA — planillas en
línea fiscalización web DM». Los correos a los inspectores salen de
qf.lukasgallegos@gmail.com con el nombre «Fiscalización web DM».

### Cuándo una planilla cuenta como revisada

Cuando todas sus filas **REGISTRADO** y **NO REGISTRADO** tienen «Decisión
final». Las filas FUERA DE ALCANCE y la fila «Sin hallazgos» no la exigen. En un
reporte sin hallazgos, el correo le pide al inspector escribir «Sin hallazgos» en
esa fila al terminar.

Una planilla a medias ya está en `revision/`, así que la búsqueda siguiente usa
lo que tiene, pero cuenta como pendiente:

- `rotacion.py --pendientes` la lista con las filas que le faltan.
- En el consolidado aporta lo ya decidido, y la cobertura la marca «En parte».

## Instalación (una vez, unos 20 minutos)

### 1. Crear el token de GitHub

El token es el permiso con que el script lee y escribe en el repositorio. Va a
poder hacerlo **solo** en este repositorio.

1. En GitHub: tu foto (arriba a la derecha) → **Settings** → abajo a la
   izquierda, **Developer settings** → **Personal access tokens** →
   **Fine-grained tokens** → **Generate new token**.
2. **Token name:** `Planillas en línea DM`.
3. **Expiration:** la más larga que te ofrezca. Anota la fecha; cuando venza, el
   script te avisa por correo.
4. **Repository access:** **Only select repositories** → elige
   `lukasgallegosguty-beep/fiscalizacion-web`.
5. **Permissions**, en los permisos del repositorio: agrega **Contents** con
   acceso **Read and write**. No agregues nada más. Que «Metadata» quede en solo
   lectura es normal.
6. **Generate token** y cópialo. Empieza con `github_pat_`. GitHub no lo vuelve a
   mostrar: si lo pierdes, se crea otro. No lo pegues en un correo ni en un chat.

### 2. Crear el script

1. Abre <https://script.google.com> con la cuenta **qf.lukasgallegos@gmail.com**.
   Si tienes varias cuentas abiertas, revisa arriba a la derecha que sea esa: las
   planillas quedan en el Drive de esa cuenta y los correos salen de ella.
2. **Nuevo proyecto**. Haz clic en «Proyecto sin título» y llámalo
   `Planillas en línea DM`.
3. Abre [`planillas.gs` en GitHub](https://github.com/lukasgallegosguty-beep/fiscalizacion-web/blob/main/integraciones/planillas-google/planillas.gs)
   y cópialo entero con el botón **Copy raw file** (el ícono de copiar, arriba a
   la derecha del código).
4. En el editor de Apps Script, borra todo lo que trae `Código.gs`, pega lo que
   copiaste y guarda (ícono del disquete, o Ctrl+S). Ahí va **el código**, unas
   1.500 líneas que empiezan con `/**` y «Planillas en línea»; **el token no va
   aquí**, va solo en el paso 3. Al guardar, la lista de funciones de arriba
   tiene que mostrar `sincronizar`; si dice «Sin funciones», lo pegado no es el
   código. Si al guardar aparece un error de sintaxis, en **Configuración del
   proyecto** marca «Habilitar el entorno de ejecución de Chrome V8»: los
   proyectos nuevos ya lo traen, los antiguos no.

### 3. Guardar el token en el script

El token va en las propiedades del proyecto, no en el código, para que no quede
a la vista.

1. En la barra de la izquierda, el engranaje: **Configuración del proyecto**.
2. Al final, **Propiedades de la secuencia de comandos** → **Agregar propiedad**.
3. Propiedad: `GITHUB_TOKEN`. Valor: el token del paso 1.
4. **Guardar**.

### 4. Activar el servicio de Drive (si el editor lo deja)

El script convierte los Excel en planillas con la API de Google Drive. En muchas
cuentas responde sin hacer nada; este paso la activa por si acaso.

1. Vuelve al editor (el ícono `< >` de la izquierda).
2. En la barra de la izquierda, junto a **Servicios**, el **+**.
3. Elige **Drive API** (no «Drive Activity» ni «Drive Labels») y **Agregar**.
   Deja la versión y el identificador (`Drive`) que trae.

Si el **+** no abre la lista o no te deja agregarlo, sigue con el paso 5:
`instalar` comprueba si la API responde. Solo si dice «La API de Drive no está
activada para el script», actívala a mano:

1. **Configuración del proyecto** (engranaje) → marca «Mostrar el archivo de
   manifiesto "appsscript.json" en el editor».
2. En el editor, abre `appsscript.json`, reemplaza todo su contenido por esto y
   guarda:

   ```json
   {
     "timeZone": "America/Santiago",
     "dependencies": {
       "enabledAdvancedServices": [
         { "userSymbol": "Drive", "serviceId": "drive", "version": "v3" }
       ]
     },
     "exceptionLogging": "STACKDRIVER",
     "runtimeVersion": "V8"
   }
   ```
3. Vuelve a ejecutar `instalar`.

### 5. Autorizar y encender

1. Arriba, en la lista de funciones junto a **Ejecutar**, elige `instalar` y
   haz clic en **Ejecutar**. Ojo: la lista parte en `sincronizar`, que es la
   primera función del archivo; hay que cambiarla a `instalar`.
2. Google pide permisos: **Revisar permisos** → elige qf.lukasgallegos@gmail.com
   → sale «Google no verificó esta app» → **Configuración avanzada** → **Ir a
   Planillas en línea DM (no seguro)** → **Permitir**.
   - El aviso sale con cualquier script personal: lo escribiste tú, no una app
     de terceros.
   - Pide Gmail, Drive y Hojas de cálculo en términos amplios porque así los
     pide cualquier script que los usa. Este solo crea y lee las planillas de su
     carpeta, manda los correos del reporte y revisa las respuestas de ispch.cl.
   - En la lista tiene que estar «Ver, editar, crear y borrar todos tus archivos
     de Google Drive»: sin ese permiso no puede crear la carpeta ni las
     planillas. Si pegas una versión nueva del código, Google puede volver a
     pedir permisos: acéptalos igual.
3. En el registro de ejecución tienen que aparecer cuatro líneas:
   - `Conexión con GitHub: OK. El token puede leer y escribir en …`
   - `Conexión con Google Drive: OK (qf.lukasgallegos@gmail.com).`
   - `Carpeta de las planillas: https://drive.google.com/drive/folders/… — compartida con: nadie. Cada planilla se abre con su enlace, sin cuenta de Google.`
   - `Listo: cada 15 minutos se publican los reportes nuevos, …`

   Si en cambio aparece un error, dice qué falta. Los más comunes:
   - **El token**: no se copió entero, o no tiene **Contents: Read and write**.
   - **«Google Drive API has not been used in project … or it is disabled»**: la
     API de Drive no está activada. Haz el paso 4; o abre el enlace que trae el
     error con qf.lukasgallegos@gmail.com y haz clic en **Habilitar**. Espera un
     par de minutos y vuelve a ejecutar `instalar`.
   - **«Request had insufficient authentication scopes»**: el script quedó
     autorizado sin el permiso de editar Drive. Pega de nuevo el código del
     paso 2 (la versión vigente lo pide), ejecuta `instalar` y acepta los
     permisos.

### 6. Cómo entran los inspectores

No hay que hacer nada: no hay invitación ni hace falta cuenta de Google. Cada
inspector abre la planilla con el botón del correo del reporte, que le llega a
su correo del ISP.

- Si su navegador está conectado a una cuenta de Google del ISP y Google dice
  que no tiene acceso, que la abra en una **ventana de incógnito**: el ISP no deja
  que sus cuentas abran archivos de fuera, pero el enlace funciona sin cuenta.
- Tú entras a la carpeta, y a todas las planillas, con qf.lukasgallegos@gmail.com,
  que es la dueña.

Si algún día quieren entrar con cuentas en vez de enlaces (por ejemplo, Gmail
personales), pon esas direcciones en `cuentasGoogle`, al principio del script en
script.google.com, y ejecuta `instalar` de nuevo: les comparte la carpeta. Las
@ispch.cl no sirven. No las copies al repositorio, que es público.

### 7. Probar con el reporte de hoy

1. En el editor, elige `sincronizar` y **Ejecutar**.
2. En la carpeta «Fiscalización web DM» aparece la subcarpeta de cada categoría
   de hoy con su planilla, y al inspector de la semana le llega el correo con el
   enlace. Se publican los reportes desde el 09-11-2026 que todavía no volvieron
   revisados por correo; si instalas otro día, salen de una vez los de los días
   entremedio, cada uno con su correo.
3. Escribe una «Decisión final» en una fila, espera 5 minutos y vuelve a ejecutar
   `sincronizar`. En el repositorio aparece el archivo en `revision/` con un
   commit «planilla en línea: …». Hazlo con una revisión de verdad: lo que
   escribes cuenta para el consolidado del mes.

### 8. Cambiar el texto de las rutinas, el mismo día

Desde ahora el script es el que le escribe al inspector. Si las rutinas siguen
con el texto anterior, al inspector le llegan dos correos por reporte, y el de la
rutina le pide descargar y devolver el Excel.

- En las rutinas **«Fiscalización web — bloque 1»**
  (<https://claude.ai/code/routines/trig_01FaZJLaCD7aqtZTtDh3f6ZL>) y **«bloque 2»**
  (<https://claude.ai/code/routines/trig_01VcLaU76dLnc2V8AzXhAKZX>): reemplaza el
  punto 1 del PASO 5, el PASO 6 y el PASO 7 por los de la sección «Prompt —
  bloque 1» de `RUTINA.md`. En el bloque 2, `--slot 1` pasa a ser `--slot 2`.
- En la rutina **«Fiscalización web — consolidado mensual»**: el PASO 5 (última
  línea) y el PASO 6, igual, desde `RUTINA.md`. Esa la puede cambiar Claude desde
  una sesión: pídeselo.
- `SKILL.md` se puede subir a la skill en claude.ai cuando quieras, antes o
  después de esto: su «Paso 5-ter» hace lo que diga el paso 6 de la rutina, con
  el texto viejo o con el nuevo.

### 9. Avisar al equipo

Un texto que puedes mandarles:

> Desde hoy, cada reporte les llega como **planilla en línea**: el correo
> «Fiscalización web DM — categoría — fecha» trae el botón «Abrir la planilla».
> Completen ahí «Decisión final» y «Observaciones del inspector»: se guarda solo,
> y no hay que descargar, devolver ni responder nada. No hace falta cuenta de
> Google; si les dice que no tienen acceso, ábranla en una ventana de incógnito.
> El enlace deja editar a quien lo tenga: no lo reenvíen fuera del equipo.

## Mantención

- **Si vence el token:** llega una ALERTA que dice «GitHub rechazó el token (401)».
  Crea uno nuevo (paso 1) y reemplaza el valor de `GITHUB_TOKEN` (paso 3). No hay
  que volver a instalar: lo pendiente se publica y se guarda solo.
- **Si cambia un inspector o su correo:** hay que cambiarlo en:
  - `inspectores` del script en script.google.com;
  - el mismo bloque en `planillas.gs` de este repositorio;
  - `INSPECTORES` en `scripts/rotacion.py`.

  `tests/test_planillas_google.py` falla si el repositorio y `rotacion.py` no
  coinciden.
- **Si un enlace llega a quien no corresponde:** en Drive, abre esa planilla →
  **Compartir** → en «Acceso general», cambia «Cualquier persona con el enlace» a
  **Restringido**. El enlace deja de abrir para todos, también para el inspector
  (el enlace de un archivo no se puede cambiar por otro). Lo ya escrito queda, y
  en **Archivo → Historial de versiones** ves si alguien cambió algo. Si todavía
  falta revisarla, el inspector te pasa sus decisiones y las escribes tú en la
  planilla: se guarda igual. Las demás planillas no cambian.
- **Si una planilla se borra por error:** sácala de la papelera de Drive de
  qf.lukasgallegos@gmail.com. No se vuelve a crear sola, salvo que la rutina
  vuelva a generar ese reporte.
- **La recepción por correo** queda como respaldo para los reportes anteriores a
  las planillas. Exige que Google haya autenticado el correo como enviado desde
  ispch.cl. Si llega una ALERTA «Excel retenido» con un correo legítimo de un
  inspector, va a pasar con todos los del ISP: en el script, cambia
  `verificarRemitente: true` a `false` y guarda. Lo retenido de los últimos 10
  días se carga solo en la corrida siguiente.
- **Para apagarlo:** en el editor, ejecuta `desinstalar`. No borra nada.
- **Para ver qué hizo:** en script.google.com, **Ejecuciones**, en la barra de la
  izquierda; en GitHub, los commits «planilla en línea: …»; o la carpeta del
  Drive.
- **Este archivo es una copia.** El script que corre es el que está pegado en
  script.google.com, igual que la skill en claude.ai. Si cambias `planillas.gs`
  aquí, vuelve a pegarlo allá.

## Tests

```bash
python3 -m unittest discover -s tests -v    # incluye los del script, si hay Node
node --test integraciones/planillas-google/*.test.js
```

`planillas.test.js` simula GitHub, Drive, Hojas de cálculo y Gmail, y recorre la
publicación, la copia a `revision/` y la instalación. `correo.test.js` recorre la
recepción por correo. `tests/test_planillas_google.py` comprueba que el script
usa los mismos inspectores, categorías y nombres que `rotacion.py`, y que
reconoce los nombres de archivo igual, con los nombres reales de `revision/`.
