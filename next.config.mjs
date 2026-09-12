/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://cdn.discordapp.com",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://webpay3g.transbank.cl https://webpay3gint.transbank.cl",
    ].join('; '),
  },
]

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  serverExternalPackages: ['discord.js', 'pg-boss', '@prisma/client'],
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // HSTS solo cuando la petición llegó de verdad por HTTPS.
        //
        // No va junto a las demás porque las cabeceras se resuelven al
        // construir la imagen, cuando todavía no se sabe con qué dominio ni
        // con qué protocolo va a correr. Anunciar HSTS sirviendo por HTTP no
        // protege nada (el navegador ignora la cabecera si no llegó por
        // HTTPS) y en un dominio de pruebas con comodín, tipo sslip.io,
        // puede dejar el navegador del equipo forzando HTTPS contra un
        // servidor que no lo tiene.
        source: '/:path*',
        has: [{ type: 'header', key: 'x-forwarded-proto', value: 'https' }],
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ]
  },
}

export default nextConfig
