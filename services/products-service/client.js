'use strict';

const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// Charger le contrat
const PROTO_PATH = path.join(__dirname, '../../proto/products.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const productsProto = grpc.loadPackageDefinition(packageDefinition).products;

// Client gRPC vers le serveur sur le port 50052
const client = new productsProto.ProductService(
  'localhost:50052',
  grpc.credentials.createInsecure()
);

// TESTS en cascade
console.log('\n--- TEST 1 : Creer un produit ---');
client.createProduct(
  { name: 'iPhone 15', description: 'Smartphone Apple', price: 999.99, stock: 50 },
  (err, product) => {
    if (err) return console.error('Erreur :', err.message);
    console.log('Cree :', product);
    const productId = product.id;

    console.log('\n--- TEST 2 : Creer un 2e produit ---');
    client.createProduct(
      { name: 'AirPods Pro', description: 'Ecouteurs sans fil', price: 249.99, stock: 100 },
      (err, product2) => {
        if (err) return console.error('Erreur :', err.message);
        console.log('Cree :', product2);

        console.log('\n--- TEST 3 : Lister tous les produits ---');
        client.listProducts({}, (err, list) => {
          if (err) return console.error('Erreur :', err.message);
          console.log('Liste :', list);

          console.log('\n--- TEST 4 : Verifier le stock (besoin de 10) ---');
          client.checkStock({ productId: productId, quantity: 10 }, (err, stock) => {
            if (err) return console.error('Erreur :', err.message);
            console.log('Stock check :', stock);

            console.log('\n--- TEST 5 : Decrementer le stock de 10 ---');
            client.updateStock({ id: productId, quantity: -10 }, (err, updated) => {
              if (err) return console.error('Erreur :', err.message);
              console.log('Stock mis a jour :', updated);
            });
          });
        });
      }
    );
  }
);
