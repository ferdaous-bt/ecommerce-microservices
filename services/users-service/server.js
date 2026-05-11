'use strict';

const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const db = require('./database');

// Charger le contrat .proto
const PROTO_PATH = path.join(__dirname, '../../proto/users.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const usersProto = grpc.loadPackageDefinition(packageDefinition).users;

// Creer un utilisateur
function createUser(call, callback) {
  const { email, name, password } = call.request;

  db.run(
    `INSERT INTO users (email, name, password) VALUES (?, ?, ?)`,
    [email, name, password],
    function (err) {
      if (err) {
        return callback({
          code: grpc.status.INTERNAL,
          message: err.message
        });
      }
      const newUser = {
        id: String(this.lastID),
        email,
        name
      };
      console.log('Utilisateur cree : ' + name + ' (id=' + newUser.id + ')');
      callback(null, newUser);
    }
  );
}

// Recuperer un utilisateur par son id
function getUser(call, callback) {
  const { id } = call.request;

  db.get(
    `SELECT id, email, name FROM users WHERE id = ?`,
    [id],
    (err, row) => {
      if (err) {
        return callback({ code: grpc.status.INTERNAL, message: err.message });
      }
      if (!row) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: 'Utilisateur ' + id + ' introuvable'
        });
      }
      callback(null, {
        id: String(row.id),
        email: row.email,
        name: row.name
      });
    }
  );
}

// Lister tous les utilisateurs
function listUsers(call, callback) {
  db.all(`SELECT id, email, name FROM users`, [], (err, rows) => {
    if (err) {
      return callback({ code: grpc.status.INTERNAL, message: err.message });
    }
    const users = rows.map(row => ({
      id: String(row.id),
      email: row.email,
      name: row.name
    }));
    callback(null, { users });
  });
}

// Demarrer le serveur gRPC
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
        console.error('Erreur de demarrage :', err);
        return;
      }
      console.log('Serveur Users gRPC demarre sur le port ' + port);
    }
  );
}

main();
