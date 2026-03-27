import { LoginForm } from "@/components/login-form";
import { OAuthButtons } from "@/components/oauth-buttons";

interface Props {
  searchParams: { registered?: string; callbackUrl?: string; error?: string };
}

// Detect which OAuth providers are configured (server-side env var check)
function getEnabledProviders() {
  const providers: Array<"google" | "github" | "linkedin"> = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) providers.push("google");
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) providers.push("github");
  if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) providers.push("linkedin");
  return providers;
}

export default function LoginPage({ searchParams }: Props) {
  const oauthProviders = getEnabledProviders();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AA</span>
            </div>
            <span className="font-semibold text-gray-900">AgenticAcademy</span>
          </a>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="text-gray-600 mt-1 text-sm">
            Sign in to your account to continue learning.
          </p>
        </div>

        {searchParams.registered && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 mb-4 text-sm">
            Account created! Sign in to get started.
          </div>
        )}

        {oauthProviders.length > 0 && (
          <>
            <OAuthButtons providers={oauthProviders} />
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium">or continue with email</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          </>
        )}

        <LoginForm callbackUrl={searchParams.callbackUrl} />

        <p className="text-center text-sm text-gray-600 mt-6">
          Don&apos;t have an account?{" "}
          <a href="/register" className="text-brand-600 hover:underline font-medium">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
