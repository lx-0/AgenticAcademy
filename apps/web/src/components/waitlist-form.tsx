"use client";

import { useFormState, useFormStatus } from "react-dom";
import { joinWaitlistAction } from "@/actions/waitlist";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-6 py-3 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
    >
      {pending ? "Joining..." : "Join waitlist"}
    </button>
  );
}

export function WaitlistForm() {
  const [state, action] = useFormState(joinWaitlistAction, null);

  if (state?.success) {
    return (
      <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-6 py-4 max-w-md mx-auto">
        <p className="font-medium">You&apos;re on the list!</p>
        <p className="text-sm mt-1 text-green-700">
          We&apos;ll notify you when your spot opens up.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex gap-3 max-w-md mx-auto">
      <input
        type="email"
        name="email"
        placeholder="Enter your work email"
        required
        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-gray-900 placeholder-gray-400"
      />
      <SubmitButton />
      {state?.error && (
        <p className="absolute mt-14 text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
