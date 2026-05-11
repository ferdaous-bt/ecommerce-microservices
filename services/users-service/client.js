'use strict';

const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// 1. Charger le contrat (exactement comme dans server.js)
const PROTO_PATH = path.join(__dirname, '../../proto/users.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const usersProto = grpc.loadPackageDefinition(packageDefinition).users;

// 2. Créer un client qui se connecte au serveur sur le port 50051
const client = new usersProto.UserService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

// 3. TESTS — on appelle les 3 fonctions du serveur

// TEST 1 : Créer un utilisateur
console.log('\n--- TEST 1 : Création d\'un utilisateur ---');
client.createUser(
  { name: 'Alice', email: 'alice@test.com', password: '123' },
  (err, user) => {
    if (err) return console.error(' Erreur :', err.message);
    console.log('Créé :', user);

    // TEST 2 : Récupérer cet utilisateur par son id
    console.log('\n--- TEST 2 : Récupération de l\'utilisateur ---');
    client.getUser({ id: user.id }, (err, found) => {
      if (err) return console.error(' Erreur :', err.message);
      console.log(' Trouvé :', found);

      // TEST 3 : Lister tous les utilisateurs
      console.log('\n--- TEST 3 : Liste de tous les utilisateurs ---');
      client.listUsers({}, (err, list) => {
        if (err) return console.error(' Erreur :', err.message);
        console.log(' Liste :', list);
      });
    });
  }
);
