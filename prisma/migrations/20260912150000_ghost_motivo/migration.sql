-- Por qué un perfil fantasma no tiene stats.
--
-- Hasta ahora solo se guardaba `notFound`, que mezcla tres casos muy
-- distintos para el jugador: cuenta inexistente, cuenta sin partidas y
-- cuenta con las estadísticas privadas. La última es la más común y la
-- única que el jugador puede resolver, así que necesita decirse aparte.
ALTER TABLE "GhostProfile" ADD COLUMN IF NOT EXISTS "motivo" TEXT;
