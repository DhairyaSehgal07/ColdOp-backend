import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";
import PaymentHistory from "../models/paymentHistoryModel.js";
import { orderSchema } from "../utils/validationSchemas.js";
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
          "voucher.type": "RECEIT", // Match orders where voucher type is "RECEIT"
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
      receiptNumber: receiptNumber,
    });
  } catch (err) {
    // Log error
    req.log.error("Error occurred while getting receipt number", {
      errorMessage: err.message,
    });
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while getting receipt number",
    });
  }
};

// @desc Create new Incoming Order
//@route POST/api/store-admin/orders
//@access Private

const createNewIncomingOrder = async (req, reply) => {
  try {
    orderSchema.parse(req.body);

    const {
      coldStorageId,
      farmerId,
      voucherNumber,
      dateOfSubmission,
      orderDetails,
    } = req.body;

    const newOrder = new Order({
      coldStorageId,
      farmerId,
      voucher: {
        type: "RECEIT", // Set voucher type to RECEIT
        voucherNumber: voucherNumber,
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

const getFarmerOrders = async (req, reply) => {
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
    });
  }
};

// outgoing order controller functions
const createOutgoingOrder = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdmin._id;
    const { farmerId, orders, totalAmount, amountPaid, date } = req.body;

    const newOrder = await OutgoingOrder.create({
      storeAdminId,
      farmerId,
      orders,
      totalAmount,
      amountPaid,
      date,
    });

    if (newOrder) {
      reply.code(201).send({
        status: "Success",
        newOrder,
      });
    }
  } catch (err) {
    console.log(err.message);
    reply.code(500).send({
      status: "Fail",
      message: "Some error occured while creating outgoing order",
    });
  }
};

// when new order has been created then delete the order from store
const updateOrdersAfterOutgoing = async (req, reply) => {
  try {
    const { orderIds } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return reply
        .code(400)
        .send({ status: "Fail", message: "Invalid order ids provided" });
    }

    // Update orders to set order status to "extracted"
    const updateResult = await Order.updateMany(
      { _id: { $in: orderIds } },
      { $set: { orderStatus: "extracted" } }
    );

    if (updateResult.nModified === 0) {
      return reply.code(404).send({
        status: "Fail",
        message: "No orders found with the provided IDs",
      });
    }

    reply.code(200).send({
      status: "Success",
      message: "Orders updated",
    });
  } catch (err) {
    console.log(err.message);
    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while updating orders",
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

const getPaymentHistory = async (req, reply) => {
  try {
    const { orderId } = req.body;

    // Validate input data
    if (!orderId) {
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid input data",
      });
    }

    // Find payment history based on orderId
    const paymentHistory = await PaymentHistory.findOne({
      outgoingOrderId: orderId,
    });

    // Check if payment history exists
    if (!paymentHistory) {
      return reply.code(404).send({
        status: "Fail",
        message: "Payment history not found",
      });
    }

    // Send success response with payment history
    reply.code(200).send({
      status: "Success",
      paymentHistory: paymentHistory,
    });
  } catch (err) {
    console.log(err.message);
    reply.code(500).send({
      status: "Fail",
      message: "Failed to fetch payment history",
    });
  }
};

export {
  createNewIncomingOrder,
  getFarmerOrders,
  createOutgoingOrder,
  updateOrdersAfterOutgoing,
  getReceiptNumber,
  getFarmerOutgoingOrders,
  updateFarmerOutgoingOrder,
  deleteFarmerOutgoingOrder,
  getPaymentHistory,
};
