'use strict';

const path = require('node:path');
const { promisify } = require('node:util');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// 1. Charger le contrat .proto (comme dans server.js)
const PROTO_PATH = path.join(__dirname, '../proto/users.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const usersProto = grpc.loadPackageDefinition(packageDefinition).users;

// 2. Creer le client gRPC vers users-service
const usersClient = new usersProto.UserService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

// 3. Transformer les methodes gRPC (callbacks) en Promises
//    (pour pouvoir utiliser async/await dans les resolvers)
const listUsersAsync = promisify(usersClient.listUsers).bind(usersClient);
const getUserAsync = promisify(usersClient.getUser).bind(usersClient);
const createUserAsync = promisify(usersClient.createUser).bind(usersClient);

// 4. Les resolvers GraphQL
const resolvers = {
  Query: {
    // GraphQL : { users { id name } }
    users: async () => {
      const response = await listUsersAsync({});
      return response.users || [];
    },

    // GraphQL : { user(id: "1") { id name } }
    user: async (_, { id }) => {
      try {
        return await getUserAsync({ id });
      } catch (err) {
        if (err.code === grpc.status.NOT_FOUND) return null;
        throw err;
      }
    }
  },

  Mutation: {
    // GraphQL : mutation { createUser(email: "...", name: "...", password: "...") { id } }
    createUser: async (_, args) => {
      return await createUserAsync(args);
    }
  }
};

module.exports = resolvers;
