import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
let socket = null;

export function connectSocket() {
    if (socket) return socket;
    
    socket = io(SOCKET_URL, {
        withCredentials: true
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
    
    return socket;
}

export function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

export function getSocket() {
    return socket;
}

export function startDungeon(characterId, difficulty) {
    if (!socket) throw new Error('Socket not connected');
    socket.emit('startDungeon', { characterId, difficulty });
}

export function movePlayer(sessionId, characterId, direction) {
    if (!socket) throw new Error('Socket not connected');
    socket.emit('move', { sessionId, characterId, direction });
}

export function attackEnemy(sessionId, characterId, enemyId) {
    if (!socket) throw new Error('Socket not connected');
    socket.emit('attack', { sessionId, characterId, enemyId });
}

export function leaveDungeon(sessionId, characterId) {
    if (!socket) throw new Error('Socket not connected');
    socket.emit('leaveDungeon', { sessionId, characterId });
}

export function onDungeonReady(callback) {
    if (!socket) return;
    socket.on('dungeonReady', callback);
}

export function onPlayerMoved(callback) {
    if (!socket) return;
    socket.on('playerMoved', callback);
}

export function onCombatUpdate(callback) {
    if (!socket) return;
    socket.on('combatUpdate', callback);
}

export function onEnemyDefeated(callback) {
    if (!socket) return;
    socket.on('enemyDefeated', callback);
}

export function onEnemyEncounter(callback) {
    if (!socket) return;
    socket.on('enemyEncounter', callback);
}

export function onPlayerDamaged(callback) {
  if (!socket) return;
  socket.on('playerDamaged', callback);
}

export function onPlayerDied(callback) {
  if (!socket) return;
  socket.on('playerDied', callback);
}

export function onDungeonCompleted(callback) {
  if (!socket) return;
  socket.on('dungeonCompleted', callback);
}

export function onLevelUp(callback) {
  if (!socket) return;
  socket.on('levelUp', callback);
}

export function useItemInDungeon(sessionId, characterId, inventoryId) {
    if (!socket) throw new Error('Socket not connected');
    socket.emit('useItem', { sessionId, characterId, inventoryId });
}

export function equipItemSocket(characterId, inventoryId) {
    if (!socket) throw new Error('Socket not connected');
    socket.emit('equipItem', { characterId, inventoryId });
}

export function onItemDropped(callback) {
    if (!socket) return;
    socket.on('itemDropped', callback);
}

export function onInventoryUpdated(callback) {
    if (!socket) return;
    socket.on('inventoryUpdated', callback);
}

export function onPlayerHealed(callback) {
    if (!socket) return;
    socket.on('playerHealed', callback);
}

export function onExitBlocked(callback) {
    if (!socket) return;
    socket.on('exitBlocked', callback);
}

// ── Global chat ──────────────────────────────────────────
export function sendGlobalChat(message) {
    if (!socket) return;
    socket.emit('globalChat', { message });
}
export function onGlobalChat(callback) {
    if (!socket) return;
    socket.on('globalChat', callback);
}

// ── Party chat ───────────────────────────────────────────
export function sendPartyChat(sessionId, message) {
    if (!socket) return;
    socket.emit('partyChat', { sessionId, message });
}
export function onPartyChat(callback) {
    if (!socket) return;
    socket.on('partyChat', callback);
}

// ── Co-op join ───────────────────────────────────────────
export function joinDungeon(sessionId, characterId) {
    if (!socket) throw new Error('Socket not connected');
    socket.emit('joinDungeon', { sessionId, characterId });
}
export function onPlayerJoined(callback) {
    if (!socket) return;
    socket.on('playerJoined', callback);
}
export function onPlayerLeft(callback) {
    if (!socket) return;
    socket.on('playerLeft', callback);
}
export function onExistingPlayers(callback) {
    if (!socket) return;
    socket.on('existingPlayers', callback);
}

// ── Gift items ───────────────────────────────────────────
export function giftItem(characterId, inventoryId, toUsername) {
    if (!socket) return;
    socket.emit('giftItem', { characterId, inventoryId, toUsername });
}
export function onGiftSent(callback) {
    if (!socket) return;
    socket.on('giftSent', callback);
}
export function onGiftReceived(callback) {
    if (!socket) return;
    socket.on('giftReceived', callback);
}