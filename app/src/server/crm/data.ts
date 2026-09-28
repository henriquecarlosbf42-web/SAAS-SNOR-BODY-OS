import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Customer, CustomerOption, Vehicle } from "@/lib/domains/crm";

type MutationResult = { ok: true; id: string } | { ok: false; code: string };

function reportDatabaseError(operation: string, code: string): void {
  console.error(`[crm] ${operation} failed`, { code });
}

function mutationFailure(operation: string, code: string): MutationResult {
  reportDatabaseError(operation, code);
  return { ok: false, code };
}

export async function listCustomers(tenantId: string): Promise<Customer[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, email, phone, locale, notes")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("name");

  if (error) {
    reportDatabaseError("list customers", error.code);
    throw new Error("Could not load CRM customers.");
  }
  if (!data) {
    throw new Error("Could not load CRM customers.");
  }

  return data;
}

export async function getCustomer(
  tenantId: string,
  customerId: string,
): Promise<Customer | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, email, phone, locale, notes")
    .eq("tenant_id", tenantId)
    .eq("id", customerId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    reportDatabaseError("get customer", error.code);
    throw new Error("Could not load this customer.");
  }

  return data;
}

export async function listCustomerOptions(tenantId: string): Promise<CustomerOption[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("name");

  if (error) {
    reportDatabaseError("list customer options", error.code);
    throw new Error("Could not load CRM customers.");
  }
  if (!data) {
    throw new Error("Could not load CRM customers.");
  }

  return data;
}

export async function listVehicles(tenantId: string): Promise<Vehicle[]> {
  const supabase = await createServerSupabaseClient();
  const [vehicleResult, customerResult] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, customer_id, make, model, year, color, vin, plate")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("make")
      .order("model"),
    supabase
      .from("customers")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null),
  ]);

  if (vehicleResult.error) {
    reportDatabaseError("list vehicles", vehicleResult.error.code);
    throw new Error("Could not load CRM vehicles.");
  }
  if (customerResult.error) {
    reportDatabaseError("load vehicle customers", customerResult.error.code);
    throw new Error("Could not load CRM vehicles.");
  }
  if (!vehicleResult.data || !customerResult.data) {
    throw new Error("Could not load CRM vehicles.");
  }

  const customerNames = new Map(customerResult.data.map((customer) => [customer.id, customer.name]));

  return vehicleResult.data.flatMap((vehicle) => {
    const customerName = customerNames.get(vehicle.customer_id);
    if (!customerName) return [];

    return [
      {
        id: vehicle.id,
        customerId: vehicle.customer_id,
        customerName,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        vin: vehicle.vin,
        plate: vehicle.plate,
      },
    ];
  });
}

export async function listCustomerVehicles(
  tenantId: string,
  customerId: string,
): Promise<Vehicle[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, customer_id, make, model, year, color, vin, plate")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("make")
    .order("model");

  if (error) {
    reportDatabaseError("list customer vehicles", error.code);
    throw new Error("Could not load this customer's vehicles.");
  }
  if (!data) {
    throw new Error("Could not load this customer's vehicles.");
  }

  return data.map((vehicle) => ({
    id: vehicle.id,
    customerId: vehicle.customer_id,
    customerName: "",
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    color: vehicle.color,
    vin: vehicle.vin,
    plate: vehicle.plate,
  }));
}

export async function getVehicle(
  tenantId: string,
  vehicleId: string,
): Promise<Vehicle | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, customer_id, make, model, year, color, vin, plate")
    .eq("tenant_id", tenantId)
    .eq("id", vehicleId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    reportDatabaseError("get vehicle", error.code);
    throw new Error("Could not load this vehicle.");
  }
  if (!data) return null;

  const customer = await getCustomer(tenantId, data.customer_id);
  if (!customer) return null;

  return {
    id: data.id,
    customerId: data.customer_id,
    customerName: customer.name,
    make: data.make,
    model: data.model,
    year: data.year,
    color: data.color,
    vin: data.vin,
    plate: data.plate,
  };
}

export async function createCustomer(
  tenantId: string,
  values: { name: string; email: string | null; phone: string | null; notes: string | null },
): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ tenant_id: tenantId, ...values })
    .select("id")
    .single();

  if (error) return mutationFailure("create customer", error.code);
  if (!data) return mutationFailure("create customer", "NO_ROW_RETURNED");
  return { ok: true, id: data.id };
}

export async function updateCustomer(
  tenantId: string,
  customerId: string,
  values: { name: string; email: string | null; phone: string | null; notes: string | null },
): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("customers")
    .update(values)
    .eq("tenant_id", tenantId)
    .eq("id", customerId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) return mutationFailure("update customer", error.code);
  if (!data) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, id: data.id };
}

export async function archiveCustomer(
  tenantId: string,
  customerId: string,
): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("customers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", customerId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) return mutationFailure("archive customer", error.code);
  if (!data) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, id: data.id };
}

export async function createVehicle(
  tenantId: string,
  values: {
    customer_id: string;
    make: string;
    model: string;
    year: number;
    color: string | null;
    vin: string | null;
    plate: string | null;
  },
): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("vehicles")
    .insert({ tenant_id: tenantId, ...values })
    .select("id")
    .single();

  if (error) return mutationFailure("create vehicle", error.code);
  if (!data) return mutationFailure("create vehicle", "NO_ROW_RETURNED");
  return { ok: true, id: data.id };
}

export async function updateVehicle(
  tenantId: string,
  vehicleId: string,
  values: {
    customer_id: string;
    make: string;
    model: string;
    year: number;
    color: string | null;
    vin: string | null;
    plate: string | null;
  },
): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("vehicles")
    .update(values)
    .eq("tenant_id", tenantId)
    .eq("id", vehicleId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) return mutationFailure("update vehicle", error.code);
  if (!data) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, id: data.id };
}

export async function archiveVehicle(
  tenantId: string,
  vehicleId: string,
): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("vehicles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", vehicleId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) return mutationFailure("archive vehicle", error.code);
  if (!data) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, id: data.id };
}
