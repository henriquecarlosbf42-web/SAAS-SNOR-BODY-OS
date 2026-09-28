import Link from "next/link";
import { CustomerForm } from "@/features/crm/components/customer-form";

export default function NewCustomerPage() {
  return (
    <section className="mx-auto max-w-6xl">
      <Link href="/customers" className="text-sm text-blue-700 underline dark:text-blue-400">
        Back to customers
      </Link>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">Add customer</h1>
      <p className="mb-8 mt-2 text-sm text-black/65 dark:text-white/65">
        Save contact details and notes for this customer.
      </p>
      <CustomerForm />
    </section>
  );
}
