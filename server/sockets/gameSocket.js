import { generateMaze } from '../utils/mazeGenerator.js';
import pool from '../config/database.js';

const activeDungeons = new Map();

// ── Item drop helper ───────────────────────────────────────
async function rollItemDrop(characterId, difficulty) {
    const dropChance = 0.4 + difficulty * 0.04;
    if (Math.random() > dropChance) return null;

    const rarity = Math.random() < 0.7 ? 'common' : 'uncommon';
    const itemResult = await pool.query(
        `SELECT * FROM items WHERE rarity = $1 ORDER BY RANDOM() LIMIT 1`,
        [rarity]
    );
    if (itemResult.rows.length === 0) return null;

    const item = itemResult.rows[0];

    await pool.query(`
        INSERT INTO character_inventory (character_id, item_id, quantity)
        VALUES ($1, $2, 1)
        ON CONFLICT (character_id, item_id)
        DO UPDATE SET quantity = character_inventory.quantity + 1
    `, [characterId, item.id]);

    const invRow = await pool.query(
        `SELECT ci.id, ci.quantity FROM character_inventory ci WHERE ci.character_id = $1 AND ci.item_id = $2`,
        [characterId, item.id]
    );

    return { item, inventoryId: invRow.rows[0].id, quantity: invRow.rows[0].quantity };
}

// ── Load equipped bonuses ──────────────────────────────────
async function getEquippedBonuses(characterId) {
    const result = await pool.query(`
        SELECT i.type, i.effect_value
        FROM character_inventory ci
        JOIN items i ON i.id = ci.item_id
        WHERE ci.character_id = $1 AND ci.equipped = TRUE AND i.type IN ('weapon','armor')
    `, [characterId]);

    let bonusAttack = 0;
    let bonusDefense = 0;
    for (const row of result.rows) {
        if (row.type === 'weapon') bonusAttack += row.effect_value;
        if (row.type === 'armor')  bonusDefense += row.effect_value;
    }
    return { bonusAttack, bonusDefense };
}

// ── Fetch full inventory for a character ──────────────────
async function fetchInventory(characterId) {
    const result = await pool.query(`
        SELECT ci.id, ci.item_id, ci.quantity, ci.equipped,
               i.name, i.type, i.effect_value, i.sprite_icon, i.description, i.rarity
        FROM character_inventory ci
        JOIN items i ON i.id = ci.item_id
        WHERE ci.character_id = $1
        ORDER BY i.type, i.rarity DESC, i.name
    `, [characterId]);
    return result.rows;
}

function calculateXPForLevel(level) {
    return Math.floor(100 * Math.pow(level, 1.5));
}

function calculateEnemyXP(enemyName, difficulty) {
    const baseXP = {
        'Goblin': 15,
        'Skeleton': 25,
        'Orc': 40
    };
    return Math.floor((baseXP[enemyName] || 10) * (1 + difficulty * 0.2));
}

async function checkLevelUp(characterId) {
    const result = await pool.query(
        'SELECT level, experience FROM characters WHERE id = $1',
        [characterId]
    );
    
    const { level, experience } = result.rows[0];
    const requiredXP = calculateXPForLevel(level);

    if (experience >= requiredXP) {
        const newLevel = level + 1;
        const remainingXP = experience - requiredXP;

        const healthIncrease = 10;
        const attackIncrease = 2;
        const defenseIncrease = 1;

        await pool.query(`
            UPDATE characters 
            SET 
                level = $1,
                experience = $2,
                max_health = max_health + $3,
                health = max_health + $3,
                base_attack = base_attack + $4,
                base_defense = base_defense + $5
            WHERE id = $6
        `, [newLevel, remainingXP, healthIncrease, attackIncrease, defenseIncrease, characterId]);
        
        return {
            leveledUp: true,
            newLevel,
            remainingXP,
            stats: {
                healthIncrease,
                attackIncrease,
                defenseIncrease
            }
        };
    }

    return { leveledUp: false };
}

function spawnEnemies(maze, difficulty) {
    const enemies = [];
    const enemyCount = 3 + (difficulty * 2);

    const walkablePositions = [];
    for (let y = 0; y < maze.length; y++) {
        for (let x = 0; x < maze[y].length; x++) {
            if (maze[y][x] === 0 && !(x === 1 && y === 1)) {
                walkablePositions.push({ x, y });
            }
        }
    }

    const enemyTypes = [
        { name: 'Goblin', health: 30, attack: 5, sprite: '👹' },
        { name: 'Skeleton', health: 40, attack: 8, sprite: '💀' },
        { name: 'Orc', health: 60, attack: 12, sprite: '🧟' }
    ];

    for (let i = 0; i < Math.min(enemyCount, walkablePositions.length); i++) {
        const randomIndex = Math.floor(Math.random() * walkablePositions.length);
        const pos = walkablePositions.splice(randomIndex, 1)[0];
        const typeIndex = Math.min(Math.floor(difficulty / 2), enemyTypes.length - 1);
        const enemyType = enemyTypes[typeIndex];

        enemies.push({
            id: `enemy_${i}`,
            ...enemyType,
            maxHealth: enemyType.health,
            position: pos,
            isAlive: true
        });
    }

    return enemies;
}

export default function (io, socket, connectedUsers = new Map()) {

    async function verifyCharacterOwnership(characterId, userId) {
        const result = await pool.query(
            'SELECT user_id FROM characters WHERE id = $1',
            [characterId]
        );

        if (result.rows.length === 0) {
            return { valid: false, error: 'Character not found' };
        }

        if (result.rows[0].user_id !== userId) {
            return { valid: false, error: 'Unauthorized: This character does not belong to you' };
        }

        return { valid: true };
    }

    socket.on('startDungeon', async ({ characterId, difficulty }) => {
        try {
            const userId = socket.request.session?.userId;
            if (!userId) {
                return socket.emit('error', { message: 'Not authenticated. Please login.' });
            }

            const charResult = await pool.query(
                'SELECT * FROM characters WHERE id = $1',
                [characterId]
            );

            if (charResult.rows.length === 0) {
                return socket.emit('error', { message: 'Character not found' });
            }

            const character = charResult.rows[0];

            if (character.user_id !== userId) {
                return socket.emit('error', { message: 'Unauthorized: This character does not belong to you' });
            }
            const mazeSize = 15 + (difficulty * 2);
            const maze = generateMaze(mazeSize, mazeSize);

            const sessionResult = await pool.query(`
                INSERT INTO dungeon_sessions 
                (character_id, difficulty, seed, width, height)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            `, [characterId, difficulty, maze.seed, mazeSize, mazeSize]);

            const sessionId = sessionResult.rows[0].id;
            const enemies = spawnEnemies(maze.layout, difficulty);
            const exitX = mazeSize - 2;
            const exitY = mazeSize - 2;
            const exitPoint = { x: exitX, y: exitY };

            activeDungeons.set(sessionId, {
                maze: maze.layout,
                enemies: enemies,
                players: new Map(),
                difficulty: difficulty
            });

            const bonuses = await getEquippedBonuses(characterId);
            activeDungeons.get(sessionId).players.set(characterId, {
                position: { x: 1, y: 1 },
                health: character.health,
                socketId: socket.id,
                bonusAttack: bonuses.bonusAttack,
                bonusDefense: bonuses.bonusDefense
            });

            socket.join(`dungeon_${sessionId}`);

            const startInventory = await fetchInventory(characterId);
            const startBonuses = activeDungeons.get(sessionId).players.get(characterId);

            socket.emit('dungeonReady', {
                sessionId,
                maze: maze.layout,
                enemies: enemies,
                spawnPoint: { x: 1, y: 1 },
                exitPoint: exitPoint,
                inventory: startInventory,
                character: {
                    id: character.id,
                    name: character.name,
                    class: character.class,
                    level: character.level,
                    experience: character.experience,
                    requiredXP: calculateXPForLevel(character.level),
                    health: character.health,
                    maxHealth: character.max_health,
                    attack: character.base_attack,
                    defense: character.base_defense,
                    bonusAttack: startBonuses.bonusAttack,
                    bonusDefense: startBonuses.bonusDefense
                }
            });
        } catch (error) {
            console.error('Start dungeon error:', error);
            socket.emit('error', { message: 'Failed to start dungeon' });
        }
    });

    socket.on('move', async ({ sessionId, characterId, direction }) => {
        try {
            const userId = socket.request.session?.userId;
            if (!userId) {
                return socket.emit('error', { message: 'Not authenticated' });
            }

            const verification = await verifyCharacterOwnership(characterId, userId);
            if (!verification.valid) {
                return socket.emit('error', { message: verification.error });
            }

            const dungeon = activeDungeons.get(sessionId);

            if (!dungeon) {
                return;
            }

            const player = dungeon.players.get(characterId);

            if (!player) {
                return;
            }

            const { x, y } = player.position;
            let newX = x;
            let newY = y;

            switch (direction) {
                case 'up':    newY = y - 1; break;
                case 'down':  newY = y + 1; break;
                case 'left':  newX = x - 1; break;
                case 'right': newX = x + 1; break;
            }

            if (dungeon.maze[newY] && dungeon.maze[newY][newX] === 0) {
                player.position = { x: newX, y: newY };

                io.to(`dungeon_${sessionId}`).emit('playerMoved', {
                    characterId,
                    position: { x: newX, y: newY }
                });

                const enemy = dungeon.enemies.find(e =>
                    e.isAlive && e.position.x === newX && e.position.y === newY
                );

                if (enemy) {
                    socket.emit('enemyEncounter', { enemy });
                }

                const exitX = dungeon.maze.length - 2;
                const exitY = dungeon.maze[0].length - 2;

                if (newX === exitX && newY === exitY) {
                    const aliveEnemies = dungeon.enemies.filter(e => e.isAlive);
                    if (aliveEnemies.length > 0) {
                        socket.emit('exitBlocked', {
                            message: `Defeat all monsters first! ${aliveEnemies.length} remaining.`,
                            remaining: aliveEnemies.length
                        });
                    } else {
                        await pool.query(`
                            UPDATE characters
                            SET health = max_health
                            WHERE id = $1
                        `, [characterId]);

                        const charResult = await pool.query(
                            'SELECT health, max_health FROM characters WHERE id = $1',
                            [characterId]
                        );

                        await pool.query(`
                            UPDATE dungeon_sessions
                            SET ended_at = NOW(), is_active = FALSE
                            WHERE id = $1
                        `, [sessionId]);

                        socket.emit('dungeonCompleted', {
                            sessionId,
                            message: 'Victory! You escaped the dungeon!',
                            healed: true,
                            health: charResult.rows[0].health,
                            maxHealth: charResult.rows[0].max_health
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Move error:', error);
        }
    });

    socket.on('attack', async ({ sessionId, characterId, enemyId }) => {
        try {
            const userId = socket.request.session?.userId;
            if (!userId) {
                return socket.emit('error', { message: 'Not authenticated' });
            }

            const verification = await verifyCharacterOwnership(characterId, userId);
            if (!verification.valid) {
                return socket.emit('error', { message: verification.error });
            }

            const dungeon = activeDungeons.get(sessionId);
            if (!dungeon) return;

            const enemy = dungeon.enemies.find(e => e.id === enemyId);
            if (!enemy || !enemy.isAlive) return;

            const charResult = await pool.query(
                'SELECT base_attack FROM characters WHERE id = $1',
                [characterId]
            );

            if (charResult.rows.length === 0) return;

            const character = charResult.rows[0];
            const player = dungeon.players.get(characterId);
            const effectiveAttack = character.base_attack + (player ? player.bonusAttack : 0);
            const damage = Math.floor(effectiveAttack * (0.8 + Math.random() * 0.4));
            enemy.health -= damage;

            if (enemy.health <= 0) {
                enemy.health = 0;
                enemy.isAlive = false;

                const xpGained = calculateEnemyXP(enemy.name, dungeon.difficulty);

                await pool.query(`
                    UPDATE characters 
                    SET experience = experience + $1
                    WHERE id = $2
                `, [xpGained, characterId]);

                const levelUpResult = await checkLevelUp(characterId);

                await pool.query(`
                    UPDATE dungeon_sessions 
                    SET enemies_killed = enemies_killed + 1
                    WHERE id = $1
                `, [sessionId]);

                const charStats = await pool.query(`
                    SELECT level, experience, max_health, base_attack, base_defense 
                    FROM characters WHERE id = $1
                `, [characterId]);

                const char = charStats.rows[0];
                const requiredXP = calculateXPForLevel(char.level);

                io.to(`dungeon_${sessionId}`).emit('enemyDefeated', {
                    enemyId,
                    killedBy: characterId,
                    xpGained,
                    currentXP: char.experience,
                    requiredXP,
                    level: char.level
                });

                // Roll for item drop
                const drop = await rollItemDrop(characterId, dungeon.difficulty);
                if (drop) {
                    socket.emit('itemDropped', {
                        inventoryId: drop.inventoryId,
                        quantity: drop.quantity,
                        item: {
                            id: drop.item.id,
                            name: drop.item.name,
                            type: drop.item.type,
                            effectValue: drop.item.effect_value,
                            spriteIcon: drop.item.sprite_icon,
                            description: drop.item.description,
                            rarity: drop.item.rarity
                        }
                    });
                }

                if (levelUpResult.leveledUp) {
                    socket.emit('levelUp', {
                        newLevel: levelUpResult.newLevel,
                        stats: levelUpResult.stats,
                        currentXP: levelUpResult.remainingXP,
                        requiredXP: calculateXPForLevel(levelUpResult.newLevel),
                        maxHealth: char.max_health,
                        attack: char.base_attack,
                        defense: char.base_defense
                    });
                }
            } else {
                io.to(`dungeon_${sessionId}`).emit('combatUpdate', {
                    enemyId,
                    damage,
                    health: enemy.health
                });

                const player = dungeon.players.get(characterId);
                if (player) {
                    const rawDamage = Math.floor(enemy.attack * (0.8 + Math.random() * 0.4));
                    const enemyDamage = Math.max(1, rawDamage - (player.bonusDefense || 0));
                    player.health -= enemyDamage;

                    await pool.query(
                        'UPDATE characters SET health = GREATEST(health - $1, 0) WHERE id = $2',
                        [enemyDamage, characterId]
                    );

                    const charResult = await pool.query(
                        'SELECT health, max_health FROM characters WHERE id = $1',
                        [characterId]
                    );

                    const updatedHealth = charResult.rows[0].health;

                    io.to(`dungeon_${sessionId}`).emit('playerDamaged', {
                        characterId,
                        damage: enemyDamage,
                        health: updatedHealth,
                        maxHealth: charResult.rows[0].max_health,
                        enemyName: enemy.name
                    });

                    if (updatedHealth <= 0) {
                        await pool.query(`
                            UPDATE characters 
                            SET health = max_health
                            WHERE id = $1
                        `, [characterId]);

                        const healedChar = await pool.query(
                            'SELECT health, max_health FROM characters WHERE id = $1',
                            [characterId]
                        );

                        await pool.query(`
                            UPDATE dungeon_sessions 
                            SET ended_at = NOW(), is_active = FALSE
                            WHERE id = $1
                        `, [sessionId]);

                        dungeon.players.delete(characterId);
                        if (dungeon.players.size === 0) {
                            activeDungeons.delete(sessionId);
                        }

                        socket.emit('playerDied', {
                            characterId,
                            message: 'You have been defeated!',
                            healed: true,
                            health: healedChar.rows[0].health,
                            maxHealth: healedChar.rows[0].max_health
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Attack error:', error);
        }
    });

    socket.on('leaveDungeon', async ({ sessionId, characterId }) => {
        try {
            const userId = socket.request.session?.userId;
            if (!userId) {
                return socket.emit('error', { message: 'Not authenticated' });
            }

            const verification = await verifyCharacterOwnership(characterId, userId);
            if (!verification.valid) {
                return socket.emit('error', { message: verification.error });
            }

            const dungeon = activeDungeons.get(sessionId);
            if (dungeon) {
                const aliveEnemies = dungeon.enemies.filter(e => e.isAlive);
                if (aliveEnemies.length > 0) {
                    return socket.emit('exitBlocked', {
                        message: `Defeat all monsters first! ${aliveEnemies.length} remaining.`,
                        remaining: aliveEnemies.length
                    });
                }

                dungeon.players.delete(characterId);
                if (dungeon.players.size === 0) {
                    activeDungeons.delete(sessionId);
                }
            }

            await pool.query(`
                UPDATE characters
                SET health = max_health
                WHERE id = $1
            `, [characterId]);

            await pool.query(`
                UPDATE dungeon_sessions 
                SET ended_at = NOW(), is_active = FALSE
                WHERE id = $1
            `, [sessionId]);

            socket.leave(`dungeon_${sessionId}`);
        } catch (error) {
            console.error('Leave dungeon error:', error);
        }
    });

    // ── useItem ──────────────────────────────────────────────
    socket.on('useItem', async ({ sessionId, characterId, inventoryId }) => {
        try {
            const userId = socket.request.session?.userId;
            if (!userId) return socket.emit('error', { message: 'Not authenticated' });

            const verification = await verifyCharacterOwnership(characterId, userId);
            if (!verification.valid) return socket.emit('error', { message: verification.error });

            // Fetch item details
            const invResult = await pool.query(`
                SELECT ci.id, ci.quantity, i.type, i.effect_value, i.name, i.sprite_icon
                FROM character_inventory ci
                JOIN items i ON i.id = ci.item_id
                WHERE ci.id = $1 AND ci.character_id = $2
            `, [inventoryId, characterId]);

            if (invResult.rows.length === 0) {
                return socket.emit('error', { message: 'Item not found in inventory' });
            }

            const inv = invResult.rows[0];

            if (inv.type !== 'potion') {
                return socket.emit('error', { message: 'Only potions can be used this way' });
            }

            // Apply heal
            const charResult = await pool.query(
                'SELECT health, max_health FROM characters WHERE id = $1',
                [characterId]
            );
            const { health, max_health } = charResult.rows[0];
            const newHealth = Math.min(health + inv.effect_value, max_health);

            await pool.query(
                'UPDATE characters SET health = $1 WHERE id = $2',
                [newHealth, characterId]
            );

            // Decrement or remove from inventory
            if (inv.quantity > 1) {
                await pool.query(
                    'UPDATE character_inventory SET quantity = quantity - 1 WHERE id = $1',
                    [inventoryId]
                );
            } else {
                await pool.query(
                    'DELETE FROM character_inventory WHERE id = $1',
                    [inventoryId]
                );
            }

            const updatedInventory = await fetchInventory(characterId);

            socket.emit('playerHealed', {
                characterId,
                health: newHealth,
                maxHealth: max_health,
                healAmount: newHealth - health,
                itemUsed: { name: inv.name, spriteIcon: inv.sprite_icon }
            });

            socket.emit('inventoryUpdated', { inventory: updatedInventory });

            // Also update in-memory dungeon player health if in a session
            if (sessionId) {
                const dungeon = activeDungeons.get(sessionId);
                if (dungeon) {
                    const player = dungeon.players.get(characterId);
                    if (player) player.health = newHealth;
                }
            }
        } catch (error) {
            console.error('Use item error:', error);
            socket.emit('error', { message: 'Failed to use item' });
        }
    });

    // ── equipItem (toggle equip via socket) ──────────────────
    socket.on('equipItem', async ({ characterId, inventoryId }) => {
        try {
            const userId = socket.request.session?.userId;
            if (!userId) return socket.emit('error', { message: 'Not authenticated' });

            const verification = await verifyCharacterOwnership(characterId, userId);
            if (!verification.valid) return socket.emit('error', { message: verification.error });

            const invResult = await pool.query(`
                SELECT ci.*, i.type FROM character_inventory ci
                JOIN items i ON i.id = ci.item_id
                WHERE ci.id = $1 AND ci.character_id = $2
            `, [inventoryId, characterId]);

            if (invResult.rows.length === 0) {
                return socket.emit('error', { message: 'Inventory item not found' });
            }

            const item = invResult.rows[0];
            const newEquipped = !item.equipped;

            if (newEquipped && (item.type === 'weapon' || item.type === 'armor')) {
                await pool.query(`
                    UPDATE character_inventory ci
                    SET equipped = FALSE
                    FROM items i
                    WHERE ci.item_id = i.id
                      AND ci.character_id = $1
                      AND i.type = $2
                      AND ci.id != $3
                `, [characterId, item.type, inventoryId]);
            }

            await pool.query(
                'UPDATE character_inventory SET equipped = $1 WHERE id = $2',
                [newEquipped, inventoryId]
            );

            const updatedInventory = await fetchInventory(characterId);

            // Update active dungeon bonus if player is currently in one
            for (const [, dungeon] of activeDungeons) {
                const player = dungeon.players.get(characterId);
                if (player) {
                    const bonuses = await getEquippedBonuses(characterId);
                    player.bonusAttack = bonuses.bonusAttack;
                    player.bonusDefense = bonuses.bonusDefense;
                    break;
                }
            }

            socket.emit('inventoryUpdated', { inventory: updatedInventory });
        } catch (error) {
            console.error('Equip item error:', error);
            socket.emit('error', { message: 'Failed to equip item' });
        }
    });

    // ── Party chat ───────────────────────────────────────────
    socket.on('partyChat', ({ sessionId, message }) => {
        const username = socket.request.session?.username;
        if (!username || !message?.trim() || !sessionId) return;
        const dungeon = activeDungeons.get(sessionId);
        if (!dungeon) return;
        io.to(`dungeon_${sessionId}`).emit('partyChat', {
            username,
            message: message.trim().slice(0, 200),
            at: new Date().toISOString()
        });
    });

    // ── joinDungeon ──────────────────────────────────────────
    socket.on('joinDungeon', async ({ sessionId, characterId }) => {
        try {
            const userId = socket.request.session?.userId;
            if (!userId) return socket.emit('error', { message: 'Not authenticated' });

            const verification = await verifyCharacterOwnership(characterId, userId);
            if (!verification.valid) return socket.emit('error', { message: verification.error });

            const dungeon = activeDungeons.get(sessionId);
            if (!dungeon) return socket.emit('error', { message: 'Dungeon not found. Check your code.' });

            // Verify session is still active in DB
            const sessionResult = await pool.query(
                'SELECT id FROM dungeon_sessions WHERE id = $1 AND is_active = TRUE',
                [sessionId]
            );
            if (sessionResult.rows.length === 0) {
                return socket.emit('error', { message: 'That dungeon session has ended.' });
            }

            const charResult = await pool.query('SELECT * FROM characters WHERE id = $1', [characterId]);
            if (charResult.rows.length === 0) return socket.emit('error', { message: 'Character not found' });
            const character = charResult.rows[0];

            const bonuses = await getEquippedBonuses(characterId);
            dungeon.players.set(characterId, {
                position: { x: 1, y: 1 },
                health: character.health,
                socketId: socket.id,
                bonusAttack: bonuses.bonusAttack,
                bonusDefense: bonuses.bonusDefense
            });

            socket.join(`dungeon_${sessionId}`);

            const inventory = await fetchInventory(characterId);

            // Send full dungeon state to the joining player
            socket.emit('dungeonReady', {
                sessionId,
                maze: dungeon.maze,
                enemies: dungeon.enemies,
                spawnPoint: { x: 1, y: 1 },
                exitPoint: {
                    x: dungeon.maze[0].length - 2,
                    y: dungeon.maze.length - 2
                },
                inventory,
                character: {
                    id: character.id,
                    name: character.name,
                    class: character.class,
                    level: character.level,
                    experience: character.experience,
                    requiredXP: calculateXPForLevel(character.level),
                    health: character.health,
                    maxHealth: character.max_health,
                    attack: character.base_attack,
                    defense: character.base_defense,
                    bonusAttack: bonuses.bonusAttack,
                    bonusDefense: bonuses.bonusDefense
                }
            });

            // Notify existing players that someone joined
            socket.to(`dungeon_${sessionId}`).emit('playerJoined', {
                characterId: character.id,
                characterName: character.name,
                characterClass: character.class,
                position: { x: 1, y: 1 }
            });

            // Send existing players' positions to the new joiner
            const otherPlayers = [];
            for (const [cId, pData] of dungeon.players) {
                if (cId !== characterId) {
                    // Fetch name/class for each other player
                    const otherChar = await pool.query(
                        'SELECT id, name, class FROM characters WHERE id = $1', [cId]
                    );
                    if (otherChar.rows.length > 0) {
                        otherPlayers.push({
                            characterId: cId,
                            characterName: otherChar.rows[0].name,
                            characterClass: otherChar.rows[0].class,
                            position: pData.position
                        });
                    }
                }
            }
            if (otherPlayers.length > 0) {
                socket.emit('existingPlayers', otherPlayers);
            }
        } catch (error) {
            console.error('Join dungeon error:', error);
            socket.emit('error', { message: 'Failed to join dungeon' });
        }
    });

    // ── giftItem ─────────────────────────────────────────────
    socket.on('giftItem', async ({ characterId, inventoryId, toUsername }) => {
        try {
            const userId = socket.request.session?.userId;
            const fromUsername = socket.request.session?.username;
            if (!userId) return socket.emit('error', { message: 'Not authenticated' });

            const verification = await verifyCharacterOwnership(characterId, userId);
            if (!verification.valid) return socket.emit('error', { message: verification.error });

            // Fetch the inventory item
            const invResult = await pool.query(`
                SELECT ci.id, ci.quantity, ci.item_id,
                       i.name, i.type, i.sprite_icon, i.effect_value, i.description, i.rarity
                FROM character_inventory ci
                JOIN items i ON i.id = ci.item_id
                WHERE ci.id = $1 AND ci.character_id = $2
            `, [inventoryId, characterId]);

            if (invResult.rows.length === 0) {
                return socket.emit('error', { message: 'Item not found in your inventory' });
            }

            const inv = invResult.rows[0];

            // Find recipient user + their most recently played character
            const recipientResult = await pool.query(`
                SELECT u.id AS user_id, c.id AS character_id
                FROM users u
                JOIN characters c ON c.user_id = u.id
                WHERE LOWER(u.username) = LOWER($1)
                ORDER BY c.last_played DESC
                LIMIT 1
            `, [toUsername.trim()]);

            if (recipientResult.rows.length === 0) {
                return socket.emit('error', { message: `Player "${toUsername}" not found` });
            }

            const recipient = recipientResult.rows[0];

            if (recipient.user_id === userId) {
                return socket.emit('error', { message: 'You cannot gift items to yourself' });
            }

            // Remove from sender
            if (inv.quantity > 1) {
                await pool.query(
                    'UPDATE character_inventory SET quantity = quantity - 1 WHERE id = $1',
                    [inventoryId]
                );
            } else {
                await pool.query('DELETE FROM character_inventory WHERE id = $1', [inventoryId]);
            }

            // Add to recipient (upsert)
            await pool.query(`
                INSERT INTO character_inventory (character_id, item_id, quantity)
                VALUES ($1, $2, 1)
                ON CONFLICT (character_id, item_id)
                DO UPDATE SET quantity = character_inventory.quantity + 1
            `, [recipient.character_id, inv.item_id]);

            const updatedInventory = await fetchInventory(characterId);

            socket.emit('giftSent', {
                inventoryId,
                toUsername,
                itemName: inv.name,
                itemSpriteIcon: inv.sprite_icon,
                inventory: updatedInventory
            });

            // Notify recipient if online
            const recipientSocket = connectedUsers.get(recipient.user_id);
            if (recipientSocket) {
                recipientSocket.emit('giftReceived', {
                    fromUsername,
                    itemName: inv.name,
                    itemSpriteIcon: inv.sprite_icon,
                    itemType: inv.type,
                    itemEffectValue: inv.effect_value,
                    itemDescription: inv.description,
                    itemRarity: inv.rarity
                });
            }
        } catch (error) {
            console.error('Gift item error:', error);
            socket.emit('error', { message: 'Failed to send gift' });
        }
    });

    // Emit playerLeft when socket disconnects from a dungeon
    socket.on('disconnect', () => {
        for (const [sessionId, dungeon] of activeDungeons) {
            for (const [cId, pData] of dungeon.players) {
                if (pData.socketId === socket.id) {
                    dungeon.players.delete(cId);
                    socket.to(`dungeon_${sessionId}`).emit('playerLeft', { characterId: cId });
                    if (dungeon.players.size === 0) activeDungeons.delete(sessionId);
                    return;
                }
            }
        }
    });
};