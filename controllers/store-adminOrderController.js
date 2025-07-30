import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";
import Farmer from "../models/farmerModel.js";
import { orderSchema } from "../utils/validationSchemas.js";
import {
  getDeliveryVoucherNumberHelper,
  getReceiptNumberHelper,
  formatDate,
} from "../utils/helpers.js";
import mongoose from "mongoose";
import StoreAdmin from "../models/storeAdminModel.js";

// ORDER ROUTES CONTROLLER FUCNTIONS

//@desc  Get receipt number
//@route GET/api/store-admin/receipt-number
//@access Private
const getReceiptNumber = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdmin._id;
    const { type } = req.query; // use query param ?type=incoming or ?type=outgoing

    req.log.info("Fetching receipt number", { storeAdminId, type });

    // Validate type
    if (!['incoming', 'outgoing'].includes(type?.toLowerCase())) {
      req.log.warn("Invalid type parameter", { type });
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid type parameter. Must be 'incoming' or 'outgoing'.",
      });
    }

    // Pick the right model based on type
    const Model = type.toLowerCase() === 'incoming' ? Order : OutgoingOrder;

    req.log.info("Using model for receipt number aggregation", { model: Model.modelName });

    // Run aggregation to count documents for this storeAdminId
    const result = await Model.aggregate([
      {
        $match: {
          coldStorageId: new mongoose.Types.ObjectId(storeAdminId),
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
        },
      },
    ]);

    const receiptNumber = result.length > 0 ? result[0].count : 0;

    req.log.info("Receipt number calculation complete", { receiptNumber });

    reply.code(200).send({
      status: "Success",
      receiptNumber: receiptNumber + 1,
    });
  } catch (err) {
    req.log.error("Error occurred while getting receipt number", {
      errorMessage: err.message,
    });
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while getting receipt number",
      errorMessage: err.message,
    });
  }
};

// @desc Create new Incoming Order
//@route POST/api/store-admin/orders
//@access Private
const searchFarmers = async (req, reply) => {
  try {
    const coldStorageId = req.storeAdmin._id;
    const searchQuery = req.query.query;

    console.log("SEARCH QUERY IS: ", searchQuery);
    console.log("COLD STORAGE ID IS: ", coldStorageId);

    // MongoDB aggregation pipeline
    req.log.info("Running aggregation pipeline for farmer search");
    const result = await Farmer.aggregate([
      {
        $search: {
          index: "farmer-name",
          autocomplete: {
            query: searchQuery,
            path: "name",
            fuzzy: {
              maxEdits: 2,
              prefixLength: 1,
            },
          },
        },
      },
      {
        $match: {
          "registeredStoreAdmins.0": new mongoose.Types.ObjectId(coldStorageId)
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          mobileNumber: 1,
          address: 1,
        },
      },
    ]);

    // Log the search results
    req.log.info("Farmer search completed", {
      resultsFound: result.length,
    });

    // Check if result is empty
    if (result.length === 0) {
      req.log.info("No farmers found matching search criteria");
      reply.code(404).send({
        status: "Fail",
        message: "No results found",
      });
    } else {
      req.log.info("Successfully found matching farmers", {
        farmersCount: result.length,
      });
      reply.code(200).send(result);
    }
  } catch (err) {
    // Log error details
    req.log.error("Error occurred while searching farmers", {
      errorMessage: err.message,
      searchQuery: req.query.query,
      coldStorageId: req.storeAdmin._id,
    });

    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while searching farmers",
      errorMessage: err.message || "An unexpected error occurred.",
    });
  }
};

// First, create a helper function that calculates stock without HTTP response handling
const getCurrentStock = async (coldStorageId, req) => {
  try {
    req.log.info("Calculating current stock for helper function", {
      coldStorageId,
      requestId: req.id,
    });

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      throw new Error("Invalid ID format");
    }

    // Aggregate incoming orders to sum currentQuantity
    const result = await Order.aggregate([
      {
        $match: {
          coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
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

    return result.length > 0 ? result[0].totalCurrentQuantity : 0;
  } catch (error) {
    req.log.error("Error in calculate current stock helper", {
      error: error.message,
      stack: error.stack,
      coldStorageId,
      requestId: req.id,
    });
    throw error;
  }
};

// Modify the createNewIncomingOrder function
const createNewIncomingOrder = async (req, reply) => {
  try {
    orderSchema.parse(req.body);

    const { coldStorageId, farmerId, orderDetails, remarks } = req.body;

    // Format current date to DD.MM.YY
    const formattedDate = new Date()
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })
      .split("/")
      .join(".");

    // Format and validate orderDetails
    const formattedOrderDetails = orderDetails.map((order) => {
      // Format variety - just capitalize first letter, no replacing spaces
      const formattedVariety = order.variety
        .replace(/^./, (char) => char.toUpperCase());

      // Format and validate bagSizes, filtering out zero quantities
      const formattedBagSizes = order.bagSizes
        .map((bag) => {
          // Check for negative values first
          if (
            bag.quantity?.initialQuantity < 0 ||
            bag.quantity?.currentQuantity < 0
          ) {
            throw new Error(
              `Negative quantities are not allowed for ${formattedVariety} - ${bag.size}`
            );
          }

          const formattedSize = bag.size
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/^./, (char) => char.toUpperCase());

          return {
            ...bag,
            size: formattedSize,
          };
        })
        // Filter out bags with zero quantities
        .filter(
          (bag) =>
            bag.quantity?.initialQuantity > 0 ||
            bag.quantity?.currentQuantity > 0
        );

      // Check if any bags remain after filtering
      if (formattedBagSizes.length === 0) {
        throw new Error(
          `All quantities are zero for variety ${formattedVariety}. At least one bag size must have a non-zero quantity.`
        );
      }

      return {
        ...order,
        variety: formattedVariety,
        bagSizes: formattedBagSizes,
      };
    });

    const receiptNumber = await getReceiptNumberHelper(coldStorageId);

    if (!receiptNumber) {
      return reply.code(500).send({
        status: "Fail",
        message: "Failed to get RECEIPT number",
      });
    }

    // Calculate the existing stock
    let existingStock;
    try {
      existingStock = await getCurrentStock(coldStorageId, req);

      req.log.info("Calculated existing stock", {
        existingStock,
        coldStorageId,
        requestId: req.id,
      });
    } catch (error) {
      req.log.error("Error calculating existing stock", {
        error: error.message,
        coldStorageId,
        requestId: req.id,
      });
      return reply.code(500).send({
        status: "Fail",
        message: "Error calculating current stock",
        errorMessage: error.message,
      });
    }

    // Calculate additional stock from the current order
    let additionalStock = 0;
    try {
      additionalStock = formattedOrderDetails.reduce((sum, order) => {
        const orderSum = order.bagSizes.reduce(
          (bagSum, bag) => bagSum + (bag.quantity.currentQuantity || 0),
          0
        );
        return sum + orderSum;
      }, 0);

      req.log.info("Calculated additional stock from current order", {
        additionalStock,
        coldStorageId,
        requestId: req.id,
      });
    } catch (error) {
      req.log.error("Error calculating additional stock", {
        error: error.message,
        coldStorageId,
        requestId: req.id,
      });
      return reply.code(500).send({
        status: "Fail",
        message: "Error calculating additional stock from current order",
        errorMessage: error.message,
      });
    }

    // Combine existing stock with the new order's stock
    const currentStockAtThatTime = existingStock + additionalStock;

    req.log.info("Final current stock calculation", {
      existingStock,
      additionalStock,
      currentStockAtThatTime,
      coldStorageId,
      requestId: req.id,
    });

    const newOrder = new Order({
      coldStorageId,
      farmerId,
      voucher: {
        type: "RECEIPT",
        voucherNumber: receiptNumber,
      },
      currentStockAtThatTime,
      fulfilled: false,
      dateOfSubmission: formattedDate,
      remarks: remarks,
      orderDetails: formattedOrderDetails,
    });

    await newOrder.save();

    reply.code(201).send({
      status: "Success",
      message: "Incoming order created successfully",
      data: newOrder,
    });
  } catch (err) {
    req.log.error("Error creating new order", {
      error: err.message,
      stack: err.stack,
      coldStorageId: req.body?.coldStorageId,
      requestId: req.id,
    });

    reply.code(400).send({
      status: "Fail",
      message: "Failed to create new order",
      errorMessage: err.message,
    });
  }
};

const getSingleOrder = async (req, reply) => {
  try {
    const { id, type } = req.params;
    const storeAdminId = req.storeAdmin._id;
    req.log.info("Starting getSingleOrder process", {
      orderId: id,
      orderType: type,
      storeAdminId,
      requestId: req.id
    });
    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.log.warn("Invalid orderId provided", { orderId: id });
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid order ID format",
        errorMessage: "Please provide a valid MongoDB ObjectId"
      });
    }
    // Validate order type
    if (!['incoming', 'outgoing'].includes(type.toLowerCase())) {
      req.log.warn("Invalid order type provided", { type });
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid order type",
        errorMessage: "Order type must be either 'incoming' or 'outgoing'"
      });
    }
    // Determine which model to use based on type
    const Model = type.toLowerCase() === 'incoming' ? Order : OutgoingOrder;

    req.log.info("Querying database for order", {
      model: Model.modelName,
      orderId: id
    });
    // Find the order and populate farmer details
    const order = await Model.findOne({
      _id: id,
      coldStorageId: storeAdminId
    }).populate({
      path: 'farmerId',
      model: Farmer,
      select: '_id name mobileNumber address'
    });
    if (!order) {
      req.log.warn("Order not found", {
        orderId: id,
        type,
        storeAdminId
      });
      return reply.code(404).send({
        status: "Fail",
        message: "Order not found"
      });
    }
    req.log.info("Successfully retrieved order", {
      orderId: id,
      type,
      storeAdminId
    });

    reply.code(200).send({
      status: "Success",
      data: order
    });
  } catch (err) {
    req.log.error("Error retrieving order", {
      error: err.message,
      stack: err.stack,
      orderId: req.params?.id,
      type: req.params?.type,
      storeAdminId: req.storeAdmin._id,
      requestId: req.id
    });
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while retrieving order",
      errorMessage: err.message
    });
  }
};

const editIncomingOrder = async (req, reply) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const orderId = req.params.id;
    const updates = req.body;

    // Validate orderId
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      req.log.warn("Invalid orderId provided", { orderId });
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid order ID format",
      });
    }

    // Find the existing order
    const existingOrder = await Order.findById(orderId).session(session);
    if (!existingOrder) {
      req.log.warn("Order not found", { orderId });
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

    // Step 1: Handle direct field updates
    const allowedDirectUpdates = ["remarks", "dateOfSubmission", "fulfilled"];
    allowedDirectUpdates.forEach((field) => {
      if (updates[field] !== undefined) {
        existingOrder[field] = updates[field];
      }
    });

    // Step 2: Handle orderDetails updates
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

      // Filter out zero-quantity bagSizes
      updateDetail.bagSizes = updateDetail.bagSizes.filter(bag =>
        bag.quantity.initialQuantity > 0 || bag.quantity.currentQuantity > 0
      );

      if (updateDetail.bagSizes.length === 0) {
        throw new Error("At least one bag size must have non-zero quantities");
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

    // Get all receipts (including current) sorted by createdAt
    const allReceipts = await Order.find({
      coldStorageId: existingOrder.coldStorageId,
      createdAt: { $lte: existingOrder.createdAt }
    })
    .sort({ createdAt: 1 })
    .session(session);

    // Calculate cumulative stock up to current receipt
    let cumulativeStock = 0;
    for (const receipt of allReceipts) {
      if (receipt._id.equals(existingOrder._id)) {
        // For the current receipt, use the updated quantities
        cumulativeStock += existingOrder.orderDetails.reduce((total, detail) =>
          total + detail.bagSizes.reduce((sum, bag) =>
            sum + bag.quantity.currentQuantity, 0
          ), 0
        );
      } else {
        // For other receipts, use their existing quantities
        cumulativeStock += receipt.orderDetails.reduce((total, detail) =>
          total + detail.bagSizes.reduce((sum, bag) =>
            sum + bag.quantity.currentQuantity, 0
          ), 0
        );
      }

      if (receipt._id.equals(existingOrder._id)) {
        existingOrder.currentStockAtThatTime = cumulativeStock;
      } else {
        await Order.updateOne(
          { _id: receipt._id },
          { $set: { currentStockAtThatTime: cumulativeStock } }
        ).session(session);
      }
    }

    // Get all future receipts and update their stock
    const futureReceipts = await Order.find({
      coldStorageId: existingOrder.coldStorageId,
      createdAt: { $gt: existingOrder.createdAt }
    })
    .sort({ createdAt: 1 })
    .session(session);

    // Update stock for future receipts
    for (const receipt of futureReceipts) {
      cumulativeStock += receipt.orderDetails.reduce((total, detail) =>
        total + detail.bagSizes.reduce((sum, bag) =>
          sum + bag.quantity.currentQuantity, 0
        ), 0
      );

      await Order.updateOne(
        { _id: receipt._id },
        { $set: { currentStockAtThatTime: cumulativeStock } }
      ).session(session);
    }

    // Save the updated order
    const updatedOrder = await existingOrder.save({ session });

    await session.commitTransaction();
    session.endSession();

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

    await session.abortTransaction();
    session.endSession();

    reply.code(400).send({
      status: "Fail",
      message: "Failed to update order",
      errorMessage: err.message,
    });
  }
};

const getFarmerIncomingOrders = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdmin._id;
    const { id } = req.params;

    // Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(storeAdminId)
    ) {
      req.log.warn("Invalid farmerId or storeAdminId provided", {
        farmerId: id,
        storeAdminId,
      });
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid ID format",
        errorMessage: "Please provide valid MongoDB ObjectIds",
      });
    }

    // Log the start of the request
    req.log.info("Fetching farmer incoming orders", {
      farmerId: id,
      storeAdminId,
    });

    // Perform the Mongoose query to find orders
    const orders = await Order.find({
      coldStorageId: storeAdminId,
      farmerId: id,
    });

    const orderObjs = orders.map(order => order.toObject());

    if (!orderObjs || orderObjs.length === 0) {
      req.log.info("No orders found for farmer", {
        farmerId: id,
        storeAdminId,
      });

      return reply.code(200).send({
        status: "Fail",
        message: "Farmer doesn't have any orders",
      });
    }

    // Log the successful response
    req.log.info("Successfully retrieved farmer orders", {
      farmerId: id,
      orderCount: orderObjs.length,
    });

    // Sending a success response with the orders (no sorting)
    reply.code(200).send({
      status: "Success",
      data: orderObjs,
    });
  } catch (err) {
    // Log the error with context
    req.log.error("Error occurred while getting farmer orders", {
      farmerId: req.params.id,
      storeAdminId: req.storeAdmin._id,
      errorMessage: err.message,
      stack: err.stack,
    });

    // Sending error response
    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while getting farmer orders",
      errorMessage: err.message,
    });
  }
};

const getAllFarmerOrders = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdmin._id;
    const { id } = req.params;

    // Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(storeAdminId)
    ) {
      req.log.warn("Invalid farmerId or storeAdminId provided", {
        farmerId: id,
        storeAdminId,
      });
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid ID format",
        errorMessage: "Please provide valid MongoDB ObjectIds",
      });
    }

    req.log.info("Starting to fetch all farmer orders", {
      farmerId: id,
      storeAdminId,
    });

    const [incomingOrders, outgoingOrders] = await Promise.all([
      Order.find({ coldStorageId: storeAdminId, farmerId: id })
        .populate({
          path: "farmerId",
          model: Farmer,
          select: "_id farmerId name",
        })
        .select(
          "_id coldStorageId farmerId remarks currentStockAtThatTime voucher dateOfSubmission orderDetails createdAt"
        ),
      OutgoingOrder.find({ coldStorageId: storeAdminId, farmerId: id })
        .populate({
          path: "farmerId",
          model: Farmer,
          select: "_id farmerId name",
        })
        .select(
          "_id coldStorageId farmerId remarks currentStockAtThatTime voucher dateOfExtraction orderDetails createdAt"
        ),
    ]);

    req.log.info("Retrieved orders from database", {
      farmerId: id,
      incomingOrdersCount: incomingOrders.length,
      outgoingOrdersCount: outgoingOrders.length,
    });

    // Helper function to sort bag sizes within orders
    const sortOrderDetails = (orders) => {
      return orders.map((order) => {
        const orderObj = order.toObject();
        orderObj.orderDetails = orderObj.orderDetails.map((detail) => ({
          ...detail,
          bagSizes: detail.bagSizes.sort((a, b) =>
            a.size.localeCompare(b.size)
          ),
        }));
        return orderObj;
      });
    };

    const addOrderType = (orders, type) =>
      orders.map((order) => ({ ...order, orderType: type }));

    // Sort bag sizes, add type, and combine
    const sortedIncoming = addOrderType(
      sortOrderDetails(incomingOrders),
      "incoming"
    );
    const sortedOutgoing = addOrderType(
      sortOrderDetails(outgoingOrders),
      "outgoing"
    );

    const allOrders = [...sortedIncoming, ...sortedOutgoing].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    if (allOrders.length === 0) {
      req.log.info("No orders found for farmer", {
        farmerId: id,
        storeAdminId,
      });
      return reply.code(200).send({
        status: "Fail",
        message: "Farmer doesn't have any orders",
        data: [],
      });
    }

    req.log.info("Successfully retrieved all farmer orders", {
      farmerId: id,
      totalOrders: allOrders.length,
      incomingOrders: incomingOrders.length,
      outgoingOrders: outgoingOrders.length,
    });

    reply.code(200).send({
      status: "Success",
      message: "Orders retrieved successfully.",
      data: allOrders,
    });
  } catch (err) {
    req.log.error("Error occurred while getting all farmer orders", {
      farmerId: req.params.id,
      storeAdminId: req.storeAdmin._id,
      errorMessage: err.message,
      stack: err.stack,
    });

    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while getting farmer orders",
      errorMessage: err.message,
    });
  }
};


const filterOrdersByVariety = async (req, reply) => {
  try {
    const { varietyName, farmerId, coldStorageId } = req.body;

    // Validate required fields
    if (!varietyName || !farmerId || !coldStorageId) {
      req.log.warn("Missing required fields", {
        varietyName,
        farmerId,
        coldStorageId,
      });
      return reply.code(400).send({
        status: "Fail",
        message: "Missing required fields",
        errorMessage: "varietyName, farmerId, and coldStorageId are required",
      });
    }

    // Validate MongoDB ObjectIds
    if (
      !mongoose.Types.ObjectId.isValid(farmerId) ||
      !mongoose.Types.ObjectId.isValid(coldStorageId)
    ) {
      req.log.warn("Invalid ObjectId format", {
        farmerId,
        coldStorageId,
      });
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid ID format",
        errorMessage: "Please provide valid MongoDB ObjectIds",
      });
    }

    req.log.info("Starting order filtering by variety", {
      varietyName,
      farmerId,
      coldStorageId,
    });

    const filteredOrders = await Order.aggregate([
      {
        $match: {
          farmerId: new mongoose.Types.ObjectId(farmerId),
          coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
          orderDetails: {
            $elemMatch: {
              variety: varietyName,
            },
          },
        },
      },
    ]);

    req.log.info("Order filtering completed", {
      varietyName,
      ordersFound: filteredOrders.length,
    });

    if (!filteredOrders || filteredOrders.length === 0) {
      req.log.info("No orders found for specified variety", {
        varietyName,
        farmerId,
      });
      return reply.code(404).send({
        status: "Fail",
        message: "No orders found with the specified variety",
      });
    }

    req.log.info("Successfully retrieved filtered orders", {
      varietyName,
      orderCount: filteredOrders.length,
    });

    reply.code(200).send({
      status: "Success",
      message: "Orders filtered successfully",
      data: filteredOrders,
    });
  } catch (err) {
    req.log.error("Error occurred while filtering orders", {
      varietyName: req.body.varietyName,
      farmerId: req.body.farmerId,
      coldStorageId: req.body.coldStorageId,
      errorMessage: err.message,
      stack: err.stack,
    });

    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while filtering orders",
      errorMessage: err.message,
    });
  }
};

const getVarietyAvailableForFarmer = async (req, reply) => {
  try {
    const coldStorageId = req.storeAdmin._id;
    const farmerId = req.params.id;

    // Validate required fields
    if (!farmerId || !coldStorageId) {
      req.log.warn("Missing required IDs", {
        farmerId,
        coldStorageId,
      });
      return reply.code(400).send({
        status: "Fail",
        message: "farmerId and coldStorageId are required",
        errorMessage: "Missing required identification parameters",
      });
    }

    // Validate MongoDB ObjectIds
    if (
      !mongoose.Types.ObjectId.isValid(farmerId) ||
      !mongoose.Types.ObjectId.isValid(coldStorageId)
    ) {
      req.log.warn("Invalid ObjectId format", {
        farmerId,
        coldStorageId,
      });
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid ID format",
        errorMessage: "Please provide valid MongoDB ObjectIds",
      });
    }

    req.log.info("Starting variety availability check for farmer", {
      farmerId,
      coldStorageId,
    });

    const varieties = await Order.aggregate([
      {
        $match: {
          farmerId: new mongoose.Types.ObjectId(farmerId),
          coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
        },
      },
      {
        $unwind: "$orderDetails",
      },
      {
        $group: {
          _id: "$orderDetails.variety",
        },
      },
      {
        $project: {
          _id: 0,
          variety: "$_id",
        },
      },
    ]);

    req.log.info("Variety aggregation completed", {
      farmerId,
      varietiesFound: varieties.length,
    });

    const varietyList = varieties.map((v) => v.variety);

    req.log.info("Successfully retrieved varieties", {
      farmerId,
      varietyCount: varietyList.length,
      varieties: varietyList,
    });

    reply.code(200).send({
      status: "Success",
      varieties: varietyList,
    });
  } catch (err) {
    req.log.error("Error occurred while getting varieties", {
      farmerId: req.params.id,
      coldStorageId: req.storeAdmin._id,
      errorMessage: err.message,
      stack: err.stack,
    });

    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while getting available varieties",
      errorMessage: err.message,
    });
  }
};

const createOutgoingOrder = async (req, reply) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    req.log.info("Starting createOutgoingOrder process", {
      storeAdminId: req.storeAdmin._id,
      farmerId: req.params.id,
      body: req.body,
    });

    const { orders, remarks } = req.body;
    const { id } = req.params;

    console.log("orders is: ", orders);

    // Validate orders array
    if (!Array.isArray(orders) || orders.length === 0) {
      req.log.warn("Invalid orders array provided", {
        isArray: Array.isArray(orders),
        length: orders?.length,
      });
      throw new Error("Orders array is required and cannot be empty");
    }

    req.log.info("Validating order structure", { orderCount: orders.length });

    // Validate each order's structure
    orders.forEach((order, index) => {
      req.log.info("Validating order", {
        orderIndex: index,
        orderId: order.orderId,
        variety: order.variety,
        bagUpdatesCount: order.bagUpdates?.length,
      });

      if (
        !order.orderId ||
        !order.variety ||
        !Array.isArray(order.bagUpdates)
      ) {
        req.log.warn("Invalid order structure detected", {
          orderIndex: index,
          hasOrderId: !!order.orderId,
          hasVariety: !!order.variety,
          hasBagUpdates: Array.isArray(order.bagUpdates),
        });
        throw new Error(
          "Invalid order structure. Required fields: orderId, variety, bagUpdates"
        );
      }

      // Validate bagUpdates
      order.bagUpdates.forEach((update, bagIndex) => {
        req.log.info("Validating bag update", {
          orderIndex: index,
          bagIndex,
          size: update.size,
          quantityToRemove: update.quantityToRemove,
        });

        if (!update.size || typeof update.quantityToRemove !== "number") {
          req.log.warn("Invalid bag update structure", {
            orderIndex: index,
            bagIndex,
            hasSize: !!update.size,
            quantityType: typeof update.quantityToRemove,
          });
          throw new Error(
            "Invalid bag update structure. Required fields: size, quantityToRemove"
          );
        }

        // Check for negative quantities
        if (update.quantityToRemove < 0) {
          req.log.warn("Negative quantity to remove detected", {
            orderIndex: index,
            bagIndex,
            quantityToRemove: update.quantityToRemove,
          });
          throw new Error(
            `Invalid quantity to remove: ${update.quantityToRemove}. Must be greater than or equal to 0`
          );
        }
      });
    });

    req.log.info("Starting to fetch and validate incoming orders");

    // Fetch and validate incomingOrders
    const incomingOrders = await Promise.all(
      orders.map(async (order, index) => {
        const { orderId, variety, bagUpdates } = order;

        req.log.info("Fetching order details", {
          orderIndex: index,
          orderId,
          variety,
        });

        const fetchedOrder = await Order.findById(orderId).lean();
        if (!fetchedOrder) {
          req.log.warn("Order not found", {
            orderIndex: index,
            orderId,
          });
          throw new Error(`Order with ID ${orderId} not found`);
        }

        const matchingDetail = fetchedOrder.orderDetails.find(
          (detail) => detail.variety === variety
        );
        if (!matchingDetail) {
          req.log.warn("Variety not found in order", {
            orderIndex: index,
            orderId,
            variety,
            availableVarieties: fetchedOrder.orderDetails.map((d) => d.variety),
          });
          throw new Error(
            `Variety ${variety} not found in Order ID ${orderId}`
          );
        }

        req.log.info("Validating quantities for bag updates", {
          orderIndex: index,
          orderId,
          variety,
          bagUpdatesCount: bagUpdates.length,
        });

        // Validate quantities for each bag update
        bagUpdates.forEach((update, bagIndex) => {
          const matchingBag = matchingDetail.bagSizes.find(
            (bag) => bag.size === update.size
          );

          if (!matchingBag) {
            req.log.warn("Bag size not found", {
              orderIndex: index,
              bagIndex,
              size: update.size,
              availableSizes: matchingDetail.bagSizes.map((b) => b.size),
            });
            throw new Error(
              `Bag size ${update.size} not found for variety ${variety} in order ${orderId}`
            );
          }

          req.log.info("Checking quantity availability", {
            orderIndex: index,
            bagIndex,
            size: update.size,
            requested: update.quantityToRemove,
            available: matchingBag.quantity.currentQuantity,
          });

          if (matchingBag.quantity.currentQuantity < update.quantityToRemove) {
            req.log.warn("Insufficient quantity available", {
              orderIndex: index,
              bagIndex,
              variety,
              size: update.size,
              requested: update.quantityToRemove,
              available: matchingBag.quantity.currentQuantity,
            });
            throw new Error(
              `Insufficient quantity available for ${variety} size ${update.size}. ` +
                `Requested: ${update.quantityToRemove}, Available: ${matchingBag.quantity.currentQuantity}`
            );
          }
        });

        // Filter bagSizes based on provided sizes in req.body
        const filteredBagSizes = matchingDetail.bagSizes.filter((bag) =>
          bagUpdates.some((update) => update.size === bag.size)
        );

        req.log.info("Successfully processed order", {
          orderIndex: index,
          orderId,
          variety,
          filteredBagSizesCount: filteredBagSizes.length,
        });

        return {
          _id: fetchedOrder._id,
          location: matchingDetail.location,
          voucher: fetchedOrder.voucher,
          orderDetails: [
            {
              ...matchingDetail,
              incomingBagSizes: filteredBagSizes.map((bag) => ({
                size: bag.size,
                currentQuantity: bag.quantity.currentQuantity,
                initialQuantity: bag.quantity.initialQuantity,
              })),
            },
          ],
        };
      })
    );

    req.log.info("Successfully validated all orders and quantities", {
      processedOrdersCount: incomingOrders.length,
    });

    // Create a map for quick lookup
    const incomingOrderMap = incomingOrders.reduce((acc, order) => {
      acc[order._id] = order;
      return acc;
    }, {});

    // Calculate total current stock from all incoming orders
    const totalIncomingStock = await Order.aggregate([
      {
        $match: {
          coldStorageId: new mongoose.Types.ObjectId(req.storeAdmin._id),
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

    console.log("Total incoming stock aggregation result:", totalIncomingStock);
    console.log("Total incoming stock value:", totalIncomingStock.length > 0 ? totalIncomingStock[0].totalCurrentQuantity : 0);

    // Calculate current outgoing order total
    const currentOutgoingTotal = orders.reduce((total, order) => {
      console.log("Processing order for total calculation:", order);
      const orderTotal = order.bagUpdates.reduce((bagTotal, update) => {
        console.log("Processing bag update:", update);
        console.log("Current bag total:", bagTotal);
        console.log("Adding quantity:", update.quantityToRemove);
        return bagTotal + update.quantityToRemove;
      }, 0);
      console.log("Order total:", orderTotal);
      return total + orderTotal;
    }, 0);

    console.log("Current outgoing order total:", currentOutgoingTotal);

    // Calculate currentStockAtThatTime (modified formula)
    const incomingTotal = totalIncomingStock.length > 0 ? totalIncomingStock[0].totalCurrentQuantity : 0;
    const currentStockAtThatTime = incomingTotal - currentOutgoingTotal;

    console.log("Final calculation breakdown (Modified):");
    console.log("- Total Incoming Stock:", incomingTotal);
    console.log("- Current Order's Outgoing Total:", currentOutgoingTotal);
    console.log("= Current Stock At That Time:", currentStockAtThatTime);

    req.log.info("Stock calculation completed", {
      incomingTotal,
      currentOutgoingTotal,
      currentStockAtThatTime,
    });

    // Initialize bulk operations array
    const bulkOps = [];

    // Prepare outgoing order details in the new format
    const outgoingOrderDetails = orders.map(
      ({ orderId, variety, bagUpdates }) => {
        console.log("Processing variety:", variety);

        // Process bag updates for bulk operations and outgoing order details
        const bagDetails = bagUpdates
          .filter((update) => update.quantityToRemove > 0) // Filter out zero quantities
          .map((update) => {
            const { size, quantityToRemove } = update;
            console.log("Processing bag update:", { size, quantityToRemove, variety });

            // Prepare bulk operation for updating quantities in the source order
            bulkOps.push({
              updateOne: {
                filter: {
                  _id: new mongoose.Types.ObjectId(orderId),
                  "orderDetails.variety": variety,
                  "orderDetails.bagSizes.size": size,
                },
                update: {
                  $inc: {
                    "orderDetails.$[i].bagSizes.$[j].quantity.currentQuantity":
                      -quantityToRemove,
                  },
                },
                arrayFilters: [{ "i.variety": variety }, { "j.size": size }],
              },
            });

            return {
              size,
              quantityRemoved: quantityToRemove,
            };
          });

        // Add incomingOrder details from the map
        const incomingOrder = incomingOrderMap[orderId];

        // Fix: Ensure `currentQuantity` and `initialQuantity` are being mapped correctly
        const incomingBagSizes = incomingOrder.orderDetails.flatMap((detail) =>
          detail.incomingBagSizes.map((bag) => ({
            size: bag.size,
            currentQuantity: bag.currentQuantity,
            initialQuantity: bag.initialQuantity,
          }))
        );

        return {
          variety,
          bagSizes: bagDetails,
          incomingOrder: {
            _id: incomingOrder._id,
            location: incomingOrder.location,
            voucher: incomingOrder.voucher,
            incomingBagSizes,
          },
        };
      }
    );

    // Execute bulk write for inventory updates
    const result = await Order.bulkWrite(bulkOps, { session });

    const deliveryVoucherNumber = await getDeliveryVoucherNumberHelper(
      req.storeAdmin._id
    );

    // Create the outgoing order document with the new format
    const outgoingOrder = new OutgoingOrder({
      coldStorageId: req.storeAdmin._id,
      farmerId: id,
      voucher: {
        type: "DELIVERY",
        voucherNumber: deliveryVoucherNumber,
      },
      dateOfExtraction: formatDate(new Date()),
      orderDetails: outgoingOrderDetails,
      remarks: remarks,
      currentStockAtThatTime: currentStockAtThatTime,
    });

    await outgoingOrder.save();
    req.log.info("Outgoing order saved", {
      outgoingOrderId: outgoingOrder._id,
    });

    await session.commitTransaction();
    session.endSession();

    req.log.info("Transaction committed successfully");

    return reply.code(200).send({
      status:"Success",
      message: "Outgoing order processed successfully.",
      outgoingOrder,
    });
  } catch (err) {
    req.log.error("Error processing outgoing order", {
      errorMessage: err.message,
    });

    await session.abortTransaction();
    session.endSession();

    return reply.code(500).send({
      status: "Fail",
      message:
        "Error occurred while updating bag quantities and creating outgoing order",
      errorMessage: err.message,
    });
  }
};

const deleteOutgoingOrder = async (req, reply) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const storeAdminId = req.storeAdmin._id;

    req.log.info("Starting deleteOutgoingOrder process", {
      outgoingOrderId: id,
      storeAdminId,
    });

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.log.warn("Invalid outgoingOrderId provided", { outgoingOrderId: id });
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid outgoingOrderId format",
        errorMessage: "Please provide a valid MongoDB ObjectId",
      });
    }

    // Find the outgoing order by ID
    const outgoingOrder = await OutgoingOrder.findById(id).session(session);
    if (!outgoingOrder) {
      req.log.warn("Outgoing order not found", { outgoingOrderId: id });
      return reply.code(404).send({
        status: "Fail",
        message: "Outgoing order not found",
      });
    }

    // Validate storeAdminId
    if (!outgoingOrder.coldStorageId.equals(storeAdminId)) {
      req.log.warn("Unauthorized attempt to delete outgoing order", {
        outgoingOrderId: id,
        storeAdminId,
      });
      return reply.code(403).send({
        status: "Fail",
        message: "Unauthorized to delete this outgoing order",
      });
    }

    // Prepare bulk operations to revert inventory updates
    const bulkOps = outgoingOrder.orderDetails.flatMap((detail) =>
      detail.bagSizes.map((bag) => ({
        updateOne: {
          filter: {
            coldStorageId: storeAdminId,
            "orderDetails.variety": detail.variety,
            "orderDetails.bagSizes.size": bag.size,
          },
          update: {
            $inc: {
              "orderDetails.$[i].bagSizes.$[j].quantity.currentQuantity":
                bag.quantityRemoved,
            },
          },
          arrayFilters: [
            { "i.variety": detail.variety },
            { "j.size": bag.size },
          ],
        },
      }))
    );

    // Execute bulk write to revert inventory updates
    await Order.bulkWrite(bulkOps, { session });

    // Delete the outgoing order
    await outgoingOrder.deleteOne({ session });

    await session.commitTransaction();
    session.endSession();

    req.log.info("Outgoing order deleted successfully", {
      outgoingOrderId: id,
    });

    return reply.code(200).send({
      status: "Success",
      message: "Outgoing order deleted successfully",
    });
  } catch (err) {
    req.log.error("Error deleting outgoing order", {
      errorMessage: err.message,
      stack: err.stack,
      outgoingOrderId: req.params.id,
      storeAdminId: req.storeAdmin._id,
    });

    await session.abortTransaction();
    session.endSession();

    return reply.code(500).send({
      status: "Fail",
      message: "Error occurred while deleting outgoing order",
      errorMessage: err.message,
    });
  }
};

const editOutgoingOrder = async (req, reply) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const storeAdminId = req.storeAdmin._id;
    const { orderDetails, remarks } = req.body;

    req.log.info("Starting editOutgoingOrder process", {
      outgoingOrderId: id,
      storeAdminId,
      body: req.body,
    });

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.log.warn("Invalid outgoingOrderId provided", { outgoingOrderId: id });
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid outgoingOrderId format",
        errorMessage: "Please provide a valid MongoDB ObjectId",
      });
    }

    // Find the outgoing order by ID
    const outgoingOrder = await OutgoingOrder.findById(id).session(session);
    if (!outgoingOrder) {
      req.log.warn("Outgoing order not found", { outgoingOrderId: id });
      return reply.code(404).send({
        status: "Fail",
        message: "Outgoing order not found",
      });
    }

    // Validate storeAdminId
    if (!outgoingOrder.coldStorageId.equals(storeAdminId)) {
      req.log.warn("Unauthorized attempt to edit outgoing order", {
        outgoingOrderId: id,
        storeAdminId,
      });
      return reply.code(403).send({
        status: "Fail",
        message: "Unauthorized to edit this outgoing order",
      });
    }

    // Validate orderDetails array
    if (!Array.isArray(orderDetails) || orderDetails.length === 0) {
      req.log.warn("Invalid orderDetails array provided", {
        isArray: Array.isArray(orderDetails),
        length: orderDetails?.length,
      });
      throw new Error("orderDetails array is required and cannot be empty");
    }

    // Filter out zero-quantity bagSizes and empty varieties
    const filteredOrderDetails = orderDetails
      .map(detail => ({
        ...detail,
        bagSizes: detail.bagSizes.filter(bag =>
          bag.quantityRemoved > 0
        )
      }))
      .filter(detail => detail.bagSizes.length > 0);

    if (filteredOrderDetails.length === 0) {
      req.log.warn("All order details were filtered out due to zero quantities");
      throw new Error("At least one variety must have non-zero quantities");
    }

    // Prepare bulk operations to revert previous inventory updates
    const revertBulkOps = outgoingOrder.orderDetails.flatMap((detail) =>
      detail.bagSizes.map((bag) => ({
        updateOne: {
          filter: {
            coldStorageId: storeAdminId,
            "orderDetails.variety": detail.variety,
            "orderDetails.bagSizes.size": bag.size,
          },
          update: {
            $inc: {
              "orderDetails.$[i].bagSizes.$[j].quantity.currentQuantity":
                bag.quantityRemoved,
            },
          },
          arrayFilters: [
            { "i.variety": detail.variety },
            { "j.size": bag.size },
          ],
        },
      }))
    );

    // Execute bulk write to revert previous inventory updates
    await Order.bulkWrite(revertBulkOps, { session });

    // Prepare bulk operations to apply new inventory updates
    const applyBulkOps = filteredOrderDetails.flatMap((detail) =>
      detail.bagSizes.map((bag) => ({
        updateOne: {
          filter: {
            coldStorageId: storeAdminId,
            "orderDetails.variety": detail.variety,
            "orderDetails.bagSizes.size": bag.size,
          },
          update: {
            $inc: {
              "orderDetails.$[i].bagSizes.$[j].quantity.currentQuantity":
                -bag.quantityRemoved,
            },
          },
          arrayFilters: [
            { "i.variety": detail.variety },
            { "j.size": bag.size },
          ],
        },
      }))
    );

    // Execute bulk write to apply new inventory updates
    await Order.bulkWrite(applyBulkOps, { session });

    // Get all future orders (including current) sorted by createdAt
    const futureOrders = await OutgoingOrder.find({
      coldStorageId: storeAdminId,
      createdAt: { $gte: outgoingOrder.createdAt }
    })
    .sort({ createdAt: 1 })
    .session(session);

    // Calculate cumulative stock for each order
    let cumulativeStock = 0;
    const stockUpdateOps = [];

    for (const order of futureOrders) {
      // Calculate total stock up to this order's creation time
      const stockResult = await Order.aggregate([
        {
          $match: {
            coldStorageId: new mongoose.Types.ObjectId(storeAdminId),
            createdAt: { $lte: order.createdAt }
          }
        },
        { $unwind: "$orderDetails" },
        { $unwind: "$orderDetails.bagSizes" },
        {
          $group: {
            _id: null,
            totalStock: {
              $sum: "$orderDetails.bagSizes.quantity.currentQuantity"
            }
          }
        }
      ]).session(session);

      // Calculate total outgoing stock up to this order
      const outgoingResult = await OutgoingOrder.aggregate([
        {
          $match: {
            coldStorageId: new mongoose.Types.ObjectId(storeAdminId),
            createdAt: { $lt: order.createdAt }
          }
        },
        { $unwind: "$orderDetails" },
        { $unwind: "$orderDetails.bagSizes" },
        {
          $group: {
            _id: null,
            totalOutgoing: {
              $sum: "$orderDetails.bagSizes.quantityRemoved"
            }
          }
        }
      ]).session(session);

      const totalStock = stockResult[0]?.totalStock || 0;
      const totalOutgoing = outgoingResult[0]?.totalOutgoing || 0;

      // Calculate current order's outgoing total
      const currentOrderOutgoing = order.orderDetails.reduce((total, detail) =>
        total + detail.bagSizes.reduce((sum, bag) => sum + bag.quantityRemoved, 0)
      , 0);

      const newCurrentStockAtThatTime = totalStock - totalOutgoing - currentOrderOutgoing;

      stockUpdateOps.push({
        updateOne: {
          filter: { _id: order._id },
          update: { $set: { currentStockAtThatTime: newCurrentStockAtThatTime } }
        }
      });
    }

    // Execute all stock updates in bulk
    if (stockUpdateOps.length > 0) {
      await OutgoingOrder.bulkWrite(stockUpdateOps, { session });
    }

    // Update the outgoing order details
    outgoingOrder.orderDetails = filteredOrderDetails;
    outgoingOrder.remarks = remarks;

    await outgoingOrder.save({ session });

    await session.commitTransaction();
    session.endSession();

    req.log.info("Outgoing order edited successfully", {
      outgoingOrderId: id,
    });

    return reply.code(200).send({
      status: "Success",
      message: "Outgoing order edited successfully",
    });
  } catch (err) {
    req.log.error("Error editing outgoing order", {
      errorMessage: err.message,
      stack: err.stack,
      outgoingOrderId: req.params.id,
      storeAdminId: req.storeAdmin._id,
    });

    await session.abortTransaction();
    session.endSession();

    return reply.code(500).send({
      status: "Fail",
      message: "Error occurred while editing outgoing order",
      errorMessage: err.message,
    });
  }
};

const getFarmerStockSummary = async (req, reply) => {
  try {
    const coldStorageId = req.storeAdmin._id;
    const farmerId = req.params.id;

    req.log.info("Starting farmer stock summary calculation", {
      farmerId,
      coldStorageId,
      requestId: req.id,
    });

    if (!farmerId || !coldStorageId) {
      req.log.warn("Missing required IDs for farmer stock summary", {
        farmerId,
        coldStorageId,
        requestId: req.id,
      });
      return reply.code(400).send({
        status: "Fail",
        message: "farmerId and coldStorageId are required",
      });
    }

    // Validate MongoDB ObjectIds
    if (
      !mongoose.Types.ObjectId.isValid(farmerId) ||
      !mongoose.Types.ObjectId.isValid(coldStorageId)
    ) {
      req.log.warn("Invalid ObjectId format in farmer stock summary", {
        farmerId,
        coldStorageId,
        isValidFarmerId: mongoose.Types.ObjectId.isValid(farmerId),
        isValidColdStorageId: mongoose.Types.ObjectId.isValid(coldStorageId),
        requestId: req.id,
      });
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid ID format",
        errorMessage: "Please provide valid MongoDB ObjectIds",
      });
    }

    req.log.info("Starting farmer incoming orders aggregation", {
      farmerId,
      coldStorageId,
      requestId: req.id,
    });

    // Aggregate incoming orders
    const incomingOrders = await Order.aggregate([
      {
        $match: {
          farmerId: new mongoose.Types.ObjectId(farmerId),
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

    req.log.info("Completed farmer incoming orders aggregation", {
      farmerId,
      incomingOrdersCount: incomingOrders.length,
      requestId: req.id,
    });

    req.log.info("Starting farmer outgoing orders aggregation", {
      farmerId,
      coldStorageId,
      requestId: req.id,
    });

    // Aggregate outgoing orders
    const outgoingOrders = await OutgoingOrder.aggregate([
      {
        $match: {
          farmerId: new mongoose.Types.ObjectId(farmerId),
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

    req.log.info("Completed farmer outgoing orders aggregation", {
      farmerId,
      outgoingOrdersCount: outgoingOrders.length,
      requestId: req.id,
    });

    req.log.info("Processing farmer summary calculations", {
      farmerId,
      requestId: req.id,
    });

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

    req.log.info("Processed incoming summary", {
      farmerId,
      varietiesCount: Object.keys(incomingSummary).length,
      requestId: req.id,
    });

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

    req.log.info("Successfully generated farmer stock summary", {
      farmerId,
      varietiesCount: stockSummaryArray.length,
      totalSizes: stockSummaryArray.reduce(
        (acc, item) => acc + item.sizes.length,
        0
      ),
      requestId: req.id,
    });

    reply.code(200).send({
      status: "Success",
      stockSummary: stockSummaryArray,
    });
  } catch (err) {
    req.log.error("Error in farmer stock summary calculation", {
      error: err.message,
      stack: err.stack,
      farmerId: req.params.id,
      coldStorageId: req.storeAdmin._id,
      requestId: req.id,
    });
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while calculating stock summary",
      errorMessage: err.message,
    });
  }
};

const coldStorageSummary = async (req, reply) => {
  try {
    const coldStorageId = req.storeAdmin._id;

    req.log.info("Starting cold storage summary calculation", {
      coldStorageId,
      requestId: req.id,
    });

    if (!coldStorageId) {
      req.log.warn("Missing coldStorageId for cold storage summary", {
        requestId: req.id,
      });
      return reply.code(400).send({
        status: "Fail",
        message: "coldStorageId is required",
      });
    }

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      req.log.warn("Invalid coldStorageId format in cold storage summary", {
        coldStorageId,
        isValid: mongoose.Types.ObjectId.isValid(coldStorageId),
        requestId: req.id,
      });
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid ID format",
        errorMessage: "Please provide a valid MongoDB ObjectId",
      });
    }

    // Get store admin creation date
    const storeAdmin = await StoreAdmin.findById(coldStorageId);
    if (!storeAdmin) {
      req.log.warn("Store admin not found", {
        coldStorageId,
        requestId: req.id,
      });
      return reply.code(404).send({
        status: "Fail",
        message: "Store admin not found",
      });
    }

    const storeAdminCreationDate = storeAdmin.createdAt;
    req.log.info("Retrieved store admin creation date", {
      coldStorageId,
      creationDate: storeAdminCreationDate,
      requestId: req.id,
    });

    // Get stock trend data (from store admin creation date)
    const [allIncomingOrders, allOutgoingOrders] = await Promise.all([
      Order.find({
        coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
        createdAt: { $gte: storeAdminCreationDate }
      }).sort({ createdAt: 1 }),
      OutgoingOrder.find({
        coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
        createdAt: { $gte: storeAdminCreationDate }
      }).sort({ createdAt: 1 })
    ]);

    // Create monthly data points from store admin creation date to current date
    const monthlyData = {};
    const months = [];
    const currentDate = new Date();
    let iterationDate = new Date(storeAdminCreationDate);

    // Initialize months from creation date to current date
    while (iterationDate <= currentDate) {
      const monthKey = iterationDate.toLocaleString('en-US', { month: 'short', year: '2-digit' });
      monthlyData[monthKey] = {
        totalStock: 0,
        month: monthKey
      };
      months.push(monthKey);
      iterationDate.setMonth(iterationDate.getMonth() + 1);
    }

    // Calculate running stock for each month
    let runningStock = 0;

    // Process incoming orders
    allIncomingOrders.forEach(order => {
      const monthKey = new Date(order.createdAt).toLocaleString('en-US', { month: 'short', year: '2-digit' });
      if (monthlyData[monthKey]) {
        const orderStock = order.orderDetails.reduce((total, detail) =>
          total + detail.bagSizes.reduce((sum, bag) =>
            sum + bag.quantity.currentQuantity, 0), 0);
        runningStock += orderStock;
        monthlyData[monthKey].totalStock = runningStock;
      }
    });

    // Process outgoing orders
    allOutgoingOrders.forEach(order => {
      const monthKey = new Date(order.createdAt).toLocaleString('en-US', { month: 'short', year: '2-digit' });
      if (monthlyData[monthKey]) {
        const orderStock = order.orderDetails.reduce((total, detail) =>
          total + detail.bagSizes.reduce((sum, bag) =>
            sum + bag.quantityRemoved, 0), 0);
        runningStock -= orderStock;
        monthlyData[monthKey].totalStock = runningStock;
      }
    });

    // Convert to array format for the frontend
    const stockTrend = months.map(month => ({
      month: month,
      totalStock: monthlyData[month].totalStock
    }));

    req.log.info("Completed stock trend analysis", {
      coldStorageId,
      monthsAnalyzed: stockTrend.length,
      startDate: storeAdminCreationDate,
      requestId: req.id,
    });

    // Continue with existing aggregations...
    req.log.info("Starting cold storage incoming orders aggregation", {
      coldStorageId,
      requestId: req.id,
    });

    // Existing aggregation for incoming orders
    const incomingOrdersAgg = await Order.aggregate([
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

    // Transform incoming orders into a structured object
    const incomingSummaryAgg = incomingOrdersAgg.reduce((acc, order) => {
      const { variety, size } = order._id;
      if (!acc[variety]) acc[variety] = {};
      acc[variety][size] = {
        initialQuantity: order.initialQuantity,
        currentQuantity: order.currentQuantity,
      };
      return acc;
    }, {});

    // Aggregate outgoing orders
    const outgoingOrdersAgg = await OutgoingOrder.aggregate([
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

    // Add outgoing quantities to the structured object
    outgoingOrdersAgg.forEach((order) => {
      const { variety, size } = order._id;
      if (!incomingSummaryAgg[variety]) incomingSummaryAgg[variety] = {};
      if (!incomingSummaryAgg[variety][size]) {
        incomingSummaryAgg[variety][size] = {
          initialQuantity: 0,
          currentQuantity: 0,
        };
      }
      incomingSummaryAgg[variety][size].quantityRemoved = order.quantityRemoved;
    });

    // Convert the stock summary object into an array
    const stockSummaryArrayAgg = Object.entries(incomingSummaryAgg).map(
      ([variety, sizes]) => ({
        variety,
        sizes: Object.entries(sizes).map(([size, quantities]) => ({
          size,
          ...quantities,
        })),
      })
    );

    req.log.info("Successfully generated cold storage summary with trend analysis", {
      coldStorageId,
      varietiesCount: stockSummaryArrayAgg.length,
      totalSizes: stockSummaryArrayAgg.reduce(
        (acc, item) => acc + item.sizes.length,
        0
      ),
      trendDataPoints: stockTrend.length,
      requestId: req.id,
    });

    reply.code(200).send({
      status: "Success",
      stockSummary: stockSummaryArrayAgg,
      stockTrend: stockTrend
    });
  } catch (err) {
    req.log.error("Error in cold storage summary calculation", {
      error: err.message,
      stack: err.stack,
      coldStorageId: req.storeAdmin._id,
      requestId: req.id,
    });
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while calculating cold storage summary",
      errorMessage: err.message,
    });
  }
};

const getTopFarmers = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdmin._id;
    if (!storeAdminId || !mongoose.Types.ObjectId.isValid(storeAdminId)) {
      return reply.code(400).send({
        status: "Fail",
        message: "Valid store admin ID is required",
      });
    }
    const topFarmers = await Order.aggregate([
      // Match orders for the specific cold storage
      {
        $match: {
          coldStorageId: new mongoose.Types.ObjectId(storeAdminId)
        }
      },
      // Unwind the arrays to get individual entries
      { $unwind: "$orderDetails" },
      { $unwind: "$orderDetails.bagSizes" },
      // Group by farmer and calculate totals
      {
        $group: {
          _id: "$farmerId",
          totalBags: {
            $sum: "$orderDetails.bagSizes.quantity.initialQuantity"
          },
          bagSizeDetails: {
            $push: {
              size: "$orderDetails.bagSizes.size",
              quantity: "$orderDetails.bagSizes.quantity.initialQuantity"
            }
          }
        }
      },
      // Properly group the bag sizes
      {
        $project: {
          _id: 1,
          totalBags: 1,
          bagSummary: {
            $arrayToObject: {
              $map: {
                input: {
                  $setUnion: "$bagSizeDetails.size"
                },
                as: "size",
                in: {
                  k: "$$size",
                  v: {
                    $sum: {
                      $map: {
                        input: {
                          $filter: {
                            input: "$bagSizeDetails",
                            as: "sizeDetail",
                            cond: { $eq: ["$$sizeDetail.size", "$$size"] }
                          }
                        },
                        as: "filteredSize",
                        in: "$$filteredSize.quantity"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      // Lookup farmer details
      {
        $lookup: {
          from: "farmers",
          localField: "_id",
          foreignField: "_id",
          as: "farmerInfo"
        }
      },
      // Unwind the farmer info array
      {
        $unwind: {
          path: "$farmerInfo",
          preserveNullAndEmptyArrays: true
        }
      },
      // Project final format
      {
        $project: {
          farmerId: "$_id",
          farmerName: { $ifNull: ["$farmerInfo.name", "Unknown Farmer"] },
          totalBags: 1,
          bagSummary: 1
        }
      },
      // Sort by total bags in descending order
      {
        $sort: { totalBags: -1 }
      },
      // Limit to top 5 farmers
      {
        $limit: 5
      }
    ]);

    if (!topFarmers.length) {
      return reply.code(200).send({
        status: "Success",
        message: "No farmers found for this cold storage",
        data: []
      });
    }

    reply.code(200).send({
      status: "Success",
      message: "Top farmers retrieved successfully",
      data: topFarmers
    });
  } catch (err) {
    req.log.error("Error in getTopFarmers:", {
      error: err.message,
      stack: err.stack,
      storeAdminId: req.storeAdmin._id
    });
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while retrieving top farmers",
      errorMessage: err.message
    });
  }
};

const searchOrdersByVarietyAndBagSize = async (req, reply) => {
  try {
    const { variety, storeAdminId } = req.body;

    req.log.info("Starting order search by variety", {
      variety,
      storeAdminId,
      requestId: req.id,
    });

    // Validate required fields
    if (!variety || !storeAdminId) {
      req.log.warn("Missing required fields", {
        variety,
        storeAdminId,
      });
      return reply.code(400).send({
        status: "Fail",
        message: "Missing required fields",
        errorMessage: "variety and storeAdminId are required",
      });
    }

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(storeAdminId)) {
      req.log.warn("Invalid storeAdminId format", {
        storeAdminId,
      });
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid ID format",
        errorMessage: "Please provide a valid MongoDB ObjectId",
      });
    }

    // Build the match condition - only filter by variety
    const matchCondition = {
      coldStorageId: new mongoose.Types.ObjectId(storeAdminId),
      orderDetails: {
        $elemMatch: {
          variety: variety,
        },
      },
    };

    req.log.info("Executing order search query", {
      variety,
      storeAdminId,
      matchCondition,
      requestId: req.id,
    });

    // Find orders matching the criteria
    const orders = await Order.find(matchCondition)
      .populate({
        path: "farmerId",
        model: Farmer,
        select: "_id name mobileNumber address",
      })
      .sort({ createdAt: -1 });

    req.log.info("Order search completed", {
      variety,
      ordersFound: orders.length,
      requestId: req.id,
    });

    if (!orders || orders.length === 0) {
      req.log.info("No orders found for specified variety", {
        variety,
        storeAdminId,
      });
      return reply.code(404).send({
        status: "Fail",
        message: "No orders found with the specified variety",
      });
    }

    // Convert to plain objects and sort bag sizes
    const processedOrders = orders.map((order) => {
      const orderObj = order.toObject();
      orderObj.orderDetails = orderObj.orderDetails.map((detail) => ({
        ...detail,
        bagSizes: detail.bagSizes.sort((a, b) =>
          a.size.localeCompare(b.size)
        ),
      }));
      return orderObj;
    });

    req.log.info("Successfully retrieved and processed orders", {
      variety,
      orderCount: processedOrders.length,
      requestId: req.id,
    });

    reply.code(200).send({
      status: "Success",
      message: "Orders retrieved successfully",
      data: processedOrders,
    });
  } catch (err) {
    req.log.error("Error occurred while searching orders", {
      variety: req.body?.variety,
      storeAdminId: req.body?.storeAdminId,
      errorMessage: err.message,
      stack: err.stack,
      requestId: req.id,
    });

    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while searching orders",
      errorMessage: err.message,
    });
  }
};

export {
  searchFarmers,
  createNewIncomingOrder,
  filterOrdersByVariety,
  getFarmerIncomingOrders,
  getAllFarmerOrders,
  getFarmerStockSummary,
  coldStorageSummary,
  createOutgoingOrder,
  getReceiptNumber,
  getVarietyAvailableForFarmer,
  getCurrentStock,
  editIncomingOrder,
  editOutgoingOrder,
  deleteOutgoingOrder,
  getSingleOrder,
  getTopFarmers,
  searchOrdersByVarietyAndBagSize,
};
