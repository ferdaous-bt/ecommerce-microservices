'use strict';

const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const dbPromise = require('./database');

// Charger le contrat .proto
const PROTO_PATH = path.join(__dirname, '../../proto/products.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const productsProto = grpc.loadPackageDefinition(packageDefinition).products;

// Helper : transformer un document RxDB en format gRPC
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

// 1. Creer un produit
async function createProduct(call, callback) {
  try {
    const { products, persistProducts, createId } = await dbPromise;
    const { name, description, price, stock } = call.request;

    const newProduct = {
      id: createId(),
      name,
      description: description || '',
      price,
      stock
    };

    const inserted = await products.insert(newProduct);
    await persistProducts(products);

    console.log('Produit cree : ' + name + ' (id=' + newProduct.id + ')');
    callback(null, docToProduct(inserted));
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

// 2. Recuperer un produit par id
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

// 3. Lister tous les produits
async function listProducts(call, callback) {
  try {
    const { products } = await dbPromise;
    const docs = await products.find().exec();
    const list = docs.map(docToProduct);
    callback(null, { products: list });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

// 4. Mettre a jour le stock (peut etre negatif pour decrementer)
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

// 5. Verifier le stock disponible
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

// Demarrer le serveur gRPC
async function main() {
  await dbPromise; // s'assurer que la DB est prete

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
