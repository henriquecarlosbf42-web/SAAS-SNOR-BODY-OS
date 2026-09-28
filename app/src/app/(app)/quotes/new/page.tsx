import Link from "next/link";
import { QuoteForm } from "@/features/orcamento/components/quote-form";
import { getVehicles } from "@/server/crm/queries";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string }>;
}) {
  const [{ vehicleId }, vehicles] = await Promise.all([searchParams, getVehicles()]);

  return (
    <section className="mx-auto max-w-6xl">
      <Link href="/quotes" className="text-sm text-blue-700 underline dark:text-blue-400">
        Back to quotes
      </Link>
      {vehicles.length === 0 ? (
        <div className="mt-6 rounded-xl border border-black/10 p-8 dark:border-white/10">
          <h1 className="text-2xl font-semibold">Add a vehicle first</h1>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            Every quote must be linked to a customer&apos;s vehicle.
          </p>
          <Link
            href="/vehicles/new"
            className="mt-5 inline-block rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white"
          >
            Add vehicle
          </Link>
        </div>
      ) : (
        <>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">New quote</h1>
          <p className="mb-8 mt-2 text-sm text-black/65 dark:text-white/65">
            Describe the damage and give an initial estimate.
          </p>
          <QuoteForm vehicles={vehicles} selectedVehicleId={vehicleId} />
        </>
      )}
    </section>
  );
}
