import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";
import Farmer from "../models/farmerModel.js";

// for testing

const dayBookOrders = async (req, reply) => {
  try {
    const [incomingOrders, outgoingOrders] = await Promise.all([
      Order.find({}).sort({ createdAt: -1 }), // Sort by createdAt (latest first)
      OutgoingOrder.find({}).sort({ createdAt: -1 }),
    ]);

    const allOrders = [...incomingOrders, ...outgoingOrders];

    if (!allOrders || allOrders.length === 0) {
      console.log("No orders found for the given farmer.");
      return reply.code(200).send({
        status: "Fail",
        message: "Farmer doesn't have any orders",
      });
    }

    // Log success and send response
    console.log("All orders retrieved successfully.");

    reply.code(200).send({
      status: "Success",
      data: allOrders,
    });
  } catch (err) {
    console.error("Error getting daybook orders:", err);

    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while getting daybook orders",
      errorMessage: err.message,
    });
  }
};

const testController = async (req, reply) => {
  try {
    const type = req.query;
    const sortBy = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1;

    const skip = (page - 1) * limit;

    const [incomingOrders, outgoingOrders] = await Promise.all([
      Order.find({}).skip(skip).limit(limit).sort({ createdAt: -1 }), // Sort by createdAt (latest first)
      OutgoingOrder.find({}).skip(skip).limit(limit).sort({ createdAt: -1 }),
    ]);

    const allOrders = [...incomingOrders, ...outgoingOrders];

    if (!allOrders || allOrders.length === 0) {
      console.log("No orders found for the given farmer.");
      return reply.code(200).send({
        status: "Fail",
        message: "Farmer doesn't have any orders",
      });
    }

    // Log success and send response
    console.log("All orders retrieved successfully.");

    reply.code(200).send({
      status: "Success",
      data: allOrders,
    });
  } catch (err) {
    console.error("Error getting daybook orders:", err);

    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while getting daybook orders",
      errorMessage: err.message,
    });
  }
};

export { dayBookOrders, testController };
