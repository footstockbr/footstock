-- M015_create_data_access_logs

CREATE TABLE "data_access_logs" (
  "id"            TEXT NOT NULL,
  "user_id"       TEXT NOT NULL,
  "action"        TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id"   TEXT,
  "ip_address"    TEXT,
  "user_agent"    TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_access_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_access_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "data_access_logs_user_id_idx" ON "data_access_logs"("user_id");
CREATE INDEX "data_access_logs_created_at_idx" ON "data_access_logs"("created_at");

-- down: DROP TABLE "data_access_logs";
