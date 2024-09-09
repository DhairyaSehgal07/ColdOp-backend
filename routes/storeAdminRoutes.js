import {
  registerStoreAdmin,
  loginStoreAdmin,
  logoutStoreAdmin,
  getStoreAdminProfile,
  updateStoreAdminProfile,
  getNumberOfStoreAdmins,
  sendRequestToFarmer,
  getFarmers,
  getFarmerById,
  updateFarmer,
  deleteFarmer,
  quickRegisterFarmer,
} from "../controllers/store-adminAuthController.js";

import {
  createNewOrder,
  getFarmerOrders,
  createOutgoingOrder,
  updateOrdersAfterOutgoing,
  getReceiptNumber,
  getFarmerOutgoingOrders,
  updateFarmerOutgoingOrder,
  deleteFarmerOutgoingOrder,
  getPaymentHistory,
} from "../controllers/store-adminOrderController.js";

import { storeAdminProtect } from "../middleware/authMiddleware.js";
import {
  mobileOtpHandler,
  verifyStoreAdminMobile,
  resendOtpHandler,
} from "../utils/store-admin/storeAdminMobileVerification.js";
import {
  forgotPasswordGetMobile,
  resetPasswordForm,
  updatePassword,
  handleResetPasswordSuccess,
} from "../utils/store-admin/store-adminForgotPassword.js";
import { deleteProfilePhoto } from "../utils/deleteImageFromCloudinary.js";

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
  fastify.post(
    "/farmers/:id",
    { preHandler: [storeAdminProtect] },
    getFarmerById
  );

  // ORDER ROUTES
  fastify.get(
    "/receipt-number",
    { preHandler: [storeAdminProtect] },
    getReceiptNumber
  );
  fastify.post("/orders", { preHandler: [storeAdminProtect] }, createNewOrder);
  fastify.post(
    "/all-orders",
    { preHandler: [storeAdminProtect] },
    getFarmerOrders
  );

  // OUTGOING ORDER ROUTES
  fastify.post(
    "/create-outgoing-order",
    { preHandler: [storeAdminProtect] },
    createOutgoingOrder
  );

  // delete the orders from order model after new outgoing order has been created
  fastify.delete(
    "/update-orders",
    { preHandler: [storeAdminProtect] },
    updateOrdersAfterOutgoing
  );

  // get farmer outgoing orders
  fastify.post(
    "/farmer-outgoing",
    { preHandler: [storeAdminProtect] },
    getFarmerOutgoingOrders
  );

  fastify.put(
    "/farmer-outgoing",
    { preHandler: [storeAdminProtect] },
    updateFarmerOutgoingOrder
  );

  fastify.delete(
    "/farmer-outgoing",
    { preHandler: [storeAdminProtect] },
    deleteFarmerOutgoingOrder
  );

  // get payment history of the outgoing order
  fastify.post(
    "/farmer-payment-history",
    { preHandler: [storeAdminProtect] },
    getPaymentHistory
  );

  done();
}

export default storeAdminRoutes;
