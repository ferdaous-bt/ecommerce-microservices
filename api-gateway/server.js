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

// === 1. Charger le contrat .proto pour les routes REST ===
const PROTO_PATH = path.join(__dirname, '../proto/users.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const usersProto = grpc.loadPackageDefinition(packageDefinition).users;

// === 2. Client gRPC pour les routes REST ===
const usersClient = new usersProto.UserService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

// === 3. Express ===
const app = express();
app.use(express.json());

// === 4. Routes REST (existantes) ===
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

// === 5. GraphQL avec Apollo Server ===
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

// === 6. Demarrer le tout ===
async function main() {
  try {
    await setupApollo();
    const PORT = 3000;
    app.listen(PORT, () => {
      console.log('API Gateway demarree sur http://localhost:' + PORT);
      console.log('  REST    : http://localhost:' + PORT + '/users');
      console.log('  GraphQL : http://localhost:' + PORT + '/graphql');
    });
  } catch (err) {
    console.error('Erreur au demarrage :', err);
  }
}

main();
