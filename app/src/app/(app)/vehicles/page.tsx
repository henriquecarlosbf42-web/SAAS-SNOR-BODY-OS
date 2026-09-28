import Link from "next/link";
import { ArchiveButton } from "@/features/crm/components/archive-button";
import { getVehicles } from "@/server/crm/queries";

export default async function VehiclesPage() {
  const vehicles = await getVehicles();

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-black/55 dark:text-white/55">CRM</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Vehicles</h1>
          <p className="mt-2 text-sm text-black/65 dark:text-white/65">
            Vehicles registered to active customers.
          </p>
        </div>
        <Link
          href="/vehicles/new"
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white"
        >
          Add vehicle
        </Link>
      </div>

      {vehicles.length === 0 ? (
        <div className="rounded-xl border border-black/10 p-8 dark:border-white/10">
          <h2 className="font-medium">No vehicles yet</h2>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            Register a vehicle and link it to one of your customers.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/55 dark:bg-white/[0.04] dark:text-white/55">
              <tr>
                <th className="px-5 py-3 font-medium">Vehicle</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Plate</th>
                <th className="px-5 py-3 font-medium">VIN</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {vehicles.map((vehicle) => (
                <tr key={vehicle.id}>
                  <td className="px-5 py-4 font-medium">
                    <Link
                      href={`/vehicles/${vehicle.id}`}
                      className="text-blue-700 underline underline-offset-4 dark:text-blue-400"
                    >
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <Link
                      href={`/customers/${vehicle.customerId}`}
                      className="text-blue-700 underline underline-offset-4 dark:text-blue-400"
                    >
                      {vehicle.customerName}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-black/65 dark:text-white/65">
                    {vehicle.plate ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-black/65 dark:text-white/65">
                    {vehicle.vin ?? "—"}
                  </td>
                  <td className="px-5 py-4">
                    <ArchiveButton id={vehicle.id} recordType="vehicle" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
