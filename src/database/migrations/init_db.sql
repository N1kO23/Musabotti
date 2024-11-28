CREATE DATABASE IF NOT EXISTS discord_bot_database;
USE discord_bot_database;

USE discord_bot_database;

CREATE TABLE IF NOT EXISTS guilds (
    id BIGINT PRIMARY KEY,
    prefix VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Add more columns here if needed
);

CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,
    bio TEXT,
    -- Add more columns here if needed
);

CREATE TABLE IF NOT EXISTS user_guild_relation (
    user_id BIGINT,
    guild_id BIGINT,
    join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, guild_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);