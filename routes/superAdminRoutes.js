import {
  loginSuperAdmin,
  logoutSuperAdmin,
  getAllColdStorages,
  coldStorageSummary,
} from "../controllers/superAdminController.js";
import { superAdminProtect } from "../middleware/authMiddleware.js";
function superAdminRoutes(fastify, options, done) {
  fastify.post("/login", loginSuperAdmin);
  fastify.post("/logout", logoutSuperAdmin);

  // get all cold storages
  fastify.get(
    "/cold-storages",
    // { preHandler: [superAdminProtect] },
    getAllColdStorages
  );

  fastify.get("/cold-storages/:id/summary", coldStorageSummary);
  done();
}

export default superAdminRoutes;
