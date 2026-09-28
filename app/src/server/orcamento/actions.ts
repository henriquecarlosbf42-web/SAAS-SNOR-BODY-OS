"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/rbac";
import { getCurrentTenant } from "@/lib/auth/session";
import {
  canTransitionQuoteStatus,
  changeQuoteStatusSchema,
  createQuoteItemSchema,
  createQuoteSchema,
  isQuoteEditable,
  recordIdSchema,
  updateQuoteSchema,
  type QuoteStatus,
} from "@/lib/domains/orcamento";
import {
  createQuote as createQuoteRecord,
  createQuoteItem as createQuoteItemRecord,
  deleteQuoteItem as deleteQuoteItemRecord,
  getQuote,
  getQuoteItem,
  updateQuote as updateQuoteRecord,
  updateQuoteStatus as updateQuoteStatusRecord,
} from "./data";

export type OrcamentoActionResult = { error: string } | { success: true };

async function writePermissionError(): Promise<OrcamentoActionResult | null> {
  try {
    await requirePermission("orcamento:write");
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: "You don't have permission to change quotes." };
    }
    throw error;
  }
}

function formValue(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

function validationError(error: z.ZodError): OrcamentoActionResult {
  return { error: error.issues[0]?.message ?? "Check the information and try again." };
}

function mutationError(): OrcamentoActionResult {
  return { error: "We couldn't save this record. Check the details and try again." };
}

function recordNotFound(): OrcamentoActionResult {
  return { error: "This record could not be found or is no longer available." };
}

export async function createQuote(formData: FormData): Promise<OrcamentoActionResult> {
  const denied = await writePermissionError();
  if (denied) return denied;

  const parsed = createQuoteSchema.safeParse({
    customerId: formValue(formData, "customerId"),
    vehicleId: formValue(formData, "vehicleId"),
    serviceCategory: formValue(formData, "serviceCategory"),
    damageDescription: formValue(formData, "damageDescription"),
    estimatedPrice: formValue(formData, "estimatedPrice"),
    estimatedDays: formValue(formData, "estimatedDays"),
    shopNotes: formValue(formData, "shopNotes"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const tenant = await getCurrentTenant();
  const { customerId, vehicleId, serviceCategory, damageDescription, estimatedPrice, estimatedDays, shopNotes } =
    parsed.data;
  const result = await createQuoteRecord(tenant.id, {
    customer_id: customerId,
    vehicle_id: vehicleId,
    service_category: serviceCategory,
    damage_description: damageDescription,
    estimated_price: estimatedPrice,
    estimated_days: estimatedDays,
    shop_notes: shopNotes,
  });
  if (!result.ok) return mutationError();

  revalidatePath("/quotes");
  return { success: true };
}

export async function updateQuote(formData: FormData): Promise<OrcamentoActionResult> {
  const denied = await writePermissionError();
  if (denied) return denied;

  const parsed = updateQuoteSchema.safeParse({
    id: formValue(formData, "id"),
    customerId: formValue(formData, "customerId"),
    vehicleId: formValue(formData, "vehicleId"),
    serviceCategory: formValue(formData, "serviceCategory"),
    damageDescription: formValue(formData, "damageDescription"),
    estimatedPrice: formValue(formData, "estimatedPrice"),
    estimatedDays: formValue(formData, "estimatedDays"),
    shopNotes: formValue(formData, "shopNotes"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const tenant = await getCurrentTenant();
  const { id, customerId, vehicleId, serviceCategory, damageDescription, estimatedPrice, estimatedDays, shopNotes } =
    parsed.data;
  const result = await updateQuoteRecord(tenant.id, id, {
    customer_id: customerId,
    vehicle_id: vehicleId,
    service_category: serviceCategory,
    damage_description: damageDescription,
    estimated_price: estimatedPrice,
    estimated_days: estimatedDays,
    shop_notes: shopNotes,
  });
  if (!result.ok) return result.code === "NOT_FOUND" ? recordNotFound() : mutationError();

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  return { success: true };
}

export async function changeQuoteStatus(formData: FormData): Promise<OrcamentoActionResult> {
  const denied = await writePermissionError();
  if (denied) return denied;

  const parsed = changeQuoteStatusSchema.safeParse({
    id: formValue(formData, "id"),
    status: formValue(formData, "status"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const tenant = await getCurrentTenant();
  const { id, status } = parsed.data;

  const current = await getQuote(tenant.id, id);
  if (!current) return recordNotFound();

  if (!canTransitionQuoteStatus(current.status as QuoteStatus, status)) {
    return { error: `Cannot move a quote from ${current.status} to ${status}.` };
  }

  const result = await updateQuoteStatusRecord(tenant.id, id, status);
  if (!result.ok) return result.code === "NOT_FOUND" ? recordNotFound() : mutationError();

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  return { success: true };
}

export async function createQuoteItem(formData: FormData): Promise<OrcamentoActionResult> {
  const denied = await writePermissionError();
  if (denied) return denied;

  const parsed = createQuoteItemSchema.safeParse({
    quoteId: formValue(formData, "quoteId"),
    description: formValue(formData, "description"),
    quantity: formValue(formData, "quantity"),
    unitPrice: formValue(formData, "unitPrice"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const tenant = await getCurrentTenant();
  const { quoteId, description, quantity, unitPrice } = parsed.data;
  const totalPrice = Math.round(quantity * unitPrice * 100) / 100;

  const quote = await getQuote(tenant.id, quoteId);
  if (!quote) return recordNotFound();
  if (!isQuoteEditable(quote.status as QuoteStatus)) {
    return { error: "This quote is closed and its items can no longer be changed." };
  }

  const result = await createQuoteItemRecord(tenant.id, {
    quote_id: quoteId,
    description,
    quantity,
    unit_price: unitPrice,
    total_price: totalPrice,
  });
  if (!result.ok) return mutationError();

  revalidatePath(`/quotes/${quoteId}`);
  return { success: true };
}

export async function deleteQuoteItem(formData: FormData): Promise<OrcamentoActionResult> {
  const denied = await writePermissionError();
  if (denied) return denied;

  const parsed = recordIdSchema.safeParse(formValue(formData, "id"));
  if (!parsed.success) return recordNotFound();

  const tenant = await getCurrentTenant();
  const item = await getQuoteItem(tenant.id, parsed.data);
  if (!item) return recordNotFound();

  const quote = await getQuote(tenant.id, item.quoteId);
  if (!quote) return recordNotFound();
  if (!isQuoteEditable(quote.status as QuoteStatus)) {
    return { error: "This quote is closed and its items can no longer be changed." };
  }

  const result = await deleteQuoteItemRecord(tenant.id, parsed.data);
  if (!result.ok) return result.code === "NOT_FOUND" ? recordNotFound() : mutationError();

  revalidatePath(`/quotes/${item.quoteId}`);
  return { success: true };
}
