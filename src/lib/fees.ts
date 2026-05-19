// Avgiftstabell för Shanghai Association Sweden
export type FeeKey =
  | "member_person"
  | "member_family"
  | "food_adult"
  | "food_child"
  | "spring_dinner"
  | "ai_activity"
  | "lecture";

export const FEES: Record<FeeKey, { label: string; price: number; account: number }> = {
  member_person:  { label: "Medlemsavgift person",  price: 150, account: 3601 },
  member_family:  { label: "Medlemsavgift familj",  price: 300, account: 3602 },
  food_adult:     { label: "Mat vuxen (årsmöte)",   price: 250, account: 3740 },
  food_child:     { label: "Mat barn (årsmöte)",    price: 125, account: 3741 },
  spring_dinner:  { label: "Vårfestmiddag",         price: 250, account: 3742 },
  ai_activity:    { label: "AI-aktivitet",          price:  50, account: 3604 },
  lecture:        { label: "Föreläsning",           price:  50, account: 3603 },
};

export const BANK_ACCOUNT = 1930;
export const DONATION_ACCOUNT = 3891;

export type Split = Partial<Record<FeeKey, number>>;

// Hitta kombinationer av avgifter som summerar till `amount`.
// Returnerar upp till `limit` kombinationer, sorterade efter färre poster först.
export function suggestSplits(amount: number, limit = 8): Split[] {
  const keys = Object.keys(FEES) as FeeKey[];
  const target = Math.round(amount * 100); // öre
  const prices = keys.map((k) => Math.round(FEES[k].price * 100));
  const maxCounts = keys.map((_, i) => Math.floor(target / prices[i]));

  const results: Split[] = [];
  const counts = new Array(keys.length).fill(0);

  function recurse(idx: number, remaining: number) {
    if (results.length >= 200) return;
    if (idx === keys.length) {
      if (remaining === 0 && counts.some((c) => c > 0)) {
        const split: Split = {};
        keys.forEach((k, i) => { if (counts[i] > 0) split[k] = counts[i]; });
        results.push(split);
      }
      return;
    }
    const max = Math.min(maxCounts[idx], Math.floor(remaining / prices[idx]));
    for (let c = 0; c <= max; c++) {
      counts[idx] = c;
      recurse(idx + 1, remaining - c * prices[idx]);
    }
    counts[idx] = 0;
  }

  recurse(0, target);

  // Regel: barn kan inte komma ensamma — food_child kräver minst en food_adult.
  // Undantag: exakt 1× food_child ensamt (125 kr) tillåts.
  const filtered = results.filter((s) => {
    const child = s.food_child ?? 0;
    const adult = s.food_adult ?? 0;
    if (child === 0) return true;
    if (adult >= 1) return true;
    const otherKeys = (Object.keys(s) as FeeKey[]).filter((k) => k !== "food_child");
    return child === 1 && otherKeys.length === 0;
  });
  results.length = 0;
  results.push(...filtered);

  // Sortera: föredra färre olika poster, sedan färre totala enheter,
  // sedan föredra medlemsavgift > mat > vårfest > AI/föreläsning.
  const priority: FeeKey[] = [
    "member_family", "member_person",
    "food_adult", "food_child",
    "spring_dinner",
    "ai_activity", "lecture",
  ];
  results.sort((a, b) => {
    const aTypes = Object.keys(a).length;
    const bTypes = Object.keys(b).length;
    if (aTypes !== bTypes) return aTypes - bTypes;
    const aTotal = Object.values(a).reduce((s, n) => s + (n ?? 0), 0);
    const bTotal = Object.values(b).reduce((s, n) => s + (n ?? 0), 0);
    if (aTotal !== bTotal) return aTotal - bTotal;
    for (const k of priority) {
      const av = a[k] ?? 0, bv = b[k] ?? 0;
      if (av !== bv) return bv - av;
    }
    return 0;
  });

  return results.slice(0, limit);
}

export function splitTotal(split: Split): number {
  return (Object.keys(split) as FeeKey[]).reduce(
    (s, k) => s + (split[k] ?? 0) * FEES[k].price, 0,
  );
}

export function describeSplit(split: Split): string {
  return (Object.keys(split) as FeeKey[])
    .filter((k) => (split[k] ?? 0) > 0)
    .map((k) => `${split[k]}× ${FEES[k].label}`)
    .join(" + ");
}
