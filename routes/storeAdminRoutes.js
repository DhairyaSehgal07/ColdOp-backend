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
} from "../controllers/store-adminOrderController.js";

import { storeAdminProtect } from "../middleware/authMiddleware.js";
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
import { deleteProfilePhoto } from "../utils/deleteImageFromCloudinary.js";
import {
  dayBookOrderController,
  dayBookOrders,
  getVarieties,
  testController,
} from "../controllers/store-adminDayBookController.js";

function storeAdminRoutes(fastify, options, done) {
  fastify.post("/register", registerStoreAdmin);
  fastify.post("/login", loginStoreAdmin);
  fastify.post("/logout", logoutStoreAdmin);

  // proifle routes
  fastify.get(
    "/profile",
    { preHandler: [storeAdminProtect] },
    getStoreAdminProfile
  );

  // mobile-verification routes
  fastify.post("/send-otp", mobileOtpHandler);
  fastify.post("/verify-mobile", verifyStoreAdminMobile);
  fastify.post("/resend-otp", resendOtpHandler);

  //delete profile photo from cloudinary
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

  fastify.get("/varities", getVarieties);

  fastify.get(
    "/farmerid/check",
    { preHandler: [storeAdminProtect] },
    getFarmersIdsForCheck
  );

  fastify.put(
    "/test/:orderId",
    { preHandler: [storeAdminProtect] },
    editIncomingOrder
  );

  done();
}

export default storeAdminRoutes;
