import bcrypt from "bcryptjs";
import generateToken from "../utils/generateToken.js";
import SuperAdmin from "../models/superAdminModel.js";
import StoreAdmin from "../models/storeAdminModel.js";
import mongoose from "mongoose";
import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";

const loginSuperAdmin = async (req, reply) => {
  try {
    const { email, password } = req.body;
    const superAdmin = await SuperAdmin.findOne({ email });

    if (!superAdmin) {
      return reply.code(404).send({
        status: "Fail",
        message: "Super admin not found",
      });
    }

    const isMatch = await bcrypt.compare(password, superAdmin.password);

    if (!isMatch) {
      // Explicitly handling wrong password case
      return reply.code(401).send({
        status: "Fail",
        message: "Invalid email or password",
      });
    }

    const token = await generateToken(reply, superAdmin._id, false);

    return reply.code(200).send({
      status: "Success",
      superAdmin,
      token,
    });
  } catch (err) {
    req.log.error("Error during super admin login", { err });
    return reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while super admin login",
      errorMessage: err.message,
    });
  }
};

const logoutSuperAdmin = async (req, reply) => {
  try {
    // Clear the JWT cookie by setting an empty value and an expired date
    reply.cookie("jwt", "", {
      httpOnly: true,
      expires: new Date(0),
    });
    req.log.info("JWT cookie cleared successfully");

    // Send success response
    reply.code(200).send({
      status: "Success",
      message: "User logged out successfully",
    });

    req.log.info("Super admin logged out successfully");
  } catch (err) {
    req.log.error("Error during super admin logout", { err });

    // Handle any errors that occur during logout
    reply.code(500).send({
      status: "Fail",
      message: "Some error occured during super admin logout",
      errorMessage: err.message,
    });
  }
};

const getAllColdStorages = async (req, reply) => {
  try {
    const storeAdmins = await StoreAdmin.find();

    if (!storeAdmins || storeAdmins.length === 0) {
      return reply.code(404).send({
        status: "Fail",
        message: "No cold storages found",
      });
    }

    return reply.code(200).send({
      status: "Success",
      storeAdmins,
    });
  } catch (err) {
    req.log.error("Error fetching cold storages", { err });
    return reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while fetching cold storages",
      errorMessage: err.message,
    });
  }
};

const coldStorageSummary = async (req, reply) => {
  try {
    const coldStorageId = req.params.id;

    if (!coldStorageId) {
      return reply.code(400).send({
        status: "Fail",
        message: "coldStorageId is required",
      });
    }

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid ID format",
        errorMessage: "Please provide a valid MongoDB ObjectId",
      });
    }

    // Aggregate incoming orders
    const incomingOrders = await Order.aggregate([
      {
        $match: {
          coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
        },
      },
      { $unwind: "$orderDetails" },
      { $unwind: "$orderDetails.bagSizes" },
      {
        $group: {
          _id: {
            variety: "$orderDetails.variety",
            size: "$orderDetails.bagSizes.size",
          },
          initialQuantity: {
            $sum: "$orderDetails.bagSizes.quantity.initialQuantity",
          },
          currentQuantity: {
            $sum: "$orderDetails.bagSizes.quantity.currentQuantity",
          },
        },
      },
    ]);

    // Aggregate outgoing orders
    const outgoingOrders = await OutgoingOrder.aggregate([
      {
        $match: {
          coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
        },
      },
      { $unwind: "$orderDetails" },
      { $unwind: "$orderDetails.bagSizes" },
      {
        $group: {
          _id: {
            variety: "$orderDetails.variety",
            size: "$orderDetails.bagSizes.size",
          },
          quantityRemoved: {
            $sum: "$orderDetails.bagSizes.quantityRemoved",
          },
        },
      },
    ]);

    // Transform incoming orders into a structured object
    const incomingSummary = incomingOrders.reduce((acc, order) => {
      const { variety, size } = order._id;
      if (!acc[variety]) acc[variety] = {};
      acc[variety][size] = {
        initialQuantity: order.initialQuantity,
        currentQuantity: order.currentQuantity,
      };
      return acc;
    }, {});

    // Add outgoing quantities to the structured object
    outgoingOrders.forEach((order) => {
      const { variety, size } = order._id;
      if (!incomingSummary[variety]) incomingSummary[variety] = {};
      if (!incomingSummary[variety][size]) {
        incomingSummary[variety][size] = {
          initialQuantity: 0,
          currentQuantity: 0,
        };
      }
      incomingSummary[variety][size].quantityRemoved = order.quantityRemoved;
    });

    // Convert the stock summary object into an array
    const stockSummaryArray = Object.entries(incomingSummary).map(
      ([variety, sizes]) => ({
        variety,
        sizes: Object.entries(sizes).map(([size, quantities]) => ({
          size,
          ...quantities,
        })),
      })
    );

    reply.code(200).send({
      status: "Success",
      stockSummary: stockSummaryArray,
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while calculating cold storage summary",
      errorMessage: err.message,
    });
  }
};

export {
  loginSuperAdmin,
  getAllColdStorages,
  logoutSuperAdmin,
  coldStorageSummary,
};
