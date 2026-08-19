# fiscalizacion-web

Repositorio de la rutina de Claude Code con la skill de **fiscalización web de
dispositivos médicos** (ISP / ANDIM, Chile).

La rutina revisa una categoría de DM por día, cruza las ofertas encontradas en
la web contra el listado ISP vigente de esa categoría, y deja el resultado como
un Excel en `resultados/`.

## Estructura

```
.claude/skills/fiscalizacion-dm-web/   Skill (copia versionada, ver nota abajo)
registros-isp/                         Excel oficiales del ISP, uno por categoría
resultados/                            Reportes generados, uno por corrida
scripts/rotacion.py                    Qué categoría toca hoy
scripts/generar_reporte.py             Genera el Excel en el formato estándar
scripts/preflight.sh                   Verifica que se va a poder guardar
estado-rotacion.json                   Última categoría procesada + historial
RUTINA.md                              Prompt de la rutina programada
```

## Uso manual

```bash
bash scripts/preflight.sh                 # ¿se va a poder guardar el resultado?
python3 scripts/rotacion.py               # qué categoría toca hoy
python3 scripts/rotacion.py --estado      # cobertura: qué se revisó y qué falta
python3 scripts/generar_reporte.py --entrada hallazgos.json --auto
python3 scripts/rotacion.py --avanzar --hallazgos 3
```

## Ciclo de categorías

El orden es fijo y está definido en `scripts/rotacion.py`. Son 10 categorías, así
que el ciclo completo se cubre en dos semanas hábiles:

1. Guantes quirúrgicos de látex
2. Guantes de examen médico
3. Preservativos masculinos (látex y sintéticos)
4. Preservativos femeninos
5. Agujas hipodérmicas
6. Jeringas hipodérmicas
7. Jeringas con agujas hipodérmicas
8. Desfibriladores externos automáticos (DEA)
9. Autotest VIH
10. Kits VIH uso profesional

El estado se guarda con un **slug estable** (`kits-vih-profesional`), no con el
nombre del archivo: los Excel del ISP llevan la fecha embebida y cambian de
nombre en cada actualización.

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
