import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteForm } from "@/features/orcamento/components/quote-form";
import { QuoteItemsPanel } from "@/features/orcamento/components/quote-items-panel";
import { QuoteStatusForm } from "@/features/orcamento/components/quote-status-form";
import { isQuoteEditable } from "@/lib/domains/orcamento";
import { getVehicles } from "@/server/crm/queries";
import { getQuoteDetails } from "@/server/orcamento/queries";

export default async function QuoteDetailsPage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  const [result, vehicles] = await Promise.all([getQuoteDetails(quoteId), getVehicles()]);
  if (!result) notFound();

  const { quote, items } = result;

  return (
    <section className="mx-auto max-w-6xl">
      <Link href="/quotes" className="text-sm text-blue-700 underline dark:text-blue-400">
        Back to quotes
      </Link>
      <div className="mb-8 mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-black/55 dark:text-white/55">Orçamento / Quote</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {quote.customerName} — {quote.vehicleLabel}
          </h1>
        </div>
        <QuoteStatusForm id={quote.id} status={quote.status} />
      </div>

      <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <h2 className="mb-5 text-lg font-semibold">Quote details</h2>
          <QuoteForm vehicles={vehicles} quote={quote} />
        </div>

        <div>
          <h2 className="mb-5 text-lg font-semibold">Line items</h2>
          <QuoteItemsPanel quoteId={quote.id} items={items} editable={isQuoteEditable(quote.status)} />
        </div>
      </div>
    </section>
  );
}
