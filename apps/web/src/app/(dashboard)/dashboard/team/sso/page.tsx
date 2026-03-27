import { auth } from "@/auth";
import { db } from "@agentic-academy/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";

export const metadata = { title: "SSO Settings — AgenticAcademy" };

type SsoSettings = {
  saml?: {
    entityId?: string;
    ssoUrl?: string;
    certificate?: string;
    enabled?: boolean;
  };
  oidc?: {
    discoveryUrl?: string;
    clientId?: string;
    clientSecret?: string;
    enabled?: boolean;
  };
};

export default async function SsoSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const membership = await db.orgMembership.findFirst({
    where: { userId, role: { in: ["org_admin"] } },
    include: { org: true },
    orderBy: { joinedAt: "asc" },
  });

  if (!membership) notFound();

  const org = membership.org;
  const settings = (org.settings as SsoSettings) ?? {};
  const saml = settings.saml ?? {};
  const oidc = settings.oidc ?? {};

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AA</span>
            </div>
            <span className="font-semibold text-gray-900">AgenticAcademy</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/dashboard/team" className="text-gray-600 hover:text-gray-900 transition-colors">
              Team
            </Link>
            <span className="text-gray-900 font-medium">SSO Settings</span>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">SSO Settings</h1>
          <p className="text-gray-500 text-sm mt-1">
            Configure SAML or OIDC single sign-on for {org.name}.
          </p>
        </div>

        {/* OAuth providers info */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-blue-900 text-sm mb-1">Social OAuth (platform-wide)</h2>
          <p className="text-sm text-blue-700">
            Google, GitHub, and LinkedIn sign-in are available platform-wide when configured by the
            platform admin via environment variables (
            <code className="bg-blue-100 px-1 rounded text-xs">GOOGLE_CLIENT_ID</code>,{" "}
            <code className="bg-blue-100 px-1 rounded text-xs">GITHUB_CLIENT_ID</code>,{" "}
            <code className="bg-blue-100 px-1 rounded text-xs">LINKEDIN_CLIENT_ID</code>).
            Users will see these options on the login page automatically.
          </p>
        </div>

        <div className="space-y-6">
          {/* SAML section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">SAML 2.0</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Connect Okta, Azure AD, Google Workspace, or any SAML 2.0 IdP.
                </p>
              </div>
              {saml.enabled && (
                <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">
                  Configured
                </span>
              )}
            </div>
            <form
              action={async (formData: FormData) => {
                "use server";
                const entityId = String(formData.get("entityId") ?? "").trim();
                const ssoUrl = String(formData.get("ssoUrl") ?? "").trim();
                const certificate = String(formData.get("certificate") ?? "").trim();
                const orgId = String(formData.get("orgId") ?? "");

                const current = await db.organization.findUnique({
                  where: { id: orgId },
                  select: { settings: true },
                });
                const currentSettings = (current?.settings ?? {}) as SsoSettings;

                await db.organization.update({
                  where: { id: orgId },
                  data: {
                    settings: {
                      ...currentSettings,
                      saml: {
                        entityId,
                        ssoUrl,
                        certificate,
                        enabled: !!(entityId && ssoUrl && certificate),
                      },
                    },
                  },
                });

                revalidatePath("/dashboard/team/sso");
              }}
              className="px-6 py-5 space-y-4"
            >
              <input type="hidden" name="orgId" value={org.id} />

              <div>
                <label htmlFor="entityId" className="block text-sm font-medium text-gray-700 mb-1">
                  IdP Entity ID
                </label>
                <input
                  id="entityId"
                  name="entityId"
                  type="text"
                  defaultValue={saml.entityId ?? ""}
                  placeholder="https://your-idp.com/saml/metadata"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <label htmlFor="ssoUrl" className="block text-sm font-medium text-gray-700 mb-1">
                  SSO URL (IdP Sign-In URL)
                </label>
                <input
                  id="ssoUrl"
                  name="ssoUrl"
                  type="url"
                  defaultValue={saml.ssoUrl ?? ""}
                  placeholder="https://your-idp.com/saml/sso"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <label htmlFor="certificate" className="block text-sm font-medium text-gray-700 mb-1">
                  X.509 Certificate (PEM)
                </label>
                <textarea
                  id="certificate"
                  name="certificate"
                  rows={5}
                  defaultValue={saml.certificate ?? ""}
                  placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
                />
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-600">
                <p className="font-medium text-gray-700 mb-1">Service Provider (SP) details — give these to your IdP:</p>
                <p><span className="text-gray-400">ACS URL:</span>{" "}<code className="bg-white border border-gray-200 rounded px-1">{process.env.NEXT_PUBLIC_APP_URL ?? "https://agentic.academy"}/api/auth/callback/saml</code></p>
                <p className="mt-1"><span className="text-gray-400">Entity ID:</span>{" "}<code className="bg-white border border-gray-200 rounded px-1">{process.env.NEXT_PUBLIC_APP_URL ?? "https://agentic.academy"}</code></p>
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
              >
                Save SAML settings
              </button>
            </form>
          </div>

          {/* OIDC section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">OIDC / OpenID Connect</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Connect via OpenID Connect discovery (Okta, Auth0, Azure AD).
                </p>
              </div>
              {oidc.enabled && (
                <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">
                  Configured
                </span>
              )}
            </div>
            <form
              action={async (formData: FormData) => {
                "use server";
                const discoveryUrl = String(formData.get("discoveryUrl") ?? "").trim();
                const clientId = String(formData.get("clientId") ?? "").trim();
                const clientSecret = String(formData.get("clientSecret") ?? "").trim();
                const orgId = String(formData.get("orgId") ?? "");

                const current = await db.organization.findUnique({
                  where: { id: orgId },
                  select: { settings: true },
                });
                const currentSettings = (current?.settings ?? {}) as SsoSettings;

                await db.organization.update({
                  where: { id: orgId },
                  data: {
                    settings: {
                      ...currentSettings,
                      oidc: {
                        discoveryUrl,
                        clientId,
                        clientSecret,
                        enabled: !!(discoveryUrl && clientId && clientSecret),
                      },
                    },
                  },
                });

                revalidatePath("/dashboard/team/sso");
              }}
              className="px-6 py-5 space-y-4"
            >
              <input type="hidden" name="orgId" value={org.id} />

              <div>
                <label htmlFor="discoveryUrl" className="block text-sm font-medium text-gray-700 mb-1">
                  Discovery URL (.well-known/openid-configuration)
                </label>
                <input
                  id="discoveryUrl"
                  name="discoveryUrl"
                  type="url"
                  defaultValue={oidc.discoveryUrl ?? ""}
                  placeholder="https://your-idp.com/.well-known/openid-configuration"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <label htmlFor="clientId" className="block text-sm font-medium text-gray-700 mb-1">
                  Client ID
                </label>
                <input
                  id="clientId"
                  name="clientId"
                  type="text"
                  defaultValue={oidc.clientId ?? ""}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <label htmlFor="clientSecret" className="block text-sm font-medium text-gray-700 mb-1">
                  Client Secret
                </label>
                <input
                  id="clientSecret"
                  name="clientSecret"
                  type="password"
                  defaultValue={oidc.clientSecret ?? ""}
                  autoComplete="off"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
              >
                Save OIDC settings
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
