FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
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
# son 97 MB, lo segundo 742 MB, y acá no hace falta nada más.
FROM node:22-alpine AS cli
WORKDIR /cli
COPY package.json ./
RUN VERSION=$(node -p "require('./package.json').dependencies.prisma") \
  && rm package.json \
  && npm install --no-save --omit=dev --ignore-scripts "prisma@$VERSION" \
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
