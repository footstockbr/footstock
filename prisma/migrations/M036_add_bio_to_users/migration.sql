-- Migration: M036_add_bio_to_users
-- Descrição: Adiciona campo bio à tabela users (max 300 chars, opcional)
-- Gap: G005 — handler PATCH /api/v1/me + bio no updateProfileSchema

ALTER TABLE "users" ADD COLUMN "bio" VARCHAR(300);
