"use server";

import { db } from "@agentic-academy/db";
import { z } from "zod";

const schema = z.object({ email: z.string().email("Invalid email address") });

export async function joinWaitlistAction(
  _prevState: { success?: boolean; error?: string } | null,
  formData: FormData
): Promise<{ success?: boolean; error?: string }> {
  const parsed = schema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid email" };
  }

  try {
    await db.waitlistEmail.create({ data: { email: parsed.data.email } });
  } catch {
    // Unique constraint — silently succeed to prevent email enumeration
  }

  return { success: true };
}
