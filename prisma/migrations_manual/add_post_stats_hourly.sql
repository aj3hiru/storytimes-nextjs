-- Real-time hourly view tracking for the Analytics page's "Today"/
-- "Yesterday" ranges. Run this once on the production database.
--
-- Safe to run multiple times (CREATE TABLE IF NOT EXISTS).
-- Does NOT touch any existing table or data.
--
-- How to run:
--   mysql -u <user> -p <database_name> < add_post_stats_hourly.sql
-- or paste its contents into phpMyAdmin / your DB client's SQL tab.

CREATE TABLE IF NOT EXISTS `post_stats_hourly` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `post_id` INT NOT NULL,
  `stat_hour` DATETIME NOT NULL,
  `source` VARCHAR(20) NOT NULL DEFAULT 'direct',
  `country` VARCHAR(2) NOT NULL DEFAULT 'XX',
  `views` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_post_hour_source_country` (`post_id`, `stat_hour`, `source`, `country`),
  KEY `idx_stat_hour` (`stat_hour`),
  KEY `idx_post_id` (`post_id`),
  CONSTRAINT `post_stats_hourly_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
