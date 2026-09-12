-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Game" AS ENUM ('FORTNITE', 'CS2');

-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('SOLO', 'DUO', 'SQUAD');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'VERIFIED', 'TRUSTED', 'FLAGGED', 'BANNED');

-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('PUNTOS', 'ELIMINACION_SIMPLE', 'ELIMINACION_DOBLE', 'LIGA');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'PUBLICADO', 'INSCRIPCION_ABIERTA', 'CHECK_IN', 'EN_CURSO', 'EN_DISPUTA', 'CERRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PlatformRule" AS ENUM ('CUALQUIERA', 'SOLO_PC', 'SOLO_CONSOLA', 'SOLO_MOBILE');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDIENTE_PAGO', 'CONFIRMADA', 'EN_ESPERA', 'CHECKED_IN', 'NO_SHOW', 'RETIRADA');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('REPORTADO', 'VERIFICADO', 'EN_DISPUTA', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "SnapshotPhase" AS ENUM ('PRE', 'POST');

-- CreateEnum
CREATE TYPE "PrizeType" AS ENUM ('VBUCKS', 'HARDWARE');

-- CreateEnum
CREATE TYPE "CodeStatus" AS ENUM ('DISPONIBLE', 'ASIGNADO', 'ENTREGADO', 'INVALIDO');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDIENTE_DATOS', 'PENDIENTE_ENVIO', 'ENVIADO', 'RECIBIDO', 'REVELADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INICIADO', 'AUTORIZADO', 'RECHAZADO', 'ANULADO', 'REEMBOLSADO');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('ABIERTA', 'EN_REVISION', 'RESUELTA', 'DESESTIMADA');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "discordTag" TEXT,
    "epicAccountId" TEXT,
    "epicNick" TEXT,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "email" TEXT,
    "rut" TEXT,
    "birthDate" TIMESTAMP(3),
    "guardianEmail" TEXT,
    "region" TEXT,
    "avatarUrl" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "statsPrivate" BOOLEAN NOT NULL DEFAULT false,
    "showPresence" BOOLEAN NOT NULL DEFAULT false,
    "dmsOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "encryptedAccess" TEXT,
    "encryptedRefresh" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ban" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "epicAccountId" TEXT,
    "discordId" TEXT,
    "ipHash" TEXT,
    "reason" TEXT NOT NULL,
    "until" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ban_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "tournamentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Strike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "game" "Game" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "game" "Game" NOT NULL DEFAULT 'FORTNITE',
    "format" "TournamentFormat" NOT NULL DEFAULT 'PUNTOS',
    "mode" "GameMode" NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "platformRule" "PlatformRule" NOT NULL DEFAULT 'CUALQUIERA',
    "serverRegion" TEXT NOT NULL DEFAULT 'BR',
    "region" TEXT,
    "seasonId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "checkInOpensAt" TIMESTAMP(3) NOT NULL,
    "maxSlots" INTEGER NOT NULL,
    "minSlots" INTEGER NOT NULL DEFAULT 0,
    "entryFeeClp" INTEGER NOT NULL DEFAULT 0,
    "scoringConfig" JSONB NOT NULL,
    "matchesCounted" INTEGER NOT NULL DEFAULT 6,
    "matchesTotal" INTEGER NOT NULL DEFAULT 8,
    "minRating" INTEGER,
    "minTournaments" INTEGER NOT NULL DEFAULT 0,
    "rulesUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "captainId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MIEMBRO',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'CONFIRMADA',
    "checkedInAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "seed" INTEGER,
    "waitlistPos" INTEGER,
    "rosterLock" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "lobbyCode" TEXT,
    "bracketRound" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "placement" INTEGER NOT NULL,
    "eliminations" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "evidenceUrl" TEXT,
    "status" "ResultStatus" NOT NULL DEFAULT 'REPORTADO',
    "confidenceScore" DOUBLE PRECISION,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matchResultId" TEXT,
    "openedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'ABIERTA',
    "resolvedById" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" "Game" NOT NULL,
    "mode" "GameMode" NOT NULL,
    "seasonId" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "deviation" DOUBLE PRECISION NOT NULL DEFAULT 350,
    "volatility" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "peakRating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingArchive" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "game" "Game" NOT NULL,
    "mode" "GameMode" NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "deviation" DOUBLE PRECISION NOT NULL,
    "position" INTEGER,
    "matchCount" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" "Game" NOT NULL,
    "mode" "GameMode" NOT NULL,
    "seasonId" TEXT NOT NULL,
    "tournamentId" TEXT,
    "ratingBefore" DOUBLE PRECISION NOT NULL,
    "ratingAfter" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prize" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "placement" INTEGER NOT NULL,
    "type" "PrizeType" NOT NULL,
    "faceValue" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "hardwareSku" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrizeCode" (
    "id" TEXT NOT NULL,
    "type" "PrizeType" NOT NULL,
    "faceValue" INTEGER NOT NULL,
    "encryptedCode" TEXT,
    "batchRef" TEXT,
    "status" "CodeStatus" NOT NULL DEFAULT 'DISPONIBLE',
    "claimId" TEXT,
    "revealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrizeCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HardwareItem" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HardwareItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrizeClaim" (
    "id" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDIENTE_DATOS',
    "rut" TEXT,
    "shipName" TEXT,
    "shipAddress" TEXT,
    "shipComuna" TEXT,
    "shipRegion" TEXT,
    "shipPhone" TEXT,
    "trackingCode" TEXT,
    "revealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrizeClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "amountClp" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INICIADO',
    "buyOrder" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "token" TEXT,
    "authorizationCode" TEXT,
    "responseCode" INTEGER,
    "rawPayload" JSONB,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FortniteStatsSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tournamentId" TEXT,
    "phase" "SnapshotPhase" NOT NULL,
    "provider" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "wins" INTEGER,
    "kills" INTEGER,
    "matchesPlayed" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FortniteStatsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderHealth" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "consecutiveFails" INTEGER NOT NULL DEFAULT 0,
    "openedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cache" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "GhostProfile" (
    "id" TEXT NOT NULL,
    "epicNick" TEXT NOT NULL,
    "epicAccountId" TEXT,
    "slug" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "cachedStats" JSONB,
    "notFound" BOOLEAN NOT NULL DEFAULT false,
    "claimedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GhostProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchQuery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMember" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedId" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "contextId" TEXT,
    "reason" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "ip" TEXT,
    "publico" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "User_epicAccountId_key" ON "User"("epicAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "User_slug_key" ON "User"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_rut_key" ON "User"("rut");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_region_idx" ON "User"("region");

-- CreateIndex
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_providerAccountId_key" ON "OAuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "Ban_epicAccountId_idx" ON "Ban"("epicAccountId");

-- CreateIndex
CREATE INDEX "Ban_discordId_idx" ON "Ban"("discordId");

-- CreateIndex
CREATE INDEX "Ban_ipHash_idx" ON "Ban"("ipHash");

-- CreateIndex
CREATE INDEX "Strike_userId_createdAt_idx" ON "Strike"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Season_slug_key" ON "Season"("slug");

-- CreateIndex
CREATE INDEX "Season_game_startsAt_idx" ON "Season"("game", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_slug_key" ON "Tournament"("slug");

-- CreateIndex
CREATE INDEX "Tournament_status_startsAt_idx" ON "Tournament"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Tournament_game_mode_idx" ON "Tournament"("game", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "Team_tag_key" ON "Team"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

-- CreateIndex
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_paymentId_key" ON "Registration"("paymentId");

-- CreateIndex
CREATE INDEX "Registration_tournamentId_status_idx" ON "Registration"("tournamentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_tournamentId_userId_key" ON "Registration"("tournamentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_tournamentId_index_key" ON "Match"("tournamentId", "index");

-- CreateIndex
CREATE INDEX "MatchResult_status_idx" ON "MatchResult"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MatchResult_matchId_registrationId_key" ON "MatchResult"("matchId", "registrationId");

-- CreateIndex
CREATE INDEX "Dispute_tournamentId_status_idx" ON "Dispute"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "Rating_game_mode_seasonId_rating_idx" ON "Rating"("game", "mode", "seasonId", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_userId_game_mode_seasonId_key" ON "Rating"("userId", "game", "mode", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "RatingArchive_userId_seasonId_game_mode_key" ON "RatingArchive"("userId", "seasonId", "game", "mode");

-- CreateIndex
CREATE INDEX "RatingHistory_userId_createdAt_idx" ON "RatingHistory"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Prize_tournamentId_placement_key" ON "Prize"("tournamentId", "placement");

-- CreateIndex
CREATE UNIQUE INDEX "PrizeCode_claimId_key" ON "PrizeCode"("claimId");

-- CreateIndex
CREATE INDEX "PrizeCode_status_type_idx" ON "PrizeCode"("status", "type");

-- CreateIndex
CREATE UNIQUE INDEX "HardwareItem_sku_key" ON "HardwareItem"("sku");

-- CreateIndex
CREATE INDEX "PrizeClaim_userId_status_idx" ON "PrizeClaim"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PrizeClaim_prizeId_userId_key" ON "PrizeClaim"("prizeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_buyOrder_key" ON "Payment"("buyOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_token_key" ON "Payment"("token");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_externalId_key" ON "WebhookEvent"("provider", "externalId");

-- CreateIndex
CREATE INDEX "FortniteStatsSnapshot_userId_tournamentId_phase_idx" ON "FortniteStatsSnapshot"("userId", "tournamentId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderHealth_provider_key" ON "ProviderHealth"("provider");

-- CreateIndex
CREATE INDEX "Cache_expiresAt_idx" ON "Cache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GhostProfile_epicNick_key" ON "GhostProfile"("epicNick");

-- CreateIndex
CREATE UNIQUE INDEX "GhostProfile_epicAccountId_key" ON "GhostProfile"("epicAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "GhostProfile_slug_key" ON "GhostProfile"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GhostProfile_claimedByUserId_key" ON "GhostProfile"("claimedByUserId");

-- CreateIndex
CREATE INDEX "GhostProfile_epicNick_idx" ON "GhostProfile"("epicNick");

-- CreateIndex
CREATE INDEX "SearchQuery_userId_createdAt_idx" ON "SearchQuery"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationMember_userId_idx" ON "ConversationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMember_conversationId_userId_key" ON "ConversationMember"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Block_blockerId_blockedId_key" ON "Block"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "Report_resolvedAt_idx" ON "Report"("resolvedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strike" ADD CONSTRAINT "Strike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_matchResultId_fkey" FOREIGN KEY ("matchResultId") REFERENCES "MatchResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingArchive" ADD CONSTRAINT "RatingArchive_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prize" ADD CONSTRAINT "Prize_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeCode" ADD CONSTRAINT "PrizeCode_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "PrizeClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeClaim" ADD CONSTRAINT "PrizeClaim_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "Prize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeClaim" ADD CONSTRAINT "PrizeClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FortniteStatsSnapshot" ADD CONSTRAINT "FortniteStatsSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FortniteStatsSnapshot" ADD CONSTRAINT "FortniteStatsSnapshot_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchQuery" ADD CONSTRAINT "SearchQuery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedId_fkey" FOREIGN KEY ("reportedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

