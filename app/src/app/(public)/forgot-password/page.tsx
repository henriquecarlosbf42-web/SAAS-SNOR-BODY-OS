import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-xl font-semibold">Recuperar senha</h1>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
