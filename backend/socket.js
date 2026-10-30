const { Server } = require('socket.io');

let io = null;

const initSocket = (httpServer, clientOrigin) => {
  io = new Server(httpServer, {
    cors: {
      origin: clientOrigin || '*',
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    // Trader registers to their private room for targeted real-time updates
    socket.on('join_trader_room', (traderId) => {
      if (traderId) {
        socket.join(`trader_${traderId}`);
      }
    });

    socket.on('disconnect', () => {});
  });

  return io;
};

const getIO = () => io;

const emitDepositStatusUpdate = (traderId, data) => {
  if (io) {
    if (traderId) {
      // Emit to authenticated Trader's private room
      io.to(`trader_${traderId}`).emit('deposit_status_update', data);
      io.to(`trader_${traderId}`).emit('balance_update', data);
    }
    // Also broadcast update to admins / overview
    io.emit('crypto_deposit_updated', data);
  }
};

module.exports = {
  initSocket,
  getIO,
  emitDepositStatusUpdate,
};

