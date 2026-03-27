import { createHash } from "crypto";

const SALT = "agenticacademy-badge-salt";

export function hashEmail(email: string): string {
  return "sha256$" + createHash("sha256").update(email + SALT).digest("hex");
}

export function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://agenticacademy.com"
  );
}

export function buildOb2Assertion(opts: {
  credentialId: string;
  recipientEmail: string;
  issuedAt: Date;
  courseTitle: string;
  courseDescription: string;
  courseSlug: string;
}) {
  const base = getBaseUrl();
  const assertionId = `${base}/api/badges/${opts.credentialId}`;
  const badgeClassId = `${base}/api/badges/class/${opts.courseSlug}`;
  const issuerId = `${base}/api/badges/issuer`;

  return {
    "@context": "https://w3id.org/openbadges/v2",
    type: "Assertion",
    id: assertionId,
    recipient: {
      type: "email",
      hashed: true,
      salt: SALT,
      identity: hashEmail(opts.recipientEmail),
    },
    badge: {
      "@context": "https://w3id.org/openbadges/v2",
      type: "BadgeClass",
      id: badgeClassId,
      name: opts.courseTitle,
      description: opts.courseDescription,
      image: `${base}/api/badges/image/${opts.courseSlug}`,
      criteria: {
        narrative: `Complete all modules of "${opts.courseTitle}" on AgenticAcademy and pass any required assessments.`,
      },
      issuer: {
        "@context": "https://w3id.org/openbadges/v2",
        type: "Issuer",
        id: issuerId,
        name: "AgenticAcademy",
        url: base,
        email: "certificates@agenticacademy.com",
      },
    },
    issuedOn: opts.issuedAt.toISOString(),
    verification: {
      type: "hosted",
    },
  };
}

export function buildLinkedInUrl(opts: {
  courseTitle: string;
  credentialId: string;
  issuedAt: Date;
  verifyUrl: string;
}): string {
  const params = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: opts.courseTitle,
    organizationName: "AgenticAcademy",
    issueYear: opts.issuedAt.getFullYear().toString(),
    issueMonth: (opts.issuedAt.getMonth() + 1).toString(),
    certUrl: opts.verifyUrl,
    certId: opts.credentialId,
  });
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}
