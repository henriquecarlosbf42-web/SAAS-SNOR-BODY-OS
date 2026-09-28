import Link from "next/link";
import { notFound } from "next/navigation";
import { VehicleForm } from "@/features/crm/components/vehicle-form";
import { getVehicleCustomerOptions } from "@/server/crm/queries";

export default async function NewVehiclePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const [{ customerId }, customers] = await Promise.all([
    searchParams,
    getVehicleCustomerOptions(),
  ]);

  if (customerId && !customers.some((customer) => customer.id === customerId)) {
    notFound();
  }

  return (
    <section className="mx-auto max-w-6xl">
      <Link href="/vehicles" className="text-sm text-blue-700 underline dark:text-blue-400">
        Back to vehicles
      </Link>
      {customers.length === 0 ? (
        <div className="mt-6 rounded-xl border border-black/10 p-8 dark:border-white/10">
          <h1 className="text-2xl font-semibold">Add a customer first</h1>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            Every vehicle must belong to an active customer in your shop.
          </p>
          <Link
            href="/customers/new"
            className="mt-5 inline-block rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white"
          >
            Add customer
          </Link>
        </div>
      ) : (
        <>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">Add vehicle</h1>
          <p className="mb-8 mt-2 text-sm text-black/65 dark:text-white/65">
            Link a vehicle to the customer who owns it.
          </p>
          <VehicleForm customers={customers} selectedCustomerId={customerId} />
        </>
      )}
    </section>
  );
}
