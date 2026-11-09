# Recepción de revisiones por correo

Con esto, los inspectores devuelven el Excel revisado **respondiendo el correo
del reporte**, y el archivo se carga solo en `revision/`. No necesitan cuenta de
GitHub ni depender de quien antes subía los archivos a mano.

## Cómo funciona

1. La rutina envía el reporte desde **qf.lukasgallegos@gmail.com**, con el
   enlace de descarga.
2. El inspector completa «Decisión final» y «Observaciones del inspector» y
   **responde ese correo con el Excel adjunto**.
3. Cada 15 minutos, un script de Google que corre en esa misma cuenta revisa el
   correo, sube el Excel a `revision/` y le responde al inspector: «Tu revisión
   quedó cargada en el repositorio».

El archivo pasa de Gmail a GitHub directamente, sin la rutina de Claude de por
medio. Un binario que pasa por el modelo como texto llega corrupto: así se
dañaron los adjuntos de salida del 24-08-2026.

### Qué hace con cada correo

| Llega | Qué hace |
|---|---|
| Respuesta de un inspector con el Excel | Lo sube con el nombre que trae y se lo confirma. |
| … con el archivo renombrado sin pistas («Libro1.xlsx») | Toma el nombre del reporte del correo original y le agrega el sufijo del inspector (`_emillan`, `_lgallegos`, `_mmedina`). |
| … con un nombre que contradice al reporte del hilo («guantes» en el hilo de Autotest VIH) | No lo sube. Le explica al inspector cómo enviarlo, en vez de adivinar. |
| … con una versión corregida y el mismo nombre | Reemplaza la anterior. |
| … con el mismo archivo otra vez | No crea nada nuevo; igual le confirma. |
| … sin Excel, pero con otro adjunto (`winmail.dat`, `.xls`, `.pdf`) | Le avisa al inspector que no llegó el Excel. |
| El consolidado completado en la reunión | Lo guarda en `revision/` como acta; la rutina no lo cuenta como revisión. |
| De alguien de ispch.cl que no está en la lista | No lo sube y te avisa a ti. |
| Que Google no pudo autenticar como enviado desde ispch.cl | Lo retiene sin responder y te avisa a ti: puede ser alguien haciéndose pasar por un inspector, y la rutina lee las observaciones del inspector como instrucciones. Si apagas la verificación, lo retenido de los últimos 10 días se carga solo. |
| GitHub no responde o el token venció | Deja el correo pendiente, reintenta cada 15 minutos y te avisa una vez al día. El inspector recibe la confirmación cuando el archivo queda arriba. |
| Cualquier otro correo | Nada. |

Los avisos llegan a **lgallegos@ispch.cl** con el asunto «ALERTA — recepción de
revisiones fiscalización web DM». En Gmail, los hilos procesados quedan con la
etiqueta «Fiscalización web/Revisión cargada» o «Fiscalización web/Revisión con
problema».

## Instalación (una vez, unos 15 minutos)

### 1. Crear el token de GitHub

El token es el permiso con que el script escribe en el repositorio. Va a poder
escribir **solo** en este repositorio.

1. En GitHub: tu foto (arriba a la derecha) → **Settings** → abajo a la
   izquierda, **Developer settings** → **Personal access tokens** →
   **Fine-grained tokens** → **Generate new token**.
2. **Token name:** `Recepción de revisiones`.
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
   Si tienes varias cuentas abiertas, revisa arriba a la derecha que sea esa: el
   script lee el correo de la cuenta donde está.
2. **Nuevo proyecto**. Haz clic en «Proyecto sin título» y llámalo
   `Recepción de revisiones DM`.
3. Abre [`recepcion.gs` en GitHub](https://github.com/lukasgallegosguty-beep/fiscalizacion-web/blob/main/integraciones/recepcion-correo/recepcion.gs)
   y cópialo entero con el botón **Copy raw file** (el ícono de copiar, arriba a
   la derecha del código).
4. En el editor de Apps Script, borra todo lo que trae `Código.gs`, pega lo que
   copiaste y guarda (ícono del disquete, o Ctrl+S). Si al guardar aparece un
   error de sintaxis, en **Configuración del proyecto** marca «Habilitar el
   entorno de ejecución de Chrome V8»: los proyectos nuevos ya lo traen, los
   antiguos no.

### 3. Guardar el token en el script

El token va en las propiedades del proyecto, no en el código, para que no quede
a la vista.

1. En la barra de la izquierda, el engranaje: **Configuración del proyecto**.
2. Al final, **Propiedades de la secuencia de comandos** → **Agregar propiedad**.
3. Propiedad: `GITHUB_TOKEN`. Valor: el token del paso 1.
4. **Guardar**.

### 4. Autorizar y encender

1. Vuelve al editor (el ícono `< >` de la izquierda).
2. Arriba, en la lista de funciones junto a **Ejecutar**, elige `instalar` y
   haz clic en **Ejecutar**.
3. Google pide permisos: **Revisar permisos** → elige qf.lukasgallegos@gmail.com
   → sale «Google no verificó esta app» → **Configuración avanzada** → **Ir a
   Recepción de revisiones DM (no seguro)** → **Permitir**.
   - El aviso sale con cualquier script personal: lo escribiste tú, no una app
     de terceros.
   - Google describe el permiso de Gmail en términos amplios porque así lo pide
     cualquier script que lee correo. Este solo busca respuestas de ispch.cl,
     las etiqueta y contesta.
4. En el registro de ejecución tienen que aparecer dos líneas:
   - `Conexión con GitHub: OK. El token puede leer y escribir en …`
   - `Listo: el script revisa el correo cada 15 minutos. …`

   Si en cambio aparece un error, dice qué falta: casi siempre es el token (que
   no se copió entero, o que no tiene **Contents: Read and write**).

### 5. Probar con una revisión real

1. Desde **lgallegos@ispch.cl**, responde un correo de reporte que te haya
   llegado, adjuntando tu Excel revisado. Usa una revisión de verdad: lo que se
   sube cuenta para el consolidado del mes.
2. En 15 minutos como máximo te llega «Tu revisión quedó cargada…» y el archivo
   aparece en `revision/`. Para no esperar, en el editor elige
   `procesarRevisiones` y **Ejecutar**.
3. Si en cambio te llega una ALERTA «Excel retenido: no se pudo verificar quién
   lo mandó», Google no logró autenticar tu correo como enviado desde ispch.cl.
   La alerta trae el detalle técnico. Si te pasa con tu propio correo, va a pasar
   con todos los del ISP: en el script de script.google.com cambia
   `verificarRemitente: true` a `false`, guarda, y en la corrida siguiente lo
   retenido se carga solo.

### 6. Cambiar el texto de las rutinas

Hazlo **después** de que funcione la prueba del paso 5: si las rutinas les piden
a los inspectores responder el correo antes de que el script esté andando, las
respuestas llegan a un buzón que nadie procesa.

Los correos de la rutina todavía dicen que el archivo se sube a `revision/`.
Cambia esto en las rutinas **«Fiscalización web — bloque 1»** y
**«Fiscalización web — bloque 2»**, al final del PASO 6:

> ~~Cierra recordando que debe completar "Decisión final" y "Observaciones del
> inspector" y subir el archivo a la carpeta revision/ del repositorio.~~
>
> Cierra recordando que debe completar "Decisión final" y "Observaciones del
> inspector" y RESPONDER ESTE MISMO CORREO con el Excel completado adjunto: se
> carga solo en el repositorio y le llega una confirmación. Que no le cambie el
> nombre al archivo; puede agregarle sus iniciales al final.

Y en la rutina **«Fiscalización web — consolidado mensual»**, en el PASO 6:

> ~~…y que el archivo completado se sube a la carpeta revision/.~~
>
> …y que el archivo completado se devuelve respondiendo este mismo correo con el
> Excel adjunto: se carga solo en el repositorio.

Las copias de los tres prompts en `RUTINA.md` ya tienen el texto nuevo.

### 7. Avisar al equipo

Un texto que puedes mandarles:

> Desde hoy, para devolver un reporte revisado basta con **responder el correo
> del reporte** adjuntando el Excel con «Decisión final» y «Observaciones del
> inspector» completadas. Se carga solo y en unos minutos les llega una
> confirmación. No le cambien el nombre al archivo (pueden agregarle sus
> iniciales al final) y respondan desde su correo del ISP.

## Las revisiones que ya tienes en tu correo

Las revisiones que te mandaron por otra vía, como las de octubre y noviembre,
también entran solas: **reenvíalas desde lgallegos@ispch.cl a
qf.lukasgallegos@gmail.com**. Se cargan si el nombre del archivo trae la
categoría y la fecha, como siempre, y te llega una confirmación por cada correo.

## Mantención

- **Si vence el token:** llega una ALERTA que dice «GitHub rechazó el token (401)».
  Crea uno nuevo (paso 1) y reemplaza el valor de `GITHUB_TOKEN` (paso 3). No hay
  que volver a instalar: los correos que quedaron pendientes se cargan solos.
- **Si cambia un inspector o su correo:** hay que cambiarlo en tres lugares:
  - `CONFIG.inspectores` del script en script.google.com;
  - el mismo bloque en `recepcion.gs` de este repositorio;
  - `INSPECTORES` en `scripts/rotacion.py`.

  `tests/test_recepcion_correo.py` falla si el repositorio y `rotacion.py` no
  coinciden.
- **Para apagarlo:** en el editor, ejecuta `desinstalar`. No borra nada.
- **Para ver qué hizo:** en script.google.com, **Ejecuciones**, en la barra de la
  izquierda; o las etiquetas en Gmail.
- **Este archivo es una copia.** El script que corre es el que está pegado en
  script.google.com, igual que la skill en claude.ai. Si cambias `recepcion.gs`
  aquí, vuelve a pegarlo allá.

## Tests

```bash
python3 -m unittest discover -s tests -v    # incluye los del script, si hay Node
node --test integraciones/recepcion-correo/recepcion.test.js
```

`recepcion.test.js` simula Gmail, GitHub y Apps Script, y recorre cada fila de la
tabla de arriba. `tests/test_recepcion_correo.py` comprueba que el script
reconoce los nombres de archivo igual que `rotacion.py`, con los nombres reales
de `revision/`.
