INSERT INTO public.accounts (number, name, type) VALUES
  (3604, 'AI-aktivitet', 'income'),
  (3742, 'Vårfestmiddag', 'income'),
  (3891, 'Donationer', 'income')
ON CONFLICT (number) DO NOTHING;