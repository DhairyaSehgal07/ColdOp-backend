import {
  deleteFarmer,
  getFarmerById,
  getFarmers,
  getFarmersIdsForCheck,
  getNumberOfStoreAdmins,
  getStoreAdminProfile,
  loginStoreAdmin,
  logoutStoreAdmin,
  quickRegisterFarmer,
  registerStoreAdmin,
  sendRequestToFarmer,
  updateFarmer,
  updateStoreAdminProfile,
} from "../controllers/store-adminAuthController.js";

import {
  coldStorageSummary,
  createNewIncomingOrder,
  getSingleOrder,
  editIncomingOrder,
  createOutgoingOrder,
  filterOrdersByVariety,
  getAllFarmerOrders,
  getFarmerIncomingOrders,
  getFarmerStockSummary,
  getReceiptNumber,
  getVarietyAvailableForFarmer,
  searchFarmers,
  editOutgoingOrder,
  getTopFarmers,
} from "../controllers/store-adminOrderController.js";

import { storeAdminProtect } from "../middleware/authMiddleware.js";
import { uploadMiddleware } from "../middleware/uploadMiddleware.js";
import {
  mobileOtpHandler,
  resendOtpHandler,
  verifyStoreAdminMobile,
} from "../utils/store-admin/storeAdminMobileVerification.js";
import {
  forgotPasswordGetMobile,
  handleResetPasswordSuccess,
  resetPasswordForm,
  updatePassword,
} from "../utils/store-admin/store-adminForgotPassword.js";
import { deleteProfilePhoto, uploadProfilePhoto } from "../utils/cloudinary.js";
import {
  dayBookOrderController,
  searchOrderByReceiptNumber,
  dayBookOrders,
  getVarieties,
  testController,
} from "../controllers/store-adminDayBookController.js";

function storeAdminRoutes(fastify, options, done) {
  fastify.post("/register", registerStoreAdmin);
  fastify.post("/login", loginStoreAdmin);
  fastify.post("/logout", logoutStoreAdmin);

  // profile routes
  fastify.get(
    "/profile",
    { preHandler: [storeAdminProtect] },
    getStoreAdminProfile
  );

    // profile routes
  fastify.put(
    "/profile",
    { preHandler: [storeAdminProtect] },
    updateStoreAdminProfile
  );

  // mobile-verification routes
  fastify.post("/send-otp", mobileOtpHandler);
  fastify.post("/verify-mobile", verifyStoreAdminMobile);
  fastify.post("/resend-otp", resendOtpHandler);

  // profile photo routes
  fastify.post("/upload-profile-photo", { preHandler: [uploadMiddleware] }, uploadProfilePhoto);
  fastify.delete("/delete-profile-photo", deleteProfilePhoto);

  // forgot-password routes
  fastify.post("/forgot-password", forgotPasswordGetMobile);
  fastify.get("/reset-password", resetPasswordForm);
  fastify.put("/reset-password", updatePassword);
  fastify.get("/reset-password/success", handleResetPasswordSuccess);

  //Add farmrer to registered farmers
  fastify.post(
    "/send-request",
    { preHandler: [storeAdminProtect] },
    sendRequestToFarmer
  );

  // get all registered farmers
  fastify.get("/farmers", { preHandler: [storeAdminProtect] }, getFarmers);

  // quick-register farmer
  fastify.post(
    "/quick-register",
    { preHandler: [storeAdminProtect] },
    quickRegisterFarmer
  );
  // get single farmer for StoreAdminViewFarmerProfileScreen
  fastify.get(
    "/farmers/:id",
    { preHandler: [storeAdminProtect] },
    getFarmerById
  );

  // day book routes

  fastify.get(
    "/daybook/orders",
    { preHandler: [storeAdminProtect] },
    dayBookOrders
  );

  // ORDER ROUTES
  fastify.get(
    "/receipt-number",
    { preHandler: [storeAdminProtect] },
    getReceiptNumber
  );

  fastify.get(
    "/:id/farmers/search",
    { preHandler: [storeAdminProtect] },
    searchFarmers
  );

  fastify.post(
    "/orders",
    { preHandler: [storeAdminProtect] },
    createNewIncomingOrder
  );

  fastify.put(
    "/incoming-orders/:id",
    { preHandler: [storeAdminProtect] },
    editIncomingOrder
  );

  fastify.get("/orders/:id/:type", { preHandler: [storeAdminProtect] },getSingleOrder )

  // get all farmer orders
  fastify.get(
    "/farmers/:id/orders",
    { preHandler: [storeAdminProtect] },
    getAllFarmerOrders
  );

  fastify.get(
    "/farmers/:id/orders/incoming",
    { preHandler: [storeAdminProtect] },
    getFarmerIncomingOrders
  );

  fastify.post(
    "/farmers/outgoing/filter",
    { preHandler: [storeAdminProtect] },
    filterOrdersByVariety
  );

  // OUTGOING ORDER ROUTES

  fastify.get(
    "/farmers/:id/stock-summary",
    { preHandler: [storeAdminProtect] },
    getFarmerStockSummary
  );

  fastify.get(
    "/cold-storage-summary",
    { preHandler: [storeAdminProtect] },
    coldStorageSummary
  );

  fastify.get(
    "/farmers/:id/outgoing/varities",
    { preHandler: [storeAdminProtect] },
    getVarietyAvailableForFarmer
  );

  fastify.post(
    "/farmers/:id/outgoing",
    { preHandler: [storeAdminProtect] },
    createOutgoingOrder
  );

  fastify.put(
    "/outgoing/:id",
    { preHandler: [storeAdminProtect] },
    editOutgoingOrder
  );

  fastify.get("/varieties", getVarieties);

  fastify.get(
    "/farmerid/check",
    { preHandler: [storeAdminProtect] },
    getFarmersIdsForCheck
  );

  fastify.get(
    "/top-farmers",
    { preHandler: [storeAdminProtect] },
    getTopFarmers
  );

  fastify.post(
    '/daybook/search-receipt',
    { preHandler: [storeAdminProtect] },
    searchOrderByReceiptNumber
  );

  fastify.get("/test", testController);

  done();
}

export default storeAdminRoutes;
