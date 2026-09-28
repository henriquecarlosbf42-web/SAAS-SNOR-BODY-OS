import Link from "next/link";
import { getQuotes } from "@/server/orcamento/queries";

function currency(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
  IN_REVIEW: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  QUOTED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  APPROVED: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  EXPIRED: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  CANCELLED: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export default async function QuotesPage() {
  const quotes = await getQuotes();

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-black/55 dark:text-white/55">Orçamento</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Quotes</h1>
          <p className="mt-2 text-sm text-black/65 dark:text-white/65">
            Repair quotes for customer vehicles.
          </p>
        </div>
        <Link
          href="/quotes/new"
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white"
        >
          New quote
        </Link>
      </div>

      {quotes.length === 0 ? (
        <div className="rounded-xl border border-black/10 p-8 dark:border-white/10">
          <h2 className="font-medium">No quotes yet</h2>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            Create a quote for a customer&apos;s vehicle to start the repair workflow.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/55 dark:bg-white/[0.04] dark:text-white/55">
              <tr>
                <th className="px-5 py-3 font-medium">Customer / Vehicle</th>
                <th className="px-5 py-3 font-medium">Service</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Estimated price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {quotes.map((quote) => (
                <tr key={quote.id}>
                  <td className="px-5 py-4">
                    <Link
                      href={`/quotes/${quote.id}`}
                      className="font-medium text-blue-700 underline underline-offset-4 dark:text-blue-400"
                    >
                      {quote.customerName}
                    </Link>
                    <p className="mt-1 text-black/60 dark:text-white/60">{quote.vehicleLabel}</p>
                  </td>
                  <td className="px-5 py-4">{quote.serviceCategory}</td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[quote.status]}`}
                    >
                      {quote.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">{currency(quote.estimatedPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
