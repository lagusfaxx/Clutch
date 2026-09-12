#!/usr/bin/env bash
# Diagnóstico de enrutamiento en el servidor de Coolify.
#
# Un 404 "page not found" lo responde Traefik, no la aplicación: significa
# que no encontró ninguna ruta para ese dominio. Esto revisa, en orden, los
# cuatro puntos donde se puede cortar la cadena.
#
# Uso, dentro del servidor:
#   bash diagnostico-coolify.sh tu-dominio.sslip.io
set -uo pipefail

DOMINIO="${1:-}"
if [ -z "$DOMINIO" ]; then
  echo "Uso: bash diagnostico-coolify.sh tu-dominio.sslip.io"
  exit 1
fi

titulo() { printf '\n=== %s ===\n' "$1"; }

titulo "1. Contenedores de la aplicación"
if ! docker ps > /dev/null 2>&1; then
  echo "No se puede hablar con Docker. ¿Estás dentro del servidor y con permisos?"
  exit 1
fi
docker ps -a --filter "name=app-" --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'

CONTENEDOR=$(docker ps --filter "name=app-" --format '{{.Names}}' | head -1)
if [ -z "$CONTENEDOR" ]; then
  echo
  echo "PROBLEMA: no hay ningún contenedor de la aplicación corriendo."
  echo "El 404 es consecuencia de eso: Traefik no tiene a quién enrutar."
  echo
  echo "Motivo por el que se detuvo, si quedó registro:"
  docker ps -a --filter "name=app-" --format '{{.Names}}\t{{.Status}}' | head -3
  ULTIMO=$(docker ps -a --filter "name=app-" --format '{{.Names}}' | head -1)
  [ -n "$ULTIMO" ] && docker logs "$ULTIMO" --tail 25 2>&1 | tail -25
  exit 0
fi
echo "Contenedor en uso: $CONTENEDOR"

titulo "2. ¿La aplicación responde por dentro?"
docker exec "$CONTENEDOR" node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(t=>console.log('respuesta:',t)).catch(e=>console.log('sin respuesta:',e.message))" 2>/dev/null \
  || echo "no se pudo consultar dentro del contenedor"

titulo "3. Etiquetas de Traefik"
ETIQUETAS=$(docker inspect "$CONTENEDOR" --format '{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}
{{end}}' | grep -i traefik)
if [ -z "$ETIQUETAS" ]; then
  echo "PROBLEMA: el contenedor no tiene NINGUNA etiqueta de Traefik."
  echo "Por eso el proxy no lo conoce y responde 404."
  echo
  echo "Se arregla en el panel: asigna el dominio al servicio 'app'"
  echo "y con el puerto 3000, por ejemplo:  http://$DOMINIO:3000"
else
  echo "$ETIQUETAS"
  if echo "$ETIQUETAS" | grep -q "$DOMINIO"; then
    echo
    echo "El dominio $DOMINIO aparece en las reglas. Bien."
  else
    echo
    echo "PROBLEMA: hay etiquetas, pero ninguna menciona $DOMINIO."
    echo "El dominio configurado en el panel no es el que estás visitando."
  fi
fi

titulo "4. ¿Está en la red del proxy?"
REDES=$(docker inspect "$CONTENEDOR" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')
echo "Redes: $REDES"
if echo "$REDES" | grep -q "coolify"; then
  echo "Está en la red coolify. Bien."
else
  echo "PROBLEMA: no está en la red 'coolify', así que Traefik no puede alcanzarlo"
  echo "aunque tenga las etiquetas correctas."
fi

titulo "5. Últimas líneas del contenedor"
docker logs "$CONTENEDOR" --tail 20 2>&1 | tail -20

titulo "6. Respuesta del proxy"
curl -s -o /dev/null -w 'http://%{url_effective} -> %{http_code}\n' "http://$DOMINIO/api/health" 2>/dev/null \
  || echo "no se pudo consultar el dominio desde el servidor"

printf '\nListo. Copia todo esto y mándalo.\n'
