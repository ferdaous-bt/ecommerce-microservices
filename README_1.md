# E-Commerce Microservices

> Projet de fin de semestre — **SoA et Microservices** (4Info, Dr. Salah Gontara, A.U. 2025-2026)

Application e-commerce basée sur une **architecture microservices** mettant en œuvre **gRPC**, **REST**, **GraphQL** et **Kafka** pour la communication asynchrone.

---

## Équipe

- **Ferdaous Ben Taleb** — 4Info

---

## Description

Ce projet implémente une plateforme e-commerce composée de **3 microservices indépendants**, chacun avec sa propre base de données :

- **users-service** : gestion des utilisateurs
- **products-service** : gestion du catalogue produits et du stock
- **orders-service** : gestion des commandes

Une **API Gateway** centralise les accès clients en exposant à la fois :
- une interface **REST** (endpoints classiques)
- une interface **GraphQL** (requêtes flexibles)

La communication **interne** entre la Gateway et les microservices se fait en **gRPC** (performant, basé sur HTTP/2).

La communication **asynchrone** entre microservices (notamment pour la mise à jour automatique du stock après création d'une commande) se fait via **Kafka**.

---

## Architecture

```
                  ┌────────────────────────┐
                  │       Client           │
                  │  (Postman, navigateur) │
                  └───────────┬────────────┘
                              │ REST / GraphQL
                              ▼
                  ┌────────────────────────┐
                  │     API Gateway        │
                  │   (Express + Apollo)   │
                  │      port 3000         │
                  └───┬──────┬──────┬──────┘
                      │ gRPC │ gRPC │ gRPC
              ┌───────┘      │      └─────────┐
              ▼              ▼                ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │users-service │ │products-     │ │orders-       │
     │  port 50051  │ │service       │ │service       │
     │              │ │ port 50052   │ │ port 50053   │
     │   SQLite3    │ │    RxDB      │ │   SQLite3    │
     └──────────────┘ └──────┬───────┘ └──────┬───────┘
                             │                │
                             │ Kafka consumer │ Kafka producer
                             └────────┬───────┘
                                      ▼
                            ┌──────────────────┐
                            │  Apache Kafka    │
                            │   port 9092      │
                            │ topic:           │
                            │  order.created   │
                            └──────────────────┘
```

### Flux d'une création de commande (avec Kafka)

1. Client envoie `POST /orders` (REST) ou mutation `createOrder` (GraphQL) sur la Gateway
2. Gateway appelle `orders-service` en gRPC
3. `orders-service` insère dans SQLite et publie l'événement `order.created` sur Kafka
4. `products-service` (consommateur Kafka) reçoit l'événement et décrémente automatiquement le stock

---

## Technologies utilisées

| Couche | Technologie |
|---|---|
| Runtime | Node.js v18+ |
| Communication interne | gRPC (`@grpc/grpc-js`, `@grpc/proto-loader`) |
| API REST | Express |
| API GraphQL | Apollo Server v4 (`@apollo/server`, `@as-integrations/express5`) |
| Base SQL | SQLite3 (`sqlite3`) — users + orders |
| Base NoSQL | RxDB (`rxdb`, `rxjs`, `ajv`) — products |
| Messagerie | Apache Kafka (`kafkajs`) |
| Conteneurisation | Docker + Docker Compose (pour Kafka) |
| Versioning | Git + GitHub |

---

## Structure du projet

```
ecommerce-microservices/
├── proto/
│   ├── users.proto             # Contrat gRPC du UserService
│   ├── products.proto          # Contrat gRPC du ProductService
│   └── orders.proto            # Contrat gRPC du OrderService
│
├── api-gateway/
│   ├── server.js               # Express + routes REST + Apollo
│   ├── schema.gql              # Schéma GraphQL unifié
│   ├── resolvers.js            # Resolvers GraphQL (appellent les microservices)
│   └── package.json
│
├── services/
│   ├── users-service/
│   │   ├── server.js           # Serveur gRPC users
│   │   ├── client.js           # Client de test gRPC
│   │   ├── database.js         # Connexion SQLite + schéma users
│   │   └── package.json
│   │
│   ├── products-service/
│   │   ├── server.js           # Serveur gRPC + consumer Kafka
│   │   ├── client.js           # Client de test gRPC
│   │   ├── database.js         # Setup RxDB + persistence JSON
│   │   └── package.json
│   │
│   └── orders-service/
│       ├── server.js           # Serveur gRPC + producer Kafka
│       ├── client.js           # Client de test gRPC
│       ├── database.js         # Connexion SQLite + schéma orders
│       └── package.json
│
├── docker-compose.yml          # Config Kafka + Zookeeper
├── .gitignore
└── README.md
```

---

## Prérequis

- **Node.js** v18 ou supérieur — [nodejs.org](https://nodejs.org)
- **npm** (livré avec Node.js)
- **Docker Desktop** — [docker.com](https://www.docker.com/products/docker-desktop)
- **Git** — pour cloner le projet

Vérifier l'installation :
```bash
node --version    # v18.0.0 ou plus
npm --version     # v9.0.0 ou plus
docker --version  # v20+ recommandé
```

---

## Installation

### 1. Cloner le projet

```bash
git clone https://github.com/ferdaous-bt/ecommerce-microservices.git
cd ecommerce-microservices
```

### 2. Installer les dépendances de chaque service

```bash
# API Gateway
cd api-gateway && npm install && cd ..

# users-service
cd services/users-service && npm install && cd ../..

# products-service
cd services/products-service && npm install && cd ../..

# orders-service
cd services/orders-service && npm install && cd ../..
```

---

## Lancement

L'application nécessite **4 terminaux Node + Docker** qui tournent simultanément.

### Étape 1 — Démarrer Kafka avec Docker

À la racine du projet :
```bash
docker compose up -d
```

Vérifier que les containers tournent :
```bash
docker compose ps
```
Tu dois voir `kafka` et `zookeeper` en statut **Up**.

### Étape 2 — Démarrer les 3 microservices

Dans **3 fenêtres de terminal séparées** :

**Terminal A — users-service**
```bash
cd services/users-service
node server.js
```
Sortie attendue : `Serveur Users gRPC demarre sur le port 50051`

**Terminal B — products-service**
```bash
cd services/products-service
node server.js
```
Sortie attendue :
- `Serveur Products gRPC demarre sur le port 50052`
- `[Kafka] Consumer connecte et abonne a order.created`

**Terminal C — orders-service**
```bash
cd services/orders-service
node server.js
```
Sortie attendue :
- `Serveur Orders gRPC demarre sur le port 50053`
- `[Kafka] Producer connecte au broker localhost:9092`

### Étape 3 — Démarrer l'API Gateway

**Terminal D — api-gateway**
```bash
cd api-gateway
node server.js
```
Sortie attendue : `API Gateway demarree sur http://localhost:3000`

### Arrêt

- **Microservices Node** : `Ctrl + C` dans chaque terminal
- **Kafka Docker** : `docker compose down` à la racine

---

## Endpoints REST

Base URL : `http://localhost:3000`

### Users

| Méthode | URL | Description | Body |
|---|---|---|---|
| `POST` | `/users` | Créer un utilisateur | `{ "name", "email", "password" }` |
| `GET` | `/users/:id` | Récupérer un utilisateur par id | — |
| `GET` | `/users` | Lister tous les utilisateurs | — |

### Products

| Méthode | URL | Description | Body |
|---|---|---|---|
| `POST` | `/products` | Créer un produit | `{ "name", "description", "price", "stock" }` |
| `GET` | `/products/:id` | Récupérer un produit | — |
| `GET` | `/products` | Lister tous les produits | — |
| `POST` | `/products/:id/stock` | Modifier le stock | `{ "quantity": 5 }` (ou négatif) |
| `GET` | `/products/:id/check-stock/:quantity` | Vérifier la disponibilité | — |

### Orders

| Méthode | URL | Description | Body |
|---|---|---|---|
| `POST` | `/orders` | Créer une commande | `{ "userId", "items": [...] }` |
| `GET` | `/orders/:id` | Récupérer une commande | — |
| `GET` | `/users/:userId/orders` | Commandes d'un utilisateur | — |
| `POST` | `/orders/:id/cancel` | Annuler une commande | — |

### Exemple curl

```bash
# Créer un utilisateur
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Sarah","email":"sarah@test.com","password":"abc"}'

# Lister les produits
curl http://localhost:3000/products
```

---

## GraphQL

URL : `http://localhost:3000/graphql` (interface Apollo Sandbox dans le navigateur)

### Types principaux

```graphql
type User {
  id: ID!
  email: String!
  name: String!
}

type Product {
  id: ID!
  name: String!
  description: String
  price: Float!
  stock: Int!
}

type Order {
  id: ID!
  userId: ID!
  items: [OrderItem!]!
  total: Float!
  status: String!
  createdAt: String!
}

type OrderItem {
  productId: ID!
  quantity: Int!
  unitPrice: Float!
}
```

### Queries disponibles

```graphql
users: [User!]!
user(id: ID!): User

products: [Product!]!
product(id: ID!): Product
checkStock(productId: ID!, quantity: Int!): StockResponse

order(id: ID!): Order
ordersByUser(userId: ID!): [Order!]!
```

### Mutations disponibles

```graphql
createUser(email, name, password): User
createProduct(name, description, price, stock): Product
updateStock(id, quantity): Product
createOrder(userId, items: [OrderItemInput!]!): Order
cancelOrder(id): Order
```

### Exemple de requête combinée

```graphql
query {
  users { id name }
  products { id name price stock }
}
```

Cette requête appelle simultanément `users-service` ET `products-service` en une seule requête réseau, **avantage majeur de GraphQL sur REST**.

### Exemple de mutation

```graphql
mutation {
  createOrder(
    userId: "1",
    items: [
      { productId: "abc-123", quantity: 2, unitPrice: 999.99 }
    ]
  ) {
    id
    total
    status
  }
}
```

---

## Communication gRPC interne

Les microservices communiquent en interne avec l'API Gateway via **gRPC**. Les contrats sont définis dans le dossier `proto/`.

### users.proto

```
service UserService {
  rpc CreateUser(CreateUserRequest) returns (User);
  rpc GetUser(GetUserRequest) returns (User);
  rpc ListUsers(Empty) returns (UserList);
}
```
Port : **50051**

### products.proto

```
service ProductService {
  rpc CreateProduct(CreateProductRequest) returns (Product);
  rpc GetProduct(GetProductRequest) returns (Product);
  rpc ListProducts(Empty) returns (ProductList);
  rpc UpdateStock(UpdateStockRequest) returns (Product);
  rpc CheckStock(CheckStockRequest) returns (StockResponse);
}
```
Port : **50052**

### orders.proto

```
service OrderService {
  rpc CreateOrder(CreateOrderRequest) returns (Order);
  rpc GetOrder(GetOrderRequest) returns (Order);
  rpc ListOrdersByUser(ListByUserRequest) returns (OrderList);
  rpc CancelOrder(CancelOrderRequest) returns (Order);
}
```
Port : **50053**

---

## Communication asynchrone Kafka

### Topic : `order.created`

| | |
|---|---|
| **Producteur** | `orders-service` |
| **Consommateur** | `products-service` (groupe `products-stock-management`) |
| **Déclenché par** | Création d'une commande via `createOrder` |
| **Action côté consommateur** | Décrémentation automatique du stock de chaque produit acheté |

### Format du message

```json
{
  "orderId": "1",
  "userId": "1",
  "items": [
    {
      "productId": "550e8400-e29b-41d4-a716-446655440000",
      "quantity": 2,
      "unitPrice": 999.99
    }
  ],
  "total": 1999.98
}
```

### Bénéfices du découplage

- **`orders-service` ne connaît pas `products-service`** : ajout futur de consommateurs (notification email, analytics, etc.) sans modifier `orders`
- **Tolérance aux pannes** : si `products-service` est temporairement indisponible, l'événement reste dans Kafka et sera traité au redémarrage
- **Scalabilité** : possibilité d'ajouter plusieurs instances consommatrices en parallèle

---

## Bases de données

| Microservice | Type | Fichier | Schéma |
|---|---|---|---|
| **users-service** | SQLite3 | `services/users-service/users.db` | Table `users(id, email, name, password)` |
| **products-service** | RxDB (NoSQL) | `services/products-service/data/products.snapshot.json` | Schéma JSON avec `id, name, description, price, stock` |
| **orders-service** | SQLite3 | `services/orders-service/orders.db` | Table `orders(id, user_id, items_json, total, status, created_at)` |

Chaque microservice dispose de **sa propre base de données indépendante**, conformément au principe d'architecture microservices.

### Inspection directe

```bash
# Inspecter SQLite
cd services/users-service
sqlite3 users.db
> SELECT * FROM users;
> .exit

# Inspecter RxDB
cat services/products-service/data/products.snapshot.json
```

---

## Tests fonctionnels

### Scénario complet (recommandé pour démonstration)

1. **Créer un utilisateur** (REST ou GraphQL)
2. **Créer un produit** avec stock = 10
3. **Vérifier le stock initial** via `GET /products`
4. **Créer une commande** pour 3 unités de ce produit
5. **Observer les logs** :
   - `orders-service` : `[Kafka] Evenement publie : order.created`
   - `products-service` : `[Kafka] Stock decremente AUTO : ... = 7`
6. **Vérifier le stock** : il est passé de 10 à 7 automatiquement

### Vérification de la persistance

1. Créer plusieurs utilisateurs / produits / commandes
2. Arrêter les microservices (`Ctrl + C`)
3. Redémarrer les microservices
4. Lister à nouveau : les données sont toujours présentes

---

## Troubleshooting

### `EADDRINUSE: address already in use`
Un ancien processus utilise le port. Pour le tuer :
```bash
lsof -ti:50051 | xargs kill -9    # remplacer par le bon port
```

### `ECONNREFUSED localhost:50051`
Le microservice n'est pas démarré. Vérifier avec :
```bash
lsof -i :50051 -i :50052 -i :50053 -i :3000
```

### Kafka ne se connecte pas
Vérifier que Docker tourne :
```bash
docker compose ps
```
Sinon : `docker compose up -d`

### Erreur Content-Type dans Postman
S'assurer que le header est bien `Content-Type: application/json` (pas `text/xml`).

---

## Licence

Projet académique 

---

## Liens utiles

- **Repo GitHub** : [github.com/ferdaous-bt/ecommerce-microservices](https://github.com/ferdaous-bt/ecommerce-microservices)
- **Documentation gRPC** : [grpc.io](https://grpc.io)
- **Documentation Apollo** : [apollographql.com](https://www.apollographql.com)
- **Documentation Kafka** : [kafka.apache.org](https://kafka.apache.org)
