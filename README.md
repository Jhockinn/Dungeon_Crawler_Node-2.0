# 🏰 Dungeon Crawler 2.0

A real-time multiplayer dungeon crawler game built with **Svelte**, **Node.js/Express**, **Socket.IO**, and **PostgreSQL**.

---

## 📋 Table of Contents

- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [First-Time Setup](#first-time-setup)
- [Running the Project](#running-the-project)
- [Environment Variables](#environment-variables)
- [Game Features](#game-features)

---

## 🚀 First-Time Setup

### 1. Create the PostgreSQL database

Open a terminal and run:

```bash
psql -U postgres -c "CREATE DATABASE dungeon_crawler;"
```

### 2. Configure the server environment

Copy the example env file and fill in your values:

```bash
cd server
copy .env.example .env
```

Open `server/.env` and set at minimum:

```env
PORT=3000
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dungeon_crawler
SESSION_SECRET=any_long_random_string_here
CLIENT_URL=http://localhost:5173
```

### 3. Run the database schema

```bash
cd server
npm run db:setup
```

This creates all tables and seeds the 8 starter items (potions, weapons, armor, gold).

> If `db:setup` fails, run the SQL files manually:
> ```bash
> psql -U postgres -d dungeon_crawler -f db/schema.sql
> psql -U postgres -d dungeon_crawler -f db/email_verification.sql
> ```

### 4. Install dependencies

```bash
# Server dependencies
cd server
npm install

# Client dependencies
cd ../client
npm install
```
---

## 🎮 Game Features

### Core gameplay
- Register/Login with email verification
- Create characters (Warrior, Mage, Rogue) with persistent stats
- Procedurally generated dungeons with difficulty 1–5
- WASD / Arrow Keys to move, SPACE to attack
- Level up system with stat increases
- Must kill all monsters before you can exit

### Inventory
- Items drop from enemies (potions, weapons, armor, gold)
- Equip weapons/armor for combat bonuses
- Use potions with `E` key
- Gift items to other players by username
- Persistent inventory across sessions

### Co-op multiplayer
- **Session code** — share the code shown in the dungeon header with a friend
- **Join a friend's dungeon** — paste the code in the "Join" panel on the character select screen
- Other players shown on the grid with blue cells
- **Global chat** — talk to all online players (💬 button, bottom-right corner)
- **Party chat** — talk only to players in your dungeon session

