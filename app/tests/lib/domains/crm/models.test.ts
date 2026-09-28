import { describe, expect, it } from "vitest";
import { createCustomerSchema, createVehicleSchema } from "@/lib/domains/crm";

describe("CRM input validation", () => {
  it("trims customer fields and normalizes blank optional fields", () => {
    const result = createCustomerSchema.safeParse({
      name: "  Alex Morgan  ",
      email: " ",
      phone: "  ",
      notes: "  First visit  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: "Alex Morgan",
        email: null,
        phone: null,
        notes: "First visit",
      });
    }
  });

  it("rejects invalid customer email and blank names", () => {
    expect(
      createCustomerSchema.safeParse({
        name: " ",
        email: "not-an-email",
        phone: null,
        notes: null,
      }).success,
    ).toBe(false);
  });

  it("validates vehicle ownership fields and normalizes identifiers", () => {
    const result = createVehicleSchema.safeParse({
      customerId: "d2719c4a-60fc-41f8-91b0-71bf92d379fb",
      make: " Toyota ",
      model: " Camry ",
      year: "2024",
      color: "",
      vin: " 1hgcm82633a004352 ",
      plate: " ab123cd ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        customerId: "d2719c4a-60fc-41f8-91b0-71bf92d379fb",
        make: "Toyota",
        model: "Camry",
        year: 2024,
        color: null,
        vin: "1HGCM82633A004352",
        plate: "AB123CD",
      });
    }
  });

  it("rejects invalid vehicle years and customer ids", () => {
    expect(
      createVehicleSchema.safeParse({
        customerId: "not-a-uuid",
        make: "Toyota",
        model: "Camry",
        year: "1800",
        color: null,
        vin: null,
        plate: null,
      }).success,
    ).toBe(false);
  });
});
