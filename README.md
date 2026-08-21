# fiscalizacion-web

Repositorio de la rutina de Claude Code con la skill de **fiscalización web de
dispositivos médicos** (ISP / ANDIM, Chile).

Dos rutinas revisan **dos categorías por día hábil** (un bloque cada una), cruzan
las ofertas encontradas en la web contra el listado ISP vigente, dejan el Excel en
`resultados/` y lo envían por correo al inspector de turno. Los inspectores
devuelven los archivos revisados a `revision/`, y ese feedback entra en la corrida
siguiente.

## Estructura

```
.claude/skills/fiscalizacion-dm-web/   Skill (copia versionada, ver nota abajo)
registros-isp/                         Excel oficiales del ISP, uno por categoría
resultados/                            Reportes generados, uno por corrida
revision/                              Excel ya revisados por los inspectores
scripts/rotacion.py                    Qué categorías tocan hoy (calendario)
scripts/feedback.py                    Lee revision/ y alimenta la búsqueda
scripts/generar_reporte.py             Genera el Excel en el formato estándar
scripts/preflight.sh                   Verifica que se va a poder guardar
estado-rotacion.json                   Última categoría procesada + historial
RUTINA.md                              Prompt de la rutina programada
```

## Uso manual

```bash
bash scripts/preflight.sh main               # ¿se va a poder guardar el resultado?
python3 scripts/rotacion.py --slot 1         # categoría del bloque 1 de hoy
python3 scripts/rotacion.py --semana         # plan completo de la semana
python3 scripts/rotacion.py --estado         # cobertura y cuántos van revisados
python3 scripts/feedback.py --categoria <slug>   # qué dejaron los inspectores
python3 scripts/generar_reporte.py --entrada hallazgos.json --auto --slot 1
python3 scripts/rotacion.py --slot 1 --avanzar --hallazgos 21
```

## Calendario

Dos categorías por día hábil, en bloques independientes. Es un calendario fijo,
no una rotación: si una corrida falla, el mismo día de la semana siguiente vuelve
a tocar esa categoría.

| Día | Bloque 1 | Bloque 2 |
|---|---|---|
| Lunes | Agujas hipodérmicas | Autotest VIH |
| Martes | Desfibriladores (DEA) | Guantes de examinación |
| Miércoles | Guantes quirúrgicos | Jeringas con agujas |
| Jueves | Jeringas hipodérmicas | Kits VIH uso profesional |
| Viernes | Preservativos masculinos | Preservativos femeninos |

Horario: **lunes a viernes 07:30 hora de Chile**, desde el 24-08-2026.

## Inspectores

La revisión es semanal y rota cada tres semanas, indefinidamente, desde el lunes
24-08-2026:

| Semana | Inspector | Correo |
|---|---|---|
| 1 | Emilio Millán | emillan@ispch.cl |
| 2 | Lukas Gallegos | lgallegos@ispch.cl |
| 3 | María Inés Medina | mmedina@ispch.cl |

Cada Excel se envía por Gmail al inspector de turno apenas termina la búsqueda.
El inspector completa **"Decisión final"** y **"Observaciones del inspector"** y
sube el archivo a `revision/`. Ver `revision/README.md`.

## Objetivo de volumen

Cada corrida apunta a **20 hallazgos**, con una mezcla esperada de 60% no
registrado y 40% registrado. Es un objetivo de **esfuerzo de búsqueda**, no una
cuota: si al agotar la búsqueda hay menos, se reporta el número real. La
clasificación sale del cruce con el listado ISP y nunca se fuerza para calzar la
proporción.

## Actualizar los listados ISP

Descargar el Excel nuevo desde el sitio del ISP y dejarlo en `registros-isp/`.
El nombre puede traer una fecha distinta: `scripts/rotacion.py` empareja por
patrón, no por nombre exacto, y si hay varias versiones toma la más reciente.
Conviene borrar la antigua igual, para que no se acumulen.

- [DM con registro sanitario](https://www.ispch.cl/andim/listado-de-dispositivos-medicos-establecimientos-y-empresas/dispositivos-medicos-con-registro-sanitario/)
- [DM in vitro con registro sanitario](https://www.ispch.cl/andim/listado-de-dispositivos-medicos-establecimientos-y-empresas/dispositivos-medicos-in-vitro-con-registro-sanitario/)

## Nota sobre la skill

La copia en `.claude/skills/fiscalizacion-dm-web/` está versionada acá para
poder revisar los cambios, pero **no es la que ejecuta la rutina**. La rutina usa
la skill sincronizada desde claude.ai. Al editar `SKILL.md` en este repositorio
hay que subir el archivo también a la skill en claude.ai, o los cambios no tienen
ningún efecto sobre las corridas.

## Requisitos de acceso

La rutina necesita permiso de **escritura** en este repositorio. Leer y clonar
funciona con el token OAuth de la cuenta, pero `git push` requiere que la Claude
GitHub App esté instalada sobre el repositorio con `Contents: Read and write`
(https://github.com/settings/installations). `scripts/preflight.sh` verifica esto
antes de que la rutina gaste la jornada de búsqueda.
