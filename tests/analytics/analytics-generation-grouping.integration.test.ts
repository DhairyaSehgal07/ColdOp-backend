import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  clearDatabase,
  connectTestDatabase,
  createTestColdStorage,
  createTestFarmer,
  createTestFarmerStorageLink,
  createTestIncomingGatePass,
  disconnectTestDatabase,
} from "../outgoing-gate-pass/helpers/fixtures.js";
import { getStockSummary } from "../../src/modules/v1/analytics/analytics.service.js";

const locationA = { chamber: "A", floor: "1", row: "3" };

describe("analytics generation grouping", () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it("groups stock summary by generation and nested filter+generation pairs", async () => {
    const coldStorage = await createTestColdStorage();
    const farmer = await createTestFarmer();
    const link = await createTestFarmerStorageLink(
      coldStorage._id,
      farmer._id,
      1001,
    );

    await createTestIncomingGatePass({
      farmerStorageLinkId: link._id,
      gatePassNo: 1,
      variety: "Atlantic",
      stockFilter: "Owned",
      generation: "G1",
      bagSizes: [
        {
          name: "Ration",
          initialQuantity: 80,
          currentQuantity: 80,
          location: locationA,
        },
      ],
    });
    await createTestIncomingGatePass({
      farmerStorageLinkId: link._id,
      gatePassNo: 2,
      variety: "Cardinal",
      stockFilter: "Owned",
      generation: "G2",
      bagSizes: [
        {
          name: "Ration",
          initialQuantity: 20,
          currentQuantity: 20,
          location: locationA,
        },
      ],
    });
    await createTestIncomingGatePass({
      farmerStorageLinkId: link._id,
      gatePassNo: 3,
      variety: "Chipsona",
      stockFilter: "Farmer",
      generation: "G1",
      bagSizes: [
        {
          name: "Ration",
          initialQuantity: 10,
          currentQuantity: 10,
          location: locationA,
        },
      ],
    });

    const byGeneration = await getStockSummary(coldStorage._id.toString(), undefined, {
      groupByGeneration: true,
    });
    expect(byGeneration).toHaveProperty("stockSummaryByGeneration");
    if ("stockSummaryByGeneration" in byGeneration) {
      expect(byGeneration.stockSummaryByGeneration.G1.totalInventory.current).toBe(90);
      expect(byGeneration.stockSummaryByGeneration.G2.totalInventory.current).toBe(20);
    }

    const nested = await getStockSummary(coldStorage._id.toString(), undefined, {
      groupByStockFilter: true,
      groupByGeneration: true,
    });
    expect(nested).toHaveProperty("stockSummaryByFilterAndGeneration");
    if ("stockSummaryByFilterAndGeneration" in nested) {
      expect(
        nested.stockSummaryByFilterAndGeneration.Owned.G1.totalInventory.current,
      ).toBe(80);
      expect(
        nested.stockSummaryByFilterAndGeneration.Owned.G2.totalInventory.current,
      ).toBe(20);
      expect(
        nested.stockSummaryByFilterAndGeneration.Farmer.G1.totalInventory.current,
      ).toBe(10);
    }
  });

  it("returns NO_GENERATION when grouping by generation with no values", async () => {
    const coldStorage = await createTestColdStorage();
    const farmer = await createTestFarmer();
    const link = await createTestFarmerStorageLink(
      coldStorage._id,
      farmer._id,
      1001,
    );
    await createTestIncomingGatePass({
      farmerStorageLinkId: link._id,
      gatePassNo: 1,
      bagSizes: [
        {
          name: "Ration",
          initialQuantity: 10,
          currentQuantity: 10,
          location: locationA,
        },
      ],
    });

    await expect(
      getStockSummary(coldStorage._id.toString(), undefined, {
        groupByGeneration: true,
      }),
    ).rejects.toMatchObject({ code: "NO_GENERATION" });
  });
});
