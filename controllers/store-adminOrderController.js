import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";
import PaymentHistory from "../models/paymentHistoryModel.js";
import Farmer from "../models/farmerModel.js";
import { orderSchema } from "../utils/validationSchemas.js";
import {
  getDeliveryVoucherNumberHelper,
  getReceiptNumberHelper,
} from "../utils/helpers.js";
import mongoose from "mongoose";
// Auth controllers

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
          coldStorageId: storeAdminId, // Match orders belonging to the specific store admin
          "voucher.type": "RECEIPT", // Match orders where voucher type is "RECEIT"
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

const getDeliveryVoucherNumber = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdminId._id;

    req.log.info("Fetching Delivery voucher number for store admin", {
      storeAdminId,
    });

    req.log.info(
      "Running aggregation pipeline to count DELIVERY voucher number"
    );

    const result = await OutgoingOrder.aggregate([
      {
        $match: {
          coldStorageId: storeAdminId,
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 }, // sum of the number of documents
        },
      },
    ]);

    const deliveryVoucherNumber = result.length > 0 ? result[0].count : 0;

    req.log.info("Deliver voucher count: ", { deliveryVoucherNumber });

    reply.code(200).send({
      status: "Success",
      deliveryVoucherNumber: deliveryVoucherNumber + 1,
    });
  } catch (err) {
    req.log.error("Error occurred while getting receipt number", {
      errorMessage: err.message,
    });

    reply.code(500).send({
      status: "Fail",
      message: "Error occured while getting delivery voucher number",
      errorMessage: err.message,
    });
  }
};

// @desc Create new Incoming Order
//@route POST/api/store-admin/orders
//@access Private
const searchFarmers = async (req, reply) => {
  try {
    // Accessing searchQuery directly from req.query
    console.log("REQUEST QUERY IS: ", req.query.query);
    const searchQuery = req.query.query; // Assuming the search query is passed as a parameter named 'q'
    const { id } = req.params;

    // MongoDB aggregation pipeline
    const result = await Farmer.aggregate([
      {
        $search: {
          index: "farmer-name",
          autocomplete: {
            query: searchQuery, // Using searchQuery directly
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
          registeredStoreAdmins: new mongoose.Types.ObjectId(`${id}`),
        },
      },
      {
        $project: {
          _id: 0,
          name: 1,
          mobileNumber: 1,
        },
      },
    ]);

    reply.code(200).send(result);
  } catch (err) {
    // Improved error handling
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while searching farmers",
      errorMessage: err.message || "An unexpected error occurred.",
    });
  }
};

// @desc Create new Incoming Order
//@route POST/api/store-admin/orders
//@access Private

const createNewIncomingOrder = async (req, reply) => {
  try {
    orderSchema.parse(req.body);

    const { coldStorageId, farmerId, dateOfSubmission, orderDetails } =
      req.body;

    const receiptNumber = await getReceiptNumberHelper(req.storeAdmin._id);

    if (!receiptNumber) {
      reply.code(500).send({
        status: "Fail",
        message: "Failed to get RECEIPT number",
      });
    }

    const newOrder = new Order({
      coldStorageId,
      farmerId,
      voucher: {
        type: "RECEIPT",
        voucherNumber: receiptNumber,
      },
      fulfilled: false,
      dateOfSubmission,
      orderDetails,
    });

    // save the new order
    await newOrder.save();

    reply.code(201).send({
      status: "Success",
      message: "Incoming order created successfully",
      data: newOrder,
    });
  } catch (err) {
    // Handling errors
    console.error("Error creating new order:", err);
    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while creating a new order",
      errorMessage: err.message,
    });
  }
};

const getFarmerIncomingOrders = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdmin._id;
    const { id } = req.params;

    // Log the start of the request
    console.log(
      `Fetching orders for Farmer ID: ${id} by Store Admin ID: ${storeAdminId}`
    );

    // Perform the Mongoose query to find orders
    const orders = await Order.find({
      coldStorageId: storeAdminId,
      farmerId: id,
    });

    // Log the query result
    console.log(`Query executed. Orders found: ${orders.length}`);

    if (!orders || orders.length === 0) {
      // Log when no orders are found
      console.log("No orders found for the given farmer.");

      return reply.code(200).send({
        status: "Fail",
        message: "Farmer doesn't have any orders",
      });
    }

    // Log the successful response
    console.log("Orders retrieved successfully.");

    // Sending a success response with the orders
    reply.code(200).send({
      status: "Success",
      data: orders,
    });
  } catch (err) {
    // Log the error
    console.error("Error getting farmer orders:", err);

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

    // Log the start of the request
    console.log(
      `Fetching all orders for Farmer ID: ${id} by Store Admin ID: ${storeAdminId}`
    );

    // Fetch both incoming orders and outgoing orders concurrently
    const [incomingOrders, outgoingOrders] = await Promise.all([
      Order.find({ coldStorageId: storeAdminId, farmerId: id }), // Incoming orders
      OutgoingOrder.find({ coldStorageId: storeAdminId, farmerId: id }), // Outgoing orders
    ]);

    // Log the result of both queries
    console.log(
      `Incoming Orders: ${incomingOrders.length}, Outgoing Orders: ${outgoingOrders.length}`
    );

    // Combine the results from both models
    const allOrders = [...incomingOrders, ...outgoingOrders];

    if (!allOrders || allOrders.length === 0) {
      // Log when no orders are found
      console.log("No orders found for the given farmer.");

      return reply.code(200).send({
        status: "Fail",
        message: "Farmer doesn't have any orders",
      });
    }

    // Log the successful response
    console.log("All orders retrieved successfully.");

    // Sending a success response with the combined orders
    reply.code(200).send({
      status: "Success",
      data: allOrders,
    });
  } catch (err) {
    // Log the error
    console.error("Error getting farmer orders:", err);

    // Sending error response
    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while getting farmer orders",
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
    });

    const orders = req.body;
    const { id } = req.params;

    req.log.info("Orders received", { ordersCount: orders.length });

    const bulkOps = [];
    const relatedOrders = [];
    const bagSizeMap = {}; // Accumulates quantities per bag size
    let variety = ""; // Common variety for outgoing order

    for (const { orderId, variety: currentVariety, bagUpdates } of orders) {
      relatedOrders.push(orderId);
      variety = currentVariety;

      req.log.info("Processing order", { orderId, variety });

      bagUpdates.forEach((update) => {
        const { size, quantityToRemove } = update;

        // Accumulate bag size quantities
        bagSizeMap[size] = (bagSizeMap[size] || 0) + quantityToRemove;

        req.log.info("Bag update", { size, quantityToRemove });

        bulkOps.push({
          updateOne: {
            filter: {
              _id: orderId,
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
      });
    }

    const result = await Order.bulkWrite(bulkOps, { session });
    req.log.info("Bulk write completed", { matchedCount: result.matchedCount });

    const fulfilledOrders = await Promise.all(
      orders.map(async ({ orderId, variety }) => {
        const updatedOrder = await Order.findOne({ _id: orderId }).session(
          session
        );

        console.log("Updated order is: ", updatedOrder);

        const isFulfilled = updatedOrder.orderDetails
          .filter((detail) => detail.variety === variety)
          .every((detail) =>
            detail.bagSizes.every((bag) => bag.quantity.currentQuantity === 0)
          );

        if (isFulfilled) {
          await Order.updateOne(
            { _id: orderId },
            { $set: { fulfilled: true } },
            { session }
          );
          req.log.info("Order fulfilled", { orderId });
          return orderId;
        }

        req.log.info("Order not fulfilled", { orderId });
        return null;
      })
    );

    const outgoingOrderInfo = {
      variety,
      bagSizes: Object.entries(bagSizeMap).map(([size, quantity]) => ({
        size,
        quantity,
      })),
    };

    const deliveryVoucherNumber = await getDeliveryVoucherNumberHelper(
      req.storeAdmin._id
    );

    req.log.info("Generating delivery voucher", { deliveryVoucherNumber });

    const outgoingOrder = new OutgoingOrder({
      coldStorageId: req.storeAdmin._id,
      farmerId: id,
      voucher: {
        type: "Delivery",
        voucherNumber: deliveryVoucherNumber,
      },
      dateOfExtraction: new Date().toISOString(),
      orderDetails: outgoingOrderInfo,
      relatedOrders,
    });

    await outgoingOrder.save();
    req.log.info("Outgoing order saved", {
      outgoingOrderId: outgoingOrder._id,
    });

    await session.commitTransaction();
    session.endSession();

    req.log.info("Transaction committed successfully");

    return reply.code(200).send({
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

// get outgoing orders for previous orders screen
const getFarmerOutgoingOrders = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdmin._id;
    const { farmerId } = req.body;

    // Query the OutgoingOrder collection using Mongoose
    const outgoingOrders = await OutgoingOrder.find({
      storeAdminId: storeAdminId,
      farmerId: farmerId,
    }).exec();

    // Check if any orders were found
    if (outgoingOrders.length === 0) {
      return reply.code(200).send({
        status: "Fail",
        message: "No outgoing orders found for the current farmer",
      });
    }

    // Send the outgoing orders as a response
    reply.code(200).send({
      status: "Success",
      outgoingOrders: outgoingOrders,
    });
  } catch (err) {
    console.log(err.message);
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while getting outgoing orders",
    });
  }
};

const updateFarmerOutgoingOrder = async (req, reply) => {
  try {
    const { orderId, amountPaid, currentDate } = req.body;

    if (amountPaid <= 0) {
      reply.code(500).send({
        status: "Fail",
        message: "Please enter a valid amount",
      });
    }
    if (amountPaid == 1 / 0) {
      reply.code(500).send({
        status: "Fail",
        message: "Inavalid input",
      });
    }

    // Validate input data
    if (!orderId || !amountPaid || !currentDate) {
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid input data",
      });
    }

    const foundOrder = await OutgoingOrder.findById(orderId);

    // Check if the order exists
    if (!foundOrder) {
      return reply.code(404).send({
        status: "Fail",
        message: "Order not found",
      });
    }

    // Update order details
    foundOrder.amountPaid = foundOrder.amountPaid + parseFloat(amountPaid);
    foundOrder.date = currentDate;

    // Save the updated order
    await foundOrder.save();

    // Find existing payment history or create new if not exists
    let paymentHistory = await PaymentHistory.findOne({
      outgoingOrderId: orderId,
    });

    if (!paymentHistory) {
      paymentHistory = new PaymentHistory({ outgoingOrderId: orderId });
      paymentHistory.totalAmount = foundOrder.totalAmount;
    }

    // Create payment entry
    const paymentEntry = {
      amountPaid: parseFloat(amountPaid),
      amountLeft: foundOrder.totalAmount - foundOrder.amountPaid, // Assuming totalAmount is available in foundOrder
      date: currentDate,
    };

    // Add payment entry to payment history
    paymentHistory.paymentEntries.push(paymentEntry);

    // Save the payment history
    await paymentHistory.save();

    // Send success response
    reply.code(200).send({
      status: "Success",
      updatedOrder: foundOrder,
      paymentHistory: paymentHistory,
    });
  } catch (err) {
    console.log(err.message);
    reply.code(500).send({
      status: "Fail",
      message: "Failed to update outgoing order",
    });
  }
};

const deleteFarmerOutgoingOrder = async (req, reply) => {
  try {
    const { orderId } = req.body;

    // Assuming you are using some ORM like Mongoose
    const deletedOrder = await OutgoingOrder.findByIdAndDelete(orderId);

    if (!deletedOrder) {
      return reply.status(404).send({
        status: "Fail",
        message: "Order not found",
      });
    }

    reply.send({
      status: "Success",
      message: "Order deleted successfully",
    });
  } catch (err) {
    console.log(err.message);
    reply.status(500).send({
      status: "Fail",
      message: "Some error occurred while deleting order",
    });
  }
};

export {
  searchFarmers,
  createNewIncomingOrder,
  getFarmerIncomingOrders,
  getAllFarmerOrders,
  createOutgoingOrder,
  getReceiptNumber,
  getFarmerOutgoingOrders,
  updateFarmerOutgoingOrder,
  deleteFarmerOutgoingOrder,
};
