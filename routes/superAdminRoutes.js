import {
  loginSuperAdmin,
  logoutSuperAdmin,
  getAllColdStorages,
  coldStorageSummary,
  getIncomingOrdersOfAColdStorage,
  editIncomingOrder,
  getFarmerInfo,
  getFarmersOfAColdStorage,
  deleteOrder,
  getOutgoingOrdersOfAColdStorage,
  editFarmerInfo,
  getSingleFarmerOrders,
  deleteOutgoingOrder,
  getTopFarmers,
  getFarmerOrderFrequency
} from "../controllers/superAdminController.js";
import { superAdminProtect } from "../middleware/authMiddleware.js";
function superAdminRoutes(fastify, options, done) {
  fastify.post("/login", loginSuperAdmin);
  fastify.post("/logout", logoutSuperAdmin);

  // get all cold storages
  fastify.get(
    "/cold-storages",
    { preHandler: [superAdminProtect] },
    getAllColdStorages
  );

  fastify.get(
    "/cold-storages/:id/summary",
    { preHandler: [superAdminProtect] },
    coldStorageSummary
  );

  fastify.get(
    "/cold-storages/:id/incoming-orders",
    { preHandler: [superAdminProtect] },
    getIncomingOrdersOfAColdStorage
  );

    fastify.put(
    "/incoming-orders/:orderId",
      { preHandler: [superAdminProtect] },
    editIncomingOrder

    );

  fastify.delete("/orders/:id", { preHandler: [superAdminProtect] },deleteOrder)

  fastify.get("/cold-storages/:id/farmers", { preHandler: [superAdminProtect] },
    getFarmersOfAColdStorage
  );

  fastify.get(
    "/farmers/:id",
    { preHandler: [superAdminProtect] },
    getFarmerInfo
  );

    fastify.put(
    "/farmers/:id",
    { preHandler: [superAdminProtect] },
    editFarmerInfo
  );

  fastify.get("/cold-storages/:coldStorageId/farmers/:farmerId/order-frequency" ,  { preHandler: [superAdminProtect] },getFarmerOrderFrequency)

  fastify.get("/cold-storages/:id/top-farmers", { preHandler: [superAdminProtect] },getTopFarmers)

  fastify.get("/cold-storages/:coldStorageId/farmers/:farmerId/orders", { preHandler: [superAdminProtect] },getSingleFarmerOrders)

  fastify.get("/cold-storages/:id/outgoing-orders", { preHandler: [superAdminProtect] }, getOutgoingOrdersOfAColdStorage)

  // ...existing code...

fastify.delete(
  "/outgoing-orders/:id",
  { preHandler: [superAdminProtect] },
  deleteOutgoingOrder
);

// ...existing code...

  done();
}

export default superAdminRoutes;
