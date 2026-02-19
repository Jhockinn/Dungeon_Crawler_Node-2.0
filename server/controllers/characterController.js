import pool from '../config/database.js';

export const getAll = async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            'SELECT * FROM characters WHERE user_id = $1 ORDER BY last_played DESC',
            [userId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Get characters error:', error);
        res.status(500).json({ error: 'Failed to get characters' });
    }
};

export const getOne = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const result = await pool.query(
            'SELECT * FROM characters WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Character not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get character error:', error);
        res.status(500).json({ error: 'Failed to get character' });
    }
};

export const create = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { name, class: characterClass } = req.body;

        if (!name || !characterClass) {
            return res.status(400).json({ error: 'Name and class are required' });
        }

        if (!['warrior', 'mage', 'rogue'].includes(characterClass)) {
            return res.status(400).json({ error: 'Invalid class. Choose: warrior, mage, or rogue' });
        }

        let stats = { health: 100, attack: 10, defense: 5 };

        if (characterClass === 'warrior') {
            stats = { health: 150, attack: 15, defense: 10 };
        } else if (characterClass === 'mage') {
            stats = { health: 80, attack: 20, defense: 3 };
        } else if (characterClass === 'rogue') {
            stats = { health: 100, attack: 18, defense: 5 };
        }

        const result = await pool.query(`
            INSERT INTO characters
            (user_id, name, class, health, max_health, base_attack, base_defense)
            VALUES ($1, $2, $3, $4, $4, $5, $6)
            RETURNING *
        `, [userId, name, characterClass, stats.health, stats.attack, stats.defense]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create character error:', error);
        res.status(500).json({ error: 'Failed to create character' });
    }
};

export const deleteCharacter = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        await pool.query(
            'DELETE FROM characters WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        res.json({ message: 'Character deleted successfully' });
    } catch (error) {
        console.error('Delete character error:', error);
        res.status(500).json({ error: 'Failed to delete character' });
    }
};

// ── Inventory ──────────────────────────────────────────────

export const getInventory = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const charResult = await pool.query(
            'SELECT id FROM characters WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        if (charResult.rows.length === 0) {
            return res.status(404).json({ error: 'Character not found' });
        }

        const result = await pool.query(`
            SELECT ci.id, ci.item_id, ci.quantity, ci.equipped, ci.acquired_at,
                   i.name, i.type, i.effect_value, i.sprite_icon, i.description, i.rarity
            FROM character_inventory ci
            JOIN items i ON i.id = ci.item_id
            WHERE ci.character_id = $1
            ORDER BY i.type, i.rarity DESC, i.name
        `, [id]);

        res.json(result.rows);
    } catch (error) {
        console.error('Get inventory error:', error);
        res.status(500).json({ error: 'Failed to get inventory' });
    }
};

export const equipItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { inventoryId } = req.body;
        const userId = req.user.userId;

        const charResult = await pool.query(
            'SELECT id FROM characters WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        if (charResult.rows.length === 0) {
            return res.status(404).json({ error: 'Character not found' });
        }

        const invResult = await pool.query(`
            SELECT ci.*, i.type FROM character_inventory ci
            JOIN items i ON i.id = ci.item_id
            WHERE ci.id = $1 AND ci.character_id = $2
        `, [inventoryId, id]);

        if (invResult.rows.length === 0) {
            return res.status(404).json({ error: 'Inventory item not found' });
        }

        const item = invResult.rows[0];
        const newEquipped = !item.equipped;

        // Unequip others of the same type when equipping
        if (newEquipped && (item.type === 'weapon' || item.type === 'armor')) {
            await pool.query(`
                UPDATE character_inventory ci
                SET equipped = FALSE
                FROM items i
                WHERE ci.item_id = i.id
                  AND ci.character_id = $1
                  AND i.type = $2
                  AND ci.id != $3
            `, [id, item.type, inventoryId]);
        }

        await pool.query(
            'UPDATE character_inventory SET equipped = $1 WHERE id = $2',
            [newEquipped, inventoryId]
        );

        const inventoryResult = await pool.query(`
            SELECT ci.id, ci.item_id, ci.quantity, ci.equipped, ci.acquired_at,
                   i.name, i.type, i.effect_value, i.sprite_icon, i.description, i.rarity
            FROM character_inventory ci
            JOIN items i ON i.id = ci.item_id
            WHERE ci.character_id = $1
            ORDER BY i.type, i.rarity DESC, i.name
        `, [id]);

        res.json({ inventory: inventoryResult.rows, equipped: newEquipped });
    } catch (error) {
        console.error('Equip item error:', error);
        res.status(500).json({ error: 'Failed to equip item' });
    }
};

export const dropItem = async (req, res) => {
    try {
        const { id, inventoryId } = req.params;
        const userId = req.user.userId;

        const charResult = await pool.query(
            'SELECT id FROM characters WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        if (charResult.rows.length === 0) {
            return res.status(404).json({ error: 'Character not found' });
        }

        await pool.query(
            'DELETE FROM character_inventory WHERE id = $1 AND character_id = $2',
            [inventoryId, id]
        );

        res.json({ message: 'Item dropped' });
    } catch (error) {
        console.error('Drop item error:', error);
        res.status(500).json({ error: 'Failed to drop item' });
    }
};
