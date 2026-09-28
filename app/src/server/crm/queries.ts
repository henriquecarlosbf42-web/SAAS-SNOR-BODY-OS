import "server-only";
import { notFound } from "next/navigation";
import { ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/rbac";
import { getCurrentTenant } from "@/lib/auth/session";
import type { Customer, CustomerOption, Vehicle } from "@/lib/domains/crm";
import {
  getCustomer,
  getVehicle,
  listCustomerOptions,
  listCustomerVehicles,
  listCustomers,
  listVehicles,
} from "./data";

async function currentCrmTenant() {
  try {
    await requirePermission("crm:read");
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return getCurrentTenant();
}

export async function getCustomers(): Promise<Customer[]> {
  const tenant = await currentCrmTenant();
  return listCustomers(tenant.id);
}

export async function getCustomerDetails(
  customerId: string,
): Promise<{ customer: Customer; vehicles: Vehicle[] } | null> {
  const tenant = await currentCrmTenant();
  const customer = await getCustomer(tenant.id, customerId);
  if (!customer) return null;

  const vehicles = await listCustomerVehicles(tenant.id, customerId);
  return { customer, vehicles };
}

export async function getVehicles(): Promise<Vehicle[]> {
  const tenant = await currentCrmTenant();
  return listVehicles(tenant.id);
}

export async function getVehicleDetails(vehicleId: string): Promise<Vehicle | null> {
  const tenant = await currentCrmTenant();
  return getVehicle(tenant.id, vehicleId);
}

export async function getVehicleCustomerOptions(): Promise<CustomerOption[]> {
  const tenant = await currentCrmTenant();
  return listCustomerOptions(tenant.id);
}
