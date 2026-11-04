-- haru-jogak MySQL schema (MySQL 8.x).
-- Run once from CMD inside haru-jogak/:  mysql -u root -p < db\schema.sql
-- Safe to re-run: every statement is IF NOT EXISTS. To start over, DROP DATABASE haru_jogak first.
-- Access rules (who can read what) live in the API routes, see src/server/db/*.

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS haru_jogak
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE haru_jogak;

CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)     NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,  -- scrypt$<salt>$<hash>, see src/server/auth.ts
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
);

-- Login cookie holds a random token; only its SHA-256 is stored here.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64)    NOT NULL,
  user_id    CHAR(36)    NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (token_hash),
  KEY ix_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id CHAR(36)    NOT NULL,
  nick    VARCHAR(12) NOT NULL,
  style   ENUM('water', 'pencil', 'crayon', 'story') NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Fragments. An entry is a draft until daily_artworks has a row for its (user_id, day).
CREATE TABLE IF NOT EXISTS entries (
  id         CHAR(36)     NOT NULL,
  user_id    CHAR(36)     NOT NULL,
  day        DATE         NOT NULL,  -- user's local date the entry belongs to
  written_at DATETIME(3)  NOT NULL,  -- UTC
  body       VARCHAR(140) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_entries_user_day (user_id, day),
  CONSTRAINT fk_entries_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- One picture per user per day.
CREATE TABLE IF NOT EXISTS daily_artworks (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  user_id    CHAR(36)     NOT NULL,
  day        DATE         NOT NULL,
  style      ENUM('water', 'pencil', 'crayon', 'story') NOT NULL,
  scene      ENUM('day', 'cat', 'rain', 'park', 'cafe', 'night') NOT NULL,  -- placeholder art until image_url exists
  image_url  VARCHAR(1024) NULL,
  summary    TEXT         NOT NULL,
  tags       JSON         NOT NULL,
  status     ENUM('drawing', 'done', 'failed') NOT NULL DEFAULT 'done',
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_artworks_user_day (user_id, day),
  CONSTRAINT fk_artworks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- One exhibition per user for now (created on sign-up); drop the unique key to allow several.
CREATE TABLE IF NOT EXISTS exhibitions (
  id          CHAR(36)     NOT NULL,
  user_id     CHAR(36)     NOT NULL,
  title       VARCHAR(60)  NOT NULL,
  description VARCHAR(300) NOT NULL DEFAULT '',
  is_public   BOOLEAN      NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exhibitions_user (user_id),
  CONSTRAINT fk_exhibitions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exhibition_items (
  exhibition_id CHAR(36)     NOT NULL,
  artwork_id    BIGINT       NOT NULL,
  position      INT          NOT NULL,
  note          VARCHAR(300) NULL,
  PRIMARY KEY (exhibition_id, artwork_id),
  CONSTRAINT fk_items_exhibition FOREIGN KEY (exhibition_id) REFERENCES exhibitions (id) ON DELETE CASCADE,
  CONSTRAINT fk_items_artwork FOREIGN KEY (artwork_id) REFERENCES daily_artworks (id) ON DELETE CASCADE
);
