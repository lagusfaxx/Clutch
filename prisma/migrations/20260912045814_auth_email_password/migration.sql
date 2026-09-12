-- DropIndex
DROP INDEX "GhostProfile_epicNick_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "epicLinkMethod" TEXT,
ADD COLUMN     "passwordHash" TEXT,
ALTER COLUMN "discordId" DROP NOT NULL;

-- RenameIndex
ALTER INDEX "Team_name_trgm" RENAME TO "Team_name_idx";

-- RenameIndex
ALTER INDEX "User_displayName_trgm" RENAME TO "User_displayName_idx";

-- RenameIndex
ALTER INDEX "User_epicNick_trgm" RENAME TO "User_epicNick_idx";

-- RenameIndex
ALTER INDEX "GhostProfile_epicNick_trgm" RENAME TO "GhostProfile_epicNick_idx";
