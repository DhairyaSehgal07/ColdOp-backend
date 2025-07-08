import fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import farmerRoutes from "./routes/farmerRoutes.js";
import acceptsSerializer from "@fastify/accepts-serializer";
import connectDB from "./config/db.js";
import dotenv from "dotenv";
import formBody from "@fastify/formbody";
import fastifyCookie from "@fastify/cookie";
import storeAdminRoutes from "./routes/storeAdminRoutes.js";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import countRoutes from "./routes/countRoutes.js";

import ejs from "ejs";
import fastifyView from "@fastify/view";
import superAdminRoutes from "./routes/superAdminRoutes.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

connectDB();
const start = async () => {
  const app = fastify({
    logger: true,
    ajv: {
      customOptions: {
        removeAdditional: false,
        useDefaults: true,
        coerceTypes: true,
        allErrors: true
      }
    }
  });

  // fastify-swagger setup with ui
  await app.register(swagger, {
    openapi: {
      info: {
        title: "ColdOp Api",
        description: "A sample API using OpenAPI and Swagger",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      }
    },
    hideUntagged: true,
    exposeRoute: true,
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    },
    staticCSP: true
  });

  // Register multipart plugin
  await app.register(multipart, {
    limits: {
      fieldNameSize: 100, // Max field name size in bytes
      fieldSize: 100000, // Max field value size in bytes
      fields: 10,        // Max number of non-file fields
      fileSize: 5000000, // Max file size in bytes (5MB)
      files: 1,          // Max number of file fields
    }
  });

  await app.register(cors, {
    origin: ["*"],
    methods: ["GET", "PUT", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    hook: "preHandler",
  });

  await app.register(fastifyCookie, {
    secret: process.env.JWT_SECRET,
    hook: 'onRequest',
  });

  await app.register(fastifyView, {
    engine: {
      ejs: ejs,
    },
    root: 'views',
    propertyName: 'view'
  });

  await app.register(formBody);
  await app.register(farmerRoutes, { prefix: "/api/farmers" });
  await app.register(storeAdminRoutes, { prefix: "/api/store-admin" });
  await app.register(superAdminRoutes, { prefix: "/api/super-admin" });
  await app.register(countRoutes, { prefix: "/api/count" });

  app.get("/", async (request, reply) => {
    return { message: "Fastify server started" };
  });

  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    app.log.info(
      `Server started in ${process.env.NODE_ENV} mode on port ${PORT}`
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
