import { Hono } from 'hono';
import { createSupabaseClient } from './config/supabase';
import { verifyToken } from './utils/jwt';

type PagesBindings = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  JWT_SECRET: string;
  OPENAI_API_KEY: string;
  OPENAI_VISION_MODEL: string;
  OPENAI_BASE_URL?: string;
};

const pages = new Hono<{ Bindings: PagesBindings }>();

// Upload pages for a book (PDF to images)
pages.post('/:bookId/pages', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Authorization token required' }, 401);
    }

    const token = authHeader.slice(7);
    const secret = c.env.JWT_SECRET;
    if (!secret) {
      return c.json({ error: 'JWT secret not configured' }, 500);
    }

    const payload = await verifyToken(token, secret);
    if (!payload) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: 'Book ID is required' }, 400);
    }

    const userId = payload.userId;
    const supabase = createSupabaseClient(c.env);

    // Verify book exists and user has permission
    const { data: bookData, error: bookError } = await supabase
      .from('books')
      .select('id, uploaded_by')
      .eq('id', bookId)
      .single();

    if (bookError || !bookData) {
      return c.json({ error: 'Book not found' }, 404);
    }

    if (bookData.uploaded_by !== userId) {
      return c.json({ error: 'Permission denied' }, 403);
    }

    // Get form data
    const formData = await c.req.formData();
    const files = formData.getAll('pages') as File[];

    if (!files || files.length === 0) {
      return c.json({ error: 'No files uploaded' }, 400);
    }

    const uploadedPages: Array<{ id: string; page_number: number; image_url: string; filename: string }> = [];
    const failedUploads: Array<{ filename: string; error: string }> = [];

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          failedUploads.push({ filename: file.name, error: 'Invalid file type. Only images are allowed.' });
          continue;
        }

        // Parse page number from filename (e.g., page-5.png)
        let pageNumber = i + 1;
        const pageMatch = file.name.match(/page-(\d+)\./);
        if (pageMatch) {
          pageNumber = parseInt(pageMatch[1], 10);
        }

        // Check if page already exists
        const { data: existingPage } = await supabase
          .from('book_pages')
          .select('id')
          .eq('book_id', bookId)
          .eq('page_number', pageNumber)
          .single();

        if (existingPage) {
          failedUploads.push({ filename: file.name, error: `Page ${pageNumber} already exists` });
          continue;
        }

        // Generate unique filename
        const fileExtension = file.name.split('.').pop();
        const fileName = `${Date.now()}-${pageNumber}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
        const filePath = `book-pages/${bookId}/${fileName}`;

        // Convert file to buffer
        const buffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(buffer);

        // Upload file to Supabase Storage
        const { data: _uploadData, error: uploadError } = await supabase.storage
          .from('book-files')
          .upload(filePath, uint8Array, {
            contentType: file.type,
            upsert: false
          });

        if (uploadError) {
          failedUploads.push({ filename: file.name, error: uploadError.message });
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('book-files')
          .getPublicUrl(filePath);

        // Analyze image with AI (optional, non-blocking)
        let imageDescription: string | null = null;
        try {
          const openaiApiKey = c.env.OPENAI_API_KEY;
          const openaiVisionModel = c.env.OPENAI_VISION_MODEL || 'gpt-4-vision-preview';

          if (openaiApiKey) {
            // Use the configured base URL or default to OpenAI
            const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
            const apiUrl = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;

            // Efficient base64 conversion without spreading array
            const base64Data = btoa(
              String.fromCharCode.apply(null, Array.from(uint8Array))
            );
            
            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${openaiApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: openaiVisionModel,
                messages: [
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'text',
                        text: "Analyze this children's book page image. Provide a detailed, educational description suitable for English language learners. Focus on objects, characters, actions, and educational content. Keep it age-appropriate and engaging."
                      },
                      {
                        type: 'image_url',
                        image_url: {
                          url: `data:${file.type};base64,${base64Data}`
                        }
                      }
                    ]
                  }
                ],
                max_tokens: 1000
              }),
              signal: AbortSignal.timeout(30000) // 30 second timeout
            });

            if (response.ok) {
              const aiResponse = await response.json() as {
                choices: Array<{
                  message: {
                    content: string;
                  };
                }>;
              };
              imageDescription = aiResponse.choices[0]?.message?.content || null;
            } else {
              console.log('AI image analysis failed during upload:', response.status, response.statusText);
            }
          }
        } catch (error) {
          console.log('AI image analysis failed during upload, continuing without description:', error instanceof Error ? error.message : String(error));
          // Continue without description - this is optional
        }

        // Create page record
        const { data: pageData, error: pageError } = await supabase
          .from('book_pages')
          .insert({
            book_id: bookId,
            page_number: pageNumber,
            image_url: urlData.publicUrl,
            image_description: imageDescription
          })
          .select()
          .single();

        if (pageError) {
          // Clean up uploaded file if database insert fails
          await supabase.storage.from('book-files').remove([filePath]);
          failedUploads.push({ filename: file.name, error: 'Database error' });
          continue;
        }

        uploadedPages.push({
          id: pageData.id,
          page_number: pageData.page_number,
          image_url: pageData.image_url,
          filename: file.name
        });
      } catch (error) {
        failedUploads.push({ filename: file.name, error: 'Processing error' });
      }
    }

    return c.json({
      message: `Uploaded ${uploadedPages.length} pages successfully`,
      uploaded_pages: uploadedPages,
      failed_uploads: failedUploads,
      total_files: files.length,
      successful_uploads: uploadedPages.length,
      failed_uploads_count: failedUploads.length
    }, 201);
  } catch (error) {
    console.error('Upload pages error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default pages;
