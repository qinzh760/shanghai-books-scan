import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, formatSEK } from "@/components/ui-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/rapporter")({
  component: RapporterPage,
});

type LineRow = {
  debit: number;
  credit: number;
  account_number: number;
  accounts: { name: string; type: string } | null;
};

function RapporterPage() {
  const today = new Date();
  const [from, setFrom] = useState(`${today.getFullYear()}-01-01`);
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  const { data } = useQuery({
    queryKey: ["report-lines", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verification_lines")
        .select("debit,credit,account_number,accounts(name,type),verifications!inner(verification_date)")
        .gte("verifications.verification_date", from)
        .lte("verifications.verification_date", to);
      if (error) throw error;
      return data as unknown as LineRow[];
    },
  });

  const grouped = groupByAccount(data ?? []);

  return (
    <>
      <PageHeader title="Rapporter" description="Resultaträkning, balansräkning och momsrapport.">
        <div className="flex gap-2 items-end">
          <div><Label className="text-xs">Från</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">Till</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </PageHeader>

      <Tabs defaultValue="result">
        <TabsList>
          <TabsTrigger value="result">Resultaträkning</TabsTrigger>
          <TabsTrigger value="balance">Balansräkning</TabsTrigger>
          <TabsTrigger value="vat">Momsrapport</TabsTrigger>
          <TabsTrigger value="tax">Skattedeklaration</TabsTrigger>
        </TabsList>

        <TabsContent value="result">
          <ResultReport rows={grouped} />
        </TabsContent>
        <TabsContent value="balance">
          <BalanceReport rows={grouped} />
        </TabsContent>
        <TabsContent value="vat">
          <VatReport rows={grouped} />
        </TabsContent>
        <TabsContent value="tax">
          <TaxReport rows={grouped} />
        </TabsContent>
      </Tabs>
    </>
  );
}

type Agg = { number: number; name: string; type: string; debit: number; credit: number };

function groupByAccount(rows: LineRow[]): Agg[] {
  const m = new Map<number, Agg>();
  for (const r of rows) {
    const key = r.account_number;
    const cur = m.get(key) ?? {
      number: key,
      name: r.accounts?.name ?? `Konto ${key}`,
      type: r.accounts?.type ?? "expense",
      debit: 0,
      credit: 0,
    };
    cur.debit += Number(r.debit);
    cur.credit += Number(r.credit);
    m.set(key, cur);
  }
  return Array.from(m.values()).sort((a, b) => a.number - b.number);
}

function ResultReport({ rows }: { rows: Agg[] }) {
  const income = rows.filter((r) => r.type === "income");
  const expense = rows.filter((r) => r.type === "expense");
  const incomeSum = income.reduce((s, r) => s + (r.credit - r.debit), 0);
  const expenseSum = expense.reduce((s, r) => s + (r.debit - r.credit), 0);
  const result = incomeSum - expenseSum;

  return (
    <Card className="mt-4">
      <CardHeader><CardTitle>Resultaträkning</CardTitle></CardHeader>
      <CardContent>
        <Section title="Intäkter" rows={income.map((r) => ({ ...r, amount: r.credit - r.debit }))} total={incomeSum} />
        <Section title="Kostnader" rows={expense.map((r) => ({ ...r, amount: r.debit - r.credit }))} total={expenseSum} />
        <div className="mt-4 pt-3 border-t flex justify-between text-base font-semibold">
          <span>Årets resultat</span>
          <span className={`tabular-nums ${result >= 0 ? "text-success" : "text-destructive"}`}>{formatSEK(result)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function BalanceReport({ rows }: { rows: Agg[] }) {
  const assets = rows.filter((r) => r.type === "asset");
  const liabilities = rows.filter((r) => r.type === "liability");
  const equity = rows.filter((r) => r.type === "equity");
  const assetSum = assets.reduce((s, r) => s + (r.debit - r.credit), 0);
  const liabSum = liabilities.reduce((s, r) => s + (r.credit - r.debit), 0);
  const eqSum = equity.reduce((s, r) => s + (r.credit - r.debit), 0);

  return (
    <Card className="mt-4">
      <CardHeader><CardTitle>Balansräkning</CardTitle></CardHeader>
      <CardContent>
        <Section title="Tillgångar" rows={assets.map((r) => ({ ...r, amount: r.debit - r.credit }))} total={assetSum} />
        <Section title="Skulder" rows={liabilities.map((r) => ({ ...r, amount: r.credit - r.debit }))} total={liabSum} />
        <Section title="Eget kapital" rows={equity.map((r) => ({ ...r, amount: r.credit - r.debit }))} total={eqSum} />
      </CardContent>
    </Card>
  );
}

function VatReport({ rows }: { rows: Agg[] }) {
  const outgoing = rows.filter((r) => r.number >= 2610 && r.number < 2640);
  const incoming = rows.filter((r) => r.number >= 2640 && r.number < 2650);
  const outSum = outgoing.reduce((s, r) => s + (r.credit - r.debit), 0);
  const inSum = incoming.reduce((s, r) => s + (r.debit - r.credit), 0);

  return (
    <Card className="mt-4">
      <CardHeader><CardTitle>Momsrapport</CardTitle></CardHeader>
      <CardContent>
        <Section title="Utgående moms" rows={outgoing.map((r) => ({ ...r, amount: r.credit - r.debit }))} total={outSum} />
        <Section title="Ingående moms" rows={incoming.map((r) => ({ ...r, amount: r.debit - r.credit }))} total={inSum} />
        <div className="mt-4 pt-3 border-t flex justify-between text-base font-semibold">
          <span>Moms att betala (negativt = återbetalning)</span>
          <span className="tabular-nums">{formatSEK(outSum - inSum)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  rows,
  total,
}: {
  title: string;
  rows: Array<Agg & { amount: number }>;
  total: number;
}) {
  return (
    <div className="mb-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{title}</div>
      <div className="space-y-1">
        {rows.length === 0 && <div className="text-sm text-muted-foreground italic">Inga poster</div>}
        {rows.map((r) => (
          <div key={r.number} className="flex justify-between text-sm">
            <span><span className="font-mono text-muted-foreground mr-2">{r.number}</span>{r.name}</span>
            <span className="tabular-nums">{formatSEK(r.amount)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t flex justify-between text-sm font-medium">
        <span>Summa {title.toLowerCase()}</span>
        <span className="tabular-nums">{formatSEK(total)}</span>
      </div>
    </div>
  );
}
