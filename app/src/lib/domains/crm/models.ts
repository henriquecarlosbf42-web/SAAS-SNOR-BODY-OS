import { z } from "zod";

const nullableText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(maxLength).nullable(),
  );

const nullableEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.union([z.string().trim().email().max(320), z.null()]),
);

export const customerFieldsSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required").max(200),
  email: nullableEmail,
  phone: nullableText(40),
  notes: nullableText(5000),
});

export const createCustomerSchema = customerFieldsSchema;
export const updateCustomerSchema = customerFieldsSchema.extend({
  id: z.string().uuid("Invalid customer"),
});

export const vehicleFieldsSchema = z.object({
  customerId: z.string().uuid("Select a valid customer"),
  make: z.string().trim().min(1, "Make is required").max(120),
  model: z.string().trim().min(1, "Model is required").max(120),
  year: z.coerce.number().int().min(1886).max(2100),
  color: nullableText(80),
  vin: nullableText(32).transform((value) => value?.toUpperCase() ?? null),
  plate: nullableText(20).transform((value) => value?.toUpperCase() ?? null),
});

export const createVehicleSchema = vehicleFieldsSchema;
export const updateVehicleSchema = vehicleFieldsSchema.extend({
  id: z.string().uuid("Invalid vehicle"),
});

export const recordIdSchema = z.string().uuid();

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  locale: string;
  notes: string | null;
}

export interface CustomerOption {
  id: string;
  name: string;
}

export interface Vehicle {
  id: string;
  customerId: string;
  customerName: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  vin: string | null;
  plate: string | null;
}
