import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";
import PaymentHistory from "../models/paymentHistoryModel.js";
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
    const orders = req.body;
    const bulkOps = [];
    const { id } = req.params;
    const relatedOrders = [];

    // Object to accumulate quantities of the same bag size
    const bagSizeMap = {};

    let variety = ""; // To store the common variety for the outgoing order

    for (const { orderId, variety: currentVariety, bagUpdates } of orders) {
      // Track related order IDs
      relatedOrders.push(orderId);

      // Store the variety (assuming all orders have the same variety)
      variety = currentVariety;

      // Iterate through each bag update
      bagUpdates.forEach((update) => {
        const { size, quantityToRemove } = update;

        // Accumulate quantities for each size
        if (bagSizeMap[size]) {
          bagSizeMap[size] += quantityToRemove;
        } else {
          bagSizeMap[size] = quantityToRemove;
        }

        bulkOps.push({
          updateOne: {
            filter: {
              _id: orderId,
              "orderDetails.variety": variety,
              "orderDetails.bagSizes.size": update.size,
            },
            update: {
              $inc: {
                "orderDetails.$[i].bagSizes.$[j].quantity.currentQuantity":
                  -update.quantityToRemove, // Decrease the current quantity
              },
            },
            arrayFilters: [
              { "i.variety": variety }, // Filter for correct variety
              { "j.size": update.size }, // Filter for correct bag size
            ],
          },
        });
      });
    }

    const result = await Order.bulkWrite(bulkOps, { session });

    const fulfilledOrders = await Promise.all(
      orders.map(async ({ orderId, variety }) => {
        const updatedOrder = await Order.findOne({ _id: orderId }).session(
          session
        ); // Query in the same transaction session

        const isFulfilled = updatedOrder.orderDetails
          .filter((detail) => detail.variety === variety)
          .every((detail) =>
            detail.bagSizes.every((bag) => bag.quantity.currentQuantity === 0)
          );

        // If all quantities for the variety are 0, mark the order as fulfilled
        if (isFulfilled) {
          await Order.updateOne(
            { _id: orderId },
            { $set: { fulfilled: true } },
            { session }
          );
          return orderId; // Return the order ID if fulfilled
        }

        return null; // No fulfillment for this order
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

    await session.commitTransaction();
    await session.endSession();

    return reply.code(200).send({
      message: "Outgoing order processed successfully.",
      outgoingOrder,
    });
  } catch (err) {
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
  createNewIncomingOrder,
  getFarmerIncomingOrders,
  getAllFarmerOrders,
  createOutgoingOrder,
  getReceiptNumber,
  getFarmerOutgoingOrders,
  updateFarmerOutgoingOrder,
  deleteFarmerOutgoingOrder,
};
