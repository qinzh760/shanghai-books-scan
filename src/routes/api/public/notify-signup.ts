import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const ADMIN_EMAIL = "qinzh760@hotmail.com";

const Body = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(255).optional().nullable(),
});

export const Route = createFileRoute("/api/public/notify-signup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: z.infer<typeof Body>;
        try {
          payload = Body.parse(await request.json());
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        // Try to send via Lovable transactional email infra if available.
        // If email infrastructure has not been set up yet the call will fail
        // silently — the pending user is still visible to admins on the
        // Användare page.
        try {
          const origin = new URL(request.url).origin;
          await fetch(`${origin}/lovable/email/transactional/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              templateName: "signup-approval-request",
              recipientEmail: ADMIN_EMAIL,
              idempotencyKey: `signup-${payload.email}-${Date.now()}`,
              templateData: {
                applicantEmail: payload.email,
                applicantName: payload.fullName ?? payload.email,
              },
            }),
          });
        } catch (err) {
          console.warn("[notify-signup] email send skipped:", err);
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
