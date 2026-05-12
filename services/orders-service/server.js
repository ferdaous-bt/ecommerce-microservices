'use strict';

const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { Kafka } = require('kafkajs');
const db = require('./database');

// === Charger le contrat .proto ===
const PROTO_PATH = path.join(__dirname, '../../proto/orders.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true
});
const ordersProto = grpc.loadPackageDefinition(packageDefinition).orders;

// === Setup Kafka Producer ===
const kafka = new Kafka({
  clientId: 'orders-service',
  brokers: ['localhost:9092']
});
const producer = kafka.producer();

async function publishOrderCreated(order) {
  try {
    await producer.send({
      topic: 'order.created',
      messages: [{
        key: order.id,
        value: JSON.stringify({
          orderId: order.id,
          userId: order.userId,
          items: order.items,
          total: order.total
        })
      }]
    });
    console.log('[Kafka] Evenement publie : order.created pour commande ' + order.id);
  } catch (err) {
    console.error('[Kafka] Erreur publication :', err.message);
  }
}

// === Helper ===
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

// === 1. Creer une commande ===
function createOrder(call, callback) {
  const { userId, items } = call.request;

  if (!items || items.length === 0) {
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Une commande doit avoir au moins 1 item'
    });
  }

  const total = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const itemsJson = JSON.stringify(items);

  db.run(
    `INSERT INTO orders (user_id, items_json, total, status) VALUES (?, ?, ?, 'PENDING')`,
    [userId, itemsJson, total],
    function (err) {
      if (err) {
        return callback({ code: grpc.status.INTERNAL, message: err.message });
      }
      db.get(`SELECT * FROM orders WHERE id = ?`, [this.lastID], (err, row) => {
        if (err) {
          return callback({ code: grpc.status.INTERNAL, message: err.message });
        }
        const order = rowToOrder(row);
        console.log('Commande creee : id=' + row.id + ', total=' + total + ' euros');

        // Publier l'evenement Kafka (en arriere-plan, ne bloque pas la reponse)
        publishOrderCreated(order).catch(console.error);

        callback(null, order);
      });
    }
  );
}

// === 2. Recuperer ===
function getOrder(call, callback) {
  const { id } = call.request;
  db.get(`SELECT * FROM orders WHERE id = ?`, [id], (err, row) => {
    if (err) return callback({ code: grpc.status.INTERNAL, message: err.message });
    if (!row) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Commande ' + id + ' introuvable'
      });
    }
    callback(null, rowToOrder(row));
  });
}

// === 3. Lister par user ===
function listOrdersByUser(call, callback) {
  const { userId } = call.request;
  db.all(
    `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
    (err, rows) => {
      if (err) return callback({ code: grpc.status.INTERNAL, message: err.message });
      const orders = rows.map(rowToOrder);
      callback(null, { orders });
    }
  );
}

// === 4. Annuler ===
function cancelOrder(call, callback) {
  const { id } = call.request;
  db.run(
    `UPDATE orders SET status = 'CANCELLED' WHERE id = ? AND status != 'CANCELLED'`,
    [id],
    function (err) {
      if (err) return callback({ code: grpc.status.INTERNAL, message: err.message });
      if (this.changes === 0) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: 'Commande ' + id + ' introuvable ou deja annulee'
        });
      }
      db.get(`SELECT * FROM orders WHERE id = ?`, [id], (err, row) => {
        if (err) return callback({ code: grpc.status.INTERNAL, message: err.message });
        console.log('Commande annulee : id=' + id);
        callback(null, rowToOrder(row));
      });
    }
  );
}

// === Demarrer ===
async function main() {
  // Connecter le producer Kafka
  try {
    await producer.connect();
    console.log('[Kafka] Producer connecte au broker localhost:9092');
  } catch (err) {
    console.error('[Kafka] Erreur connexion producer :', err.message);
  }

  // Demarrer le serveur gRPC
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
