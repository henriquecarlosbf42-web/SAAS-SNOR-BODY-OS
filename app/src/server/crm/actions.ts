"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/rbac";
import { getCurrentTenant } from "@/lib/auth/session";
import {
  createCustomerSchema,
  createVehicleSchema,
  recordIdSchema,
  updateCustomerSchema,
  updateVehicleSchema,
} from "@/lib/domains/crm";
import {
  archiveCustomer as archiveCustomerRecord,
  archiveVehicle as archiveVehicleRecord,
  createCustomer as createCustomerRecord,
  createVehicle as createVehicleRecord,
  updateCustomer as updateCustomerRecord,
  updateVehicle as updateVehicleRecord,
} from "./data";

export type CrmActionResult = { error: string } | { success: true };

async function writePermissionError(): Promise<CrmActionResult | null> {
  try {
    await requirePermission("crm:write");
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: "You don't have permission to change CRM records." };
    }
    throw error;
  }
}

function formValue(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

function validationError(error: z.ZodError): CrmActionResult {
  return { error: error.issues[0]?.message ?? "Check the information and try again." };
}

function mutationError(): CrmActionResult {
  return { error: "We couldn't save this record. Check the details and try again." };
}

function recordNotFound(): CrmActionResult {
  return { error: "This record could not be found or is no longer available." };
}

export async function createCustomer(formData: FormData): Promise<CrmActionResult> {
  const denied = await writePermissionError();
  if (denied) return denied;

  const parsed = createCustomerSchema.safeParse({
    name: formValue(formData, "name"),
    email: formValue(formData, "email"),
    phone: formValue(formData, "phone"),
    notes: formValue(formData, "notes"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const tenant = await getCurrentTenant();
  const result = await createCustomerRecord(tenant.id, parsed.data);
  if (!result.ok) return mutationError();

  revalidatePath("/customers");
  return { success: true };
}

export async function updateCustomer(formData: FormData): Promise<CrmActionResult> {
  const denied = await writePermissionError();
  if (denied) return denied;

  const parsed = updateCustomerSchema.safeParse({
    id: formValue(formData, "id"),
    name: formValue(formData, "name"),
    email: formValue(formData, "email"),
    phone: formValue(formData, "phone"),
    notes: formValue(formData, "notes"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const tenant = await getCurrentTenant();
  const { id, ...values } = parsed.data;
  const result = await updateCustomerRecord(tenant.id, id, values);
  if (!result.ok) return result.code === "NOT_FOUND" ? recordNotFound() : mutationError();

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: true };
}

export async function archiveCustomer(formData: FormData): Promise<CrmActionResult> {
  const denied = await writePermissionError();
  if (denied) return denied;

  const parsed = recordIdSchema.safeParse(formValue(formData, "id"));
  if (!parsed.success) return recordNotFound();

  const tenant = await getCurrentTenant();
  const result = await archiveCustomerRecord(tenant.id, parsed.data);
  if (!result.ok) return result.code === "NOT_FOUND" ? recordNotFound() : mutationError();

  revalidatePath("/customers");
  revalidatePath("/vehicles");
  revalidatePath(`/customers/${parsed.data}`);
  return { success: true };
}

export async function createVehicle(formData: FormData): Promise<CrmActionResult> {
  const denied = await writePermissionError();
  if (denied) return denied;

  const parsed = createVehicleSchema.safeParse({
    customerId: formValue(formData, "customerId"),
    make: formValue(formData, "make"),
    model: formValue(formData, "model"),
    year: formValue(formData, "year"),
    color: formValue(formData, "color"),
    vin: formValue(formData, "vin"),
    plate: formValue(formData, "plate"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const tenant = await getCurrentTenant();
  const { customerId, ...values } = parsed.data;
  const result = await createVehicleRecord(tenant.id, {
    customer_id: customerId,
    ...values,
  });
  if (!result.ok) return mutationError();

  revalidatePath("/vehicles");
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

export async function updateVehicle(formData: FormData): Promise<CrmActionResult> {
  const denied = await writePermissionError();
  if (denied) return denied;

  const parsed = updateVehicleSchema.safeParse({
    id: formValue(formData, "id"),
    customerId: formValue(formData, "customerId"),
    make: formValue(formData, "make"),
    model: formValue(formData, "model"),
    year: formValue(formData, "year"),
    color: formValue(formData, "color"),
    vin: formValue(formData, "vin"),
    plate: formValue(formData, "plate"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const tenant = await getCurrentTenant();
  const { id, customerId, ...values } = parsed.data;
  const result = await updateVehicleRecord(tenant.id, id, {
    customer_id: customerId,
    ...values,
  });
  if (!result.ok) return result.code === "NOT_FOUND" ? recordNotFound() : mutationError();

  revalidatePath("/vehicles");
  revalidatePath(`/vehicles/${id}`);
  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

export async function archiveVehicle(formData: FormData): Promise<CrmActionResult> {
  const denied = await writePermissionError();
  if (denied) return denied;

  const parsed = recordIdSchema.safeParse(formValue(formData, "id"));
  if (!parsed.success) return recordNotFound();

  const tenant = await getCurrentTenant();
  const result = await archiveVehicleRecord(tenant.id, parsed.data);
  if (!result.ok) return result.code === "NOT_FOUND" ? recordNotFound() : mutationError();

  revalidatePath("/vehicles");
  revalidatePath("/customers");
  return { success: true };
}
