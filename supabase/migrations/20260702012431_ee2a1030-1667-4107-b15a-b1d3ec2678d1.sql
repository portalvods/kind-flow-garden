
ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'analyzing';
ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'fixed';
