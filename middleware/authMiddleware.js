import jwt from "jsonwebtoken";
import Farmer from "../models/farmerModel.js";
import StoreAdmin from "../models/storeAdminModel.js";

const protect = async (request, reply) => {
  try {
    let token;
    if (request.cookies.jwt) {
      token = request.cookies.jwt;

      if (!token) {
        reply.code(401).send({ message: "Not authorized, no token" });
        return;
      }
    } else if (
      request.headers.authorization &&
      request.headers.authorization.startsWith("Bearer")
    ) {
      token = request.headers.authorization.split(" ")[1];
      if (!token) {
        reply.code(401).send({ message: "Not authorized, no token" });
        return;
      }
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    request.farmer = await Farmer.findById(decoded.userId).select("--password");

    // Call reply.send() if the middleware completes successfully
    return;
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      reply.code(401).send({ message: "Not authorized, invalid token" });
      return;
    }

    // Handle other errors with reply.code() and reply.send()
    reply.code(500).send({ status: "Fail", message: error.message });
    return;
  }
};

const storeAdminProtect = async (request, reply) => {
  try {
    let token;

    if (request.cookies.jwt) {
      token = request.cookies.jwt;

      if (!token) {
        reply.code(401).send({ message: "Not authorized, no token" });
        return;
      }
    } else if (
      request.headers.authorization &&
      request.headers.authorization.startsWith("Bearer")
    ) {
      token = request.headers.authorization.split(" ")[1];
      if (!token) {
        reply.code(401).send({ message: "Not authorized, no token" });
        return;
      }
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    request.storeAdmin = await StoreAdmin.findById(decoded.userId).select(
      "--password"
    );

    // Call reply.send() if the middleware completes successfully
    return;
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      reply.code(401).send({ message: "Not authorized, invalid token" });
      return;
    }

    // Handle other errors with reply.code() and reply.send()
    reply.code(500).send({ status: "Fail", message: error.message });
    return;
  }
};

export { protect, storeAdminProtect };
