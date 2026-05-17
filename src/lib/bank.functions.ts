import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ParseSchema = z.object({
  pdfBase64: z.string().min(10),
});

export type BankTransaction = {
  date: string;          // YYYY-MM-DD
  amount: number;        // positivt = insättning, negativt = uttag
  description: string;
  counterparty: string | null;
};

export const parseBankPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ParseSchema.parse(input))
  .handler(async ({ data }): Promise<
    { ok: true; transactions: BankTransaction[] } | { ok: false; error: string }
  > => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false, error: "LOVABLE_API_KEY saknas." };

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
              "Du extraherar transaktioner från svenska bankkontoutdrag (PDF). Returnera ENDAST giltig JSON enligt schemat: " +
              '{ "transactions": [{ "date": "YYYY-MM-DD", "amount": number, "description": string, "counterparty": string|null }] }. ' +
              "Belopp i SEK. Positivt belopp = insättning till kontot, negativt = uttag. counterparty = avsändarens/mottagarens namn om det går att avgöra, annars null. Ignorera saldo-rader och rubriker.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrahera alla transaktioner från detta bankutdrag." },
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${data.pdfBase64}` },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) return { ok: false, error: "AI-tjänsten överbelastad. Försök igen." };
    if (res.status === 402) return { ok: false, error: "AI-krediter slut. Lägg till krediter." };
    if (!res.ok) {
      const txt = await res.text();
      console.error("AI gateway error", res.status, txt);
      return { ok: false, error: `AI-fel (${res.status}).` };
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(content) as { transactions?: unknown };
      const list = Array.isArray(parsed.transactions) ? parsed.transactions : [];
      const transactions: BankTransaction[] = list
        .map((t) => {
          const tx = t as Record<string, unknown>;
          return {
            date: String(tx.date ?? ""),
            amount: Number(tx.amount ?? 0),
            description: String(tx.description ?? ""),
            counterparty: tx.counterparty == null ? null : String(tx.counterparty),
          };
        })
        .filter((t) => t.date && !Number.isNaN(t.amount) && t.amount !== 0);
      return { ok: true, transactions };
    } catch {
      return { ok: false, error: "Kunde inte tolka AI-svaret." };
    }
  });
