const fs = require('fs/promises');
const path = require('path');
const { createHash, randomUUID } = require('crypto');
const { createRxDatabase } = require('rxdb');
const { getRxStorageMemory } = require('rxdb/plugins/storage-memory');
const { wrappedValidateAjvStorage } = require('rxdb/plugins/validate-ajv');

const DATA_DIR = path.join(__dirname, 'data');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'products.snapshot.json');

// Schema JSON du produit (comme le schema users dans TP6)
const productSchema = {
  title: 'product schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', maxLength: 1000 },
    price: { type: 'number' },
    stock: { type: 'integer' }
  },
  required: ['id', 'name', 'price', 'stock']
};

async function hashFunction(input) {
  if (input instanceof ArrayBuffer) {
    input = Buffer.from(input);
  }
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    input = Buffer.from(await input.arrayBuffer());
  }
  if (!Buffer.isBuffer(input)) {
    input = Buffer.from(String(input));
  }
  return createHash('sha256').update(input).digest('hex');
}

async function loadSnapshot() {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function persistProducts(collection) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const docs = await collection.find().exec();
  const products = docs.map((doc) => doc.toJSON());
  await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(products, null, 2), 'utf8');
}

async function initDatabase() {
  const storage = wrappedValidateAjvStorage({
    storage: getRxStorageMemory()
  });

  const db = await createRxDatabase({
    name: 'products_db',
    storage,
    eventReduce: true,
    multiInstance: false,
    hashFunction
  });

  await db.addCollections({
    products: { schema: productSchema }
  });

  // Recharger les produits du snapshot au démarrage
  const initialProducts = await loadSnapshot();
  if (initialProducts.length > 0) {
    await db.products.bulkInsert(initialProducts);
  }

  return {
    db,
    products: db.products,
    persistProducts,
    createId: () => randomUUID()
  };
}

module.exports = initDatabase();
