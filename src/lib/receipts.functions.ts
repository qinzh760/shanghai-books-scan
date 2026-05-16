import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ExtractSchema = z.object({
  imageBase64: z.string().min(10),
  mimeType: z.string().min(3).max(50),
});

export const extractReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ExtractSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "LOVABLE_API_KEY saknas. Aktivera Lovable AI." };
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Du extraherar data från svenska kvitton. Returnera ENDAST giltig JSON med fälten: vendor (string), receipt_date (YYYY-MM-DD), total_amount (number i SEK), vat_amount (number i SEK), currency (default 'SEK'), notes (kort beskrivning på svenska). Om något saknas använd null.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrahera kvittots uppgifter som JSON." },
              {
                type: "image_url",
                image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) {
      return { ok: false as const, error: "AI-tjänsten är överbelastad. Försök igen om en stund." };
    }
    if (res.status === 402) {
      return { ok: false as const, error: "AI-krediter slut. Lägg till krediter i Lovable Cloud." };
    }
    if (!res.ok) {
      const txt = await res.text();
      console.error("AI gateway error", res.status, txt);
      return { ok: false as const, error: `AI-fel (${res.status}).` };
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "{}";

    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      return {
        ok: true as const,
        data: {
          vendor: (parsed.vendor as string) ?? null,
          receipt_date: (parsed.receipt_date as string) ?? null,
          total_amount: parsed.total_amount != null ? Number(parsed.total_amount) : null,
          vat_amount: parsed.vat_amount != null ? Number(parsed.vat_amount) : null,
          currency: (parsed.currency as string) ?? "SEK",
          notes: (parsed.notes as string) ?? null,
        },
      };
    } catch {
      return { ok: false as const, error: "Kunde inte tolka AI-svaret." };
    }
  });
