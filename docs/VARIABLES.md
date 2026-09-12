# Variables de entorno: de dónde sale cada una

Ninguna de estas vive en el repositorio. En docker compose van en un archivo
`.env` al lado del `docker-compose.yml`; en Coolify se cargan en el panel de
la aplicación.

Para revisar qué tienes configurado y qué se cae sin eso:

```bash
npm run env:check
```

## Resumen

| Variable | ¿Obligatoria? | Sin ella |
|---|---|---|
| `DATABASE_URL` | sí | No arranca |
| `AUTH_SECRET` | sí | No arranca |
| `SITE_URL` | sí | Links rotos en correos, Discord y el retorno de pago |
| `AUTH_URL` | sí en producción | El login redirige a la URL equivocada |
| `FORTNITE_API_KEY` | en la práctica sí | Nadie puede verificar su nick, o sea nadie se inscribe |
| `PRIZE_ENCRYPTION_KEY` | al entregar premios | Los códigos de V-Bucks no se pueden cargar ni revelar |
| `RUN_BACKGROUND` | sí | No corre la cola: los torneos no cierran solos |
| `FORTNITE_API_IO_KEY` | no | Sin respaldo si el proveedor principal se cae |
| `DISCORD_CLIENT_ID` / `SECRET` | no | No se puede vincular Discord. El login por correo funciona igual |
| `DISCORD_BOT_TOKEN` | no | Sin bot: sin anuncios, sin recordatorios, sin roles |
| `DISCORD_GUILD_ID` | si hay bot | Los comandos tardan hasta 1 hora en aparecer; sin roles automáticos |
| `DISCORD_CANAL_TORNEOS` | si hay bot | Sin anuncios ni resultados publicados |
| `TBK_*` | solo con inscripción pagada | Los torneos gratis funcionan igual |

---

## 1. Secretos que generas tú

### `AUTH_SECRET`

Firma las sesiones. Si cambia, se cierran todas las sesiones abiertas.

```bash
openssl rand -base64 32
```

### `PRIZE_ENCRYPTION_KEY`

Cifra los códigos de V-Bucks en la base. **Tiene que ser exactamente 32
bytes en base64** o el proceso falla al tocar un código.

```bash
openssl rand -base64 32
```

Aviso serio: si pierdes esta clave, **los códigos ya guardados no se pueden
recuperar**. No hay puerta trasera, ese es el punto. Guárdala en un gestor de
contraseñas antes de cargar el primer código.

Nunca las reutilices entre sí ni entre ambientes: una clave de pruebas que
se filtra no puede servir para descifrar producción.

Atajo para generar ambas:

```bash
npm run secretos
```

---

## 2. Base de datos

### `DATABASE_URL`

```
postgresql://USUARIO:CLAVE@HOST:5432/NOMBRE_BASE
```

**Con docker compose** no la escribes: se arma sola desde `POSTGRES_USER`,
`POSTGRES_PASSWORD` y `POSTGRES_DB`. Solo define `POSTGRES_PASSWORD`.

**Con Coolify**: creas el recurso PostgreSQL y el panel te entrega la URL
interna. Usa la interna (`postgres://...@nombre-del-recurso:5432/...`), no la
pública: así la base no queda expuesta a internet.

Si la clave tiene caracteres raros (`@`, `:`, `/`, `#`), hay que
codificarlos en porcentaje o la URL se parte. Lo más simple es generar una
clave sin símbolos: `openssl rand -hex 24`.

---

## 3. URLs públicas

### `SITE_URL` y `AUTH_URL`

Las dos apuntan a la dirección pública del sitio, con `https://` y **sin
barra al final**:

```
SITE_URL=https://clutch.cl
AUTH_URL=https://clutch.cl
```

`SITE_URL` arma los links que salen a Discord y la vuelta desde Webpay.
`AUTH_URL` la usa Auth.js para saber a dónde volver después del login.

En local, las dos son `http://localhost:3000`.

### Pruebas por HTTP con sslip.io

Mientras no haya dominio ni certificado, `sslip.io` resuelve cualquier IP:
`http://190-0-0-1.sslip.io` apunta a `190.0.0.1` sin configurar DNS.

Pon **las dos** variables con `http://`, el mismo host y el mismo puerto:

```
SITE_URL=http://190-0-0-1.sslip.io:3000
AUTH_URL=http://190-0-0-1.sslip.io:3000
```

Reemplaza los números por la IP de tu servidor, con guiones en vez de
puntos. Si publicas en el puerto 80, el `:3000` se omite en las dos.

**El error que te va a costar la tarde:** Auth.js decide si las cookies de
sesión llevan la marca `Secure` mirando el protocolo de `AUTH_URL`. Si ahí
dice `https://` pero el sitio se sirve por HTTP, las cookies salen como
`__Host-` y `__Secure-`, el navegador se niega a devolverlas por HTTP, y el
login falla con `MissingCSRF` **sin dejar ninguna pista** de por qué: la
pantalla simplemente vuelve al formulario. `npm run env:check` detecta esa
mezcla y te la nombra.

Lo que sí funciona por HTTP: el registro, el login por correo, los torneos,
el ranking, la verificación de nicks y el panel. O sea, todo lo que
necesitas para probar.

Lo que no:

- **Login con Discord.** Discord solo acepta redirecciones `https`, con la
  única excepción de `http://localhost`. Un dominio de pruebas por HTTP no
  le sirve. El bot de Discord sí funciona, porque no usa redirecciones.
- **Webpay.** Transbank exige https para el retorno.

Mientras corras por HTTP, el sitio no manda la cabecera HSTS: anunciarla sin
certificado no protege nada, y en un dominio comodín como sslip.io podría
dejarte el navegador forzando HTTPS contra un servidor que no lo tiene.
Cuando pongas el certificado, la cabecera aparece sola.

### Cuando pases a dominio y HTTPS

Cambia las dos variables a `https://clutch.cl`, y recuerda actualizar la URL
de callback en el portal de Discord. Nada más: el resto se ajusta solo.

---

## 4. Fortnite

### `FORTNITE_API_KEY` (fortnite-api.com)

Es la que sostiene la verificación de nicks. Sin ella nadie confirma su
cuenta de Fortnite y, por lo tanto, **nadie puede inscribirse a un torneo**.

1. Entra a **https://dash.fortnite-api.com**
2. Inicia sesión con Discord
3. La key aparece en el panel. Es gratis

### `FORTNITE_API_IO_KEY` (fortniteapi.io)

**Es otro servicio, con otra cuenta.** Solo sirve de respaldo si
fortnite-api.com se cae. Puedes dejarla vacía: el sistema ni la intenta.

Si la quieres: te registras en **https://fortniteapi.io**, y la key sale en
tu panel. El plan gratis tiene cuota diaria.

Ninguna de las dos es oficial de Epic. Por eso el sistema tiene caché,
corta-circuito y degradación a reporte manual: si se caen, los torneos
siguen corriendo.

---

## 5. Discord

Todo esto es **opcional**. El login es por correo y contraseña. Discord
agrega el bot de la comunidad y la vinculación de cuenta.

### Crear la aplicación

1. Entra a **https://discord.com/developers/applications**
2. **New Application**, ponle un nombre, acepta los términos
3. Menú **OAuth2**:
   - **Client ID** → `DISCORD_CLIENT_ID`
   - **Reset Secret** → copia el valor → `DISCORD_CLIENT_SECRET`
     (solo se muestra una vez)
   - En **Redirects**, agrega exactamente:
     ```
     https://clutch.cl/api/auth/callback/discord
     ```
     Y si vas a probar en local, agrega también:
     ```
     http://localhost:3000/api/auth/callback/discord
     ```
     Si esta URL no calza carácter por carácter, Discord rechaza el login
     con `invalid_redirect_uri`.

### El bot

4. Menú **Bot**:
   - **Reset Token** → `DISCORD_BOT_TOKEN` (también se muestra una sola vez)
   - **Privileged Gateway Intents**: activa **Server Members Intent**.

   Esto último no es opcional: el bot pide ese permiso para asignar roles
   por ranking. Si no lo activas, **el bot no conecta** y verás un error de
   *disallowed intents* en los logs. Es el error número uno al montar esto.

5. Menú **OAuth2 → URL Generator**:
   - Scopes: `bot` y `applications.commands`
   - Bot Permissions: `Send Messages`, `Embed Links`, `Manage Roles`
   - Copia la URL que aparece abajo, ábrela y elige tu servidor

### Los IDs del servidor y del canal

6. En la aplicación de Discord: **Ajustes de usuario → Avanzado → Modo
   desarrollador**, actívalo
7. Clic derecho sobre el nombre del servidor → **Copiar ID del servidor** →
   `DISCORD_GUILD_ID`
8. Clic derecho sobre el canal de anuncios → **Copiar ID del canal** →
   `DISCORD_CANAL_TORNEOS`

`DISCORD_GUILD_ID` además hace que los comandos (`/rank`, `/proximo`)
aparezcan al instante. Sin él, Discord los propaga globalmente y pueden
tardar hasta una hora.

### Roles por ranking

El bot busca roles con estos nombres **exactos**:

```
Top 10 Clutch
Top 50 Clutch
```

Créalos en tu servidor, y en **Ajustes del servidor → Roles** arrastra el
rol del bot **por encima** de esos dos. Discord no deja que un bot asigne
roles que estén más arriba que el suyo. Si no existen, esa parte
simplemente no hace nada: no rompe nada más.

---

## 5.5 Despliegue en Coolify con Docker Compose

Coolify pone Traefik delante y llega al contenedor **por la red interna de
Docker**. Por eso el servicio `app` no publica puertos: usa `expose`.

Si ves este error en el despliegue:

```
Bind for 0.0.0.0:3000 failed: port is already allocated
```

es que el compose está publicando un puerto del host que ya está ocupado.
Con `expose` eso no puede pasar, porque no se toca ningún puerto del host.

Pasos en el panel:

1. Crea el recurso con el buildpack **Docker Compose**, apuntando al
   repositorio y a la rama.
2. Carga las variables de entorno del panel: al menos `POSTGRES_PASSWORD`,
   `AUTH_SECRET`, `PRIZE_ENCRYPTION_KEY`, `FORTNITE_API_KEY`, `SITE_URL` y
   `AUTH_URL`.
3. Asigna el dominio al servicio **app**, en el puerto **3000**. Si todavía
   no tienes dominio, Coolify puede generarte uno con sslip.io.
4. `SITE_URL` y `AUTH_URL` tienen que coincidir **exactamente** con ese
   dominio, protocolo incluido.

Las migraciones no necesitan comando de pre-deploy: el contenedor las
aplica solo al arrancar, y si fallan no levanta, que es lo correcto.

### El dominio responde 404

Antes que nada, en el servidor:

```bash
bash scripts/diagnostico-coolify.sh tu-dominio.sslip.io
```

Revisa en orden los cuatro puntos donde se corta la cadena: si el contenedor
corre, si la aplicación responde por dentro, si tiene etiquetas de Traefik y
si está en la red del proxy. Dice cuál falla en vez de dejarte adivinar.

#### Lo de siempre

Un 404 al entrar al dominio **no viene de la aplicación**: viene de Traefik,
que no tiene ninguna ruta para ese nombre. Los logs del contenedor se ven
perfectos justamente porque la petición nunca le llegó.

Revisa, en este orden:

1. Que el dominio esté asignado al servicio **app**, no al servicio `db` ni
   al recurso completo.
2. Que el puerto sea **3000**. En Coolify el campo del dominio acepta el
   puerto: `http://tu-dominio.sslip.io:3000`.
3. Que el despliegue haya terminado bien y el contenedor esté corriendo.

El compose declara `SERVICE_FQDN_APP_3000` justamente para que Coolify sepa
a qué puerto enrutar y genere las etiquetas de Traefik solo.

Ojo con el detalle del banner de arranque: Next imprime

```
- Local:   http://9959687655b2:3000
```

Ese `9959687655b2` es el identificador del contenedor, no tu dominio. Next
escucha en `0.0.0.0` y no sabe nada de `SITE_URL`; el dominio lo resuelve el
proxy. Que ahí no aparezca tu dominio es lo normal, no es el problema.

### El despliegue falla con "Invalid template"

```
failed to read /artifacts/build-time.env: Invalid template: "${SITE_URL:-"
```

Ese error **no viene del repositorio**: viene de una variable guardada en el
panel cuyo valor quedó a medias. Coolify registra como variables propias las
que detecta en el compose, y una vez guardadas **ningún cambio en el
repositorio las corrige**.

Se arregla en el panel, en Environment Variables: borra la variable que
aparece con un valor tipo `${ALGO:-` y vuelve a desplegar. Si la necesitas,
déjala con el valor real, nunca con una referencia a otra variable.

Comprobado: con esa variable corrupta el despliegue falla aunque el compose
ya no la mencione, porque Docker Compose falla al leer el archivo completo.
Borrarla, o dejarla vacía, basta para que parsee.

### Los formularios fallan con un error genérico

Si el sitio carga pero entrar, registrarse o inscribirse tira un error sin
explicación, y en los logs del contenedor aparece:

```
`x-forwarded-host` header ... does not match `origin` header ...
Invalid Server Actions request.
```

es la protección contra CSRF de Next: compara el origen del navegador contra
el encabezado que reenvía el proxy, y si no calzan aborta el envío.

El compose lo resuelve pasando `SITE_URL` como argumento de construcción.
Con una diferencia importante: **Next graba esa lista dentro de la imagen**,
así que si cambias de dominio hay que **reconstruir**, no solo reiniciar. En
Coolify, eso es volver a desplegar y no simplemente actualizar la variable.

### En un VPS sin panel ni proxy

Ahí sí hace falta publicar el puerto, y va en un archivo aparte:

```bash
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build
```

Si el 3000 está ocupado, define `PUERTO=3001` en el `.env` y ajusta
`SITE_URL` y `AUTH_URL` al mismo puerto.

---

## 6. Transbank (Webpay Plus)

Solo hace falta si vas a cobrar inscripción. Los torneos gratis no lo tocan.

### Para probar

Transbank publica credenciales de integración abiertas en su documentación
(**https://transbankdevelopers.cl**). Con `TBK_AMBIENTE=integracion`,
`TBK_COMMERCE_CODE` y `TBK_API_KEY` toman los valores de prueba que aparecen
ahí. No mueven plata real.

### Para producción

Necesitas ser comercio afiliado a Transbank. Ahí te entregan tu código de
comercio y tu API key reales, y pones `TBK_AMBIENTE=produccion`.

Antes de cobrarle a alguien de verdad: revisa con tu contador la boleta
electrónica. El sistema deja el gancho listo pero no emite documento
tributario.

---

## 7. Operación

### `RUN_BACKGROUND`

```
RUN_BACKGROUND=true
```

Enciende la cola de trabajos y el bot **dentro del mismo proceso web**. Sin
esto los torneos no cierran solos, el ranking no se calcula y no salen los
recordatorios de check-in.

La regla que no puedes romper: **solo una instancia puede tenerla en
`true`**. Si algún día corres dos réplicas con ambas en `true`, el bot se
conecta dos veces y duplica cada mensaje, y los trabajos que no son de la
cola se procesan dos veces.

### Solo para docker compose

| Variable | Para qué |
|---|---|
| `POSTGRES_USER` | Usuario de la base (por defecto `clutch`) |
| `POSTGRES_PASSWORD` | **Obligatoria.** Compose no levanta sin ella |
| `POSTGRES_DB` | Nombre de la base (por defecto `clutch`) |
| `PUERTO` | Puerto donde escucha el sitio (por defecto `3000`) |

---

## Lo mínimo para arrancar

Con esto ya tienes un sitio funcionando con torneos gratis:

```bash
POSTGRES_PASSWORD=$(openssl rand -hex 24)
AUTH_SECRET=$(openssl rand -base64 32)
PRIZE_ENCRYPTION_KEY=$(openssl rand -base64 32)
FORTNITE_API_KEY=la-que-sacaste-de-dash.fortnite-api.com
SITE_URL=https://clutch.cl
AUTH_URL=https://clutch.cl
RUN_BACKGROUND=true
```

Discord y Transbank los agregas después sin tocar nada más: el sistema se
da cuenta solo de que aparecieron.
