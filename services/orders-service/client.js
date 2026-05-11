'use strict';

const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = path.join(__dirname, '../../proto/orders.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const ordersProto = grpc.loadPackageDefinition(packageDefinition).orders;

const client = new ordersProto.OrderService(
  'localhost:50053',
  grpc.credentials.createInsecure()
);

// TESTS en cascade

console.log('\n--- TEST 1 : Creer une commande avec 2 items ---');
client.createOrder(
  {
    userId: '1',
    items: [
      { productId: 'iphone-15', quantity: 2, unitPrice: 999.99 },
      { productId: 'airpods-pro', quantity: 1, unitPrice: 249.99 }
    ]
  },
  (err, order) => {
    if (err) return console.error('Erreur :', err.message);
    console.log('Cree :', JSON.stringify(order, null, 2));
    const orderId = order.id;

    console.log('\n--- TEST 2 : Recuperer la commande ---');
    client.getOrder({ id: orderId }, (err, found) => {
      if (err) return console.error('Erreur :', err.message);
      console.log('Trouve :', JSON.stringify(found, null, 2));

      console.log('\n--- TEST 3 : Creer une 2e commande pour le meme user ---');
      client.createOrder(
        {
          userId: '1',
          items: [
            { productId: 'macbook-m3', quantity: 1, unitPrice: 2499.99 }
          ]
        },
        (err, order2) => {
          if (err) return console.error('Erreur :', err.message);
          console.log('Cree :', JSON.stringify(order2, null, 2));

          console.log('\n--- TEST 4 : Lister les commandes du user 1 ---');
          client.listOrdersByUser({ userId: '1' }, (err, list) => {
            if (err) return console.error('Erreur :', err.message);
            console.log('Commandes du user 1 :', JSON.stringify(list, null, 2));

            console.log('\n--- TEST 5 : Annuler la 1ere commande ---');
            client.cancelOrder({ id: orderId }, (err, cancelled) => {
              if (err) return console.error('Erreur :', err.message);
              console.log('Annulee :', JSON.stringify(cancelled, null, 2));
            });
          });
        }
      );
    });
  }
);
