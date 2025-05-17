import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";
import mongoose from "mongoose";
// export const formatDate = (date) => {
//   const day = date.getDate();
//   const monthIndex = date.getMonth();
//   const year = date.getFullYear();

//   // Array of month names
//   const monthNames = [
//     "January",
//     "February",
//     "March",
//     "April",
//     "May",
//     "June",
//     "July",
//     "August",
//     "September",
//     "October",
//     "November",
//     "December",
//   ];

//   // Add the ordinal suffix to the day
//   const dayWithOrdinal = addOrdinalSuffix(day);

//   return `${dayWithOrdinal} ${monthNames[monthIndex]} ${year}`;
// };

// Function to add ordinal suffix to the day
const addOrdinalSuffix = (day) => {
  if (day > 3 && day < 21) return day + "th";
  switch (day % 10) {
    case 1:
      return day + "st";
    case 2:
      return day + "nd";
    case 3:
      return day + "rd";
    default:
      return day + "th";
  }
};

export const getReceiptNumberHelper = async (storeAdminId) => {
  try {
    const result = await Order.aggregate([
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
    console.log("RESULT IS: ", result);
    const ReceiptVoucherNumber = result.length > 0 ? result[0].count : 0;
    return ReceiptVoucherNumber + 1;
  } catch (err) {
    console.error("Error fetching receipt number:", err);
    throw new Error("Some error occurred while getting receipt number");
  }
};

export const getDeliveryVoucherNumberHelper = async (storeAdminId) => {
  try {
    const result = await OutgoingOrder.aggregate([
      {
        $match: {
          coldStorageId:  new mongoose.Types.ObjectId(storeAdminId),
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

    return deliveryVoucherNumber + 1;
  } catch (err) {
    throw new Error("Some error occurred while getting deliver voucher Number");
  }
};

export const formatName = (name) => {
  return name
    .split(" ") // Split the string by spaces
    .map(
      (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() // Capitalize each word
    )
    .join("-"); // Join the words with hyphens
};

export const formatFarmerName = (name) => {
  return name
    .split(" ")
    .map(
      (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" "); // Join with space instead of returning array
};

export const formatDate = (date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
  const year = String(date.getFullYear()).slice(-2); // Take last two digits of year
  return `${day}.${month}.${year}`;
};

export const varieties = [
  "Atlantic",
  "Cardinal",
  "Chipsona 1",
  "Chipsona 2",
  "Chipsona 3",
  "Colomba",
  "Desiree",
  "Diamond",
  "FC - 11",
  "FC - 12",
  "FC - 5",
  "Fry Sona",
  "Himalini",
  "K. Badshah",
  "K. Chandramukhi",
  "K. Jyoti",
  "K. Pukhraj",
  "Kuroda",
  "Khyati",
  "L.R",
  "Lima",
  "Mohan",
  "Pushkar",
  "SU - Khyati",
  "Super Six",
  "Surya",
];


const cleanRegisteredFarmers = async (storeAdminId) => {
  try {
    // Fetch the store admin document
    const storeAdmin = await StoreAdmin.findById(storeAdminId);
    if (!storeAdmin) {
      console.log("Store Admin not found");
      return;
    }

    let registeredFarmers = storeAdmin.registeredFarmers; // Array of farmer IDs

    // Find farmers that exist in the database
    const existingFarmers = await Farmer.find({
      _id: { $in: registeredFarmers },
    }).select("_id");

    // Extract valid IDs from found farmer documents
    const validFarmerIds = new Set(
      existingFarmers.map((farmer) => farmer._id.toString())
    );

    // Filter out IDs that are not in the database
    const filteredFarmers = registeredFarmers.filter((id) =>
      validFarmerIds.has(id.toString())
    );

    // Update the store admin document only if changes are needed
    if (filteredFarmers.length !== registeredFarmers.length) {
      storeAdmin.registeredFarmers = filteredFarmers;
      await storeAdmin.save();
      console.log("Updated store admin document with valid farmers.");
    } else {
      console.log("No changes needed. All farmers exist.");
    }
  } catch (error) {
    console.error("Error cleaning registered farmers:", error);
  }
};
