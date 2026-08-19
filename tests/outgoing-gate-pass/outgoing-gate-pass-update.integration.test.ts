import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import mongoose, { Types } from "mongoose";
import {
  clearDatabase,
  connectTestDatabase,
  createTestColdStorage,
  createTestFarmer,
  createTestFarmerStorageLink,
  createTestIncomingGatePass,
  createTestOutgoingGatePass,
  createTestStoreAdmin,
  disconnectTestDatabase,
} from "./helpers/fixtures.js";
import {
  updateOutgoingGatePass,
  nullOutgoingGatePass,
} from "../../src/modules/v1/outgoing-gate-pass/outgoing-gate-pass.service.js";
import { updateOutgoingGatePassSchema, createOutgoingGatePassSchema } from "../../src/modules/v1/outgoing-gate-pass/outgoing-gate-pass.schema.js";
import {
  OutgoingGatePass,
} from "../../src/modules/v1/outgoing-gate-pass/outgoing-gate-pass.model.js";
import { IncomingGatePass } from "../../src/modules/v1/incoming-gate-pass/incoming-gate-pass.model.js";
import {
  EditHistory,
  EditHistoryAction,
  EditHistoryEntityType,
} from "../../src/modules/v1/edit-history/edit-history.model.js";
import {
  NotFoundError,
} from "../../src/utils/errors.js";

const locationA = { chamber: "A", floor: "1", row: "3" };
const locationB = { chamber: "B", floor: "2", row: "1" };

describe("updateOutgoingGatePass integration", () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  async function seedBaseline() {
    const coldStorage = await createTestColdStorage();
    const farmer = await createTestFarmer();
    const link = await createTestFarmerStorageLink(
      coldStorage._id,
      farmer._id,
      1001,
    );
    const admin = await createTestStoreAdmin(coldStorage._id);
    const incoming = await createTestIncomingGatePass({
      farmerStorageLinkId: link._id,
      gatePassNo: 101,
      bagSizes: [
        {
          name: "50kg",
          initialQuantity: 300,
          currentQuantity: 300,
          location: locationA,
        },
      ],
    });
    const { outgoing } = await createTestOutgoingGatePass({
      farmerStorageLinkId: link._id,
      gatePassNo: 501,
      incomingGatePassId: incoming._id,
      quantity: 50,
      size: "50kg",
      location: locationA,
      createdById: admin._id.toString(),
    });

    return {
      coldStorage,
      link,
      admin,
      incoming,
      outgoing,
    };
  }

  it("increases issued quantity and deducts additional stock", async () => {
    const { coldStorage, incoming, outgoing, admin } = await seedBaseline();

    await updateOutgoingGatePass(
      outgoing._id.toString(),
      {
        incomingGatePasses: [
          {
            incomingGatePassId: incoming._id.toString(),
            variety: "Potato",
            allocations: [
              { size: "50kg", quantityToAllocate: 80, location: locationA },
            ],
          },
        ],
      },
      admin._id.toString(),
      coldStorage._id.toString(),
    );

    const refreshedIncoming = await IncomingGatePass.findById(incoming._id).lean();
    expect(refreshedIncoming?.bagSizes[0].currentQuantity).toBe(220);

    const refreshedOutgoing = await OutgoingGatePass.findById(outgoing._id).lean();
    expect(refreshedOutgoing?.orderDetails[0].quantityIssued).toBe(80);
    expect(
      refreshedOutgoing?.incomingGatePassSnapshots?.[0].bagSizes[0]
        .quantityIssued,
    ).toBe(80);
  });

  it("persists generation on create", async () => {
    const { link, incoming, admin, outgoing } = await seedBaseline();

    const created = await createTestOutgoingGatePass({
      farmerStorageLinkId: link._id,
      gatePassNo: 502,
      incomingGatePassId: incoming._id,
      quantity: 10,
      size: "50kg",
      location: locationA,
      createdById: admin._id.toString(),
      generation: "G1",
    });

    const stored = await OutgoingGatePass.findById(created.outgoing._id).lean();
    expect(stored?.generation).toBe("G1");
    expect(outgoing.gatePassNo).toBe(501);
  });

  it("decreases issued quantity and restores stock", async () => {
    const { coldStorage, incoming, outgoing, admin } = await seedBaseline();

    await updateOutgoingGatePass(
      outgoing._id.toString(),
      {
        incomingGatePasses: [
          {
            incomingGatePassId: incoming._id.toString(),
            variety: "Potato",
            allocations: [
              { size: "50kg", quantityToAllocate: 30, location: locationA },
            ],
          },
        ],
      },
      admin._id.toString(),
      coldStorage._id.toString(),
    );

    const refreshedIncoming = await IncomingGatePass.findById(incoming._id).lean();
    expect(refreshedIncoming?.bagSizes[0].currentQuantity).toBe(270);
  });

  it("restores stock when allocation moves to a different incoming pass", async () => {
    const { coldStorage, link, incoming, outgoing, admin } =
      await seedBaseline();

    const incoming2 = await createTestIncomingGatePass({
      farmerStorageLinkId: link._id,
      gatePassNo: 102,
      bagSizes: [
        {
          name: "50kg",
          initialQuantity: 200,
          currentQuantity: 200,
          location: locationB,
        },
      ],
    });

    await updateOutgoingGatePass(
      outgoing._id.toString(),
      {
        incomingGatePasses: [
          {
            incomingGatePassId: incoming2._id.toString(),
            variety: "Potato",
            allocations: [
              { size: "50kg", quantityToAllocate: 40, location: locationB },
            ],
          },
        ],
      },
      admin._id.toString(),
      coldStorage._id.toString(),
    );

    const oldIncoming = await IncomingGatePass.findById(incoming._id).lean();
    const newIncoming = await IncomingGatePass.findById(incoming2._id).lean();
    expect(oldIncoming?.bagSizes[0].currentQuantity).toBe(300);
    expect(newIncoming?.bagSizes[0].currentQuantity).toBe(160);

    const refreshedOutgoing = await OutgoingGatePass.findById(outgoing._id).lean();
    expect(refreshedOutgoing?.incomingGatePassSnapshots).toHaveLength(1);
    expect(
      refreshedOutgoing?.incomingGatePassSnapshots?.[0]._id.toString(),
    ).toBe(incoming2._id.toString());
  });

  it("targets the correct bag when same size exists at multiple locations", async () => {
    const coldStorage = await createTestColdStorage();
    const farmer = await createTestFarmer();
    const link = await createTestFarmerStorageLink(
      coldStorage._id,
      farmer._id,
      1002,
    );
    const admin = await createTestStoreAdmin(coldStorage._id);
    const incoming = await createTestIncomingGatePass({
      farmerStorageLinkId: link._id,
      gatePassNo: 201,
      bagSizes: [
        {
          name: "50kg",
          initialQuantity: 100,
          currentQuantity: 100,
          location: locationA,
        },
        {
          name: "50kg",
          initialQuantity: 100,
          currentQuantity: 100,
          location: locationB,
        },
      ],
    });

    const { outgoing } = await createTestOutgoingGatePass({
      farmerStorageLinkId: link._id,
      gatePassNo: 601,
      incomingGatePassId: incoming._id,
      quantity: 20,
      size: "50kg",
      location: locationA,
      createdById: admin._id.toString(),
    });

    await updateOutgoingGatePass(
      outgoing._id.toString(),
      {
        incomingGatePasses: [
          {
            incomingGatePassId: incoming._id.toString(),
            variety: "Potato",
            allocations: [
              { size: "50kg", quantityToAllocate: 35, location: locationA },
            ],
          },
        ],
      },
      admin._id.toString(),
      coldStorage._id.toString(),
    );

    const refreshed = await IncomingGatePass.findById(incoming._id).lean();
    const bagA = refreshed?.bagSizes.find(
      (b) => b.location.chamber === "A",
    );
    const bagB = refreshed?.bagSizes.find(
      (b) => b.location.chamber === "B",
    );
    expect(bagA?.currentQuantity).toBe(65);
    expect(bagB?.currentQuantity).toBe(100);
  });

  it("updates header fields without changing incoming stock", async () => {
    const { coldStorage, incoming, outgoing, admin } = await seedBaseline();

    await updateOutgoingGatePass(
      outgoing._id.toString(),
      { truckNumber: "HR-99-XY-0001", remarks: "Updated truck" },
      admin._id.toString(),
      coldStorage._id.toString(),
    );

    const refreshedIncoming = await IncomingGatePass.findById(incoming._id).lean();
    expect(refreshedIncoming?.bagSizes[0].currentQuantity).toBe(250);

    const refreshedOutgoing = await OutgoingGatePass.findById(outgoing._id).lean();
    expect(refreshedOutgoing?.truckNumber).toBe("HR-99-XY-0001");
    expect(refreshedOutgoing?.remarks).toBe("Updated truck");
  });

  it("combines header and allocation changes in one request", async () => {
    const { coldStorage, incoming, outgoing, admin } = await seedBaseline();

    await updateOutgoingGatePass(
      outgoing._id.toString(),
      {
        truckNumber: "HR-10-COMBINED",
        incomingGatePasses: [
          {
            incomingGatePassId: incoming._id.toString(),
            variety: "Potato",
            allocations: [
              { size: "50kg", quantityToAllocate: 60, location: locationA },
            ],
          },
        ],
      },
      admin._id.toString(),
      coldStorage._id.toString(),
    );

    const refreshedOutgoing = await OutgoingGatePass.findById(outgoing._id).lean();
    expect(refreshedOutgoing?.truckNumber).toBe("HR-10-COMBINED");
    expect(refreshedOutgoing?.orderDetails[0].quantityIssued).toBe(60);
  });

  it("rejects identical allocations with INVALID_ALLOCATION_QUANTITY", async () => {
    const { coldStorage, incoming, outgoing, admin } = await seedBaseline();

    await expect(
      updateOutgoingGatePass(
        outgoing._id.toString(),
        {
          incomingGatePasses: [
            {
              incomingGatePassId: incoming._id.toString(),
              variety: "Potato",
              allocations: [
                { size: "50kg", quantityToAllocate: 50, location: locationA },
              ],
            },
          ],
        },
        admin._id.toString(),
        coldStorage._id.toString(),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_ALLOCATION_QUANTITY",
    });
  });

  it("rejects allocation edit when snapshots are missing", async () => {
    const coldStorage = await createTestColdStorage();
    const farmer = await createTestFarmer();
    const link = await createTestFarmerStorageLink(
      coldStorage._id,
      farmer._id,
      1003,
    );
    const admin = await createTestStoreAdmin(coldStorage._id);
    const incoming = await createTestIncomingGatePass({
      farmerStorageLinkId: link._id,
      gatePassNo: 301,
      bagSizes: [
        {
          name: "50kg",
          initialQuantity: 100,
          location: locationA,
        },
      ],
    });

    const legacyOutgoing = await OutgoingGatePass.create({
      farmerStorageLinkId: link._id,
      gatePassNo: 701,
      date: new Date(),
      truckNumber: "",
      incomingGatePassSnapshots: [],
      orderDetails: [
        {
          variety: "Potato",
          size: "50kg",
          quantityAvailable: 50,
          quantityIssued: 50,
          location: locationA,
        },
      ],
    });

    await expect(
      updateOutgoingGatePass(
        legacyOutgoing._id.toString(),
        {
          incomingGatePasses: [
            {
              incomingGatePassId: incoming._id.toString(),
              variety: "Potato",
              allocations: [
                { size: "50kg", quantityToAllocate: 10, location: locationA },
              ],
            },
          ],
        },
        admin._id.toString(),
        coldStorage._id.toString(),
      ),
    ).rejects.toMatchObject({
      code: "OUTGOING_SNAPSHOT_MISSING",
    });
  });

  it("rejects variety mismatch", async () => {
    const { coldStorage, incoming, outgoing, admin } = await seedBaseline();

    await expect(
      updateOutgoingGatePass(
        outgoing._id.toString(),
        {
          incomingGatePasses: [
            {
              incomingGatePassId: incoming._id.toString(),
              variety: "Onion",
              allocations: [
                { size: "50kg", quantityToAllocate: 60, location: locationA },
              ],
            },
          ],
        },
        admin._id.toString(),
        coldStorage._id.toString(),
      ),
    ).rejects.toMatchObject({
      code: "VARIETY_MISMATCH",
    });
  });

  it("rejects insufficient stock beyond edit credit", async () => {
    const { coldStorage, incoming, outgoing, admin } = await seedBaseline();

    await expect(
      updateOutgoingGatePass(
        outgoing._id.toString(),
        {
          incomingGatePasses: [
            {
              incomingGatePassId: incoming._id.toString(),
              variety: "Potato",
              allocations: [
                { size: "50kg", quantityToAllocate: 400, location: locationA },
              ],
            },
          ],
        },
        admin._id.toString(),
        coldStorage._id.toString(),
      ),
    ).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
    });
  });

  it("rejects updates on nulled outgoing gate pass", async () => {
    const { coldStorage, outgoing, admin } = await seedBaseline();

    await nullOutgoingGatePass(
      outgoing._id.toString(),
      {},
      admin._id.toString(),
      coldStorage._id.toString(),
    );

    await expect(
      updateOutgoingGatePass(
        outgoing._id.toString(),
        { truckNumber: "SHOULD-FAIL" },
        admin._id.toString(),
        coldStorage._id.toString(),
      ),
    ).rejects.toMatchObject({
      code: "OUTGOING_GATE_PASS_NULLED",
    });
  });

  it("returns 404 for wrong cold storage tenant", async () => {
    const { outgoing, admin } = await seedBaseline();
    const otherStorage = await createTestColdStorage();

    await expect(
      updateOutgoingGatePass(
        outgoing._id.toString(),
        { truckNumber: "TENANT-FAIL" },
        admin._id.toString(),
        otherStorage._id.toString(),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("allows farmerStorageLinkId change within same cold storage", async () => {
    const { coldStorage, link, outgoing, admin } = await seedBaseline();
    const farmer2 = await createTestFarmer();
    const link2 = await createTestFarmerStorageLink(
      coldStorage._id,
      farmer2._id,
      1004,
    );

    await updateOutgoingGatePass(
      outgoing._id.toString(),
      { farmerStorageLinkId: link2._id.toString() },
      admin._id.toString(),
      coldStorage._id.toString(),
    );

    const refreshed = await OutgoingGatePass.findById(outgoing._id).lean();
    expect(refreshed?.farmerStorageLinkId.toString()).toBe(link2._id.toString());
    expect(link._id.toString()).not.toBe(link2._id.toString());
  });

  it("rejects farmerStorageLinkId from another cold storage", async () => {
    const { coldStorage, outgoing, admin } = await seedBaseline();
    const otherStorage = await createTestColdStorage();
    const otherFarmer = await createTestFarmer();
    const otherLink = await createTestFarmerStorageLink(
      otherStorage._id,
      otherFarmer._id,
      2001,
    );

    await expect(
      updateOutgoingGatePass(
        outgoing._id.toString(),
        { farmerStorageLinkId: otherLink._id.toString() },
        admin._id.toString(),
        coldStorage._id.toString(),
      ),
    ).rejects.toMatchObject({
      code: "FARMER_STORAGE_LINK_NOT_FOUND",
    });
  });

  it("records edit history on incoming and outgoing passes after allocation edit", async () => {
    const { coldStorage, incoming, outgoing, admin } = await seedBaseline();

    await updateOutgoingGatePass(
      outgoing._id.toString(),
      {
        incomingGatePasses: [
          {
            incomingGatePassId: incoming._id.toString(),
            variety: "Potato",
            allocations: [
              { size: "50kg", quantityToAllocate: 70, location: locationA },
            ],
          },
        ],
      },
      admin._id.toString(),
      coldStorage._id.toString(),
    );

    const incomingHistory = await EditHistory.find({
      entityType: EditHistoryEntityType.INCOMING_GATE_PASS,
      documentId: incoming._id,
      action: EditHistoryAction.QUANTITY_ADJUSTMENT,
    }).lean();
    const outgoingHistory = await EditHistory.find({
      entityType: EditHistoryEntityType.OUTGOING_GATE_PASS,
      documentId: outgoing._id,
      action: EditHistoryAction.UPDATE,
    }).lean();

    expect(incomingHistory.length).toBeGreaterThanOrEqual(1);
    expect(outgoingHistory.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects empty update body via schema validation", () => {
    const parsed = updateOutgoingGatePassSchema.safeParse({
      params: { id: new Types.ObjectId().toString() },
      body: {},
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid outgoing gate pass id", async () => {
    await expect(
      updateOutgoingGatePass("not-an-id", { truckNumber: "X" }, undefined, undefined),
    ).rejects.toMatchObject({
      code: "INVALID_OUTGOING_GATE_PASS_ID",
    });
  });

  it("rejects NO_FIELDS_TO_UPDATE when only unknown-empty payload reaches service", async () => {
    const { coldStorage, outgoing, admin } = await seedBaseline();

    await expect(
      updateOutgoingGatePass(
        outgoing._id.toString(),
        {},
        admin._id.toString(),
        coldStorage._id.toString(),
      ),
    ).rejects.toMatchObject({
      code: "NO_FIELDS_TO_UPDATE",
    });
  });
});

describe("updateOutgoingGatePassSchema", () => {
  it("accepts incomingGatePasses-only body", () => {
    const parsed = updateOutgoingGatePassSchema.safeParse({
      params: { id: new Types.ObjectId().toString() },
      body: {
        incomingGatePasses: [
          {
            incomingGatePassId: new Types.ObjectId().toString(),
            variety: "Potato",
            allocations: [{ size: "50kg", quantityToAllocate: 10 }],
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid incoming gate pass id in allocations", () => {
    const parsed = updateOutgoingGatePassSchema.safeParse({
      params: { id: new Types.ObjectId().toString() },
      body: {
        incomingGatePasses: [
          {
            incomingGatePassId: "bad-id",
            variety: "Potato",
            allocations: [{ size: "50kg", quantityToAllocate: 10 }],
          },
        ],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts generation on update", () => {
    const parsed = updateOutgoingGatePassSchema.safeParse({
      params: { id: new Types.ObjectId().toString() },
      body: { generation: "G1" },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("createOutgoingGatePassSchema", () => {
  it("accepts generation on create", () => {
    const parsed = createOutgoingGatePassSchema.safeParse({
      body: {
        farmerStorageLinkId: new Types.ObjectId().toString(),
        gatePassNo: 1,
        date: new Date().toISOString(),
        generation: "G1",
        incomingGatePasses: [
          {
            incomingGatePassId: new Types.ObjectId().toString(),
            variety: "Potato",
            allocations: [{ size: "50kg", quantityToAllocate: 10 }],
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.body.generation).toBe("G1");
    }
  });
});
