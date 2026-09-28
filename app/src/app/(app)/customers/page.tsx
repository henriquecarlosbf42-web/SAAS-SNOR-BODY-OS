import Link from "next/link";
import { getCustomers } from "@/server/crm/queries";

export default async function CustomersPage() {
  const customers = await getCustomers();

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-black/55 dark:text-white/55">CRM</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-2 text-sm text-black/65 dark:text-white/65">
            Customer records and contact history for your shop.
          </p>
        </div>
        <Link
          href="/customers/new"
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white"
        >
          Add customer
        </Link>
      </div>

      {customers.length === 0 ? (
        <div className="rounded-xl border border-black/10 p-8 dark:border-white/10">
          <h2 className="font-medium">No customers yet</h2>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            Add your first customer to start building your shop&apos;s CRM.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/55 dark:bg-white/[0.04] dark:text-white/55">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td className="px-5 py-4 font-medium">{customer.name}</td>
                  <td className="px-5 py-4 text-black/65 dark:text-white/65">
                    {customer.email ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-black/65 dark:text-white/65">
                    {customer.phone ?? "—"}
                  </td>
                  <td className="px-5 py-4">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="text-blue-700 underline underline-offset-4 dark:text-blue-400"
                    >
                      View
                    </Link>
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
