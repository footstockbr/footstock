-- AlterTable: add date range and responsive image fields to sponsor_banners
ALTER TABLE "sponsor_banners" ADD COLUMN "start_date" TIMESTAMP(3);
ALTER TABLE "sponsor_banners" ADD COLUMN "end_date" TIMESTAMP(3);
ALTER TABLE "sponsor_banners" ADD COLUMN "image_desktop_url" TEXT;
ALTER TABLE "sponsor_banners" ADD COLUMN "image_mobile_url" TEXT;
ALTER TABLE "sponsor_banners" ADD COLUMN "image_vertical_url" TEXT;
