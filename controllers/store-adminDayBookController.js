import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";
import Farmer from "../models/farmerModel.js";
import mongoose from "mongoose";

const dayBookOrders = async (req, reply) => {
  try {
    const { type } = req.query;
    const { sortBy } = req.query;
    const { page } = req.query || 1;
    const { limit } = req.query || 1;
    const sortOrder = sortBy === "latest" ? 1 : -1;

    const skip = (page - 1) * limit;

    switch (type) {
      case "all": {
        const [incomingOrders, outgoingOrders] = await Promise.all([
          Order.find({})
            .skip(skip)
            .limit(limit)
            .sort({ sortOrder })
            .populate({
              path: "farmerId",
              model: Farmer,
              select: "_id name", // Select only the _id and name
            })
            .select(
              "_id coldStorageId farmerId voucher dateOfSubmission orderDetails"
            ),
          OutgoingOrder.find({})
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .populate({
              path: "farmerId",
              model: Farmer,
              select: "_id name", // Select only the _id and name
            })
            .select(
              "_id coldStorageId  farmerId voucher dateOfExtraction orderDetails"
            ),
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
        break;
      }
      case "incoming": {
        const incomingOrders = await Order.find({})
          .skip(skip)
          .limit(limit)
          .sort({ sortOrder })
          .populate({
            path: "farmerId",
            model: Farmer,
            select: "_id name", // Select only the _id and name
          })
          .select(
            "_id coldStorageId farmerId voucher dateOfSubmission orderDetails"
          );
        if (!incomingOrders || incomingOrders.length === 0) {
          return reply.code(200).send({
            status: "Fail",
            message: "No incoming orders found.",
          });
        }
        reply.code(200).send({
          status: "Success",
          data: incomingOrders,
        });
        break;
      }
      case "outgoing": {
        const outgoingOrders = await OutgoingOrder.find({})
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 })
          .populate({
            path: "farmerId",
            model: Farmer,
            select: "_id name", // Select only the _id and name
          })
          .select(
            "_id coldStorageId  farmerId voucher dateOfExtraction orderDetails"
          );
        if (!outgoingOrders || outgoingOrders.length === 0) {
          return reply.code(200).send({
            status: "Fail",
            message: "No outgoing orders found.",
          });
        }
        reply.code(200).send({
          status: "Success",
          data: outgoingOrders,
        });
        break;
      }
      default: {
        reply.code(400).send({
          message: "Invalid type parameter",
        });
        break;
      }
    }
  } catch (err) {
    console.error("Error getting daybook orders:", err);

    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while getting daybook orders",
      errorMessage: err.message,
    });
  }
};

const dayBookOrderController = async (req, reply) => {};

const testController = async (req, reply) => {
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

    const incomingOrders = await Promise.all(
      orders.map(async (order) => {
        const { orderId, variety, bagUpdates } = order;

        // Fetch the order details from the database
        const fetchedOrder = await Order.findById(orderId).lean();

        if (!fetchedOrder) {
          throw new Error(`Order with ID ${orderId} not found`);
        }

        // Filter bagSizes based on provided sizes in req.body
        const filteredOrderDetails = fetchedOrder.orderDetails
          .filter((detail) => detail.variety === variety) // Match the variety
          .map((detail) => {
            const filteredBagSizes = detail.bagSizes.filter((bag) =>
              bagUpdates.some((update) => update.size === bag.size)
            );

            return {
              ...detail,
              bagSizes: filteredBagSizes.map((bag) => ({
                size: bag.size,
                currentQuantity: bag.quantity.currentQuantity,
                initialQuantity: bag.quantity.initialQuantity,
              })),
            };
          });

        return {
          _id: fetchedOrder._id,
          location: fetchedOrder.location,
          voucher: fetchedOrder.voucher,
          orderDetails: filteredOrderDetails,
        };
      })
    );

    // Log the `incomingOrders` array
    console.log(JSON.stringify(incomingOrders, null, 2));

    // Initialize bulk operations array
    const bulkOps = [];
    let variety = ""; // Common variety for outgoing order

    // Prepare outgoing order details in the new format
    const outgoingOrderDetails = orders.map(
      ({ variety: currentVariety, bagUpdates }) => {
        variety = currentVariety;

        req.log.info("Processing order", { variety });

        // Process bag updates for bulk operations and outgoing order details
        const bagDetails = bagUpdates.map((update) => {
          const { size, quantityToRemove } = update;
          req.log.info("Bag update", { size, quantityToRemove });

          // Prepare bulk operation for updating quantities in the source order
          bulkOps.push({
            updateOne: {
              filter: {
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

          return { size, quantityRemoved: quantityToRemove }; // Updated field name here
        });

        // Return the order detail in the desired structure
        return {
          variety,
          bagSizes: bagDetails,
        };
      }
    );

    // Execute bulk write for inventory updates
    const result = await Order.bulkWrite(bulkOps, { session });
    req.log.info("Bulk write completed", { matchedCount: result.matchedCount });

    // Check if each order is fulfilled and update accordingly
    const fulfilledOrders = await Promise.all(
      orders.map(async ({ orderId: incomingOrder, variety }) => {
        const updatedOrder = await Order.findOne({
          _id: incomingOrder,
        }).session(session);
        console.log("Updated order is: ", updatedOrder);

        const isFulfilled = updatedOrder.orderDetails
          .filter((detail) => detail.variety === variety)
          .every((detail) =>
            detail.bagSizes.every((bag) => bag.quantity.currentQuantity === 0)
          );

        if (isFulfilled) {
          await Order.updateOne(
            { _id: incomingOrder },
            { $set: { fulfilled: true } },
            { session }
          );
          req.log.info("Order fulfilled", { incomingOrder });
          return incomingOrder;
        }

        req.log.info("Order not fulfilled", { incomingOrder });
        return null;
      })
    );

    const deliveryVoucherNumber = await getDeliveryVoucherNumberHelper(
      req.storeAdmin._id
    );
    req.log.info("Generating delivery voucher", { deliveryVoucherNumber });

    // Create the outgoing order document with the new format
    const outgoingOrder = new OutgoingOrder({
      coldStorageId: req.storeAdmin._id,
      farmerId: id,
      voucher: {
        type: "DELIVERY",
        voucherNumber: deliveryVoucherNumber,
      },
      dateOfExtraction: formatDate(new Date()),
      orderDetails: outgoingOrderDetails, // Updated structure without incomingOrder
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

export { dayBookOrders, dayBookOrderController, testController };
