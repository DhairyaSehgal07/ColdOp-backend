import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";
import Farmer from "../models/farmerModel.js";
import { varieties } from "../utils/helpers.js";
const dayBookOrders = async (req, reply) => {
  try {
    const coldStorageId = req.storeAdmin._id;
    const { type } = req.query;
    const { sortBy } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortOrder = sortBy === "latest" ? -1 : 1;

    const skip = (page - 1) * limit;

    // Helper function to sort bag sizes
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

    // Helper function to create pagination metadata
    const createPaginationMeta = (total, page, limit) => {
      const totalPages = Math.ceil(total / limit);
      return {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        nextPage: page < totalPages ? page + 1 : null,
        previousPage: page > 1 ? page - 1 : null,
      };
    };

    console.log("sort order is: ", sortOrder);

    switch (type) {
      case "all": {
        // Get total counts for pagination
        const [incomingCount, outgoingCount] = await Promise.all([
          Order.countDocuments({ coldStorageId }),
          OutgoingOrder.countDocuments({ coldStorageId }),
        ]);

        const totalCount = incomingCount + outgoingCount;

        if (totalCount === 0) {
          console.log("No orders found for the given cold storage.");
          return reply.code(200).send({
            status: "Fail",
            message: "Cold storage doesn't have any orders",
            pagination: createPaginationMeta(0, page, limit),
          });
        }

        // For "all" type, we need to merge and sort both collections
        // This is complex with pagination, so we'll fetch all and then paginate
        // For better performance with large datasets, consider a different approach
        const [allIncomingOrders, allOutgoingOrders] = await Promise.all([
          Order.find({ coldStorageId })
            .sort({ createdAt: sortOrder })
            .populate({
              path: "farmerId",
              model: Farmer,
              select: "_id name",
            })
            .select(
              "_id coldStorageId currentStockAtThatTime remarks farmerId voucher dateOfSubmission orderDetails createdAt"
            ),
          OutgoingOrder.find({ coldStorageId })
            .sort({ createdAt: sortOrder })
            .populate({
              path: "farmerId",
              model: Farmer,
              select: "_id name",
            })
            .select(
              "_id coldStorageId remarks farmerId voucher dateOfExtraction orderDetails currentStockAtThatTime createdAt"
            ),
        ]);

        // Merge and sort all orders by createdAt
        const allOrders = [...allIncomingOrders, ...allOutgoingOrders];
        allOrders.sort((a, b) => {
          if (sortOrder === -1) {
            return new Date(b.createdAt) - new Date(a.createdAt);
          } else {
            return new Date(a.createdAt) - new Date(b.createdAt);
          }
        });

        // Apply pagination to merged results
        const paginatedOrders = allOrders.slice(skip, skip + limit);
        const sortedOrders = sortOrderDetails(paginatedOrders);

        // Log success and send response
        console.log("All orders retrieved successfully.");
        reply.code(200).send({
          status: "Success",
          data: sortedOrders,
          pagination: createPaginationMeta(totalCount, page, limit),
        });
        break;
      }
      case "incoming": {
        // Get total count for pagination
        const totalCount = await Order.countDocuments({ coldStorageId });

        if (totalCount === 0) {
          return reply.code(200).send({
            status: "Fail",
            message: "No incoming orders found.",
            pagination: createPaginationMeta(0, page, limit),
          });
        }

        const incomingOrders = await Order.find({ coldStorageId })
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: sortOrder })
          .populate({
            path: "farmerId",
            model: Farmer,
            select: "_id name",
          })
          .select(
            "_id coldStorageId remarks currentStockAtThatTime farmerId voucher dateOfSubmission orderDetails"
          );

        const sortedOrders = sortOrderDetails(incomingOrders);

        reply.code(200).send({
          status: "Success",
          data: sortedOrders,
          pagination: createPaginationMeta(totalCount, page, limit),
        });
        break;
      }
      case "outgoing": {
        // Get total count for pagination
        const totalCount = await OutgoingOrder.countDocuments({ coldStorageId });

        if (totalCount === 0) {
          return reply.code(200).send({
            status: "Fail",
            message: "No outgoing orders found.",
            pagination: createPaginationMeta(0, page, limit),
          });
        }

        const outgoingOrders = await OutgoingOrder.find({ coldStorageId })
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: sortOrder })
          .populate({
            path: "farmerId",
            model: Farmer,
            select: "_id name",
          })
          .select(
            "_id coldStorageId remarks farmerId voucher dateOfExtraction orderDetails currentStockAtThatTime"
          );

        const sortedOrders = sortOrderDetails(outgoingOrders);

        reply.code(200).send({
          status: "Success",
          data: sortedOrders,
          pagination: createPaginationMeta(totalCount, page, limit),
        });
        break;
      }
      default: {
        reply.code(400).send({
          message: "Invalid type parameter. Use 'all', 'incoming', or 'outgoing'.",
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
  try {
    const orders = await Order.find({
      coldStorageId: { $ne: new mongoose.Types.ObjectId("66e1f22d782bbd67d3446805") }
    });
    console.log("Orders: ", orders);
    reply.code(200).send({
      message: "test controller",
      orders: orders,
    });
  } catch (err) {
    console.error(err.message);
  }
};

const getVarieties = async (req, reply) => {
  try {
    reply.code(200).send({
      status: "Success",
      varieties,
    });
  } catch (err) {
    console.error("Error getting varieties:", err);

    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while getting varieties",
      errorMessage: err.message,
    });
  }
};

// Add this controller function in store-adminDayBookController.js
const searchOrderByReceiptNumber = async (req, reply) => {
  try {
    const coldStorageId = req.storeAdmin._id;
    const { receiptNumber } = req.body;

    if (!receiptNumber) {
      req.log.warn("Receipt number not provided", { coldStorageId });
      return reply.code(400).send({
        status: "Fail",
        message: "Receipt number is required"
      });
    }

    req.log.info("Searching for order with receipt number", {
      receiptNumber,
      coldStorageId
    });

    // Search in both Order and OutgoingOrder collections
    const [incomingOrder, outgoingOrder] = await Promise.all([
      Order.findOne({
        coldStorageId,
        'voucher.voucherNumber': receiptNumber
      }).populate({
        path: 'farmerId',
        model: Farmer,
        select: '_id name mobileNumber address'
      }),
      OutgoingOrder.findOne({
        coldStorageId,
        'voucher.voucherNumber': receiptNumber
      }).populate({
        path: 'farmerId',
        model: Farmer,
        select: '_id name mobileNumber address'
      })
    ]);

    // If no order found
    if (!incomingOrder && !outgoingOrder) {
      req.log.info("No order found with receipt number", {
        receiptNumber,
        coldStorageId
      });
      return reply.code(404).send({
        status: "Fail",
        message: "No order found with this receipt number"
      });
    }

    // Get the found order (either incoming or outgoing)
    const foundOrder = incomingOrder || outgoingOrder;
    const orderType = incomingOrder ? 'incoming' : 'outgoing';

    // Convert to plain object and sort bag sizes
    const orderObject = foundOrder.toObject();
    if (orderObject.orderDetails) {
      orderObject.orderDetails = orderObject.orderDetails.map(detail => ({
        ...detail,
        bagSizes: detail.bagSizes.sort((a, b) =>
          a.size.localeCompare(b.size)
        )
      }));
    }

    req.log.info("Successfully found order", {
      receiptNumber,
      orderType,
      orderId: foundOrder._id
    });

    reply.code(200).send({
      status: "Success",
      orderType,
      data: orderObject
    });

  } catch (err) {
    req.log.error("Error searching for order", {
      error: err.message,
      stack: err.stack,
      receiptNumber: req.body?.receiptNumber,
      coldStorageId: req.storeAdmin._id
    });

    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while searching for order",
      errorMessage: err.message
    });
  }
};

export {
  dayBookOrders,
  dayBookOrderController,
  testController,
  getVarieties,
  searchOrderByReceiptNumber
};
