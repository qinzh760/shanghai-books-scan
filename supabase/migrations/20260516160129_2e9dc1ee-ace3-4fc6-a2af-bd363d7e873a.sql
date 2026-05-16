
-- Tighten SECURITY DEFINER function exposure
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) TO authenticated;

-- Seed BAS 2025 essential chart of accounts for a Swedish association
INSERT INTO public.accounts (number, name, type, vat_rate) VALUES
-- Tillgångar (Assets)
(1220, 'Inventarier och verktyg', 'asset', NULL),
(1510, 'Kundfordringar', 'asset', NULL),
(1630, 'Skattekonto', 'asset', NULL),
(1910, 'Kassa', 'asset', NULL),
(1930, 'Företagskonto / Bankkonto', 'asset', NULL),
(1940, 'Övriga bankkonton', 'asset', NULL),
-- Skulder (Liabilities)
(2440, 'Leverantörsskulder', 'liability', NULL),
(2611, 'Utgående moms 25%', 'liability', 25.00),
(2621, 'Utgående moms 12%', 'liability', 12.00),
(2631, 'Utgående moms 6%', 'liability', 6.00),
(2641, 'Ingående moms 25%', 'asset', 25.00),
(2645, 'Beräknad ingående moms', 'asset', NULL),
(2650, 'Redovisningskonto för moms', 'liability', NULL),
(2710, 'Personalskatt', 'liability', NULL),
(2730, 'Lagstadgade sociala avgifter', 'liability', NULL),
-- Eget kapital (Equity)
(2010, 'Eget kapital', 'equity', NULL),
(2019, 'Årets resultat', 'equity', NULL),
-- Intäkter (Income)
(3011, 'Försäljning varor 25% moms', 'income', 25.00),
(3041, 'Försäljning tjänster 25% moms', 'income', 25.00),
(3740, 'Öres- och kronutjämning', 'income', NULL),
(3890, 'Övriga ersättningar och intäkter', 'income', NULL),
(3987, 'Erhållna kommunala bidrag', 'income', NULL),
(3989, 'Övriga erhållna bidrag', 'income', NULL),
(3990, 'Medlemsavgifter', 'income', NULL),
-- Kostnader (Expenses)
(4010, 'Inköp av varor', 'expense', 25.00),
(5010, 'Lokalhyra', 'expense', 25.00),
(5410, 'Förbrukningsinventarier', 'expense', 25.00),
(5460, 'Förbrukningsmaterial', 'expense', 25.00),
(5611, 'Drivmedel', 'expense', 25.00),
(5710, 'Frakter och transporter', 'expense', 25.00),
(5800, 'Resekostnader', 'expense', NULL),
(5810, 'Biljetter', 'expense', 6.00),
(5831, 'Logi (hotell)', 'expense', 12.00),
(5832, 'Kost (representation)', 'expense', 12.00),
(5900, 'Reklam och PR', 'expense', 25.00),
(6071, 'Representation, avdragsgill', 'expense', NULL),
(6072, 'Representation, ej avdragsgill', 'expense', NULL),
(6110, 'Kontorsmateriel', 'expense', 25.00),
(6212, 'Mobiltelefon', 'expense', 25.00),
(6230, 'Internet', 'expense', 25.00),
(6250, 'Porto', 'expense', NULL),
(6310, 'Företagsförsäkringar', 'expense', NULL),
(6540, 'IT-tjänster', 'expense', 25.00),
(6550, 'Konsultarvoden', 'expense', 25.00),
(6570, 'Bankkostnader', 'expense', NULL),
(6991, 'Övriga externa kostnader, avdragsgilla', 'expense', 25.00),
(6992, 'Övriga externa kostnader, ej avdragsgilla', 'expense', NULL),
(7010, 'Löner till kollektivanställda', 'expense', NULL),
(7210, 'Löner till tjänstemän', 'expense', NULL),
(7510, 'Lagstadgade sociala avgifter', 'expense', NULL),
(8400, 'Räntekostnader', 'expense', NULL);
