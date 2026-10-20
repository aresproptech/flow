import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasActiveAdminProfile } from "@/lib/admin-profile";

function redirectWithSession(request: NextRequest, pathname: string, response: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  const redirectResponse = NextResponse.redirect(url);

  response.cookies.getAll().forEach(({ name, value, ...options }) => {
    redirectResponse.cookies.set(name, value, options);
  });
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = response.headers.get(header);
    if (value) redirectResponse.headers.set(header, value);
  }

  return redirectResponse;
}

export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser valida el token en Supabase; getSession solo lee la cookie local.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLogin = request.nextUrl.pathname.startsWith("/login");
  const isPasswordRecovery = request.nextUrl.pathname === "/login/reset-password";
  const isRecoveryCallback =
    request.nextUrl.pathname === "/" &&
    ["code", "error", "error_code"].some((key) => request.nextUrl.searchParams.has(key));
  if (!user && !isLogin && !isRecoveryCallback) {
    return redirectWithSession(request, "/login", response);
  }

  if (user && isLogin && !isPasswordRecovery) {
    return redirectWithSession(request, "/dashboard", response);
  }

  const isAdminRoute = ["/ajustes", "/usuarios"].some(
    (route) => request.nextUrl.pathname === route || request.nextUrl.pathname.startsWith(`${route}/`)
  );
  if (user && isAdminRoute && !(await hasActiveAdminProfile(supabase, user.id))) {
    return redirectWithSession(request, "/dashboard", response);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|placeholder).*)",
  ],
};
