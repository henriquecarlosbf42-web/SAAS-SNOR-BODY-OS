import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveButton } from "@/features/crm/components/archive-button";
import { VehicleForm } from "@/features/crm/components/vehicle-form";
import { getVehicleCustomerOptions, getVehicleDetails } from "@/server/crm/queries";

export default async function VehicleDetailsPage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;
  const [vehicle, customers] = await Promise.all([
    getVehicleDetails(vehicleId),
    getVehicleCustomerOptions(),
  ]);
  if (!vehicle) notFound();

  return (
    <section className="mx-auto max-w-6xl">
      <Link href="/vehicles" className="text-sm text-blue-700 underline dark:text-blue-400">
        Back to vehicles
      </Link>
      <div className="mb-8 mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-black/55 dark:text-white/55">CRM / Vehicle</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </h1>
        </div>
        <ArchiveButton id={vehicle.id} recordType="vehicle" />
      </div>
      <VehicleForm customers={customers} vehicle={vehicle} />
    </section>
  );
}
