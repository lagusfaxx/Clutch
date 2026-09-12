# Plan de diseño

## Tokens de color

| Token | Hex | Rol |
|---|---|---|
| `carbon` | `#0E1113` | Fondo base. Carbón con tinte frío y una capa de ruido SVG al 3.5%. No es `#111` ni `#0B0B0B`. |
| `panel` | `#171B1E` | Superficie de bloques y tablas. |
| `linea` | `#272E33` | Bordes y separadores. La retícula es lo que da la lectura de marcador. |
| `hueso` | `#E9ECE9` | Texto principal. Blanco roto, no blanco puro. |
| `humo` | `#8B9490` | Texto secundario, encabezados de tabla, metadatos. |
| `brasa` | `#E2542A` | Acento de marca. Naranja quemado, defendible: es el color de un marcador encendido y no aparece en ningún dashboard de SaaS. |
| `cal` | `#C9D93B` | Valores positivos: rating, puntos. Verde limón sucio. |
| `podio` | `#D9A441` | Primeros puestos y estados retenidos. |
| `alerta` | `#D63B3B` | Tasas malas, stock en cero, confianza bajo umbral. |

La configuración de Tailwind **reemplaza** la escala de colores completa, no
la extiende: `indigo-500`, `slate-900` y compañía no existen como clases en
este proyecto. No es disciplina, es imposibilidad.

## Tipografía

Dos familias, con roles separados que se notan a simple vista:

- **Archivo** (400/500/600/700) para todo el texto. Grotesca cerrada, con
  peso real en los títulos. Se eligió por la densidad horizontal: en un
  marcador el ancho es caro.
- **IBM Plex Mono** (400/500/600) para **todo número comparable entre filas**:
  rating, puntos, posiciones, cupos, fechas, cuentas regresivas. Con
  `font-variant-numeric: tabular-nums`, las columnas quedan alineadas al
  dígito.

No se usa Inter. No porque sea mala, sino porque sería el reflejo.

## Wireframe: home

```
┌──────────────────────────────────────────────────────────────────────┐
│ CLUTCH.   Ranking  Torneos  Comparar        [busca un nick]  [Entrar]│
├─────────────────────────────────────────┬────────────────────────────┤
│ SEMANAL SOLO #1              02d 14h 31m│ Top 10 · Fortnite          │
│                                          │ #  Jugador      Rating  T │
│ Modo     Cupos    Servidor   Entrada     │ 1  vatoloco      1842  11 │
│ SOLO     64/100   BR         Gratis      │ 2  kiltro        1790   9 │
│                                          │ 3  pelao_cl      1755  14 │
│ Check-in abre 21:30. Sin check-in se     │ ...                       │
│ libera tu cupo.                          │ 10 tomate        1602   6 │
│                                          │                           │
│ [ Inscríbete ]  [ Ver todos ]            │ Tabla completa            │
├─────────────────────────────────────────┼────────────────────────────┤
│ Últimas partidas reportadas              │ Calendario                 │
│ Jugador    Torneo     Pos  Elim   Pts    │ Torneo    Modo Cupos Parte │
│ kiltro     Semanal#1    3     7    56    │ Semanal#1 SOLO 64/100 21:00│
│ vatoloco   Semanal#1    1     4    68    │ Dúos #4   DUO  22/50  Jue  │
└─────────────────────────────────────────┴────────────────────────────┘
```

El héroe es dato vivo: el próximo torneo con cuenta regresiva real, el top
10 en vivo y las últimas partidas reportadas. No hay titular de marketing en
ninguna parte de la home.

## Wireframe: página de torneo

```
┌──────────────────────────────────────────────────────────────────────┐
│ SEMANAL SOLO #1                                        parte en 02d…  │
│ SOLO · puntos · servidor BR                                           │
│                                                                       │
│ Inscritos  Partidas          Check-in   Termina   Entrada             │
│ 64/100     mejores 6 de 8    21:30      00:00     Gratis              │
│                                                                       │
│ [ Hacer check-in ] [ Bajarme del torneo ]                             │
│ ┌── reporte (solo con check-in hecho) ────────────────────────────┐   │
│ │ [Partida 3 ▾] [Pos] [Elim] [link del screenshot]   [Reportar]   │   │
│ └─────────────────────────────────────────────────────────────────┘   │
├───────────────────────────────────────────┬───────────────────────────┤
│ Tabla del torneo                          │ Puntaje                   │
│ #  Jugador     Equipo  Pts  Part Mej Elim │ Puesto 1            60    │
│ 1  vatoloco    —       284    6    1   22 │ Puestos 2 a 3       45    │
│ 2  kiltro      TKL     251    6    2   19 │ Por eliminación      2    │
│ 3  pelao_cl    —       240    5    3   15 │                           │
│                                           │ Premios                   │
│                                           │ 1  2.800 V-Bucks          │
├───────────────────────────────────────────┴───────────────────────────┤
│ Bitácora pública                                                      │
│ 12 sep 22:14  disputa.resolver  {decision: RESUELTA, …}               │
│ 12 sep 21:31  torneo.checkin_cerrado  {noShows: 7}                    │
└───────────────────────────────────────────────────────────────────────┘
```

La bitácora pública es parte del diseño, no un detalle administrativo: es lo
que responde a "el organizador arregla los resultados" sin tener que pedir
confianza.

## Revisión contra las restricciones de §7

Qué se descartó en el camino y por qué:

1. **Hero con titular de marketing.** El primer borrador abría con una frase
   y un botón. Se reemplazó por el próximo torneo con cuenta regresiva: la
   primera pantalla ahora responde "¿cuándo juego y contra quiénes?" en lugar
   de explicar qué es la plataforma.
2. **Cards uniformes.** No hay un componente `Card` reutilizado en todo el
   sitio. Hay bloques con padding distinto según jerarquía y, sobre todo,
   tablas: el público objetivo lee stats por deporte, esconder datos detrás
   de cards espaciadas es lo contrario de lo que quiere.
3. **Radios grandes.** El máximo es 6px y casi todo es de canto vivo. Un
   marcador no tiene esquinas redondeadas.
4. **Animaciones al scroll.** Cero. El único movimiento del sitio es la
   cuenta regresiva, que se mueve porque el tiempo pasa, y los estados de
   botón mientras una acción está pendiente.
5. **Barras de acento a la izquierda, eyebrows en mayúsculas espaciadas,
   marcadores 01/02/03, flechitas al final de los links.** Ninguno existe.
   `scripts/check-ai-smell.sh` los verifica en cada deploy junto con la
   paleta por defecto de Tailwind y los comentarios de atribución.
6. **Em dashes en el copy.** El checker marca el em dash entre palabras. Se
   permite el glifo suelto como "sin dato" en una celda, que es convención de
   tabla deportiva y no un tic de redacción.
7. **Imágenes o ilustraciones generadas.** Ninguna. El gráfico de evolución
   de rating es SVG dibujado con los datos reales, sin librería: dos
   polilíneas y una grilla pesan menos que 90 KB de dependencia.
8. **Copy traducido del inglés.** "Inscríbete", "Bajarme del torneo",
   "Se pasó el plazo de 30 minutos para reportar esta partida". Los errores
   dicen qué pasó y qué hacer.
