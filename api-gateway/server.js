'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { buildSchema } = require('graphql');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@as-integrations/express5');
const { addResolversToSchema } = require('@graphql-tools/schema');

const resolvers = require('./resolvers');

// ====== USERS : proto + client gRPC ======
const USERS_PROTO_PATH = path.join(__dirname, '../proto/users.proto');
const usersDef = protoLoader.loadSync(USERS_PROTO_PATH, {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true
});
const usersProto = grpc.loadPackageDefinition(usersDef).users;
const usersClient = new usersProto.UserService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

// ====== PRODUCTS : proto + client gRPC ======
const PRODUCTS_PROTO_PATH = path.join(__dirname, '../proto/products.proto');
const productsDef = protoLoader.loadSync(PRODUCTS_PROTO_PATH, {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true
});
const productsProto = grpc.loadPackageDefinition(productsDef).products;
const productsClient = new productsProto.ProductService(
  'localhost:50052',
  grpc.credentials.createInsecure()
);

// ====== Express ======
const app = express();
app.use(express.json());

// ====== Routes REST USERS ======
app.post('/users', (req, res) => {
  usersClient.createUser(req.body, (err, response) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json(response);
  });
});

app.get('/users/:id', (req, res) => {
  usersClient.getUser({ id: req.params.id }, (err, response) => {
    if (err) {
      if (err.code === grpc.status.NOT_FOUND) {
        return res.status(404).json({ error: err.message });
      }
      return res.status(500).json({ error: err.message });
    }
    res.json(response);
  });
});

app.get('/users', (req, res) => {
  usersClient.listUsers({}, (err, response) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(response);
  });
});

// ====== Routes REST PRODUCTS ======
app.post('/products', (req, res) => {
  productsClient.createProduct(req.body, (err, response) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json(response);
  });
});

app.get('/products/:id', (req, res) => {
  productsClient.getProduct({ id: req.params.id }, (err, response) => {
    if (err) {
      if (err.code === grpc.status.NOT_FOUND) {
        return res.status(404).json({ error: err.message });
      }
      return res.status(500).json({ error: err.message });
    }
    res.json(response);
  });
});

app.get('/products', (req, res) => {
  productsClient.listProducts({}, (err, response) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(response);
  });
});

app.post('/products/:id/stock', (req, res) => {
  const { quantity } = req.body;
  productsClient.updateStock(
    { id: req.params.id, quantity },
    (err, response) => {
      if (err) {
        if (err.code === grpc.status.NOT_FOUND) {
          return res.status(404).json({ error: err.message });
        }
        if (err.code === grpc.status.FAILED_PRECONDITION) {
          return res.status(400).json({ error: err.message });
        }
        return res.status(500).json({ error: err.message });
      }
      res.json(response);
    }
  );
});

app.get('/products/:id/check-stock/:quantity', (req, res) => {
  productsClient.checkStock(
    { productId: req.params.id, quantity: parseInt(req.params.quantity, 10) },
    (err, response) => {
      if (err) {
        if (err.code === grpc.status.NOT_FOUND) {
          return res.status(404).json({ error: err.message });
        }
        return res.status(500).json({ error: err.message });
      }
      res.json(response);
    }
  );
});

// ====== GraphQL avec Apollo Server ======
async function setupApollo() {
  const schemaString = fs.readFileSync(
    path.join(__dirname, 'schema.gql'),
    'utf-8'
  );
  const schema = buildSchema(schemaString);
  const schemaWithResolvers = addResolversToSchema({ schema, resolvers });

  const apolloServer = new ApolloServer({ schema: schemaWithResolvers });
  await apolloServer.start();

  app.use('/graphql', express.json(), expressMiddleware(apolloServer));
}

// ====== Demarrer ======
async function main() {
  try {
    await setupApollo();
    const PORT = 3000;
    app.listen(PORT, () => {
      console.log('API Gateway demarree sur http://localhost:' + PORT);
      console.log('  REST users    : http://localhost:' + PORT + '/users');
      console.log('  REST products : http://localhost:' + PORT + '/products');
      console.log('  GraphQL       : http://localhost:' + PORT + '/graphql');
    });
  } catch (err) {
    console.error('Erreur au demarrage :', err);
  }
}

main();
