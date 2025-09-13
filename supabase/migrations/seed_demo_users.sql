-- Seed demo users for the Interactive English Tutor application
-- This script creates demo accounts for testing purposes

-- First, ensure we have the necessary permissions
GRANT ALL PRIVILEGES ON public.users TO anon;
GRANT ALL PRIVILEGES ON public.users TO authenticated;

-- Insert demo users into public.users table (our application users)
-- Note: The auth users will need to be created via the Supabase admin API
INSERT INTO public.users (
  id,
  email,
  full_name,
  role,
  age,
  grade_level,
  parent_id,
  created_at,
  updated_at
) VALUES 
  (
    '11111111-1111-1111-1111-111111111111',
    'child@demo.com',
    'Demo Child',
    'child',
    8,
    '3rd Grade',
    '22222222-2222-2222-2222-222222222222',
    NOW(),
    NOW()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'parent@demo.com',
    'Demo Parent',
    'parent',
    NULL,
    NULL,
    NULL,
    NOW(),
    NOW()
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'admin@demo.com',
  'Demo Admin',
  'admin',
    NULL,
    NULL,
    NULL,
    NOW(),
    NOW()
  );

-- Verify the demo users were created
SELECT 
  id,
  email,
  full_name,
  role,
  age,
  grade_level,
  parent_id
FROM public.users 
WHERE email IN ('child@demo.com', 'parent@demo.com', 'admin@demo.com')
ORDER BY role;