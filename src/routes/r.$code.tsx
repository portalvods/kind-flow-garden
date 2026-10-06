import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveReferralCode } from "@/lib/referral.functions";

// Short referral link: /r/CODE -> /auth?mode=signup&ref=<reseller-id>
export const Route = createFileRoute("/r/$code")({
  ssr: true,
  beforeLoad: async ({ params }) => {
    try {
      const res = await resolveReferralCode({ data: { code: params.code } });
      if (res?.reseller) {
        throw redirect({
          to: "/auth",
          search: { mode: "signup", ref: res.reseller },
        });
      }
    } catch (err) {
      if (err && typeof err === "object" && "to" in (err as Record<string, unknown>)) throw err;
      // lookup failed: fall through to plain signup
    }
    throw redirect({ to: "/auth", search: { mode: "signup" } });
  },
  component: () => null,
});
