#!/usr/bin/env bash
# Antes de cada deploy (§7). Si la escena huele a plantilla generada,
# se pierde credibilidad justo con el público que más lo detecta.
set -uo pipefail

cd "$(dirname "$0")/.."
fallos=0

# docs/ queda fuera: ahí se documentan justamente las restricciones, y
# nombrar un color prohibido para prohibirlo no es usarlo.
buscar() {
  local patron="$1" mensaje="$2"
  if grep -rniE --exclude-dir={node_modules,.next,.git,docs} --exclude="check-ai-smell.sh" "$patron" . > /dev/null 2>&1; then
    echo "FALLA: $mensaje"
    grep -rniE --exclude-dir={node_modules,.next,.git,docs} --exclude="check-ai-smell.sh" "$patron" . | head -5
    fallos=$((fallos + 1))
  fi
}

buscar "generated with|lovable|bolt\.new|v0\.dev|cursor\.sh|made with ai" "atribución de generador en el código"
buscar "meta name=\"generator\"" "meta generator en el HTML"
buscar "indigo-[0-9]|violet-[0-9]|slate-[0-9]|purple-[0-9]" "paleta por defecto de Tailwind (índigo/violeta/slate)"
buscar "#0B0B0B|#0b0b0b|#111111|#111\b" "negro falso"
buscar "from-indigo|to-violet|via-purple" "gradiente índigo a violeta"
buscar "tracking-widest uppercase" "eyebrow label en mayúsculas espaciadas"
buscar "animate-fade-in-up|data-aos|scroll-reveal" "animaciones de entrada al scroll"

# Em dash en prosa. El glifo suelto como "sin dato" en una tabla es
# convención de marcador deportivo y no se marca: lo que se persigue es el
# em dash espolvoreado entre palabras, que es el tic del texto generado.
if grep -rnE --include="*.tsx" --exclude-dir={node_modules,.next} "[[:alnum:]] — |— [[:alnum:]]|[[:alnum:]]—[[:alnum:]]" src > /dev/null 2>&1; then
  echo "FALLA: em dash en el copy de la interfaz"
  grep -rnE --include="*.tsx" "[[:alnum:]] — |— [[:alnum:]]|[[:alnum:]]—[[:alnum:]]" src | head -5
  fallos=$((fallos + 1))
fi

if [ "$fallos" -gt 0 ]; then
  echo ""
  echo "$fallos control(es) fallaron. Revisa §7 antes de desplegar."
  exit 1
fi

echo "Sin rastros de plantilla generada."
