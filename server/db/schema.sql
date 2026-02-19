DROP TABLE IF EXISTS user_deletions CASCADE;
DROP TABLE IF EXISTS user_consents CASCADE;
DROP TABLE IF EXISTS leaderboard CASCADE;
DROP TABLE IF EXISTS enemy_kills CASCADE;
DROP TABLE IF EXISTS dungeon_sessions CASCADE;
DROP TABLE IF EXISTS enemy_types CASCADE;
DROP TABLE IF EXISTS characters CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ==================
-- 1. USERS
-- ==================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

-- ==================
-- 2. CHARACTERS
-- ==================
CREATE TABLE characters (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    class VARCHAR(20) NOT NULL CHECK (class IN ('warrior', 'mage', 'rogue')),
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    health INTEGER DEFAULT 100,
    max_health INTEGER DEFAULT 100,
    base_attack INTEGER DEFAULT 10,
    base_defense INTEGER DEFAULT 5,
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_played TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_characters_user_id ON characters(user_id);

-- ==================
-- 3. ENEMY TYPES
-- ==================
CREATE TABLE enemy_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    base_health INTEGER NOT NULL,
    base_attack INTEGER NOT NULL,
    base_defense INTEGER DEFAULT 0,
    experience_reward INTEGER DEFAULT 10,
    sprite_icon VARCHAR(10),
    difficulty_level INTEGER DEFAULT 1
);

-- ==================
-- 4. DUNGEON SESSIONS
-- ==================
CREATE TABLE dungeon_sessions (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 10),
    seed VARCHAR(50),
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    enemies_killed INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    completed BOOLEAN DEFAULT FALSE,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
);

CREATE INDEX idx_dungeon_sessions_character ON dungeon_sessions(character_id);
CREATE INDEX idx_dungeon_sessions_active ON dungeon_sessions(is_active);

-- ==================
-- 5. ENEMY KILLS
-- ==================
CREATE TABLE enemy_kills (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES dungeon_sessions(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    enemy_name VARCHAR(50) NOT NULL,
    experience_gained INTEGER DEFAULT 0,
    killed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_enemy_kills_session ON enemy_kills(session_id);
CREATE INDEX idx_enemy_kills_character ON enemy_kills(character_id);

-- ==================
-- 6. USER CONSENTS (GDPR)
-- ==================
CREATE TABLE user_consents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type VARCHAR(50) NOT NULL,
    consented BOOLEAN DEFAULT FALSE,
    consented_at TIMESTAMP,
    ip_address VARCHAR(45),
    UNIQUE(user_id, consent_type)
);

-- ==================
-- 8. USER DELETIONS (GDPR Audit)
-- ==================
CREATE TABLE user_deletions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    username VARCHAR(50),
    email VARCHAR(100),
    reason TEXT,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================
-- SEED DATA
-- ==================

INSERT INTO enemy_types (name, base_health, base_attack, base_defense, experience_reward, sprite_icon, difficulty_level) VALUES
('Goblin', 30, 5, 2, 15, '👹', 1),
('Skeleton', 40, 8, 3, 25, '💀', 2),
('Orc', 60, 12, 5, 40, '🧟', 3),
('Dark Knight', 80, 15, 8, 60, '⚔️', 5),
('Dragon', 150, 25, 12, 150, '🐉', 8);

-- ==================
-- 7. ITEMS
-- ==================
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('potion', 'weapon', 'armor', 'gold')),
    effect_value INTEGER NOT NULL DEFAULT 0,
    sprite_icon VARCHAR(10) NOT NULL,
    description TEXT,
    rarity VARCHAR(20) DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare'))
);

-- ==================
-- 8. CHARACTER INVENTORY
-- ==================
CREATE TABLE IF NOT EXISTS character_inventory (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    equipped BOOLEAN DEFAULT FALSE,
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(character_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_character ON character_inventory(character_id);

-- Seed item definitions
INSERT INTO items (name, type, effect_value, sprite_icon, description, rarity) VALUES
('Health Potion',  'potion',  30,  '🧪', 'Restores 30 HP',           'common'),
('Greater Potion', 'potion',  75,  '⚗️',  'Restores 75 HP',           'uncommon'),
('Iron Sword',     'weapon',   5,  '⚔️',  '+5 Attack for this run',   'common'),
('Steel Sword',    'weapon',  10,  '🗡️',  '+10 Attack for this run',  'uncommon'),
('Iron Shield',    'armor',    5,  '🛡️',  '+5 Defense for this run',  'common'),
('Steel Armor',    'armor',   10,  '🥋',  '+10 Defense for this run', 'uncommon'),
('Gold Coin',      'gold',    10,  '🪙',  '10 gold',                  'common'),
('Gold Nugget',    'gold',    25,  '💰',  '25 gold',                  'uncommon')
ON CONFLICT DO NOTHING;

SELECT 'Schema with inventory created successfully!' as status;
