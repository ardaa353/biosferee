CREATE TABLE `cloud_image_deletions` (
	`id` varchar(64) NOT NULL,
	`file_key` varchar(512) NOT NULL,
	`attempts` int unsigned NOT NULL DEFAULT 0,
	`next_attempt_at` timestamp NOT NULL DEFAULT (now()),
	`last_error` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cloud_image_deletions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `collaborators` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`post_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	CONSTRAINT `collaborators_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_collab` UNIQUE(`post_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `dataset_import_entries` (
	`id` varchar(64) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`source_id` varchar(128) NOT NULL,
	`post_id` bigint unsigned,
	`record` json NOT NULL,
	`public_ids` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dataset_import_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dataset_import_jobs` (
	`id` varchar(36) NOT NULL,
	`importer_id` bigint unsigned NOT NULL,
	`author_id` bigint unsigned,
	`archive_id` varchar(128) NOT NULL,
	`total` int unsigned NOT NULL,
	`state` varchar(20) NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dataset_import_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `imported_observation_data` (
	`post_id` bigint unsigned NOT NULL,
	`source` json NOT NULL,
	CONSTRAINT `imported_observation_data_post_id` PRIMARY KEY(`post_id`)
);
--> statement-breakpoint
CREATE TABLE `likes` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`post_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `likes_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_like` UNIQUE(`post_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `post_images` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`post_id` bigint unsigned NOT NULL,
	`file_key` varchar(512) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `post_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`author_id` bigint unsigned,
	`description` text NOT NULL,
	`status` enum('unknown','verified','removed') NOT NULL DEFAULT 'verified',
	`kingdom` varchar(100),
	`phylum` varchar(150),
	`class_name` varchar(150),
	`order_name` varchar(150),
	`family` varchar(150),
	`genus` varchar(150),
	`species` varchar(200),
	`common_name` varchar(200),
	`city` varchar(100) NOT NULL,
	`locality` varchar(200) NOT NULL,
	`lat` double NOT NULL,
	`lng` double NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`post_id` bigint unsigned NOT NULL,
	`reporter_id` bigint unsigned NOT NULL,
	`reason` enum('misleading','wrong_species','inappropriate','other') NOT NULL,
	`details` text NOT NULL,
	`status` enum('pending','resolved','dismissed') NOT NULL DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`token` varchar(128) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`post_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`kingdom` varchar(100) NOT NULL,
	`phylum` varchar(150) NOT NULL,
	`class_name` varchar(150) NOT NULL,
	`order_name` varchar(150) NOT NULL,
	`family` varchar(150) NOT NULL,
	`genus` varchar(150) NOT NULL,
	`species` varchar(200) NOT NULL,
	`common_name` varchar(200) NOT NULL,
	`note` text,
	`status` enum('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `suggestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `text_translations` (
	`content_hash` varchar(64) NOT NULL,
	`translated_text` text NOT NULL,
	`source_language` varchar(12) NOT NULL,
	`provider` varchar(40) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `text_translations_content_hash` PRIMARY KEY(`content_hash`)
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` bigint unsigned NOT NULL,
	`language` varchar(2),
	CONSTRAINT `user_preferences_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`first_name` varchar(80) NOT NULL,
	`last_name` varchar(80) NOT NULL,
	`username` varchar(40) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(30) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`bio` text NOT NULL,
	`avatar_key` varchar(512),
	`role` enum('user','moderator','admin') NOT NULL DEFAULT 'user',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE INDEX `cloud_deletion_due_idx` ON `cloud_image_deletions` (`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `dataset_entry_job_idx` ON `dataset_import_entries` (`job_id`);--> statement-breakpoint
CREATE INDEX `image_post_idx` ON `post_images` (`post_id`);--> statement-breakpoint
CREATE INDEX `post_author_idx` ON `posts` (`author_id`);--> statement-breakpoint
CREATE INDEX `post_city_idx` ON `posts` (`city`);--> statement-breakpoint
CREATE INDEX `post_species_idx` ON `posts` (`species`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `sessions` (`user_id`);
--> statement-breakpoint
-- Reserve the old application's low IDs for a later, explicitly verified restore.
ALTER TABLE `users` AUTO_INCREMENT = 1000000000;
--> statement-breakpoint
ALTER TABLE `sessions` AUTO_INCREMENT = 1000000000;
--> statement-breakpoint
ALTER TABLE `posts` AUTO_INCREMENT = 1000000000;
--> statement-breakpoint
ALTER TABLE `post_images` AUTO_INCREMENT = 1000000000;
--> statement-breakpoint
ALTER TABLE `likes` AUTO_INCREMENT = 1000000000;
--> statement-breakpoint
ALTER TABLE `collaborators` AUTO_INCREMENT = 1000000000;
--> statement-breakpoint
ALTER TABLE `suggestions` AUTO_INCREMENT = 1000000000;
--> statement-breakpoint
ALTER TABLE `reports` AUTO_INCREMENT = 1000000000;
