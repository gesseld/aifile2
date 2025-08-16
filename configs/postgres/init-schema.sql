-- Enable UUID for tokens
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core user table
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User sessions (JWT tokens)
CREATE TABLE user_sessions (
    id           SERIAL PRIMARY KEY,
    user_id      INT REFERENCES users(id) ON DELETE CASCADE,
    access_token UUID NOT NULL DEFAULT uuid_generate_v4(),
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stub tables for future features
CREATE TABLE two_factor_auth (user_id INT PRIMARY KEY);          -- 2FA placeholder
CREATE TABLE password_reset_tokens (token TEXT, user_id INT);   -- Password reset placeholder
CREATE TABLE user_devices (id SERIAL PRIMARY KEY);              -- Device tracking placeholder
