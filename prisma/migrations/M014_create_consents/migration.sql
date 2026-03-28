-- M014_create_consents

CREATE TABLE "consents" (
  "id"        TEXT NOT NULL,
  "user_id"   TEXT NOT NULL,
  "purpose"   "ConsentPurpose" NOT NULL,
  "granted"   BOOLEAN NOT NULL,
  "granted_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "consents_user_id_purpose_key" ON "consents"("user_id", "purpose");
CREATE INDEX "consents_user_id_idx" ON "consents"("user_id");

-- down: DROP TABLE "consents";
