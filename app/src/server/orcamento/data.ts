import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Quote, QuoteItem, QuoteStatus } from "@/lib/domains/orcamento";

type MutationResult = { ok: true; id: string } | { ok: false; code: string };

function reportDatabaseError(operation: string, code: string): void {
  console.error(`[orcamento] ${operation} failed`, { code });
}

function mutationFailure(operation: string, code: string): MutationResult {
  reportDatabaseError(operation, code);
  return { ok: false, code };
}

const QUOTE_SELECT =
  "id, customer_id, vehicle_id, status, service_category, damage_description, estimated_price, estimated_days, shop_notes, quote_expires_at, created_at";

type QuoteRow = {
  id: string;
  customer_id: string;
  vehicle_id: string;
  status: QuoteStatus;
  service_category: string;
  damage_description: string;
  estimated_price: number | null;
  estimated_days: number | null;
  shop_notes: string | null;
  quote_expires_at: string | null;
  created_at: string;
};

function toQuote(
  row: QuoteRow,
  customerName: string,
  vehicleLabel: string,
): Quote {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName,
    vehicleId: row.vehicle_id,
    vehicleLabel,
    status: row.status,
    serviceCategory: row.service_category,
    damageDescription: row.damage_description,
    estimatedPrice: row.estimated_price,
    estimatedDays: row.estimated_days,
    shopNotes: row.shop_notes,
    quoteExpiresAt: row.quote_expires_at,
    createdAt: row.created_at,
  };
}

function vehicleLabelOf(vehicle: { year: number; make: string; model: string }): string {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
}

export async function listQuotes(tenantId: string): Promise<Quote[]> {
  const supabase = await createServerSupabaseClient();
  const [quoteResult, customerResult, vehicleResult] = await Promise.all([
    supabase
      .from("quotes")
      .select(QUOTE_SELECT)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase.from("customers").select("id, name").eq("tenant_id", tenantId),
    supabase
      .from("vehicles")
      .select("id, make, model, year")
      .eq("tenant_id", tenantId),
  ]);

  if (quoteResult.error) {
    reportDatabaseError("list quotes", quoteResult.error.code);
    throw new Error("Could not load quotes.");
  }
  if (customerResult.error || vehicleResult.error) {
    reportDatabaseError("load quote references", customerResult.error?.code ?? vehicleResult.error?.code ?? "");
    throw new Error("Could not load quotes.");
  }
  if (!quoteResult.data || !customerResult.data || !vehicleResult.data) {
    throw new Error("Could not load quotes.");
  }

  const customerNames = new Map(customerResult.data.map((customer) => [customer.id, customer.name]));
  const vehicleLabels = new Map(
    vehicleResult.data.map((vehicle) => [vehicle.id, vehicleLabelOf(vehicle)]),
  );

  return quoteResult.data.flatMap((row) => {
    const customerName = customerNames.get(row.customer_id);
    const vehicleLabel = vehicleLabels.get(row.vehicle_id);
    if (!customerName || !vehicleLabel) return [];
    return [toQuote(row, customerName, vehicleLabel)];
  });
}

export async function getQuote(tenantId: string, quoteId: string): Promise<Quote | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("quotes")
    .select(QUOTE_SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", quoteId)
    .maybeSingle();

  if (error) {
    reportDatabaseError("get quote", error.code);
    throw new Error("Could not load this quote.");
  }
  if (!data) return null;

  const [customerResult, vehicleResult] = await Promise.all([
    supabase
      .from("customers")
      .select("name")
      .eq("tenant_id", tenantId)
      .eq("id", data.customer_id)
      .maybeSingle(),
    supabase
      .from("vehicles")
      .select("make, model, year")
      .eq("tenant_id", tenantId)
      .eq("id", data.vehicle_id)
      .maybeSingle(),
  ]);

  if (!customerResult.data || !vehicleResult.data) return null;

  return toQuote(data, customerResult.data.name, vehicleLabelOf(vehicleResult.data));
}

export async function listQuoteItems(tenantId: string, quoteId: string): Promise<QuoteItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("quote_items")
    .select("id, quote_id, description, quantity, unit_price, total_price")
    .eq("tenant_id", tenantId)
    .eq("quote_id", quoteId)
    .order("id");

  if (error) {
    reportDatabaseError("list quote items", error.code);
    throw new Error("Could not load quote items.");
  }
  if (!data) {
    throw new Error("Could not load quote items.");
  }

  return data.map((item) => ({
    id: item.id,
    quoteId: item.quote_id,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    totalPrice: item.total_price,
  }));
}

export async function createQuote(
  tenantId: string,
  values: {
    customer_id: string;
    vehicle_id: string;
    service_category: string;
    damage_description: string;
    estimated_price: number | null;
    estimated_days: number | null;
    shop_notes: string | null;
  },
): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("quotes")
    .insert({ tenant_id: tenantId, ...values })
    .select("id")
    .single();

  if (error) return mutationFailure("create quote", error.code);
  if (!data) return mutationFailure("create quote", "NO_ROW_RETURNED");
  return { ok: true, id: data.id };
}

export async function updateQuote(
  tenantId: string,
  quoteId: string,
  values: {
    customer_id: string;
    vehicle_id: string;
    service_category: string;
    damage_description: string;
    estimated_price: number | null;
    estimated_days: number | null;
    shop_notes: string | null;
  },
): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("quotes")
    .update(values)
    .eq("tenant_id", tenantId)
    .eq("id", quoteId)
    .select("id")
    .maybeSingle();

  if (error) return mutationFailure("update quote", error.code);
  if (!data) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, id: data.id };
}

export async function updateQuoteStatus(
  tenantId: string,
  quoteId: string,
  status: QuoteStatus,
): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("quotes")
    .update({ status })
    .eq("tenant_id", tenantId)
    .eq("id", quoteId)
    .select("id")
    .maybeSingle();

  if (error) return mutationFailure("update quote status", error.code);
  if (!data) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, id: data.id };
}

export async function createQuoteItem(
  tenantId: string,
  values: {
    quote_id: string;
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  },
): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("quote_items")
    .insert({ tenant_id: tenantId, ...values })
    .select("id")
    .single();

  if (error) return mutationFailure("create quote item", error.code);
  if (!data) return mutationFailure("create quote item", "NO_ROW_RETURNED");
  return { ok: true, id: data.id };
}

export async function getQuoteItem(
  tenantId: string,
  itemId: string,
): Promise<{ id: string; quoteId: string } | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("quote_items")
    .select("id, quote_id")
    .eq("tenant_id", tenantId)
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    reportDatabaseError("get quote item", error.code);
    return null;
  }
  if (!data) return null;
  return { id: data.id, quoteId: data.quote_id };
}

export async function deleteQuoteItem(
  tenantId: string,
  itemId: string,
): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("quote_items")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", itemId)
    .select("id")
    .maybeSingle();

  if (error) return mutationFailure("delete quote item", error.code);
  if (!data) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, id: data.id };
}
