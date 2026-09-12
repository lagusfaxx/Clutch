FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
# Los orígenes permitidos para Server Actions quedan grabados en el build
# (Next los serializa en required-server-files.json), así que tienen que
# llegar como argumento de construcción y no como variable de ejecución.
# Cambiar de dominio obliga a reconstruir la imagen.
ARG ALLOWED_ORIGINS=""
ENV ALLOWED_ORIGINS=$ALLOWED_ORIGINS
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# El CLI de Prisma solo, con su cierre de dependencias resuelto por npm.
#
# Copiar a mano los paquetes de Prisma al contenedor final no funciona: el CLI
# arrastra effect, fast-check, empathic y varios más, y esa lista cambia en
# cada versión. Que la calcule npm y no nosotros.
#
# Se instala solo el CLI y no todas las dependencias de producción: lo primero
# son 133 MB, lo segundo 742 MB, y acá no hace falta nada más.
#
# Sin --ignore-scripts a propósito: ese postinstall es el que descarga los
# motores de Prisma. Si no corre acá, el CLI intenta descargarlos al arrancar
# el contenedor, como usuario sin privilegios y sobre una carpeta de solo
# lectura, y falla con "Can't write to /app/cli/node_modules/@prisma/engines".
#
# Esta etapa tiene que usar la MISMA imagen base que la etapa final: los
# motores son binarios nativos y los de glibc no sirven en musl.
FROM node:22-alpine AS cli
WORKDIR /cli
COPY package.json ./
RUN VERSION=$(node -p "require('./package.json').dependencies.prisma") \
  && rm package.json \
  && npm install --no-save --omit=dev "prisma@$VERSION" \
  && npm cache clean --force

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Los motores de Prisma necesitan openssl; la imagen alpine no lo trae.
RUN apk add --no-cache openssl \
  && addgroup -g 1001 nodejs \
  && adduser -S -u 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Queda en ./cli/node_modules y no en ./node_modules a propósito: así Node
# resuelve las dependencias del CLI desde esa carpeta y no se mezclan con las
# que Next dejó trazadas para la aplicación.
COPY --from=cli /cli/node_modules ./cli/node_modules
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
USER nextjs
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
