import bcrypt from "bcryptjs";
import generateToken from "../utils/generateToken.js";
import SuperAdmin from "../models/superAdminModel.js";
import StoreAdmin from "../models/storeAdminModel.js";
import Farmer from "../models/farmerModel.js";
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

    const token = await generateToken(reply, superAdmin._id, true);

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

const getIncomingOrdersOfAColdStorage = async (req, reply) => {
  try {
    const { id } = req.params;

    if (!id) {
      return reply.code(400).send({
        status: "Fail",
        message: "Cold storage ID is required",
      });
    }

    // Find orders by coldStorageId
    const orders = await Order.find({ coldStorageId: id });

    if (!orders.length) {
      return reply.code(404).send({
        status: "Fail",
        message: "No orders found for this cold storage",
      });
    }

    reply.code(200).send({
      status: "Success",
      message: "Cold storage orders retrieved successfully",
      data: orders,
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while retrieving cold storage orders",
      errorMessage: err.message,
    });
  }
};

const editIncomingOrder = async (req, reply) => {
  try {
    const { orderId } = req.params;
    const updates = req.body;

    // Validate orderId
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid order ID format",
      });
    }

    // Find the existing order
    const existingOrder = await Order.findById(orderId);
    if (!existingOrder) {
      return reply.code(404).send({
        status: "Fail",
        message: "Order not found",
      });
    }

    req.log.info("Processing order update", {
      orderId,
      updates,
      requestId: req.id,
    });

    // ✅ Step 1: Handle direct field updates
    const allowedDirectUpdates = ["remarks", "dateOfSubmission", "fulfilled"];
    allowedDirectUpdates.forEach((field) => {
      if (updates[field] !== undefined) {
        existingOrder[field] = updates[field];
      }
    });

    // ✅ Step 2: Handle orderDetails updates
    if (updates.orderDetails && Array.isArray(updates.orderDetails) && updates.orderDetails.length > 0) {
      // Since each order should have only one variety entry, we always use the first item in the array
      const updateDetail = updates.orderDetails[0];
      
      if (!updateDetail.variety) {
        throw new Error("Variety is required for order details");
      }

      if (
        !updateDetail.bagSizes ||
        !Array.isArray(updateDetail.bagSizes) ||
        updateDetail.bagSizes.length === 0
      ) {
        throw new Error(
          `At least one bag size is required for variety ${updateDetail.variety}`
        );
      }

      // Validate bag sizes
      updateDetail.bagSizes.forEach((bag) => {
        if (!bag.size) {
          throw new Error(
            `Size is required for bag sizes in variety ${updateDetail.variety}`
          );
        }
        if (
          !bag.quantity ||
          bag.quantity.initialQuantity === undefined ||
          bag.quantity.currentQuantity === undefined
        ) {
          throw new Error(
            `Both initialQuantity and currentQuantity are required for bag size ${bag.size} in variety ${updateDetail.variety}`
          );
        }
        if (bag.quantity.initialQuantity < 0 || bag.quantity.currentQuantity < 0) {
          throw new Error(
            `Negative quantities are not allowed for ${updateDetail.variety} - ${bag.size}`
          );
        }
      });

      // Update the location if provided
      if (updateDetail.location !== undefined) {
        // If the order already has an orderDetails array with at least one item
        if (existingOrder.orderDetails && existingOrder.orderDetails.length > 0) {
          // Update the location of the existing variety
          existingOrder.orderDetails[0].location = updateDetail.location;
        } else {
          // If there's no orderDetails array yet, create one with the location
          existingOrder.orderDetails = [{
            variety: updateDetail.variety,
            bagSizes: updateDetail.bagSizes,
            location: updateDetail.location
          }];
        }
      }

      // Always maintain a single variety entry
      if (existingOrder.orderDetails && existingOrder.orderDetails.length > 0) {
        // Update the variety name and bag sizes
        existingOrder.orderDetails[0].variety = updateDetail.variety;
        existingOrder.orderDetails[0].bagSizes = updateDetail.bagSizes;
      } else {
        // Create a new orderDetails array with single entry if it doesn't exist
        existingOrder.orderDetails = [updateDetail];
      }
    }

    // ✅ Step 3: Recalculate `currentStockAtThatTime`
    let newCurrentStock = 0;
    try {
      const coldStorageId = existingOrder.coldStorageId;
      const originalOrderId = existingOrder._id;

      const result = await Order.aggregate([
        {
          $match: {
            coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
            _id: { $ne: new mongoose.Types.ObjectId(originalOrderId) },
          },
        },
        { $unwind: "$orderDetails" },
        { $unwind: "$orderDetails.bagSizes" },
        {
          $group: {
            _id: null,
            totalCurrentQuantity: {
              $sum: "$orderDetails.bagSizes.quantity.currentQuantity",
            },
          },
        },
      ]);

      const baseStock = result.length > 0 ? result[0].totalCurrentQuantity : 0;

      const orderStock = existingOrder.orderDetails.reduce(
        (totalStock, detail) =>
          totalStock +
          detail.bagSizes.reduce(
            (sum, bag) => sum + (bag.quantity.currentQuantity || 0),
            0
          ),
        0
      );

      newCurrentStock = baseStock + orderStock;

      req.log.info("Recalculated current stock", {
        baseStock,
        orderStock,
        newCurrentStock,
        orderId,
        requestId: req.id,
      });
    } catch (error) {
      req.log.error("Error recalculating stock", {
        error: error.message,
        stack: error.stack,
        orderId,
        requestId: req.id,
      });

      return reply.code(500).send({
        status: "Fail",
        message: "Error recalculating stock",
        errorMessage: error.message,
      });
    }

    existingOrder.currentStockAtThatTime = newCurrentStock;

    // ✅ Step 4: Save the updated order
    const updatedOrder = await existingOrder.save();

    reply.code(200).send({
      status: "Success",
      message: "Order updated successfully",
      data: updatedOrder,
    });
  } catch (err) {
    req.log.error("Error updating order", {
      error: err.message,
      stack: err.stack,
      orderId: req.params?.orderId,
      requestId: req.id,
    });

    reply.code(400).send({
      status: "Fail",
      message: "Failed to update order",
      errorMessage: err.message,
    });
  }
};


const getFarmerInfo = async (req, reply) => {
  try {
    const { id } = req.params;
    if (!id) {
      return reply.code(400).send({
        status: "Fail",
        message: "Farmer ID is required",
      });
    }
    
    // Find farmer by id
    const farmer = await Farmer.findById(id);
    if (!farmer) {
      return reply.code(404).send({
        status: "Fail",
        message: "Farmer not found with the provided ID",
      });
    }
    
    reply.code(200).send({
      status: "Success",
      message: "Farmer information retrieved successfully",
      data: farmer,
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while retrieving farmer information",
      errorMessage: err.message,
    });
  }
};

const getFarmersOfAColdStorage = async (req, reply) => {
  try {
    const { id } = req.params;
    if (!id) {
      return reply.code(400).send({
        status: "Fail",
        message: "Cold storage ID is required",
      });
    }
    
    const storeAdmin = await StoreAdmin.findById(id)
      .populate({
        path: 'registeredFarmers',  // Change this to your actual field name that contains farmer references
        select: '-password -__v'    // Optional: exclude sensitive or unnecessary fields
      });
      
    if (!storeAdmin) { 
      return reply.code(404).send({
        status: "Fail",
        message: "Cold storage not found",
      });
    }
    
    reply.code(200).send({
      status: "Success",
      message: "Cold storage orders retrieved successfully",
      data: storeAdmin.registeredFarmers
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while retrieving cold storage orders",
      errorMessage: err.message,
    });
  }
};

const deleteOrder = async (req, reply) => {
  try {
    const { id } = req.params;

    if (!id) {
      return reply.code(400).send({
        status: "Fail",
        message: "Order ID is required"
      });
    }

    // Validate if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid order ID format"
      });
    }

    // Find and delete the order
    const deletedOrder = await Order.findByIdAndDelete(id);

    if (!deletedOrder) {
      return reply.code(404).send({
        status: "Fail",
        message: "Order not found"
      });
    }

    reply.code(200).send({
      status: "Success",
      message: "Order deleted successfully",
      data: deletedOrder
    });

  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while deleting the order",
      errorMessage: err.message
    });
  }
};

const getOutgoingOrdersOfAColdStorage = async (req, reply) => {
  try {
    const { id } = req.params;

    if (!id) {
      return reply.code(400).send({
        status: "Fail",
        message: "Cold storage ID is required",
      });
    }

    // Find orders by coldStorageId
    const orders = await OutgoingOrder.find({ coldStorageId: id });

    if (!orders.length) {
      return reply.code(200).send({
        status: "Fail",
        message: "No orders found for this cold storage",
      });
    }

    reply.code(200).send({
      status: "Success",
      message: "Cold storage orders retrieved successfully",
      data: orders,
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while retrieving cold storage orders",
      errorMessage: err.message,
    });
  }
};

export {
  loginSuperAdmin,
  getAllColdStorages,
  logoutSuperAdmin,
  coldStorageSummary,
  getIncomingOrdersOfAColdStorage,
  editIncomingOrder,
  getFarmersOfAColdStorage,
  getFarmerInfo,
  deleteOrder,
  getOutgoingOrdersOfAColdStorage

};
