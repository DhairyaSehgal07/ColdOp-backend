import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ColdStorage } from "../../../src/modules/v1/cold-storage/cold-storage.model.js";
import { Farmer } from "../../../src/modules/v1/farmer/farmer-model.js";
import { FarmerStorageLink } from "../../../src/modules/v1/farmer-storage-link/farmer-storage-link-model.js";
import {
  IncomingGatePass,
  GatePassStatus,
  GatePassType as IncomingGatePassType,
} from "../../../src/modules/v1/incoming-gate-pass/incoming-gate-pass.model.js";
import { StoreAdmin } from "../../../src/modules/v1/store-admin/store-admin.model.js";
import { createOutgoingGatePass } from "../../../src/modules/v1/outgoing-gate-pass/outgoing-gate-pass.service.js";
import type { CreateOutgoingGatePassInput } from "../../../src/modules/v1/outgoing-gate-pass/outgoing-gate-pass.schema.js";

let replSet: MongoMemoryReplSet | undefined;
let mobileCounter = 0;

function nextMobile(): string {
  mobileCounter += 1;
  return `9${String(mobileCounter).padStart(9, "0")}`;
}

export async function connectTestDatabase(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(replSet.getUri());
}

export async function disconnectTestDatabase(): Promise<void> {
  await mongoose.disconnect();
  if (replSet) {
    await replSet.stop();
    replSet = undefined;
  }
}

export async function clearDatabase(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const collection of Object.values(collections)) {
    await collection.deleteMany({});
  }
}

export async function createTestColdStorage() {
  const mobileNumber = nextMobile();
  return ColdStorage.create({
    name: `Test Storage ${mobileNumber}`,
    address: "Test Address",
    mobileNumber,
    capacity: 1000,
  });
}

export async function createTestFarmer() {
  const mobileNumber = nextMobile();
  return Farmer.create({
    name: "Test Farmer",
    address: "Farmer Address",
    mobileNumber,
    password: "test-password-123",
  });
}

export async function createTestStoreAdmin(coldStorageId: Types.ObjectId) {
  const mobileNumber = nextMobile();
  return StoreAdmin.create({
    coldStorageId,
    name: "Test Admin",
    mobileNumber,
    password: "admin-password-123",
    isVerified: true,
  });
}

export async function createTestFarmerStorageLink(
  coldStorageId: Types.ObjectId,
  farmerId: Types.ObjectId,
  accountNumber: number,
) {
  return FarmerStorageLink.create({
    coldStorageId,
    farmerId,
    accountNumber,
    isActive: true,
    name: "Test Farmer Link",
  });
}

export interface TestBagConfig {
  name: string;
  initialQuantity: number;
  currentQuantity?: number;
  location: { chamber: string; floor: string; row: string };
  paltaiLocation?: { chamber: string; floor: string; row: string }[];
}

export async function createTestIncomingGatePass(params: {
  farmerStorageLinkId: Types.ObjectId;
  gatePassNo: number;
  variety?: string;
  bagSizes: TestBagConfig[];
  createdById?: Types.ObjectId;
}) {
  return IncomingGatePass.create({
    farmerStorageLinkId: params.farmerStorageLinkId,
    createdBy: params.createdById,
    gatePassNo: params.gatePassNo,
    date: new Date(),
    type: IncomingGatePassType.RECEIPT,
    variety: params.variety ?? "Potato",
    status: GatePassStatus.OPEN,
    bagSizes: params.bagSizes.map((bag) => ({
      name: bag.name,
      initialQuantity: bag.initialQuantity,
      currentQuantity: bag.currentQuantity ?? bag.initialQuantity,
      location: bag.location,
      ...(bag.paltaiLocation &&
        bag.paltaiLocation.length > 0 && { paltaiLocation: bag.paltaiLocation }),
    })),
  });
}

export async function createTestOutgoingGatePass(params: {
  farmerStorageLinkId: Types.ObjectId;
  gatePassNo: number;
  incomingGatePassId: Types.ObjectId;
  variety?: string;
  size: string;
  quantity: number;
  location?: { chamber: string; floor: string; row: string };
  createdById?: string;
}) {
  const payload: CreateOutgoingGatePassInput = {
    farmerStorageLinkId: params.farmerStorageLinkId.toString(),
    gatePassNo: params.gatePassNo,
    date: new Date(),
    incomingGatePasses: [
      {
        incomingGatePassId: params.incomingGatePassId.toString(),
        variety: params.variety ?? "Potato",
        allocations: [
          {
            size: params.size,
            quantityToAllocate: params.quantity,
            ...(params.location && { location: params.location }),
          },
        ],
      },
    ],
  };

  const result = await createOutgoingGatePass(
    payload,
    params.createdById,
    undefined,
  );
  return {
    outgoing: result as { _id: Types.ObjectId; gatePassNo: number },
    payload,
  };
}

export function bagAt(
  incomingPass: { bagSizes: Array<{ name: string; currentQuantity: number }> },
  size: string,
): number {
  const bag = incomingPass.bagSizes.find((b) => b.name === size);
  if (!bag) throw new Error(`Bag size ${size} not found`);
  return bag.currentQuantity;
}
