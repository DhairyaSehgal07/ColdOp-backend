// server.ts
import { buildApp } from "./app.js";
import { connectDB } from "./config/database.js";

const start = async () => {
  try {
    // Build app first to get logger
    const app = await buildApp();

    // Connect to database with logger
    await connectDB(app.log);

    const port = Number(process.env.PORT) || 8000;
    const host = process.env.HOST || "0.0.0.0";

    await app.listen({ port, host });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error occurred";
    console.error("Failed to start server:", errorMessage);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
};

void start();
