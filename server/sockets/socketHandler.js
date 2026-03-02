import gameSocket from './gameSocket.js';

// userId → socket  (for delivering targeted events like gift notifications)
const connectedUsers = new Map();

export function setupSockets(io) {
    io.on('connection', (socket) => {
        const userId = socket.request.session?.userId;
        if (userId) connectedUsers.set(userId, socket);

        socket.join('global');

        socket.on('globalChat', ({ message }) => {
            const username = socket.request.session?.username;
            if (!username || !message?.trim()) return;
            io.to('global').emit('globalChat', {
                username,
                message: message.trim().slice(0, 200),
                at: new Date().toISOString()
            });
        });

        gameSocket(io, socket, connectedUsers);

        socket.on('disconnect', () => {
            if (userId) connectedUsers.delete(userId);
        });
    });
}
