#!/usr/bin/env bash
# Busca reportes que quedaron varados en ramas sueltas y nunca llegaron a main.
#
# Una corrida puede terminar sin error y con `git status` limpio y aun así haber
# empujado a la rama de su sesión en vez de a main: el entorno remoto redirige el
# push y devuelve éxito. Cuando eso pasa el Excel existe, está bien hecho, y
# nadie lo ve. Ya ocurrió con Desfibriladores (25-08), Jeringas con agujas
# (26-08) y Jeringas hipodérmicas (03-09).
#
# Correrlo antes del cierre mensual. Si imprime algo, hay que rescatarlo:
#   git show <rama>:<ruta> > <ruta> && git add <ruta> && git commit && git push
#
# Uso: bash scripts/ramas_varadas.sh

set -euo pipefail
cd "$(dirname "$0")/.."

echo "Trayendo todas las ramas remotas…"
git fetch origin --prune -q   # sin --prune quedan refs muertas; sin 'origin' a
                              # secas solo se ve main y el varado no aparece

en_main="$(git ls-tree -r --name-only origin/main resultados/)"
varados=0

for rama in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/ | grep -v '^origin/main$'); do
    for archivo in $(git ls-tree -r --name-only "$rama" resultados/ 2>/dev/null); do
        if ! grep -qxF "$archivo" <<<"$en_main"; then
            fecha="$(git log -1 --date=format:'%Y-%m-%d %H:%M' --format='%ad' "$rama")"
            echo "VARADO  $archivo"
            echo "        rama: $rama  ($fecha)"
            varados=$((varados + 1))
        fi
    done
done

echo
if [ "$varados" -eq 0 ]; then
    echo "Sin reportes varados: todo lo que se generó está en main."
else
    echo "$varados reporte(s) fuera de main. Rescatarlos antes del consolidado."
    exit 1
fi
