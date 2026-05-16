
-- Enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'accountant', 'viewer');

-- Account types
CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','income','expense');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles app_role[])
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

-- Accounts (BAS chart)
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type account_type NOT NULL,
  vat_rate NUMERIC(5,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- Verifications (journal entries)
CREATE TABLE public.verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series TEXT NOT NULL DEFAULT 'A',
  number INTEGER NOT NULL,
  verification_date DATE NOT NULL,
  description TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(series, number, fiscal_year)
);
ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;

-- Verification lines
CREATE TABLE public.verification_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id UUID NOT NULL REFERENCES public.verifications(id) ON DELETE CASCADE,
  account_number INTEGER NOT NULL REFERENCES public.accounts(number),
  debit NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT,
  line_order INTEGER NOT NULL DEFAULT 0,
  CHECK (debit >= 0 AND credit >= 0)
);
ALTER TABLE public.verification_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.verification_lines(verification_id);

-- Receipts
CREATE TABLE public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor TEXT,
  receipt_date DATE,
  total_amount NUMERIC(14,2),
  vat_amount NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'SEK',
  notes TEXT,
  image_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processed, attached
  verification_id UUID REFERENCES public.verifications(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- User roles policies
CREATE POLICY "View own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Accounts policies
CREATE POLICY "Authenticated view accounts" ON public.accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage accounts" ON public.accounts FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Verifications policies
CREATE POLICY "Authenticated view verifications" ON public.verifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountants insert verifications" ON public.verifications FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::app_role[]));
CREATE POLICY "Accountants update verifications" ON public.verifications FOR UPDATE USING (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::app_role[]));
CREATE POLICY "Admins delete verifications" ON public.verifications FOR DELETE USING (public.has_role(auth.uid(),'admin'));

-- Verification lines policies (mirror parent)
CREATE POLICY "Authenticated view lines" ON public.verification_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountants manage lines" ON public.verification_lines FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::app_role[]));

-- Receipts policies
CREATE POLICY "Authenticated view receipts" ON public.receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Accountants insert receipts" ON public.receipts FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::app_role[]));
CREATE POLICY "Accountants update receipts" ON public.receipts FOR UPDATE USING (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::app_role[]));
CREATE POLICY "Admins delete receipts" ON public.receipts FOR DELETE USING (public.has_role(auth.uid(),'admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_verifications_updated BEFORE UPDATE ON public.verifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_receipts_updated BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- New user trigger: create profile + assign role (first user => admin, otherwise viewer)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage bucket for receipts
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false);

CREATE POLICY "Authenticated view receipt files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'receipts');
CREATE POLICY "Accountants upload receipt files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'receipts' AND public.has_any_role(auth.uid(), ARRAY['admin','accountant']::app_role[]));
CREATE POLICY "Accountants update receipt files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'receipts' AND public.has_any_role(auth.uid(), ARRAY['admin','accountant']::app_role[]));
CREATE POLICY "Admins delete receipt files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'receipts' AND public.has_role(auth.uid(),'admin'));
