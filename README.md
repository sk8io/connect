# @sk8ai/connect

SK8 vendor integration SDK — middleware and embeddable components.

This guide explains how to embed SK8 components into your application, both on the frontend (as web components) and backend (via npm package).

## Prerequisites

Before beginning, ensure you have:
- A backend server (Node.js)
- Ability to serve static files from your backend

---

## Step 1: Obtain Your Access Token

1. Ask SK8 support to provide an API key

### Security Notes
- **Never expose this token in client-side code** (browser, mobile apps, etc.)
- Store the token in environment variables or a secure secrets manager

---

## Step 2: Install the Backend SDK

Install the SK8 npm package on your backend server:

```bash
npm i @sk8ai/connect
```

### Create the Middleware Endpoint

The SDK provides a middleware function that proxies requests from your embedded components to the SK8 API.
This SDK tries to be as much framework-agnostic as possible by using standard Node APIs (`res.statusCode`, `res.setHeader`, `res.end`) and can run in any Node-based framework. Examples use Express because it is the most common setup.

Add an additional middleware before the SK8 middleware that gets
the requesting client identifier. Client identifier can be anything
you use in order to uniquely identify users in your application,
but it must be the same client identifier that you provided during SK8 tenant creation.
This middleware must set `clientId` attribute on the request object.

```js
// Example: Express.js implementation

// CommonJS
const express = require('express');
const { initializeSK8Middleware } = require('@sk8ai/connect');

// ESM
import express from 'express';
import { initializeSK8Middleware } from '@sk8ai/connect';

const app = express();

app.use((req, res, next) => {
  req.clientId = '<your-client-id-provider>';
  next();
});

// Initialize the middleware with your API key
const sk8Middleware = initializeSK8Middleware({
  apiKey: process.env.SK8_API_KEY,
  baseUrl: "https://app-dev.sk8.ai/api"
});

app.use(express.json());
app.use('/api/sk8-embedded', sk8Middleware);
app.use(errorHandler);

// Full order (preferred): body parser (mandatory) → clientId extractor middleware (mandatory) → SK8 middleware → error handler (optional)
```

**Important:**
- `baseUrl` should point to `https://app-dev.sk8.ai/api`

**Note:** The middleware automatically:
- Forwards requests to the SK8 API
- Attaches your API key for authentication

If you don't use Express then make sure that these properties are set for `req` and `res`:

**`req` properties:**
- **url** – request path including query parameters
- **method** – request method (GET, POST, etc.)
- **headers** – request headers; The middleware does not forward incoming headers except `Content-Type`. Authentication is handled via your SK8 API key.
- **body** – request body should be already parsed as JSON (e.g. via `express.json()` or another body parser); required for methods that send a body (POST, PUT, PATCH, etc.)

**`res` properties** (standard Node `ServerResponse`):
- **statusCode** – set by the middleware for the response status
- **setHeader** – standard Node API to set headers
- **end** – standard Node API to send the response

**`next`**
- Typical 'next' function in a middleware chain.
This function will be called only on error response from the SK8 API because typically this embedded middleware should be the last in the chain before the error middleware.
If 'next' is not a function then on SK8 API error response a generic
500 error will be returned as a response so there are no hanging requests left.

### Popular node js framework integration examples

The SDK has been validated with these backend setups:

- Express (JavaScript)
- Express (TypeScript)
- Fastify (`@fastify/middie` bridge)
- NestJS (`app.use(...)` middleware mounting)

All tested variants keep the same middleware contract:

- body parser before SK8 middleware
- `req.clientId` set by your middleware
- SK8 middleware mounted on your backend endpoint (for example `/api/sk8-embedded`)

Examples:

```ts
// Express + TypeScript
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { initializeSK8Middleware } from "@sk8ai/connect";

type VendorRequest = Request & { clientId?: string };

const PORT = process.env.PORT;
const apiKey = process.env.SK8_API_KEY;

const app = express();

app.use(cors());
app.use(express.json());
app.use("/static", express.static("static"));

app.use((req: VendorRequest, _res: Response, next: NextFunction) => {
  req.clientId = '<your-client-id-provider>';
  next();
});

app.use(
  "/api/sk8-embedded",
  initializeSK8Middleware({
    apiKey,
    baseUrl: "https://app-dev.sk8.ai/api",
  }),
);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "not found" });
});

app.listen(PORT, () => {
  console.log(`Express-ts on http://localhost:${PORT}`);
});
```

```js
// Fastify + middie
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import middie from "@fastify/middie";
import fastifyStatic from "@fastify/static";
import { initializeSK8Middleware } from "@sk8ai/connect";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = process.env.PORT;
const apiKey = process.env.SK8_API_KEY;

const app = Fastify({ logger: true });
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const staticRoot = join(__dirname, "..", "static");
const allowedOrigins = new Set([
  "http://127.0.0.1:5500",
  "http://localhost:5500",
]);

await app.register(fastifyCors, {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.has(origin)) {
      cb(null, true);
      return;
    }
    cb(new Error(`Origin ${origin} is not allowed by CORS`), false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
});
await app.register(middie);
await app.register(fastifyStatic, {
  root: staticRoot,
  prefix: "/static/",
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With",
    );
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  next();
});

app.use((req, _res, next) => {
  req.clientId = '<your-client-id-provider>';
  next();
});

app.use(
  "/api/sk8-embedded",
  initializeSK8Middleware({
    apiKey,
    baseUrl: "https://app-dev.sk8.ai/api",
  }),
);

app.setNotFoundHandler((_request, reply) => {
  reply.code(404).send({ error: "not found" });
});

await app.listen({ port: PORT, host: "0.0.0.0" });
app.log.info(`Fastify on http://localhost:${PORT}`);
```

```ts
// NestJS + TypeScript
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { type NestExpressApplication } from "@nestjs/platform-express";
import { initializeSK8Middleware } from "@sk8ai/connect";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AppModule } from "./nest-app.module.ts";

const PORT = process.env.PORT;
const apiKey = process.env.SK8_API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const staticRoot = join(__dirname, "..", "static");

const bootstrap = async () => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: ["http://127.0.0.1:5500", "http://localhost:5500"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  });
  app.useStaticAssets(staticRoot, { prefix: "/static/" });
  app.use((req: IncomingMessage, _res: ServerResponse, next: (err?: unknown) => void) => {
    (req as IncomingMessage & { clientId?: string }).clientId = '<your-client-id-provider>';
    next();
  });
  app.use(
    "/api/sk8-embedded",
    initializeSK8Middleware({
      apiKey,
      baseUrl: "https://app-dev.sk8.ai/api",
    }),
  );
  app.use((_req: IncomingMessage, res: ServerResponse) => {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "not found" }));
  });

  await app.listen(PORT);
  console.log(`NestJS on http://localhost:${PORT}`);
};

await bootstrap();
```

---

## Step 3: Serve the Component Script

The embed scripts are included in this package under `embed/`. Copy them to your static assets directory:

```bash
# Copy from node_modules after installing
cp node_modules/@sk8ai/connect/embed/pipelines-embed.js public/embed/

# Or copy all embed scripts
cp node_modules/@sk8ai/connect/embed/*.js public/embed/
```

Available components:
- `pipelines-embed.js` — Pipeline management component
- `accounts-embed.js` — Account management component
- `templates-embed.js` — Template management component

Configure your server to serve static files:
```js
// Express example
app.use('/public', express.static('public'));
```

---

## Step 4: Embed the Component in Your Frontend

### Load the Script
Include the component script in your HTML:

```html
<head>
  <!-- Load the SK8 component script -->
  <script src="/public/embed/pipelines-embed.js"></script>
</head>
```

### Add the Web Component
Place the web component anywhere in your application.

```html
<pipelines-embed
  base-api="https://your-backend.example.com/api/sk8-embedded"
/>
```

### Framework-Specific Examples

**React:**
```jsx
const pipelineEntityNaming = JSON.stringify({
  pipeline: { singular: 'Integration', plural: 'Integrations' },
});

function MyComponent() {
  return (
    <div>
      <pipelines-embed
        base-api="https://your-backend.example.com/api/sk8-embedded"
        entity-naming={pipelineEntityNaming}
      />
    </div>
  );
}
```

**Vue:**
```vue
<script setup>
const baseApi = 'http://localhost:4000/api/sk8-embedded'

const entityNaming = {
  pipeline: { singular: 'Integration', plural: 'Integrations' },
}
const entityNamingJson = JSON.stringify(entityNaming)
</script>

<template>
  <div>
    <pipelines-embed
      :base-api="baseApi"
      :entity-naming="entityNamingJson"
    />
  </div>
</template>
```

With **Vite**, set `compilerOptions.isCustomElement` (for example `(tag) => tag === 'pipelines-embed'`) on `@vitejs/plugin-vue` so Vue does not treat the tag as a missing component. Other bundlers (webpack, Rollup, etc.) can pass the same compiler option wherever your Vue plugin reads it.

**Vanilla JavaScript:**
```js
// Dynamically add component
const sk8Component = document.createElement('pipelines-embed');
sk8Component.setAttribute('base-api', 'https://your-backend.example.com/api/sk8-embedded');
sk8Component.setAttribute(
  'entity-naming',
  JSON.stringify({
    pipeline: { singular: 'Integration', plural: 'Integrations' },
  }),
);
document.getElementById('container').appendChild(sk8Component);
```

## TypeScript support

`@sk8ai/connect` ships a very simple declaration file.

- No `declare module "@sk8ai/connect"` shim is required in consumer projects.
- No `@types/sk8ai__connect` package is required.
- For strict projects, type your own request augmentation (for example `type VendorRequest = Request & { clientId?: string }`) when setting `req.clientId`.
- Standard import works in TS:

```ts
import { initializeSK8Middleware } from "@sk8ai/connect";
```

## Customization

You can tailor how SK8 reads in your product in two supported ways: **labels** (what users see) and **styling** (how it looks), without changing SK8 APIs or data models.

### Custom entity names (`entity-naming`)

Each embed exposes an optional **`entity-naming`** attribute. The value must be a **JSON object** (as a string in HTML). You can override **singular** and **plural** labels per entity kind. Unspecified keys keep the built-in defaults.

**Default labels** (when `entity-naming` is omitted):

| Entity kind | JSON key | Default singular | Default plural |
|-------------|----------|------------------|----------------|
| Pipeline | `pipeline` | Pipeline | Pipelines |
| Template | `template` | Template | Templates |
| Account | `account` | Account | Accounts |

**Which embed uses which entities**

| Embed | `pipeline` | `template` | `account` |
|-------|:----------:|:----------:|:---------:|
| `pipelines-embed` | Yes | Yes | Yes |
| `templates-embed` | Yes | Yes | Yes |
| `accounts-embed` | — | — | Yes |

`pipelines-embed` and `templates-embed` flows can reference all **three** kinds (for example pipeline and template pickers, accounts, and related copy). **`accounts-embed`** only surfaces **account** copy; pass `account` to customize it—the other keys are not used in that UI.

**JSON shape:**

```json
{
  "pipeline": { "singular": "…", "plural": "…" },
  "template": { "singular": "…", "plural": "…" },
  "account": { "singular": "…", "plural": "…" }
}
```

Each top-level key is optional. You only need to include the keys you want to rename.

**Examples (single entity per embed):**

```html
<pipelines-embed
  base-api="https://your-backend.example.com/api/sk8-embedded"
  entity-naming='{"pipeline":{"singular":"Integration","plural":"Integrations"}}'
/>

<templates-embed
  base-api="https://your-backend.example.com/api/sk8-embedded"
  entity-naming='{"template":{"singular":"Blueprint","plural":"Blueprints"}}'
/>

<accounts-embed
  base-api="https://your-backend.example.com/api/sk8-embedded"
  entity-naming='{"account":{"singular":"Connection","plural":"Connections"}}'
/>
```

**Example (multiple entity names on one embed):** on `pipelines-embed` or `templates-embed`, pass `pipeline`, `template`, and `account` together when you want consistent wording across the flow:

```html
<pipelines-embed
  base-api="https://your-backend.example.com/api/sk8-embedded"
  entity-naming='{"pipeline":{"singular":"Integration","plural":"Integrations"},"template":{"singular":"Blueprint","plural":"Blueprints"},"account":{"singular":"Connection","plural":"Connections"}}'
/>
```

The same JSON shape works in frameworks: build one object, pass it as `JSON.stringify(...)` to the `entity-naming` attribute.

These names flow through UI copy (page titles, buttons, table headings, forms, confirmations, and similar) wherever the product refers to those entities in user-visible text. They do **not** change API paths, resource IDs, or backend terminology.

### Styling with CSS `::part()`

Embed scripts render inside an **open shadow root**. SK8 exposes selected internal elements with the standard **`part`** attribute so your page can style them from **outside** the component using the **`::part()`** pseudo-element on the custom element host.

SK8's internal styles usually stay within **single-class** specificity, so rules you author on the host (for example `pipelines-embed::part(container)`) typically **take precedence** over them and apply **without** `!important`.

**Selector pattern:**

```css
pipelines-embed::part(part-name) {
  /* your rules */
}
```

**Exposed part names** (reference for styling):

| Area | `part` value(s) | Purpose |
|------|-----------------|--------|
| Main layout | `container` | Outer page shell padding and title block |
| | `header` | Title row wrapper |
| | `title` | Main heading |
| | `description` | Subtitle / description text |
| Primary action | `button`, `main-action-button` | Primary component button (e.g. Create Pipeline) |
| Table panel | `table-panel` | Panel around the data table |
| | `table-panel-header` | Panel header strip |
| | `table-title` | Panel section title |
| | `table-description` | Panel description |
| Data table | `table-container` | Scroll / table wrapper |
| | `table-header` | `<thead>` |
| | `table-head` | Header cell |
| | `table-body` | `<tbody>` |
| | `table-row` | Row |
| | `table-cell` | Cell |
| Embedded template picker | `embedded-template-tile-grid` | Grid wrapper for embedded template selection |
| | `embedded-template-tile` | Individual template tile in embedded selection mode |
| Forms (e.g. create/edit panels) | `form-panel` | Form card |
| | `form-panel-header` | Form header bar |
| | `form-panel-title` | Form title |
| | `form-panel-body` | Form body |
| | `form-panel-footer` | Form footer |
| | `button`, `form-cancel-button` | Cancel |
| | `button`, `form-submit-button` | Submit |
| Fields | `input` | Text input |
| | `input`, `select` | Select |
| | `input`, `textarea` | Textarea |
| Row actions menu | `actions-menu-trigger` | Menu trigger |
| | `dropdown-menu-content` | Menu surface |
| | `dropdown-menu-item` | Menu item |

---

### Component Attributes

| Attribute | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| `base-api` | **Yes** | string | - | Full path to your backend endpoint with SK8 middleware |
| `entity-naming` | No | JSON string | (see Customization section) | Optional display names for entities inside the embed (singular and plural). Parsed as JSON and merged with SK8 defaults. |


## Repository Structure

```
connect/
├── src/
│   └── index.js          # Middleware (published to npm)
│   └── index.d.ts        # TypeScript declarations (published to npm)
├── embed/
│   ├── pipelines-embed.js  # Pipeline web component (published to npm)
│   ├── accounts-embed.js   # Account web component (published to npm)
│   └── templates-embed.js  # Template web component (published to npm)
├── package.json
└── README.md
```
