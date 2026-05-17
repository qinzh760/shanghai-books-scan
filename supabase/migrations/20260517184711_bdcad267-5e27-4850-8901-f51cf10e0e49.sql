
INSERT INTO public.accounts (number, name, type) VALUES
  (3601, 'Medlemsavgifter person', 'income'),
  (3602, 'Medlemsavgifter familj', 'income'),
  (3603, 'AI-föreläsning', 'income'),
  (3741, 'Matintäkter barn', 'income')
ON CONFLICT (number) DO NOTHING;

UPDATE public.accounts SET name = 'Matintäkter vuxen', type = 'income' WHERE number = 3740;
