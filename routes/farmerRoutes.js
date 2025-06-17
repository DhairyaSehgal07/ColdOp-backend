import {
  acceptRequest,
  getAllColdStorages,
  getRegisteredStoreAdmins,
  getStoreAdminDetails,
  getStoreAdminRequests,
  loginFarmer,
  logoutFarmer,
  registerFarmer,
  rejectRequest,
  updateFarmerProfile,
} from "../controllers/farmerController.js";

import { protect } from "../middleware/authMiddleware.js";
import { deleteProfilePhoto, uploadProfilePhoto } from "../utils/cloudinary.js";
import { uploadMiddleware } from "../middleware/uploadMiddleware.js";
import {
  forgotPasswordGetMobile,
  handleResetPasswordSuccess,
  resetPasswordForm,
  updatePassword,
} from "../utils/farmers/forgotPassword.js";
import {
  mobileOtpHandler,
  resendMobileOtpHandler,
  verifyFarmerMobile,
} from "../utils/farmers/mobileVerification.js";

function userRoutes(fastify, options, done) {
  // farmer_auth routes
  fastify.post("/register", registerFarmer);
  fastify.post("/login", loginFarmer);
  fastify.post("/logout", logoutFarmer);

  fastify.get(
    "/registered-store-admins",
    { preHandler: [protect] },
    getRegisteredStoreAdmins,
  );
  fastify.put("/profile", { preHandler: [protect] }, updateFarmerProfile);

  //mobile-verification routes
  fastify.post("/send-otp", mobileOtpHandler);
  fastify.post("/verify-mobile", verifyFarmerMobile);
  fastify.post("/resend-otp", resendMobileOtpHandler);

  //profile photo routes
  fastify.post("/upload-profile-photo", { preHandler: [uploadMiddleware] }, uploadProfilePhoto);
  fastify.delete("/delete-profile-photo", deleteProfilePhoto);

  // get store-admin details pre registration
  fastify.post("/store-admin-details", getStoreAdminDetails);

  // forgot-password routes
  fastify.post("/forgot-password", forgotPasswordGetMobile);
  fastify.get("/reset-password", resetPasswordForm);
  fastify.put("/reset-password", updatePassword);

  fastify.get("/reset-password/success", handleResetPasswordSuccess);

  // Farmer Features Routes
  fastify.get(
    "/all-cold-storages",
    { preHandler: [protect] },
    getAllColdStorages,
  );

  // get register requests from store-admins
  fastify.get(
    "/all-requests",
    { preHandler: [protect] },
    getStoreAdminRequests,
  );
  fastify.post("/requests/accept", { preHandler: [protect] }, acceptRequest);
  fastify.delete("/requests/reject", { preHandler: [protect] }, rejectRequest);

  // //ORDER CONTROLLER FUNCTIONS
  // fastify.post(
  //   "/cold-storage-orders",
  //   { preHandler: [protect] },
  //   getOrdersFromColdStorage
  // );

  // // Outgoing order controller functions
  // fastify.post(
  //   "/extracted",
  //   { preHandler: [protect] },
  //   getFarmerOutgoingOrders
  // );

  // // get payment history
  // fastify.post(
  //   "/extracted-payment-history",
  //   { preHandler: [protect] },
  //   getPaymentHistory
  // );
  done();
}

export default userRoutes;
