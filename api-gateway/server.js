'use strict';

const path = require('node:path');
const express = require('express');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// === 1. Charger le contrat .proto ===
const PROTO_PATH = path.join(__dirname, '../proto/users.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const usersProto = grpc.loadPackageDefinition(packageDefinition).users;

// === 2. Créer un client gRPC vers users-service ===
const usersClient = new usersProto.UserService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

// === 3. Créer le serveur Express (REST) ===
const app = express();
app.use(express.json());

// === 4. Routes REST qui appellent users-service en gRPC ===

// POST /users  →  CreateUser (gRPC)
app.post('/users', (req, res) => {
  usersClient.createUser(req.body, (err, response) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json(response);
  });
});

// GET /users/:id  →  GetUser (gRPC)
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

// GET /users  →  ListUsers (gRPC)
app.get('/users', (req, res) => {
  usersClient.listUsers({}, (err, response) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(response);
  });
});

// === 5. Démarrer le serveur REST ===
const PORT = 3000;
app.listen(PORT, () => {
  console.log(` API Gateway démarrée sur http://localhost:${PORT}`);
});
