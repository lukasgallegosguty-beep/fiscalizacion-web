#!/usr/bin/env bash
# Verifica ANTES de gastar la jornada de búsqueda que el resultado se va a poder
# persistir. Sin esto, un fallo de permisos en el último paso destruye el trabajo
# completo: el contenedor se destruye al terminar la rutina y el commit local se
# pierde con él.
#
# Uso:  bash scripts/preflight.sh
# Sale 0 si el push es viable, 1 si no lo es.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

RAMA="${1:-$(git rev-parse --abbrev-ref HEAD)}"
echo "== Preflight de persistencia =="
echo "Repositorio : $(git config --get remote.origin.url)"
echo "Rama        : ${RAMA}"

echo
echo "-- Lectura del remoto --"
if git ls-remote --heads origin >/dev/null 2>&1; then
  echo "OK: se puede leer el remoto."
else
  echo "FALLO: no se puede ni leer el remoto. Revisa la conexión de GitHub."
  exit 1
fi

echo
echo "-- Escritura en el remoto (push en seco) --"
SALIDA="$(git push --dry-run origin "HEAD:refs/heads/${RAMA}" 2>&1)"
CODIGO=$?

if [ $CODIGO -eq 0 ]; then
  echo "OK: hay permiso de escritura. La rutina puede persistir sus resultados."
  exit 0
fi

echo "$SALIDA" | sed 's/^/    /'
echo
echo "FALLO: no hay permiso de escritura sobre el repositorio."
case "$SALIDA" in
  *403*|*"not accessible"*|*"Write access"*)
    cat <<'MSG'

    Diagnóstico: el clon y la lectura funcionan (token OAuth), pero las
    operaciones de escritura requieren que la Claude GitHub App esté instalada
    sobre este repositorio con permiso "Contents: Read and write".

    Cómo resolverlo:
      1. https://github.com/settings/installations
      2. Entrar en la instalación de Claude -> "Configure"
      3. En "Repository access", agregar este repositorio
         (o elegir "All repositories")
      4. Confirmar que el permiso "Contents" figura como "Read and write"
      5. Si la app no aparece, reconectar GitHub desde
         claude.ai -> Settings -> Connectors

    Hasta que eso esté hecho, la rutina NO debe ejecutar la búsqueda completa:
    el resultado se perdería al destruirse el contenedor.
MSG
    ;;
esac
exit 1
