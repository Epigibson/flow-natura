-- Subscriptions table for SaaS plan management
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultant_id UUID NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan TEXT NOT NULL DEFAULT 'trial',  -- trial, basico, pro, premium
    billing_period TEXT DEFAULT 'monthly', -- monthly, annual
    status TEXT NOT NULL DEFAULT 'trialing', -- trialing, active, past_due, canceled, unpaid
    trial_ends_at TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(consultant_id),
    UNIQUE(stripe_customer_id),
    UNIQUE(stripe_subscription_id)
);

-- RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Consultants can read their own subscription
CREATE POLICY "Read own subscription"
    ON public.subscriptions FOR SELECT
    USING (auth.uid() = consultant_id);

-- Service role (webhooks) can do everything (bypasses RLS automatically)
-- No INSERT/UPDATE policy needed for end users — only webhooks write

-- Extend handle_new_user to auto-create trial subscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.consultant_profiles (id, full_name, natura_code, level)
  VALUES (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'natura_code',
    'Semilla'
  );

  -- Auto-create 15-day trial subscription
  INSERT INTO public.subscriptions (consultant_id, plan, status, trial_ends_at)
  VALUES (
    new.id,
    'trial',
    'trialing',
    now() + interval '15 days'
  );

  RETURN new;
END;
$$;
