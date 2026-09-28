import { z } from "zod";

const nullableText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(maxLength).nullable(),
  );

export const QUOTE_STATUSES = [
  "PENDING",
  "IN_REVIEW",
  "QUOTED",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/**
 * Transições permitidas de status — espelha ARCHITECTURE.md seção 13
 * (`PENDING → IN_REVIEW → QUOTED → APPROVED/REJECTED/EXPIRED/CANCELLED`).
 * Nenhum estado terminal (APPROVED/REJECTED/EXPIRED/CANCELLED) permite
 * saída — orçamento fechado nunca reabre; um novo orçamento é criado.
 */
const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  PENDING: ["IN_REVIEW", "CANCELLED"],
  IN_REVIEW: ["QUOTED", "CANCELLED"],
  QUOTED: ["APPROVED", "REJECTED", "EXPIRED", "CANCELLED"],
  APPROVED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export function canTransitionQuoteStatus(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].includes(to);
}

/** Um orçamento em estado terminal nunca reabre (ver comentário acima). */
export function isQuoteEditable(status: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[status].length > 0;
}

export const quoteFieldsSchema = z.object({
  customerId: z.string().uuid("Select a valid customer"),
  vehicleId: z.string().uuid("Select a valid vehicle"),
  serviceCategory: z.string().trim().min(1, "Service category is required").max(120),
  damageDescription: z.string().trim().min(1, "Damage description is required").max(5000),
  estimatedPrice: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.coerce.number().min(0).nullable(),
  ),
  estimatedDays: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.coerce.number().int().min(0).nullable(),
  ),
  shopNotes: nullableText(5000),
});

export const createQuoteSchema = quoteFieldsSchema;
export const updateQuoteSchema = quoteFieldsSchema.extend({
  id: z.string().uuid("Invalid quote"),
});

export const changeQuoteStatusSchema = z.object({
  id: z.string().uuid("Invalid quote"),
  status: z.enum(QUOTE_STATUSES),
});

export const quoteItemFieldsSchema = z.object({
  quoteId: z.string().uuid("Invalid quote"),
  description: z.string().trim().min(1, "Description is required").max(500),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0),
});

export const createQuoteItemSchema = quoteItemFieldsSchema;

export const recordIdSchema = z.string().uuid();

export interface Quote {
  id: string;
  customerId: string;
  customerName: string;
  vehicleId: string;
  vehicleLabel: string;
  status: QuoteStatus;
  serviceCategory: string;
  damageDescription: string;
  estimatedPrice: number | null;
  estimatedDays: number | null;
  shopNotes: string | null;
  quoteExpiresAt: string | null;
  createdAt: string;
}

export interface QuoteItem {
  id: string;
  quoteId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}
