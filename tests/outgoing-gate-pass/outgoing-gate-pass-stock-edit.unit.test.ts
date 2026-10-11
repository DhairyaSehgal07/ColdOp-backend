import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import {
  outgoingGatePassStockEditTestExports,
} from "../../src/modules/v1/outgoing-gate-pass/outgoing-gate-pass.service.js";
import {
  GatePassType,
  type IOutgoingIncomingGatePassSnapshot,
  type IOutgoingOrderDetail,
} from "../../src/modules/v1/outgoing-gate-pass/outgoing-gate-pass.model.js";
import type {
  IBagSize,
  IIncomingGatePass,
} from "../../src/modules/v1/incoming-gate-pass/incoming-gate-pass.model.js";
import { ValidationError } from "../../src/utils/errors.js";

const {
  allocationMapKey,
  buildIncomingGatePassSnapshots,
  buildPreviouslyIssuedMap,
  buildRequestedAllocationMap,
  prepareNetDeltaBulkOperationsForUpdate,
} = outgoingGatePassStockEditTestExports;

const incomingId = new Types.ObjectId().toString();
const incomingId2 = new Types.ObjectId().toString();

function makeSnapshot(
  id: string,
  variety: string,
  bagSizes: Array<{
    name: string;
    quantityIssued?: number;
    location?: { chamber: string; floor: string; row: string };
  }>,
): IOutgoingIncomingGatePassSnapshot {
  return {
    _id: new Types.ObjectId(id),
    gatePassNo: 1,
    variety,
    bagSizes: bagSizes.map((bag) => ({
      name: bag.name,
      currentQuantity: 100,
      initialQuantity: 200,
      type: GatePassType.DELIVERY,
      location: bag.location ?? { chamber: "A", floor: "1", row: "1" },
      ...(bag.quantityIssued !== undefined && {
        quantityIssued: bag.quantityIssued,
      }),
    })),
  };
}

function makeIncomingPass(
  id: string,
  variety: string,
  bagSizes: IBagSize[],
): IIncomingGatePass & { _id: Types.ObjectId } {
  return {
    _id: new Types.ObjectId(id),
    farmerStorageLinkId: new Types.ObjectId(),
    gatePassNo: 1,
    date: new Date(),
    type: "RECEIPT" as never,
    variety,
    bagSizes,
    status: "OPEN" as never,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("outgoing gate pass stock edit helpers", () => {
  describe("allocationMapKey", () => {
    it("treats unicode dash and hyphen as the same size", () => {
      const hyphenKey = allocationMapKey(incomingId, "25-30", {
        chamber: "A",
        floor: "1",
        row: "1",
      });
      const enDashKey = allocationMapKey(incomingId, "25–30", {
        chamber: "A",
        floor: "1",
        row: "1",
      });
      expect(hyphenKey).toBe(enDashKey);
    });
  });

  describe("buildPreviouslyIssuedMap", () => {
    it("uses quantityIssued from snapshot rows when present", () => {
      const snapshots = [
        makeSnapshot(incomingId, "Potato", [
          { name: "50kg", quantityIssued: 50 },
        ]),
      ];
      const map = buildPreviouslyIssuedMap(snapshots, []);
      const key = allocationMapKey(incomingId, "50kg", {
        chamber: "A",
        floor: "1",
        row: "1",
      });
      expect(map.get(key)).toBe(50);
    });

    it("falls back to orderDetails for legacy passes without quantityIssued", () => {
      const snapshots = [
        makeSnapshot(incomingId, "Potato", [{ name: "50kg" }]),
      ];
      const orderDetails: IOutgoingOrderDetail[] = [
        {
          variety: "Potato",
          size: "50kg",
          quantityAvailable: 150,
          quantityIssued: 40,
          location: { chamber: "A", floor: "1", row: "1" },
        },
      ];
      const map = buildPreviouslyIssuedMap(snapshots, orderDetails);
      const key = allocationMapKey(incomingId, "50kg", {
        chamber: "A",
        floor: "1",
        row: "1",
      });
      expect(map.get(key)).toBe(40);
    });

    it("splits aggregated orderDetails across duplicate snapshot rows", () => {
      const loc = { chamber: "A", floor: "1", row: "1" };
      const snapshots = [
        makeSnapshot(incomingId, "Potato", [{ name: "50kg", location: loc }]),
        makeSnapshot(incomingId2, "Potato", [{ name: "50kg", location: loc }]),
      ];
      const orderDetails: IOutgoingOrderDetail[] = [
        {
          variety: "Potato",
          size: "50kg",
          quantityAvailable: 100,
          quantityIssued: 100,
          location: loc,
        },
      ];
      const map = buildPreviouslyIssuedMap(snapshots, orderDetails);
      expect(map.get(allocationMapKey(incomingId, "50kg", loc))).toBe(50);
      expect(map.get(allocationMapKey(incomingId2, "50kg", loc))).toBe(50);
    });

    it("throws OUTGOING_RESTORE_QUANTITY_UNKNOWN when issued qty cannot be resolved", () => {
      const snapshots = [
        makeSnapshot(incomingId, "Potato", [{ name: "50kg" }]),
      ];
      expect(() => buildPreviouslyIssuedMap(snapshots, [])).toThrow(
        ValidationError,
      );
      try {
        buildPreviouslyIssuedMap(snapshots, []);
      } catch (error) {
        expect((error as ValidationError).code).toBe(
          "OUTGOING_RESTORE_QUANTITY_UNKNOWN",
        );
      }
    });
  });

  describe("buildRequestedAllocationMap", () => {
    it("sums multiple allocations for the same key", () => {
      const map = buildRequestedAllocationMap([
        {
          incomingGatePassId: incomingId,
          variety: "Potato",
          allocations: [
            {
              incomingGatePassId: incomingId,
              size: "50kg",
              quantityToAllocate: 30,
              location: { chamber: "A", floor: "1", row: "1" },
            },
            {
              incomingGatePassId: incomingId,
              size: "50kg",
              quantityToAllocate: 20,
              location: { chamber: "A", floor: "1", row: "1" },
            },
          ],
        },
      ]);
      const key = allocationMapKey(incomingId, "50kg", {
        chamber: "A",
        floor: "1",
        row: "1",
      });
      expect(map.get(key)).toBe(50);
    });
  });

  describe("prepareNetDeltaBulkOperationsForUpdate", () => {
    const location = { chamber: "A", floor: "1", row: "3" };

    function setupPass(currentQuantity: number) {
      const pass = makeIncomingPass(incomingId, "Potato", [
        {
          name: "50kg",
          initialQuantity: 300,
          currentQuantity,
          location,
        },
      ]);
      return new Map([[incomingId, pass]]);
    }

    it("skips keys where delta is zero", () => {
      const previouslyIssued = new Map([
        [allocationMapKey(incomingId, "50kg", location), 50],
      ]);
      const requested = new Map([
        [allocationMapKey(incomingId, "50kg", location), 50],
      ]);
      const ops = prepareNetDeltaBulkOperationsForUpdate(
        previouslyIssued,
        requested,
        setupPass(200),
      );
      expect(ops).toHaveLength(0);
    });

    it("builds increment op when issuing more bags", () => {
      const key = allocationMapKey(incomingId, "50kg", location);
      const previouslyIssued = new Map([[key, 50]]);
      const requested = new Map([[key, 80]]);
      const ops = prepareNetDeltaBulkOperationsForUpdate(
        previouslyIssued,
        requested,
        setupPass(200),
      );
      expect(ops).toHaveLength(1);
      const op = ops[0] as {
        updateOne: {
          update: { $inc: Record<string, number> };
          filter: Record<string, unknown>;
        };
      };
      expect(op.updateOne.update.$inc["bagSizes.0.currentQuantity"]).toBe(-30);
      expect(op.updateOne.filter["bagSizes.0.currentQuantity"]).toEqual({
        $gte: 30,
      });
    });

    it("builds decrement op when issuing fewer bags", () => {
      const key = allocationMapKey(incomingId, "50kg", location);
      const previouslyIssued = new Map([[key, 80]]);
      const requested = new Map([[key, 30]]);
      const ops = prepareNetDeltaBulkOperationsForUpdate(
        previouslyIssued,
        requested,
        setupPass(170),
      );
      expect(ops).toHaveLength(1);
      const op = ops[0] as {
        updateOne: { update: { $inc: Record<string, number> } };
      };
      expect(op.updateOne.update.$inc["bagSizes.0.currentQuantity"]).toBe(50);
    });

    it("restores full stock when allocation is removed", () => {
      const key = allocationMapKey(incomingId, "50kg", location);
      const previouslyIssued = new Map([[key, 50]]);
      const requested = new Map<string, number>();
      const ops = prepareNetDeltaBulkOperationsForUpdate(
        previouslyIssued,
        requested,
        setupPass(200),
      );
      expect(ops).toHaveLength(1);
      const op = ops[0] as {
        updateOne: { update: { $inc: Record<string, number> } };
      };
      expect(op.updateOne.update.$inc["bagSizes.0.currentQuantity"]).toBe(50);
    });

    it("throws INSUFFICIENT_STOCK when increase exceeds available + edit credit", () => {
      const key = allocationMapKey(incomingId, "50kg", location);
      const previouslyIssued = new Map([[key, 50]]);
      const requested = new Map([[key, 300]]);
      expect(() =>
        prepareNetDeltaBulkOperationsForUpdate(
          previouslyIssued,
          requested,
          setupPass(200),
        ),
      ).toThrow(ValidationError);
      try {
        prepareNetDeltaBulkOperationsForUpdate(
          previouslyIssued,
          requested,
          setupPass(200),
        );
      } catch (error) {
        expect((error as ValidationError).code).toBe("INSUFFICIENT_STOCK");
      }
    });

    it("throws SIZE_NOT_FOUND for unknown size", () => {
      const key = allocationMapKey(incomingId, "25kg", location);
      const previouslyIssued = new Map([[key, 10]]);
      const requested = new Map([[key, 5]]);
      expect(() =>
        prepareNetDeltaBulkOperationsForUpdate(
          previouslyIssued,
          requested,
          setupPass(200),
        ),
      ).toThrow(ValidationError);
      try {
        prepareNetDeltaBulkOperationsForUpdate(
          previouslyIssued,
          requested,
          setupPass(200),
        );
      } catch (error) {
        expect((error as ValidationError).code).toBe("SIZE_NOT_FOUND");
      }
    });

    it("targets bag by current location when previousLocation history is set", () => {
      const current = { chamber: "A", floor: "1", row: "1" };
      const previous = { chamber: "B", floor: "2", row: "4" };
      const pass = makeIncomingPass(incomingId, "Potato", [
        {
          name: "50kg",
          initialQuantity: 300,
          currentQuantity: 200,
          location: current,
          previousLocation: [previous],
        },
      ]);
      const incomingPassMap = new Map([[incomingId, pass]]);
      const key = allocationMapKey(incomingId, "50kg", current);
      const previouslyIssued = new Map([[key, 20]]);
      const requested = new Map([[key, 50]]);
      const ops = prepareNetDeltaBulkOperationsForUpdate(
        previouslyIssued,
        requested,
        incomingPassMap,
      );
      expect(ops).toHaveLength(1);
      const op = ops[0] as {
        updateOne: {
          filter: Record<string, unknown>;
        };
      };
      expect(op.updateOne.filter).toEqual(
        expect.objectContaining({
          "bagSizes.0.location.chamber": "A",
          "bagSizes.0.location.floor": "1",
          "bagSizes.0.location.row": "1",
        }),
      );
    });

    it("draws a request across duplicate rows at the same location", () => {
      const rack = { chamber: "3", floor: "1", row: "43" };
      const pass = makeIncomingPass(incomingId, "K. Pukhraj", [
        {
          name: "Cut-tok",
          initialQuantity: 74,
          currentQuantity: 74,
          location: rack,
        },
        {
          name: "Cut-tok",
          initialQuantity: 107,
          currentQuantity: 107,
          location: rack,
        },
        {
          name: "Cut-tok",
          initialQuantity: 84,
          currentQuantity: 84,
          location: rack,
        },
      ]);
      const key = allocationMapKey(incomingId, "Cut-tok", rack);
      const ops = prepareNetDeltaBulkOperationsForUpdate(
        new Map(),
        new Map([[key, 265]]),
        new Map([[incomingId, pass]]),
      );

      expect(ops).toHaveLength(1);
      const op = ops[0] as {
        updateOne: { update: { $inc: Record<string, number> } };
      };
      expect(op.updateOne.update.$inc).toEqual({
        "bagSizes.0.currentQuantity": -74,
        "bagSizes.1.currentQuantity": -107,
        "bagSizes.2.currentQuantity": -84,
      });
    });

    it("continues into the next row when the first row is smaller than the request", () => {
      const rack = { chamber: "3", floor: "1", row: "43" };
      const pass = makeIncomingPass(incomingId, "K. Pukhraj", [
        {
          name: "Cut-tok",
          initialQuantity: 74,
          currentQuantity: 74,
          location: rack,
        },
        {
          name: "Cut-tok",
          initialQuantity: 107,
          currentQuantity: 107,
          location: rack,
        },
      ]);
      const key = allocationMapKey(incomingId, "Cut-tok", rack);
      const ops = prepareNetDeltaBulkOperationsForUpdate(
        new Map(),
        new Map([[key, 107]]),
        new Map([[incomingId, pass]]),
      );
      const op = ops[0] as {
        updateOne: { update: { $inc: Record<string, number> } };
      };
      expect(op.updateOne.update.$inc).toEqual({
        "bagSizes.0.currentQuantity": -74,
        "bagSizes.1.currentQuantity": -33,
      });
    });

    it("rejects when the pooled rows are still short", () => {
      const rack = { chamber: "3", floor: "1", row: "43" };
      const pass = makeIncomingPass(incomingId, "K. Pukhraj", [
        {
          name: "Cut-tok",
          initialQuantity: 74,
          currentQuantity: 74,
          location: rack,
        },
        {
          name: "Cut-tok",
          initialQuantity: 107,
          currentQuantity: 107,
          location: rack,
        },
      ]);
      const key = allocationMapKey(incomingId, "Cut-tok", rack);
      expect(() =>
        prepareNetDeltaBulkOperationsForUpdate(
          new Map(),
          new Map([[key, 300]]),
          new Map([[incomingId, pass]]),
        ),
      ).toThrow(ValidationError);
    });
  });

  describe("buildIncomingGatePassSnapshots", () => {
    it("records one pooled line when several rows share a size and location", () => {
      const rack = { chamber: "3", floor: "1", row: "43" };
      const pass = makeIncomingPass(incomingId, "K. Pukhraj", [
        {
          name: "Cut-tok",
          initialQuantity: 74,
          currentQuantity: 74,
          location: rack,
        },
        {
          name: "Cut-tok",
          initialQuantity: 107,
          currentQuantity: 107,
          location: rack,
        },
        {
          name: "Cut-tok",
          initialQuantity: 84,
          currentQuantity: 84,
          location: rack,
        },
      ]);
      const snapshots = buildIncomingGatePassSnapshots(
        [
          {
            incomingGatePassId: incomingId,
            variety: "K. Pukhraj",
            allocations: [
              {
                incomingGatePassId: incomingId,
                size: "Cut-tok",
                quantityToAllocate: 74,
                location: rack,
              },
              {
                incomingGatePassId: incomingId,
                size: "Cut-tok",
                quantityToAllocate: 107,
                location: rack,
              },
              {
                incomingGatePassId: incomingId,
                size: "Cut-tok",
                quantityToAllocate: 84,
                location: rack,
              },
            ],
          },
        ],
        new Map([[incomingId, pass]]),
      );

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].bagSizes).toEqual([
        expect.objectContaining({
          name: "Cut-tok",
          quantityIssued: 265,
          currentQuantity: 0,
          initialQuantity: 265,
          location: rack,
        }),
      ]);
    });
  });
});
