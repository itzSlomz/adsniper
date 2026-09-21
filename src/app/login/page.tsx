import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Deliberately neutral surface: no bank name, branding, or purpose disclosed
// pre-auth (Section 10). Passcode fallback is active until Resend is wired.
export default async function LoginPage(
  props: {
    searchParams: Promise<{ error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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
      <form action={login} className="card elev-md w-full max-w-xs space-y-3" style={{ padding: "var(--space-6)" }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Sign in</h1>
        {searchParams.error && (
          <p className="callout text-sm">
            Sign-in failed. Check your details.
          </p>
        )}
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="input"
        />
        {!magicLinks && (
          <input
            name="passcode"
            type="password"
            required
            inputMode="numeric"
            placeholder="Passcode"
            className="input"
          />
        )}
        <button className="btn btn-primary btn-block">
          {magicLinks ? "Send sign-in link" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
