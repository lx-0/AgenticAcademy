import { NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/badges";

export async function GET() {
  const base = getBaseUrl();
  return NextResponse.json(
    {
      "@context": "https://w3id.org/openbadges/v2",
      type: "Issuer",
      id: `${base}/api/badges/issuer`,
      name: "AgenticAcademy",
      url: base,
      email: "certificates@agenticacademy.com",
    },
    { headers: { "Cache-Control": "public, max-age=86400" } }
  );
}
