-- ============================================================================
-- StoryTimes CMS — MySQL/MariaDB schema
-- Hand-translated 1:1 from prisma/schema.prisma (NOT auto-generated — this
-- sandbox has no network access to Prisma's schema-engine binary, so this
-- was written column-by-column against the schema instead of trusting
-- `prisma db push` to be the only way to get a correct database).
--
-- This is provided as a SAFE, DIRECT ALTERNATIVE to `npx prisma db push`:
-- import this file into an EMPTY database with your MySQL client of choice,
-- then skip `prisma db push` (but still run `npx prisma generate` so the
-- Prisma Client's TypeScript types are generated) and go straight to
-- `npm run db:seed`.
--
-- Import:
--   mysql -u YOUR_USER -p YOUR_DATABASE < prisma/schema.sql
--
-- Requirements: MySQL 8.0+ or MariaDB 10.5+ (needs JSON-capable TEXT columns
-- and modern FK support — both have been standard for years).
-- Character set: utf8mb4 throughout, to safely store emoji (used in the
-- admin dashboard's country flags, AI-generated content, etc.).
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── users ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `email` VARCHAR(100) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('admin','editor','author') NOT NULL DEFAULT 'author',
  `status` ENUM('active','pending','suspended') NOT NULL DEFAULT 'pending',
  `permissions` LONGTEXT NULL,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_username_key` (`username`),
  UNIQUE KEY `users_email_key` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── authors ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `authors` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `full_name` VARCHAR(150) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(150) NULL,
  `bio` TEXT NULL,
  `profile_image` VARCHAR(255) NULL,
  `email` VARCHAR(150) NULL,
  `mobile_number` VARCHAR(20) NULL,
  `address` TEXT NULL,
  `qualifications` TEXT NULL,
  `designation` VARCHAR(150) NULL,
  `experience` VARCHAR(100) NULL,
  `certifications` TEXT NULL,
  `languages_known` VARCHAR(255) NULL,
  `instagram` VARCHAR(255) NULL,
  `threads` VARCHAR(255) NULL,
  `linkedin` VARCHAR(255) NULL,
  `facebook` VARCHAR(255) NULL,
  `twitter` VARCHAR(255) NULL,
  `total_posts` INT NULL DEFAULT 0,
  `is_featured` TINYINT(1) NULL DEFAULT 0,
  `status` ENUM('active','pending','suspended') NOT NULL DEFAULT 'pending',
  `user_id` INT NOT NULL,
  `join_date` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `authors_slug_key` (`slug`),
  UNIQUE KEY `authors_email_key` (`email`),
  UNIQUE KEY `authors_user_id_key` (`user_id`),
  KEY `fk_author_user` (`user_id`),
  CONSTRAINT `authors_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── categories ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `categories` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(150) NOT NULL,
  `meta_title` VARCHAR(255) NULL,
  `meta_description` TEXT NULL,
  `meta_keywords` TEXT NULL,
  `views` INT NULL DEFAULT 0,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `categories_slug_key` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── tags ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `tags` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(150) NOT NULL,
  `views` INT NULL DEFAULT 0,
  `is_active` TINYINT(1) NULL DEFAULT 1,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tags_slug_key` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── states ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `states` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `state_name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `views` INT NULL DEFAULT 0,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `states_slug_key` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── posts ───────────────────────────────────────────────────────────────
-- NOTE: `featured_image_id` intentionally has NO foreign key constraint
-- defined inline here — posts and media reference each other (a post has
-- a featured image; an image can belong to a post), so the FK is added
-- via ALTER TABLE further down, after both tables exist.
CREATE TABLE IF NOT EXISTS `posts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(200) NOT NULL,
  `content` TEXT NOT NULL,
  `faq_json` LONGTEXT NULL,
  `last_date` DATE NULL,
  `date` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `author_id` INT NOT NULL,
  `category_id` INT NOT NULL,
  `state_id` INT NULL,
  `slug` VARCHAR(200) NOT NULL,
  `status` ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  `featured_image_id` INT NULL,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `excerpt` TEXT NULL,
  `post_type` ENUM('post','page') NOT NULL DEFAULT 'post',
  PRIMARY KEY (`id`),
  UNIQUE KEY `posts_slug_key` (`slug`),
  UNIQUE KEY `posts_featured_image_id_key` (`featured_image_id`),
  KEY `idx_slug` (`slug`),
  KEY `author_id` (`author_id`),
  KEY `idx_status` (`status`),
  KEY `idx_date` (`date`),
  KEY `idx_category_id` (`category_id`),
  KEY `idx_status_date` (`status`, `date`),
  KEY `idx_category_status_date` (`category_id`, `status`, `date`),
  CONSTRAINT `posts_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `authors` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `posts_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `posts_state_id_fkey` FOREIGN KEY (`state_id`) REFERENCES `states` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── media ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `media` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `file_path` VARCHAR(255) NOT NULL,
  `file_type` VARCHAR(50) NOT NULL,
  `responsive_set` LONGTEXT NULL,
  `alt_text` VARCHAR(200) NULL,
  `uploaded_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `uploaded_by` INT NULL,
  `post_id` INT NULL,
  `description` TEXT NULL,
  `caption` VARCHAR(255) NULL,
  `title` VARCHAR(200) NULL,
  `ai_generated` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `post_id` (`post_id`),
  KEY `idx_media_uploaded_by` (`uploaded_by`),
  CONSTRAINT `media_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `media_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Now that both tables exist, wire up posts.featured_image_id -> media.id.
ALTER TABLE `posts`
  ADD CONSTRAINT `posts_featured_image_id_fkey`
  FOREIGN KEY (`featured_image_id`) REFERENCES `media` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ── post_categories (many-to-many: post <-> category) ──────────────────
CREATE TABLE IF NOT EXISTS `post_categories` (
  `post_id` INT NOT NULL,
  `category_id` INT NOT NULL,
  PRIMARY KEY (`post_id`, `category_id`),
  KEY `category_id` (`category_id`),
  CONSTRAINT `post_categories_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `post_categories_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── post_tag (many-to-many: post <-> tag) ───────────────────────────────
CREATE TABLE IF NOT EXISTS `post_tag` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `post_id` INT NOT NULL,
  `tag_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_post_tag` (`post_id`, `tag_id`),
  KEY `fk_tag_link` (`tag_id`),
  CONSTRAINT `post_tag_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `post_tag_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── post_meta (SEO fields: description, keywords, fb_description, etc.) ─
CREATE TABLE IF NOT EXISTS `post_meta` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `post_id` INT NOT NULL,
  `meta_key` VARCHAR(100) NOT NULL,
  `meta_value` TEXT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_post_id` (`post_id`),
  CONSTRAINT `post_meta_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── pages (static pages: About Us, Privacy Policy, etc.) ────────────────
CREATE TABLE IF NOT EXISTS `pages` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(200) NOT NULL,
  `slug` VARCHAR(200) NOT NULL,
  `content` LONGTEXT NULL,
  `status` ENUM('draft','published') NOT NULL DEFAULT 'draft',
  `meta_title` VARCHAR(200) NULL,
  `meta_description` TEXT NULL,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pages_slug_key` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── comments (threaded, self-referencing parent_id) ─────────────────────
CREATE TABLE IF NOT EXISTS `comments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100) NOT NULL,
  `content` TEXT NOT NULL,
  `date` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `evf` TINYINT(1) NULL DEFAULT 0,
  `post_id` INT NOT NULL,
  `parent_id` INT NULL,
  `ip_address` VARCHAR(45) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `user_agent` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  KEY `parent_id` (`parent_id`),
  KEY `idx_post_id` (`post_id`),
  KEY `idx_date` (`date`),
  KEY `idx_post_id_date` (`post_id`, `date`),
  CONSTRAINT `comments_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `comments_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `comments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── contact_submissions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `contact_submissions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `subject` VARCHAR(255) NULL,
  `message` TEXT NOT NULL,
  `ip` VARCHAR(45) NULL,
  `status` ENUM('new','read','replied') NOT NULL DEFAULT 'new',
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── visitor_log (whole-post unique-visitor tracking) ─────────────────────
CREATE TABLE IF NOT EXISTS `visitor_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `visit_date` DATE NOT NULL,
  `visitor_id` VARCHAR(64) NOT NULL,
  `post_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_visit` (`visit_date`, `visitor_id`, `post_id`),
  KEY `idx_date` (`visit_date`),
  KEY `idx_post` (`post_id`),
  CONSTRAINT `visitor_log_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── chapter_visitor_log (per-chapter unique-visitor tracking) ───────────
CREATE TABLE IF NOT EXISTS `chapter_visitor_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `visit_date` DATE NOT NULL,
  `visitor_id` VARCHAR(64) NOT NULL,
  `post_id` INT NOT NULL,
  `chapter_number` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_visit` (`visit_date`, `visitor_id`, `post_id`, `chapter_number`),
  KEY `idx_post` (`post_id`),
  CONSTRAINT `chapter_visitor_log_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── post_stats_daily (daily views by traffic-source + country) ──────────
CREATE TABLE IF NOT EXISTS `post_stats_daily` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `post_id` INT NOT NULL,
  `stat_date` DATE NOT NULL,
  `source` VARCHAR(20) NOT NULL DEFAULT 'direct',
  `country` VARCHAR(2) NOT NULL DEFAULT 'XX',
  `views` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_post_date_source_country` (`post_id`, `stat_date`, `source`, `country`),
  KEY `idx_stat_date` (`stat_date`),
  KEY `idx_post_id` (`post_id`),
  CONSTRAINT `post_stats_daily_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── analytics_adjustment_rules (country-based view-count display filter) ─
-- Not present in the original storytimes-cms.sql — this is a newer
-- addition (admin/analytics-adjustment.php) with no CREATE TABLE anywhere
-- in the PHP source; this shape is inferred from that page's INSERT/SELECT
-- statements. See prisma/schema.prisma's AnalyticsAdjustmentRule model doc.
CREATE TABLE IF NOT EXISTS `analytics_adjustment_rules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `country` VARCHAR(2) NOT NULL,
  `scope` VARCHAR(10) NOT NULL DEFAULT 'all',
  `user_id` INT NULL,
  `reduction_percent` INT NOT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_enabled_country` (`enabled`, `country`),
  KEY `analytics_adjustment_rules_user_id_fkey` (`user_id`),
  KEY `analytics_adjustment_rules_created_by_fkey` (`created_by`),
  CONSTRAINT `analytics_adjustment_rules_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `analytics_adjustment_rules_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── post_views (all-time views, per post + chapter) ──────────────────────
CREATE TABLE IF NOT EXISTS `post_views` (
  `post_id` INT NOT NULL,
  `chapter_number` INT NOT NULL DEFAULT 0,
  `views` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`post_id`, `chapter_number`),
  CONSTRAINT `post_views_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── activity_logs (admin audit trail) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NULL,
  `action_type` VARCHAR(50) NULL,
  `description` TEXT NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` TEXT NULL,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `activity_logs_user_id_fkey` (`user_id`),
  CONSTRAINT `activity_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── ai_api_keys (multi-key Gemini/Cloudflare rotation, per user) ─────────
CREATE TABLE IF NOT EXISTS `ai_api_keys` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `provider` ENUM('gemini','cloudflare') NOT NULL,
  `label` VARCHAR(100) NULL,
  `api_key` VARCHAR(255) NOT NULL,
  `cf_account_id` VARCHAR(64) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `fail_count` INT NOT NULL DEFAULT 0,
  `success_count` INT NOT NULL DEFAULT 0,
  `last_used_at` DATETIME NULL,
  `last_error` VARCHAR(255) NULL,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_provider` (`user_id`, `provider`, `is_active`),
  CONSTRAINT `ai_api_keys_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── ai_feature_settings (per-user generate-title/content/seo/thumbnail toggles) ─
CREATE TABLE IF NOT EXISTS `ai_feature_settings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NULL,
  `generate_title` TINYINT(1) NOT NULL DEFAULT 1,
  `generate_content` TINYINT(1) NOT NULL DEFAULT 1,
  `generate_seo` TINYINT(1) NOT NULL DEFAULT 1,
  `generate_thumbnail` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ai_feature_settings_user_id_key` (`user_id`),
  CONSTRAINT `ai_feature_settings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── ai_generation_log (per-attempt success/fail audit, feeds Fail Rate tab) ─
CREATE TABLE IF NOT EXISTS `ai_generation_log` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `api_key_id` INT NULL,
  `provider` ENUM('gemini','cloudflare') NOT NULL,
  `task` ENUM('text','image') NOT NULL,
  `status` ENUM('success','fail') NOT NULL,
  `error_message` VARCHAR(255) NULL,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_created` (`created_at`),
  KEY `ai_generation_log_api_key_id_fkey` (`api_key_id`),
  CONSTRAINT `ai_generation_log_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ai_generation_log_api_key_id_fkey` FOREIGN KEY (`api_key_id`) REFERENCES `ai_api_keys` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── app_config (key/value site settings — general/performance/homepage/etc.) ─
CREATE TABLE IF NOT EXISTS `app_config` (
  `config_key` VARCHAR(50) NOT NULL,
  `config_value` TEXT NULL,
  PRIMARY KEY (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── site_settings (key/value — currently just site_logo) ────────────────
CREATE TABLE IF NOT EXISTS `site_settings` (
  `setting_key` VARCHAR(100) NOT NULL,
  `setting_value` TEXT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── country_redirections ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `country_redirections` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `country_code` VARCHAR(10) NOT NULL,
  `target_url` TEXT NOT NULL,
  `status` TINYINT(1) NULL DEFAULT 1,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `country_redirections_country_code_key` (`country_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── table_templates (reusable HTML table snippets for post content) ──────
CREATE TABLE IF NOT EXISTS `table_templates` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `html` TEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- That's all 27 tables (25 from the original storytimes-cms.sql + the two
-- newer ones — analytics_adjustment_rules and the country/source columns on
-- post_stats_daily — that came from your latest PHP script).
--
-- Next steps after importing this file:
--   npx prisma generate     # generates the TypeScript client — NOT optional,
--                            # the app will not build without this
--   npm run db:seed         # creates your first admin account
--   npm run build && npm start
-- ============================================================================
