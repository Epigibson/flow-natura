-- Natura Flow Initial Schema

-- Ensure UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Consultants (Consultoras)
-- Extending the default auth.users if needed, or a separate table
CREATE TABLE public.consultant_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    natura_code TEXT UNIQUE,
    level TEXT DEFAULT 'Semilla', -- Levels: Semilla, Bronce, Plata, Oro, Zafiro, Diamante
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Products Catalog (Catalogo Natura)
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL, -- Natura product code
    name TEXT NOT NULL,
    category TEXT, -- e.g., Perfumeria, Cuerpo, Rostro, etc.
    description TEXT,
    price DECIMAL(10, 2) NOT NULL, -- Suggested retail price
    cost DECIMAL(10, 2) NOT NULL, -- Consultant cost
    points INTEGER DEFAULT 0, -- Natura points
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Consultant Inventory (Stock Pronta Entrega)
CREATE TABLE public.inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultant_id UUID NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 0 CHECK (quantity >= 0),
    expiration_date DATE, -- Useful for Natura cosmetics
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(consultant_id, product_id)
);

-- 4. Customers (Clientes)
CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultant_id UUID NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    preferences TEXT, -- E.g., favorite scents, birthdays
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Orders (Ventas / Pedidos)
CREATE TYPE order_status AS ENUM ('pending', 'delivered', 'paid', 'cancelled');

CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultant_id UUID NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    status order_status DEFAULT 'pending',
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    payment_method TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Order Items (Detalle de Venta)
CREATE TABLE public.order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL, -- Price at the time of sale
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

ALTER TABLE public.consultant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Profiles: Consultants can read and update their own profile
CREATE POLICY "Consultants can view their own profile."
    ON public.consultant_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Consultants can insert their own profile."
    ON public.consultant_profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Consultants can update their own profile."
    ON public.consultant_profiles FOR UPDATE
    USING (auth.uid() = id);

-- Products: Everyone (authenticated) can view the product catalog
CREATE POLICY "Authenticated users can view products."
    ON public.products FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can insert products."
    ON public.products FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can update products."
    ON public.products FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can delete products."
    ON public.products FOR DELETE
    TO authenticated
    USING (true);

-- Inventory: Consultants manage their own inventory
CREATE POLICY "Consultants manage their own inventory."
    ON public.inventory FOR ALL
    USING (auth.uid() = consultant_id);

-- Customers: Consultants manage their own customers
CREATE POLICY "Consultants manage their own customers."
    ON public.customers FOR ALL
    USING (auth.uid() = consultant_id);

-- Orders: Consultants manage their own orders
CREATE POLICY "Consultants manage their own orders."
    ON public.orders FOR ALL
    USING (auth.uid() = consultant_id);

-- Order Items: Consultants manage items for their orders
CREATE POLICY "Consultants manage their own order items."
    ON public.order_items FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.orders 
            WHERE orders.id = order_items.order_id 
            AND orders.consultant_id = auth.uid()
        )
    );

-- ==========================================
-- TRIGGERS & FUNCTIONS
-- ==========================================

-- Function to handle an inventory decrement when an order is created/updated
-- We'll keep it simple: A function designed to be called perhaps manually or via RPC
-- so that inventory is reduced only when an order is 'delivered'

CREATE OR REPLACE FUNCTION update_inventory_on_delivery()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
        -- Deduct from inventory
        -- NOTE: For a real app, you might want more robust stock handling
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle an inventory decrement when an order is created/updated
-- Trigger for new user registration (bypasses RLS issues on frontend)
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
  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
