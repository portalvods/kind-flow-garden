import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveReferralCode } from "@/lib/referral.functions";

// Short referral link: /r/CODE -> /auth?mode=signup&ref=<reseller-id>
export const Route = createFileRoute("/r/$code")({
  ssr: true,
  beforeLoad: async ({ params }) => {
    let ref: string | null = null;
    try {
      const res = await resolveReferralCode({ data: { code: params.code } });
      ref = res?.reseller ?? null;
    } catch (err) {
      console.warn("[referral] lookup failed:", err instanceof Error ? err.message : err);
      // lookup failed: fall through to plain signup
    }
    throw redirect({
      to: "/auth",
      search: ref ? { mode: "signup", ref } : { mode: "signup" },
    });
  },
  component: () => null,
});
