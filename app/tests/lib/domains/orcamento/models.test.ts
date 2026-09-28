import { describe, expect, it } from "vitest";
import {
  canTransitionQuoteStatus,
  changeQuoteStatusSchema,
  createQuoteItemSchema,
  createQuoteSchema,
} from "@/lib/domains/orcamento";

describe("Quote input validation", () => {
  it("trims quote fields and normalizes blank optional numbers", () => {
    const result = createQuoteSchema.safeParse({
      customerId: "d2719c4a-60fc-41f8-91b0-71bf92d379fb",
      vehicleId: "9f1c1b3e-3b3b-4b3b-8b3b-3b3b3b3b3b3b",
      serviceCategory: "  Collision repair  ",
      damageDescription: "  Front bumper dented  ",
      estimatedPrice: "",
      estimatedDays: "",
      shopNotes: "  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        customerId: "d2719c4a-60fc-41f8-91b0-71bf92d379fb",
        vehicleId: "9f1c1b3e-3b3b-4b3b-8b3b-3b3b3b3b3b3b",
        serviceCategory: "Collision repair",
        damageDescription: "Front bumper dented",
        estimatedPrice: null,
        estimatedDays: null,
        shopNotes: null,
      });
    }
  });

  it("rejects blank damage description and invalid ids", () => {
    expect(
      createQuoteSchema.safeParse({
        customerId: "not-a-uuid",
        vehicleId: "not-a-uuid",
        serviceCategory: "Paint job",
        damageDescription: " ",
        estimatedPrice: null,
        estimatedDays: null,
        shopNotes: null,
      }).success,
    ).toBe(false);
  });

  it("coerces numeric estimated price and days", () => {
    const result = createQuoteSchema.safeParse({
      customerId: "d2719c4a-60fc-41f8-91b0-71bf92d379fb",
      vehicleId: "9f1c1b3e-3b3b-4b3b-8b3b-3b3b3b3b3b3b",
      serviceCategory: "Paint job",
      damageDescription: "Scratch on the door",
      estimatedPrice: "450.50",
      estimatedDays: "3",
      shopNotes: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estimatedPrice).toBe(450.5);
      expect(result.data.estimatedDays).toBe(3);
    }
  });

  it("validates quote item fields", () => {
    const result = createQuoteItemSchema.safeParse({
      quoteId: "d2719c4a-60fc-41f8-91b0-71bf92d379fb",
      description: "Replace bumper",
      quantity: "2",
      unitPrice: "120.00",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        quoteId: "d2719c4a-60fc-41f8-91b0-71bf92d379fb",
        description: "Replace bumper",
        quantity: 2,
        unitPrice: 120,
      });
    }
  });

  it("rejects quote items with zero or negative quantity/price", () => {
    expect(
      createQuoteItemSchema.safeParse({
        quoteId: "d2719c4a-60fc-41f8-91b0-71bf92d379fb",
        description: "Replace bumper",
        quantity: "0",
        unitPrice: "-1",
      }).success,
    ).toBe(false);
  });

  it("validates status change payload", () => {
    expect(
      changeQuoteStatusSchema.safeParse({
        id: "d2719c4a-60fc-41f8-91b0-71bf92d379fb",
        status: "IN_REVIEW",
      }).success,
    ).toBe(true);

    expect(
      changeQuoteStatusSchema.safeParse({
        id: "d2719c4a-60fc-41f8-91b0-71bf92d379fb",
        status: "NOT_A_STATUS",
      }).success,
    ).toBe(false);
  });
});

describe("Quote status transitions", () => {
  it("allows the documented forward transitions", () => {
    expect(canTransitionQuoteStatus("PENDING", "IN_REVIEW")).toBe(true);
    expect(canTransitionQuoteStatus("IN_REVIEW", "QUOTED")).toBe(true);
    expect(canTransitionQuoteStatus("QUOTED", "APPROVED")).toBe(true);
    expect(canTransitionQuoteStatus("QUOTED", "REJECTED")).toBe(true);
    expect(canTransitionQuoteStatus("QUOTED", "EXPIRED")).toBe(true);
    expect(canTransitionQuoteStatus("PENDING", "CANCELLED")).toBe(true);
  });

  it("rejects skipping states and leaving terminal states", () => {
    expect(canTransitionQuoteStatus("PENDING", "QUOTED")).toBe(false);
    expect(canTransitionQuoteStatus("PENDING", "APPROVED")).toBe(false);
    expect(canTransitionQuoteStatus("APPROVED", "PENDING")).toBe(false);
    expect(canTransitionQuoteStatus("CANCELLED", "PENDING")).toBe(false);
  });
});
