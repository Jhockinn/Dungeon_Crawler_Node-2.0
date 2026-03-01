import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
let socket = null;

function emit(event, payload) {
    if (socket) socket.emit(event, payload);
}

function on(event, cb) {
    if (socket) socket.on(event, cb);
}

export function connectSocket() {
    if (socket) return socket;
    socket = io(SOCKET_URL, { withCredentials: true });
    socket.on('error', (error) => console.error('Socket error:', error));
    return socket;
}

export function disconnectSocket() {
    if (socket) { socket.disconnect(); socket = null; }
}

export function getSocket() { return socket; }

// ── Dungeon actions ──────────────────────────────────────────
export const startDungeon     = (characterId, difficulty)             => emit('startDungeon', { characterId, difficulty });
export const movePlayer       = (sessionId, characterId, direction)   => emit('move', { sessionId, characterId, direction });
export const attackEnemy      = (sessionId, characterId, enemyId)     => emit('attack', { sessionId, characterId, enemyId });
export const leaveDungeon     = (sessionId, characterId)              => emit('leaveDungeon', { sessionId, characterId });
export const joinDungeon      = (sessionId, characterId)              => emit('joinDungeon', { sessionId, characterId });
export const useItemInDungeon = (sessionId, characterId, inventoryId) => emit('useItem', { sessionId, characterId, inventoryId });
export const equipItemSocket  = (characterId, inventoryId)            => emit('equipItem', { characterId, inventoryId });
export const sendGlobalChat   = (message)                             => emit('globalChat', { message });
export const sendPartyChat    = (sessionId, message)                  => emit('partyChat', { sessionId, message });
export const giftItem         = (characterId, inventoryId, toUsername)=> emit('giftItem', { characterId, inventoryId, toUsername });

// ── Dungeon listeners ────────────────────────────────────────
export const onDungeonReady     = (cb) => on('dungeonReady', cb);
export const onPlayerMoved      = (cb) => on('playerMoved', cb);
export const onCombatUpdate     = (cb) => on('combatUpdate', cb);
export const onEnemyDefeated    = (cb) => on('enemyDefeated', cb);
export const onEnemyEncounter   = (cb) => on('enemyEncounter', cb);
export const onPlayerDamaged    = (cb) => on('playerDamaged', cb);
export const onPlayerDied       = (cb) => on('playerDied', cb);
export const onDungeonCompleted = (cb) => on('dungeonCompleted', cb);
export const onLevelUp          = (cb) => on('levelUp', cb);
export const onItemDropped      = (cb) => on('itemDropped', cb);
export const onInventoryUpdated = (cb) => on('inventoryUpdated', cb);
export const onPlayerHealed     = (cb) => on('playerHealed', cb);
export const onExitBlocked      = (cb) => on('exitBlocked', cb);
export const onGlobalChat       = (cb) => on('globalChat', cb);
export const onPartyChat        = (cb) => on('partyChat', cb);
export const onPlayerJoined     = (cb) => on('playerJoined', cb);
export const onPlayerLeft       = (cb) => on('playerLeft', cb);
export const onExistingPlayers  = (cb) => on('existingPlayers', cb);
export const onGiftSent         = (cb) => on('giftSent', cb);
export const onGiftReceived     = (cb) => on('giftReceived', cb);
export const onGameError        = (cb) => on('error', cb);
