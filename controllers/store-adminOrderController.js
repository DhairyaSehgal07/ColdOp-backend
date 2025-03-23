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

// ORDER ROUTES CONTROLLER FUCNTIONS

//@desc  Get receipt number
//@route GET/api/store-admin/receipt-number
//@access Private
const getReceiptNumber = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdmin._id;

    // Log the store admin ID
    req.log.info("Fetching receipt number for store admin", { storeAdminId });

    // Using aggregation pipeline to count orders where voucher.type is "RECEIT"
    req.log.info("Running aggregation pipeline to count RECEIT type orders");
    const result = await Order.aggregate([
      {
        $match: {
          coldStorageId: new mongoose.Types.ObjectId(storeAdminId), 
        },
      },
      {
        $group: {
          _id: null, // We don't care about grouping by any field, just counting
          count: { $sum: 1 }, // Sum the number of documents that match
        },
      },
    ]);

    // Extracting count from result
    const receiptNumber = result.length > 0 ? result[0].count : 0;

    // Log the receipt number result
    req.log.info("Receipt number calculation complete", { receiptNumber });

    // Sending response with receipt number
    reply.code(200).send({
      status: "Success",
      receiptNumber: receiptNumber + 1,
    });
  } catch (err) {
    // Log error
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
    const searchQuery = req.query.query;
    const { id } = req.params;

    console.log("SEARCH QUERY IS: ", searchQuery);
    console.log("id is : ", id);
    // Log the search request details
    req.log.info("Starting farmer search", {
      searchQuery,
      storeAdminId: id,
    });

    // MongoDB aggregation pipeline (Fix: `$search` is now the first stage)
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
          registeredStoreAdmins: new mongoose.Types.ObjectId(id),
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
      storeAdminId: req.params.id,
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

const editIncomingOrder = async (req, reply) => {
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
    const existingOrder = await Order.findById(orderId);
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

    // Step 3: Recalculate `currentStockAtThatTime`
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

    // Step 4: Save the updated order
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
        .sort({ dateOfSubmission: -1 })
        .populate({
          path: "farmerId",
          model: Farmer,
          select: "_id name",
        })
        .select(
          "_id coldStorageId farmerId remarks voucher dateOfSubmission orderDetails"
        ),
      OutgoingOrder.find({ coldStorageId: storeAdminId, farmerId: id })
        .sort({ dateOfExtraction: -1 })
        .populate({
          path: "farmerId",
          model: Farmer,
          select: "_id name",
        })
        .select(
          "_id coldStorageId farmerId remarks voucher dateOfExtraction orderDetails"
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

    // Sort bag sizes in both incoming and outgoing orders
    const sortedIncoming = sortOrderDetails(incomingOrders);
    const sortedOutgoing = sortOrderDetails(outgoingOrders);
    const allOrders = [...sortedIncoming, ...sortedOutgoing];

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

    // Initialize bulk operations array
    const bulkOps = [];
    let variety = ""; // Common variety for outgoing order

    // Prepare outgoing order details in the new format
    const outgoingOrderDetails = orders.map(
      ({ orderId, variety: currentVariety, bagUpdates }) => {
        variety = currentVariety;

        req.log.info("Processing order", { variety });

        // Process bag updates for bulk operations and outgoing order details
        const bagDetails = bagUpdates
          .filter((update) => update.quantityToRemove > 0) // Filter out zero quantities
          .map((update) => {
            const { size, quantityToRemove } = update;
            req.log.info("Bag update", { size, quantityToRemove });

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
            currentQuantity: bag.currentQuantity, // Ensure this is mapped correctly
            initialQuantity: bag.initialQuantity, // Ensure this is mapped correctly
          }))
        );

        return {
          variety,
          bagSizes: bagDetails,
          incomingOrder: {
            _id: incomingOrder._id,
            location: incomingOrder.location,
            voucher: incomingOrder.voucher,
            incomingBagSizes, // Make sure you're using the correct field names
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
    const applyBulkOps = orderDetails.flatMap((detail) =>
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

    // Update the outgoing order details
    outgoingOrder.orderDetails = orderDetails;
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

    req.log.info("Starting cold storage incoming orders aggregation", {
      coldStorageId,
      requestId: req.id,
    });

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

    req.log.info("Completed cold storage incoming orders aggregation", {
      coldStorageId,
      incomingOrdersCount: incomingOrders.length,
      requestId: req.id,
    });

    req.log.info("Starting cold storage outgoing orders aggregation", {
      coldStorageId,
      requestId: req.id,
    });

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

    req.log.info("Completed cold storage outgoing orders aggregation", {
      coldStorageId,
      outgoingOrdersCount: outgoingOrders.length,
      requestId: req.id,
    });

    req.log.info("Processing cold storage summary calculations", {
      coldStorageId,
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

    req.log.info("Processed cold storage incoming summary", {
      coldStorageId,
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

    req.log.info("Successfully generated cold storage summary", {
      coldStorageId,
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
};
