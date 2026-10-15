-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "modalities" TEXT NOT NULL,
    "manifest" TEXT NOT NULL,
    "quality" REAL NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "keyEnc" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "priority" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "quotaTotal" REAL,
    "quotaUsed" REAL NOT NULL DEFAULT 0,
    "resetRule" TEXT NOT NULL DEFAULT 'none',
    "resetAt" DATETIME,
    "cooldownTill" DATETIME,
    "health" REAL NOT NULL DEFAULT 1,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "avgLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKey_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modality" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "request" TEXT NOT NULL,
    "providerId" TEXT,
    "apiKeyId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMsg" TEXT,
    "mediaIds" TEXT,
    "costEstimate" REAL,
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "kind" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "sizeBytes" INTEGER,
    "watermark" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "QuotaEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apiKeyId" TEXT NOT NULL,
    "delta" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "taskId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Provider_slug_key" ON "Provider"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_providerId_keyHash_key" ON "ApiKey"("providerId", "keyHash");
