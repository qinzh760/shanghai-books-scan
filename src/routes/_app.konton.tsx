import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export const Route = createFileRoute("/_app/konton")({
  component: KontoplanPage,
});

function KontoplanPage() {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("number,name,type,vat_rate")
        .order("number");
      if (error) throw error;
      return data;
    },
  });

  const filtered = (data ?? []).filter(
    (a) =>
      !q ||
      String(a.number).includes(q) ||
      a.name.toLowerCase().includes(q.toLowerCase()),
  );

  const labels: Record<string, string> = {
    asset: "Tillgång",
    liability: "Skuld",
    equity: "Eget kapital",
    income: "Intäkt",
    expense: "Kostnad",
  };

  return (
    <>
      <PageHeader title="Kontoplan" description="BAS 2025 – svensk standard">
        <Input
          placeholder="Sök kontonummer eller namn…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-72"
        />
      </PageHeader>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 w-24">Nr</th>
                <th className="px-4 py-3">Namn</th>
                <th className="px-4 py-3 w-32">Typ</th>
                <th className="px-4 py-3 w-20 text-right">Moms</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.number} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-mono tabular-nums">{a.number}</td>
                  <td className="px-4 py-2.5">{a.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{labels[a.type]}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {a.vat_rate ? `${a.vat_rate}%` : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
