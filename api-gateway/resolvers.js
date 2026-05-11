'use strict';

const path = require('node:path');
const { promisify } = require('node:util');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

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
const listUsersAsync = promisify(usersClient.listUsers).bind(usersClient);
const getUserAsync = promisify(usersClient.getUser).bind(usersClient);
const createUserAsync = promisify(usersClient.createUser).bind(usersClient);

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
const listProductsAsync = promisify(productsClient.listProducts).bind(productsClient);
const getProductAsync = promisify(productsClient.getProduct).bind(productsClient);
const createProductAsync = promisify(productsClient.createProduct).bind(productsClient);
const updateStockAsync = promisify(productsClient.updateStock).bind(productsClient);
const checkStockAsync = promisify(productsClient.checkStock).bind(productsClient);

// ====== ORDERS : proto + client gRPC ======
const ORDERS_PROTO_PATH = path.join(__dirname, '../proto/orders.proto');
const ordersDef = protoLoader.loadSync(ORDERS_PROTO_PATH, {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true
});
const ordersProto = grpc.loadPackageDefinition(ordersDef).orders;
const ordersClient = new ordersProto.OrderService(
  'localhost:50053',
  grpc.credentials.createInsecure()
);
const createOrderAsync = promisify(ordersClient.createOrder).bind(ordersClient);
const getOrderAsync = promisify(ordersClient.getOrder).bind(ordersClient);
const listOrdersByUserAsync = promisify(ordersClient.listOrdersByUser).bind(ordersClient);
const cancelOrderAsync = promisify(ordersClient.cancelOrder).bind(ordersClient);

// ====== RESOLVERS ======
const resolvers = {
  Query: {
    // --- Users ---
    users: async () => {
      const response = await listUsersAsync({});
      return response.users || [];
    },
    user: async (_, { id }) => {
      try {
        return await getUserAsync({ id });
      } catch (err) {
        if (err.code === grpc.status.NOT_FOUND) return null;
        throw err;
      }
    },

    // --- Products ---
    products: async () => {
      const response = await listProductsAsync({});
      return response.products || [];
    },
    product: async (_, { id }) => {
      try {
        return await getProductAsync({ id });
      } catch (err) {
        if (err.code === grpc.status.NOT_FOUND) return null;
        throw err;
      }
    },
    checkStock: async (_, { productId, quantity }) => {
      return await checkStockAsync({ productId, quantity });
    },

    // --- Orders ---
    order: async (_, { id }) => {
      try {
        return await getOrderAsync({ id });
      } catch (err) {
        if (err.code === grpc.status.NOT_FOUND) return null;
        throw err;
      }
    },
    ordersByUser: async (_, { userId }) => {
      const response = await listOrdersByUserAsync({ userId });
      return response.orders || [];
    }
  },

  Mutation: {
    // --- Users ---
    createUser: async (_, args) => {
      return await createUserAsync(args);
    },

    // --- Products ---
    createProduct: async (_, args) => {
      return await createProductAsync(args);
    },
    updateStock: async (_, { id, quantity }) => {
      return await updateStockAsync({ id, quantity });
    },

    // --- Orders ---
    createOrder: async (_, { userId, items }) => {
      return await createOrderAsync({ userId, items });
    },
    cancelOrder: async (_, { id }) => {
      return await cancelOrderAsync({ id });
    }
  }
};

module.exports = resolvers;
