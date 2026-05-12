'use strict';

const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { Kafka } = require('kafkajs');
const dbPromise = require('./database');

// === Charger le contrat .proto ===
const PROTO_PATH = path.join(__dirname, '../../proto/products.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true
});
const productsProto = grpc.loadPackageDefinition(packageDefinition).products;

// === Setup Kafka Consumer ===
const kafka = new Kafka({
  clientId: 'products-service',
  brokers: ['localhost:9092']
});
const consumer = kafka.consumer({ groupId: 'products-stock-management' });

// === Helpers ===
function docToProduct(doc) {
  const json = doc.toJSON();
  return {
    id: json.id,
    name: json.name,
    description: json.description || '',
    price: json.price,
    stock: json.stock
  };
}

// Helper interne pour décrémenter le stock (utilisé par Kafka)
async function decrementProductStock(productId, quantityToRemove) {
  const { products, persistProducts } = await dbPromise;
  const doc = await products.findOne(productId).exec();

  if (!doc) {
    console.log('[Kafka] Produit ' + productId + ' introuvable, on ignore');
    return;
  }

  const newStock = doc.stock - quantityToRemove;
  if (newStock < 0) {
    console.log('[Kafka] Stock insuffisant pour ' + doc.name + ' (' + doc.stock + ' restants, demande de ' + quantityToRemove + ')');
    return;
  }

  await doc.incrementalPatch({ stock: newStock });
  await persistProducts(products);
  console.log('[Kafka] Stock decremente AUTO : ' + doc.name + ' = ' + newStock);
}

// === Consumer Kafka : ecoute "order.created" ===
async function setupKafkaConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'order.created', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        console.log('[Kafka] Reception order.created pour commande ' + event.orderId);

        for (const item of event.items) {
          await decrementProductStock(item.productId, item.quantity);
        }
      } catch (err) {
        console.error('[Kafka] Erreur traitement message :', err.message);
      }
    }
  });

  console.log('[Kafka] Consumer connecte et abonne a order.created');
}

// === Fonctions gRPC ===

async function createProduct(call, callback) {
  try {
    const { products, persistProducts, createId } = await dbPromise;
    const { name, description, price, stock } = call.request;
    const newProduct = { id: createId(), name, description: description || '', price, stock };
    const inserted = await products.insert(newProduct);
    await persistProducts(products);
    console.log('Produit cree : ' + name + ' (id=' + newProduct.id + ')');
    callback(null, docToProduct(inserted));
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

async function getProduct(call, callback) {
  try {
    const { products } = await dbPromise;
    const { id } = call.request;
    const doc = await products.findOne(id).exec();
    if (!doc) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Produit ' + id + ' introuvable'
      });
    }
    callback(null, docToProduct(doc));
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

async function listProducts(call, callback) {
  try {
    const { products } = await dbPromise;
    const docs = await products.find().exec();
    callback(null, { products: docs.map(docToProduct) });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

async function updateStock(call, callback) {
  try {
    const { products, persistProducts } = await dbPromise;
    const { id, quantity } = call.request;
    const doc = await products.findOne(id).exec();
    if (!doc) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Produit ' + id + ' introuvable'
      });
    }
    const newStock = doc.stock + quantity;
    if (newStock < 0) {
      return callback({
        code: grpc.status.FAILED_PRECONDITION,
        message: 'Stock insuffisant'
      });
    }
    await doc.incrementalPatch({ stock: newStock });
    await persistProducts(products);
    console.log('Stock maj : ' + doc.name + ' = ' + newStock);
    const updated = await products.findOne(id).exec();
    callback(null, docToProduct(updated));
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

async function checkStock(call, callback) {
  try {
    const { products } = await dbPromise;
    const { productId, quantity } = call.request;
    const doc = await products.findOne(productId).exec();
    if (!doc) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Produit ' + productId + ' introuvable'
      });
    }
    callback(null, {
      available: doc.stock >= quantity,
      currentStock: doc.stock
    });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

// === Demarrer ===
async function main() {
  await dbPromise;

  setupKafkaConsumer().catch(err => {
    console.error('[Kafka] Erreur consumer :', err.message);
  });

  const server = new grpc.Server();
  server.addService(productsProto.ProductService.service, {
    createProduct,
    getProduct,
    listProducts,
    updateStock,
    checkStock
  });

  server.bindAsync(
    '0.0.0.0:50052',
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        console.error('Erreur de demarrage :', err);
        return;
      }
      console.log('Serveur Products gRPC demarre sur le port ' + port);
    }
  );
}

main();
