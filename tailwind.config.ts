import type { Config } from 'tailwindcss'

/**
 * Paleta propia. No se usan los colores por defecto de Tailwind:
 * `colors` reemplaza la escala completa, así que indigo/slate/violet
 * simplemente no existen como clases en este proyecto.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      carbon: '#0E1113',
      panel: '#171B1E',
      panelAlt: '#1E2428',
      linea: '#272E33',
      hueso: '#E9ECE9',
      humo: '#8B9490',
      brasa: '#E2542A',
      cal: '#C9D93B',
      alerta: '#D63B3B',
      podio: '#D9A441',
    },
    fontFamily: {
      display: ['var(--fuente-display)', 'Archivo', 'system-ui', 'sans-serif'],
      dato: ['var(--fuente-dato)', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
    },
    extend: {
      borderRadius: { nada: '0', pieza: '2px', caja: '6px', ficha: '14px' },
      fontSize: {
        marcador: ['3.25rem', { lineHeight: '0.92', letterSpacing: '-0.03em' }],
        cifra: ['1.75rem', { lineHeight: '1', letterSpacing: '-0.02em' }],
      },
      backgroundImage: {
        ruido:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
}

export default config
