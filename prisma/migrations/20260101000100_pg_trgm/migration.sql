-- Búsqueda difusa de nicks (§2.11). Los typos en nicks son constantes, así que
-- el índice local tiene que tolerarlos sin salir a la API externa.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "User_displayName_trgm"
  ON "User" USING GIN ("displayName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "User_epicNick_trgm"
  ON "User" USING GIN ("epicNick" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "GhostProfile_epicNick_trgm"
  ON "GhostProfile" USING GIN ("epicNick" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Team_name_trgm"
  ON "Team" USING GIN ("name" gin_trgm_ops);
