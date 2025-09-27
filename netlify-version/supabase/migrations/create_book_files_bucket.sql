-- Create storage bucket for book files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'book-files',
  'book-files',
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for authenticated users to upload files
CREATE POLICY "Authenticated users can upload book files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'book-files');

-- Create storage policy for public read access
CREATE POLICY "Public read access for book files" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'book-files');

-- Create storage policy for users to delete their own files
CREATE POLICY "Users can delete their own book files" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'book-files' AND owner::uuid = auth.uid());