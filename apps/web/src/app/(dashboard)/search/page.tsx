import Link from "next/link";
import { auth } from "@/auth";
import { SearchClient } from "./search-client";

export const metadata = {
  title: "Search — AgenticAcademy",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const session = await auth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="flex items-center gap-2 hover:text-gray-900">
              <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
                <span className="text-white font-bold text-xs">AA</span>
              </div>
            </Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">Search</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/courses" className="text-sm text-gray-600 hover:text-gray-900">
              Courses
            </Link>
            {session?.user && (
              <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Search</h1>
          <p className="text-gray-500 mt-1">
            Find courses, modules, and lessons — search by meaning, not just keywords.
          </p>
        </div>

        <SearchClient initialQuery={searchParams.q} />
      </main>
    </div>
  );
}
