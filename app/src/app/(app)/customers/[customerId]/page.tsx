import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveButton } from "@/features/crm/components/archive-button";
import { CustomerForm } from "@/features/crm/components/customer-form";
import { getCustomerDetails } from "@/server/crm/queries";

export default async function CustomerDetailsPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const result = await getCustomerDetails(customerId);
  if (!result) notFound();

  const { customer, vehicles } = result;

  return (
    <section className="mx-auto max-w-6xl">
      <Link href="/customers" className="text-sm text-blue-700 underline dark:text-blue-400">
        Back to customers
      </Link>
      <div className="mb-8 mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-black/55 dark:text-white/55">CRM / Customer</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{customer.name}</h1>
        </div>
        <ArchiveButton id={customer.id} recordType="customer" />
      </div>

      <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <h2 className="mb-5 text-lg font-semibold">Contact details</h2>
          <CustomerForm customer={customer} />
        </div>

        <div>
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Vehicles</h2>
            <Link
              href={`/vehicles/new?customerId=${customer.id}`}
              className="text-sm text-blue-700 underline underline-offset-4 dark:text-blue-400"
            >
              Add vehicle
            </Link>
          </div>
          {vehicles.length === 0 ? (
            <p className="rounded-xl border border-black/10 p-5 text-sm text-black/60 dark:border-white/10 dark:text-white/60">
              No active vehicles linked to this customer.
            </p>
          ) : (
            <ul className="divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
              {vehicles.map((vehicle) => (
                <li key={vehicle.id} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <Link
                      href={`/vehicles/${vehicle.id}`}
                      className="font-medium text-blue-700 underline underline-offset-4 dark:text-blue-400"
                    >
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </Link>
                    <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                      {[vehicle.color, vehicle.plate].filter(Boolean).join(" · ") || "No extra details"}
                    </p>
                  </div>
                  <ArchiveButton id={vehicle.id} recordType="vehicle" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
