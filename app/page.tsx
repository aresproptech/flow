import { redirect } from "next/navigation";

type RootPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RootPage({ searchParams }: RootPageProps) {
  const params = await searchParams;
  const recoveryParams = new URLSearchParams();

  for (const key of ["code", "error", "error_code", "error_description", "type"]) {
    const value = params[key];
    if (typeof value === "string") recoveryParams.set(key, value);
  }

  if (
    recoveryParams.has("code") ||
    recoveryParams.has("error") ||
    recoveryParams.has("error_code")
  ) {
    redirect(`/login/reset-password?${recoveryParams.toString()}`);
  }

  redirect("/dashboard");
}
