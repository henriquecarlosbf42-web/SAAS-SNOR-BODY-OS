import "server-only";
import { notFound } from "next/navigation";
import { ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/rbac";
import { getCurrentTenant } from "@/lib/auth/session";
import type { Quote, QuoteItem } from "@/lib/domains/orcamento";
import { getQuote, listQuoteItems, listQuotes } from "./data";

async function currentOrcamentoTenant() {
  try {
    await requirePermission("orcamento:read");
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return getCurrentTenant();
}

export async function getQuotes(): Promise<Quote[]> {
  const tenant = await currentOrcamentoTenant();
  return listQuotes(tenant.id);
}

export async function getQuoteDetails(
  quoteId: string,
): Promise<{ quote: Quote; items: QuoteItem[] } | null> {
  const tenant = await currentOrcamentoTenant();
  const quote = await getQuote(tenant.id, quoteId);
  if (!quote) return null;

  const items = await listQuoteItems(tenant.id, quoteId);
  return { quote, items };
}
