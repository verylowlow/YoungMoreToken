-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "modalities" TEXT NOT NULL,
    "manifest" TEXT NOT NULL,
    "quality" REAL NOT NULL DEFAULT 0,
    "region" TEXT NOT NULL DEFAULT 'intl',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Provider" ("createdAt", "enabled", "id", "kind", "manifest", "modalities", "name", "quality", "slug") SELECT "createdAt", "enabled", "id", "kind", "manifest", "modalities", "name", "quality", "slug" FROM "Provider";
DROP TABLE "Provider";
ALTER TABLE "new_Provider" RENAME TO "Provider";
CREATE UNIQUE INDEX "Provider_slug_key" ON "Provider"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
