CREATE TABLE `participants` (
	`room` text NOT NULL,
	`client` text NOT NULL,
	`role` text NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	`seen_revision` integer DEFAULT 0 NOT NULL,
	`last_seen` integer NOT NULL,
	PRIMARY KEY(`room`, `client`)
);

CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
