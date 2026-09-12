# Clutch.cl

Plataforma de torneos y ranking persistente de Fortnite competitivo en Chile.
API-first: la web y la app móvil futura consumen los mismos servicios.

## Cómo está armado

Un solo servicio de Next.js 15 (App Router) sobre PostgreSQL. En el mismo
proceso Node corren las páginas, la API `/api/v1`, el worker de colas
(pg-boss) y el bot de Discord, arrancados desde `src/instrumentation.ts`
cuando `RUN_BACKGROUND=true`. Sin Redis, sin backend separado, sin docker-compose.

```
src/server/services/*     lógica de negocio pura, no importa nada de Next
src/app/api/v1/*          REST versionado para la app móvil
src/app/**/actions.ts     Server Actions, cáscaras finas sobre los servicios
src/server/jobs/*         cola pg-boss sobre el mismo Postgres
src/server/discord/*      bot y anuncios
src/instrumentation.ts    arranque del worker y del bot
```

Regla no negociable: si hay lógica de negocio dentro de un componente o de
una Server Action, está mal. Esa separación es lo que permite mover el
worker a un segundo servicio el día que el CPU se note, sin reescribir nada.

## Cuentas y verificación

El login es **correo y contraseña**. Las contraseñas se guardan con scrypt
del propio Node, sin dependencias nativas que compilar.

Epic Account Services está fuera por ahora, así que la cuenta de Fortnite se
comprueba resolviendo el nick contra fortnite-api.com y guardando el
`accountId` que devuelve, con constraint único. Conviene tener claro qué
garantiza eso y qué no: asegura que **una cuenta de Fortnite valga por una
sola cuenta de Clutch**, que es lo que corta el grueso del smurfing, pero no
prueba que quien se registra sea el dueño de esa cuenta. Solo el OAuth de
Epic puede afirmar eso, y el código para volver a enchufarlo sigue en
`vincularEpic()` esperando el método `OAUTH`.

Sin nick confirmado se puede mirar todo el sitio, pero no inscribirse a
ningún torneo.

Discord queda como vínculo opcional para el bot: anuncios, recordatorios de
check-in por mensaje directo y roles por tramo de ranking.

## Levantarlo con docker compose

La forma más corta de tenerlo andando en un VPS:

```bash
cp .env.example .env    # completa AUTH_SECRET, POSTGRES_PASSWORD, FORTNITE_API_KEY
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build
```

Levanta la aplicación y PostgreSQL, aplica las migraciones sola y deja el
sitio en el puerto 3000. La base no publica puertos: solo se ve desde la red
interna de compose.

El segundo archivo es el que publica el puerto en el host, y existe aparte
porque **detrás de un proxy no se usa**. Con Coolify basta
`docker-compose.yml`: Traefik alcanza el contenedor por la red interna, y
publicar el puerto solo consigue chocar con lo que ya escuche en el host
(`port is already allocated`). Ver
[docs/VARIABLES.md](docs/VARIABLES.md) para el paso a paso del panel.

Para generar los secretos de una vez:

```bash
npm run secretos        # imprime AUTH_SECRET, PRIZE_ENCRYPTION_KEY y POSTGRES_PASSWORD
npm run env:check       # dice qué falta y qué se degrada sin cada variable
```

**De dónde sale cada variable, paso a paso: [docs/VARIABLES.md](docs/VARIABLES.md).**

Con compose los respaldos son tuyos. `./respaldos` está montado dentro del
contenedor de la base para que `pg_dump` escriba ahí, pero tienes que
programarlo y **subirlo a otra parte**: un respaldo en el mismo servidor que
la base no es un respaldo. Si prefieres no hacerte cargo de eso, usa Coolify
con su PostgreSQL gestionado, que trae respaldos programados.

### Probar sin dominio ni certificado

`sslip.io` resuelve cualquier IP sin tocar DNS. Pon las dos URLs con `http://`
y el mismo host:

```
SITE_URL=http://190-0-0-1.sslip.io:3000
AUTH_URL=http://190-0-0-1.sslip.io:3000
```

Si `AUTH_URL` queda en `https` mientras sirves por HTTP, las cookies salen
marcadas `Secure`, el navegador no las devuelve y el login falla con
`MissingCSRF` sin explicación. `npm run env:check` detecta esa mezcla.

El login con Discord y Webpay no funcionan por HTTP; todo lo demás sí. El
detalle está en [docs/VARIABLES.md](docs/VARIABLES.md).

## Levantarlo local sin Docker

```bash
cp .env.example .env          # completa DATABASE_URL y AUTH_SECRET
npm install
npx prisma migrate deploy     # incluye la extensión pg_trgm
npm run db:seed               # temporada y torneo de ejemplo
npm run dev
```

Comandos útiles:

```bash
npm run typecheck        # TypeScript estricto, con noUncheckedIndexedAccess
npm test                 # lógica pura: Glicko-2, puntaje, RUT, cifrado, CS2
npm run check:ai-smell   # controles de §7 antes de desplegar
npm run test:humo        # flujo completo de un torneo contra una base real
npm run env:check        # revisa la configuración y explica qué se cae sin cada variable
```

`test:humo` necesita una base con las migraciones aplicadas y escribe datos
de prueba, así que no se corre contra producción.

## Deploy en Coolify

Dos recursos: la aplicación (build por Dockerfile) y un PostgreSQL
gestionado, con backup programado a almacenamiento externo desde el día uno.
Un backup en el mismo VPS no es un backup. El `docker-compose.yml` no se usa
en este camino.

```
Dominio:       clutch.cl (TLS por Traefik). api.clutch.cl apunta al mismo contenedor.
Pre-deploy:    npx prisma migrate deploy
Health check:  /api/health   (verifica la conexión a Postgres, no solo el proceso)
Puerto:        3000
```

Variables de entorno: ver [docs/VARIABLES.md](docs/VARIABLES.md) para saber de
dónde sale cada una, y `.env.example` como plantilla. Ninguna vive en el
repositorio.

`RUN_BACKGROUND=true` solo puede estar en **una** réplica. Con dos, el bot de
Discord se conecta dos veces y duplica cada mensaje: pg-boss maneja el
locking de los jobs, el bot no.

## Integración con Fortnite

Las stats vienen de APIs no oficiales: `fortnite-api.com` como primario
(`FORTNITE_API_KEY`) y `fortniteapi.io` como fallback. Son dos servicios
distintos con cuentas distintas: `FORTNITE_API_IO_KEY` puede quedar vacía y
el sistema ni intenta el fallback. Cliente propio con Zod
en cada respuesta, caché de 15 minutos, circuit breaker de 5 fallos por 10
minutos y timeout de 5 segundos. Si los dos caen, la UI avisa que la
verificación automática no está disponible y el torneo sigue con reporte
manual.

Estas APIs entregan stats acumuladas de cuenta, no el resultado de una
partida identificable. Por eso la verificación es por delta de snapshots
pre/post ventana del torneo: sirve para pillar fraude grosero (reportó 8
kills y su contador subió 2), alimenta un `confidenceScore` y bajo el umbral
manda el caso a revisión humana. El delta nunca decide solo.

Nunca se pide usuario ni contraseña de Epic, solo OAuth.

## Legal

Clutch no está asociada, patrocinada ni avalada por Epic Games. No se usan
logos ni assets de Epic o Fortnite. Los premios son V-Bucks y periféricos,
nunca dinero en efectivo ni transferencias.

Antes de escalar la entrega de premios, revisar con un contador el
tratamiento tributario de premios a personas naturales en Chile (aplica
igual aunque sean en especie) y las Fortnite Events Guidelines de Epic para
torneos organizados por terceros.
