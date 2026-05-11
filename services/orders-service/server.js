'use strict';

const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const db = require('./database');

// Charger le contrat .proto
const PROTO_PATH = path.join(__dirname, '../../proto/orders.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const ordersProto = grpc.loadPackageDefinition(packageDefinition).orders;

// Helper : transformer une ligne SQL en format gRPC
function rowToOrder(row) {
  return {
    id: String(row.id),
    userId: row.user_id,
    items: JSON.parse(row.items_json),
    total: row.total,
    status: row.status,
    createdAt: row.created_at
  };
}

// 1. Creer une commande
function createOrder(call, callback) {
  const { userId, items } = call.request;

  if (!items || items.length === 0) {
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Une commande doit avoir au moins 1 item'
    });
  }

  // Calculer le total : somme de (quantite * prix unitaire) pour chaque item
  const total = items.reduce((sum, item) => {
    return sum + (item.quantity * item.unitPrice);
  }, 0);

  const itemsJson = JSON.stringify(items);

  db.run(
    `INSERT INTO orders (user_id, items_json, total, status) VALUES (?, ?, ?, 'PENDING')`,
    [userId, itemsJson, total],
    function (err) {
      if (err) {
        return callback({ code: grpc.status.INTERNAL, message: err.message });
      }
      // Recuperer la ligne inseree pour la renvoyer complete
      db.get(`SELECT * FROM orders WHERE id = ?`, [this.lastID], (err, row) => {
        if (err) {
          return callback({ code: grpc.status.INTERNAL, message: err.message });
        }
        console.log('Commande creee : id=' + row.id + ', total=' + total + ' euros');
        callback(null, rowToOrder(row));
      });
    }
  );
}

// 2. Recuperer une commande
function getOrder(call, callback) {
  const { id } = call.request;

  db.get(`SELECT * FROM orders WHERE id = ?`, [id], (err, row) => {
    if (err) {
      return callback({ code: grpc.status.INTERNAL, message: err.message });
    }
    if (!row) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Commande ' + id + ' introuvable'
      });
    }
    callback(null, rowToOrder(row));
  });
}

// 3. Lister les commandes d'un utilisateur
function listOrdersByUser(call, callback) {
  const { userId } = call.request;

  db.all(
    `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        return callback({ code: grpc.status.INTERNAL, message: err.message });
      }
      const orders = rows.map(rowToOrder);
      callback(null, { orders });
    }
  );
}

// 4. Annuler une commande
function cancelOrder(call, callback) {
  const { id } = call.request;

  db.run(
    `UPDATE orders SET status = 'CANCELLED' WHERE id = ? AND status != 'CANCELLED'`,
    [id],
    function (err) {
      if (err) {
        return callback({ code: grpc.status.INTERNAL, message: err.message });
      }
      if (this.changes === 0) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: 'Commande ' + id + ' introuvable ou deja annulee'
        });
      }
      db.get(`SELECT * FROM orders WHERE id = ?`, [id], (err, row) => {
        if (err) {
          return callback({ code: grpc.status.INTERNAL, message: err.message });
        }
        console.log('Commande annulee : id=' + id);
        callback(null, rowToOrder(row));
      });
    }
  );
}

// Demarrer le serveur gRPC
function main() {
  const server = new grpc.Server();
  server.addService(ordersProto.OrderService.service, {
    createOrder,
    getOrder,
    listOrdersByUser,
    cancelOrder
  });

  server.bindAsync(
    '0.0.0.0:50053',
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        console.error('Erreur de demarrage :', err);
        return;
      }
      console.log('Serveur Orders gRPC demarre sur le port ' + port);
    }
  );
}

main();
