#!/bin/sh
# Aplica las migraciones pendientes y levanta el servidor.
#
# prisma migrate deploy es idempotente: si no hay nada que aplicar, no hace
# nada. Y si falla, el contenedor no arranca, que es lo correcto: es mejor
# no levantar a levantar contra un esquema que no corresponde.
set -e

echo "[arranque] aplicando migraciones"
node ./cli/node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma

echo "[arranque] levantando Clutch"
exec node server.js
