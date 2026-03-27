"use server";

import { signIn } from "@/auth";
import { db } from "@agentic-academy/db";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import { sendEmail } from "@/lib/resend";
import { WelcomeEmail } from "@/emails/welcome";
import * as React from "react";

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function registerAction(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string } | null> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? "Invalid input";
    return { error: message };
  }

  const { name, email, password } = parsed.data;
  const hashedPassword = await bcrypt.hash(password, 12);

  let userId: string;
  try {
    const user = await db.user.create({ data: { name, email, password: hashedPassword } });
    userId = user.id;
  } catch {
    return { error: "That email is already registered." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentic.academy";
  // Fire-and-forget — don't block the redirect
  sendEmail({
    to: email,
    subject: "Welcome to AgenticAcademy!",
    type: "welcome",
    userId,
    template: React.createElement(WelcomeEmail, {
      name,
      dashboardUrl: `${appUrl}/dashboard`,
    }),
  });

  redirect("/login?registered=true");
}

export async function oauthSignInAction(provider: "google" | "github" | "linkedin"): Promise<void> {
  await signIn(provider, { redirectTo: "/dashboard" });
}

export async function loginAction(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string } | null> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error; // re-throw NEXT_REDIRECT
  }
  return null;
}
