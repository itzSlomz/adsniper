import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Deliberately neutral surface: no bank name, branding, or purpose disclosed
// pre-auth (Section 10). Passcode fallback is active until Resend is wired.
export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const magicLinks = !!process.env.RESEND_API_KEY;

  async function login(formData: FormData) {
    "use server";
    try {
      // redirectTo must ride in the options (formData) — the third signIn
      // argument is OAuth authorizationParams and silently ignores it.
      formData.set("redirectTo", "/");
      if (process.env.RESEND_API_KEY) {
        await signIn("resend", formData);
      } else {
        await signIn("credentials", formData);
      }
    } catch (err) {
      if (err instanceof AuthError) redirect("/login?error=1");
      throw err;
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form action={login} className="w-full max-w-xs space-y-4">
        <h1 className="text-center text-lg font-medium">Sign in</h1>
        {searchParams.error && (
          <p className="rounded bg-red-50 p-2 text-center text-sm text-red-700">
            Sign-in failed. Check your details.
          </p>
        )}
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="w-full rounded border px-3 py-2"
        />
        {!magicLinks && (
          <input
            name="passcode"
            type="password"
            required
            inputMode="numeric"
            placeholder="Passcode"
            className="w-full rounded border px-3 py-2"
          />
        )}
        <button className="w-full rounded bg-gray-900 px-3 py-2 text-white hover:bg-gray-700">
          {magicLinks ? "Send sign-in link" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
