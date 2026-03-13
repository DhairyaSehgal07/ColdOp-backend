import mongoose from "mongoose";
import type { FastifyBaseLogger } from "fastify";

export const connectDB = async (logger?: FastifyBaseLogger): Promise<void> => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined in environment variables");
    }

    const conn = await mongoose.connect(process.env.MONGO_URI);

    if (logger) {
      logger.info(`MongoDB Connected: ${conn.connection.host}`);
    } else {
      console.log(`MongoDB Connected: ${conn.connection.host}`);
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    if (logger) {
      logger.error(`MongoDB connection error: ${errorMessage}`);
    } else {
      console.error(`Error: ${errorMessage}`);
    }
    process.exit(1);
  }
};
