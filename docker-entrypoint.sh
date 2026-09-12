#!/bin/sh
# Aplica las migraciones pendientes y levanta el servidor. Con Coolify esto
# va como comando de pre-deploy; con docker compose no hay dónde ponerlo,
# así que vive acá.
set -e

echo "[arranque] aplicando migraciones"
./node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma

echo "[arranque] levantando Clutch"
exec node server.js
