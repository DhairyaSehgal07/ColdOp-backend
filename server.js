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

import ejs from "ejs";
import fastifyView from "@fastify/view";

dotenv.config();

const PORT = process.env.PORT || 5000;

connectDB();
const start = async () => {
  const app = fastify({ logger: true });

  // fastify-swagger setup with ui
  app.register(swagger, {
    swagger: {
      info: {
        title: "ColdOp Api",
        description: "A sample API using Fastify and Swagger",
        version: "1.0.0",
      },
      // externalDocs: {
      //   url: "https://swagger.io",
      //   description: "Find more info here",
      // },
      consumes: ["application/json"],
      produces: ["application/json"],
    },
    exposeRoute: true,
  });

  app.register(swaggerUi, {
    routePrefix: "/docs",
  });

  // app.register(acceptsSerializer, {
  //   serializers: [
  //     {
  //       regex: /^application\/json/,
  //       serializer: (payload) => JSON.parse(payload),
  //     },
  //     {
  //       regex: /^application\/x-www-form-urlencoded/,
  //       serializer: (payload) => require("querystring").parse(payload),
  //     },
  //   ],
  // });

  await app.register(cors, {
    origin: ["*", "http://localhost:3000"],
    methods: ["GET", "PUT", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    hook: "preHandler",
  });

  app.register(fastifyCookie, {
    secret: process.env.JWT_SECRET,
    parseOptions: {},
  });

  app.register(fastifyView, {
    engine: {
      ejs: ejs,
    },
    template: "views",
  });

  app.register(formBody);
  app.register(farmerRoutes, { prefix: "/api/farmers" });
  app.register(storeAdminRoutes, { prefix: "/api/store-admin" });

  app.get("/", (req, res) => {
    res.send("Fastify server started server");
  });

  try {
    await app.listen({ port: PORT });
    app.log.info(
      `Server started in ${process.env.NODE_ENV} mode on port ${PORT}`
    );
    // console.log(
    //   `Server started in ${process.env.NODE_ENV} mode on port ${PORT}`
    // );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
