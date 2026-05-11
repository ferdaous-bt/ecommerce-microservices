'use strict';

const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// 1. Charger le fichier .proto (le contrat)
const PROTO_PATH = path.join(__dirname, '../../proto/users.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const usersProto = grpc.loadPackageDefinition(packageDefinition).users;

// 2. Une "base de données" en mémoire pour commencer
const users = [];
let nextId = 1;

// 3. Implémentation des 3 fonctions du service

function createUser(call, callback) {
  const { email, name } = call.request;
  const newUser = {
    id: String(nextId++),
    email,
    name
  };
  users.push(newUser);
  console.log(` Utilisateur créé : ${newUser.name} (id=${newUser.id})`);
  callback(null, newUser);
}

function getUser(call, callback) {
  const { id } = call.request;
  const user = users.find(u => u.id === id);
  if (!user) {
    return callback({
      code: grpc.status.NOT_FOUND,
      message: `Utilisateur ${id} introuvable`
    });
  }
  callback(null, user);
}

function listUsers(call, callback) {
  callback(null, { users });
}

// 4. Démarrer le serveur gRPC
function main() {
  const server = new grpc.Server();
  server.addService(usersProto.UserService.service, {
    createUser,
    getUser,
    listUsers
  });

  server.bindAsync(
    '0.0.0.0:50051',
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        console.error('Erreur de démarrage :', err);
        return;
      }
      console.log(`Serveur Users gRPC démarré sur le port ${port}`);
    }
  );
}

main();
