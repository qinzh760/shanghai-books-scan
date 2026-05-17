import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, formatSEK, formatDate } from "@/components/ui-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, FileUp, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { parseBankPdf, type BankTransaction } from "@/lib/bank.functions";
import { FEES, BANK_ACCOUNT, suggestSplits, splitTotal, describeSplit, type FeeKey, type Split } from "@/lib/fees";

export const Route = createFileRoute("/_app/verifikationer")({
  component: VerifPage,
});

type Line = { account_number: string; debit: string; credit: string; description: string };

function VerifPage() {
  const qc = useQueryClient();
  const { canEdit } = useAuth();
  const [open, setOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);

  const { data: list } = useQuery({
    queryKey: ["verifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verifications")
        .select("*, verification_lines(debit, credit)")
        .order("verification_date", { ascending: false })
        .order("number", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <PageHeader title="Verifikationer" description="Bokföringsposter med dubbel bokföring (debet/kredit)">
        {canEdit && (
          <div className="flex gap-2">
            <Dialog open={bankOpen} onOpenChange={setBankOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><FileUp className="h-4 w-4 mr-1.5" /> Importera bankutdrag (PDF)</Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Importera bankutdrag</DialogTitle></DialogHeader>
                <BankImport onDone={() => { setBankOpen(false); qc.invalidateQueries({ queryKey: ["verifications"] }); }} />
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-1.5" /> Ny verifikation</Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader><DialogTitle>Ny verifikation</DialogTitle></DialogHeader>
                <NewVerification onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["verifications"] }); }} />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 w-20">Nr</th>
                <th className="px-4 py-3 w-28">Datum</th>
                <th className="px-4 py-3">Beskrivning</th>
                <th className="px-4 py-3 w-32 text-right">Belopp</th>
              </tr>
            </thead>
            <tbody>
              {(list ?? []).map((v) => {
                const sum = (v.verification_lines ?? []).reduce(
                  (s: number, l: { debit: number }) => s + Number(l.debit),
                  0,
                );
                return (
                  <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-mono">{v.series}{v.number}</td>
                    <td className="px-4 py-2.5">{formatDate(v.verification_date)}</td>
                    <td className="px-4 py-2.5">{v.description}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatSEK(sum)}</td>
                  </tr>
                );
              })}
              {(list ?? []).length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">Inga verifikationer ännu.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

function NewVerification({ onDone }: { onDone: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { account_number: "", debit: "", credit: "", description: "" },
    { account_number: "", debit: "", credit: "", description: "" },
  ]);
  const [saving, setSaving] = useState(false);

  const { data: accounts } = useQuery({
    queryKey: ["accounts-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("number,name").order("number");
      if (error) throw error;
      return data;
    },
  });

  const totals = useMemo(() => {
    let d = 0, c = 0;
    for (const l of lines) { d += Number(l.debit || 0); c += Number(l.credit || 0); }
    return { d, c, balanced: Math.abs(d - c) < 0.005 && d > 0 };
  }, [lines]);

  const setLine = (i: number, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const save = async () => {
    if (!totals.balanced) { toast.error("Debet och kredit måste balansera."); return; }
    if (!description) { toast.error("Ange beskrivning."); return; }
    setSaving(true);
    try {
      const year = new Date(date).getFullYear();
      const { data: maxRow } = await supabase
        .from("verifications").select("number").eq("fiscal_year", year).eq("series", "A")
        .order("number", { ascending: false }).limit(1).maybeSingle();
      const nextNumber = (maxRow?.number ?? 0) + 1;

      const { data: { user } } = await supabase.auth.getUser();
      const { data: v, error } = await supabase.from("verifications").insert({
        series: "A",
        number: nextNumber,
        verification_date: date,
        description,
        fiscal_year: year,
        created_by: user?.id,
      }).select("id").single();
      if (error) throw error;

      const linesPayload = lines
        .filter((l) => l.account_number && (Number(l.debit) > 0 || Number(l.credit) > 0))
        .map((l, idx) => ({
          verification_id: v.id,
          account_number: Number(l.account_number),
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          description: l.description || null,
          line_order: idx,
        }));
      const { error: lErr } = await supabase.from("verification_lines").insert(linesPayload);
      if (lErr) throw lErr;

      toast.success(`Verifikation A${nextNumber} sparad.`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Datum</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Beskrivning</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="t.ex. Lokalhyra mars" />
        </div>
      </div>

      <div>
        <div className="grid grid-cols-12 gap-2 text-xs uppercase text-muted-foreground mb-1.5 px-1">
          <div className="col-span-4">Konto</div>
          <div className="col-span-3">Text</div>
          <div className="col-span-2 text-right">Debet</div>
          <div className="col-span-2 text-right">Kredit</div>
          <div className="col-span-1" />
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 mb-1.5">
            <div className="col-span-4">
              <Select value={l.account_number} onValueChange={(v) => setLine(i, { account_number: v })}>
                <SelectTrigger><SelectValue placeholder="Välj konto" /></SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).map((a) => (
                    <SelectItem key={a.number} value={String(a.number)}>
                      {a.number} – {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input className="col-span-3" placeholder="Text" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
            <Input className="col-span-2 text-right" type="number" step="0.01" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
            <Input className="col-span-2 text-right" type="number" step="0.01" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
            <Button variant="ghost" size="icon" className="col-span-1" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { account_number: "", debit: "", credit: "", description: "" }])}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Lägg till rad
        </Button>
      </div>

      <div className="flex justify-between items-center border-t pt-3 text-sm">
        <div className="text-muted-foreground">
          Debet: <span className="tabular-nums text-foreground">{formatSEK(totals.d)}</span>
          {" · "}
          Kredit: <span className="tabular-nums text-foreground">{formatSEK(totals.c)}</span>
          {" · "}
          {totals.balanced ? (
            <span className="text-success">Balanserad</span>
          ) : (
            <span className="text-destructive">Differens: {formatSEK(totals.d - totals.c)}</span>
          )}
        </div>
        <Button onClick={save} disabled={saving || !totals.balanced}>
          {saving ? "Sparar…" : "Spara verifikation"}
        </Button>
      </div>
    </div>
  );
}
