/**
 * Route for regenerating image descriptions
 */
import { Router, type Request, type Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticateToken } from '../utils/jwt';

const router = Router();

router.post('/:bookId/pages/:pageId/regenerate-description', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    console.log(`Regenerating description for page ${req.params.pageId}`);
    const { pageId } = req.params;

    // 1. Fetch the page to get the image URL
    const { data: page, error: pageError } = await supabase
      .from('book_pages')
      .select('id, image_url')
      .eq('id', pageId)
      .single();

    if (pageError || !page) {
      res.status(404).json({ error: 'Book page not found' });
      return;
    }

    const { image_url } = page;

    // 2. Analyze the image with OpenAI
    let newDescription = null;
    try {
      const openaiConfig = process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : null;

      if (openaiConfig) {
        const { OpenAI } = await import('openai');
        const openai = new OpenAI(openaiConfig);

        const response = await openai.chat.completions.create({
          model: process.env.OPENAI_VISION_MODEL || 'gpt-4-turbo',
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Analyze this children's book page image. Provide a detailed, educational description suitable for English language learners. Focus on objects, characters, actions, and educational content. Keep it age-appropriate and engaging."
                },
                {
                  type: "image_url",
                  image_url: {
                    url: image_url,
                  }
                }
              ]
            }
          ],
          max_tokens: 1024
        });
        
        newDescription = response.choices[0]?.message?.content || null;
      }
    } catch (error) {
      console.log('AI image analysis failed:', error.message);
      res.status(500).json({ error: 'Failed to analyze image' });
      return;
    }

    if (!newDescription) {
      res.status(500).json({ error: 'Failed to generate new description' });
      return;
    }

    // 3. Update the page with the new description
    const { data: updatedPage, error: updateError } = await supabase
      .from('book_pages')
      .update({ image_description: newDescription })
      .eq('id', pageId)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update page with new description:', updateError);
      res.status(500).json({ error: 'Failed to save new description' });
      return;
    }

    res.json({
      message: 'Description regenerated successfully',
      description: newDescription
    });

  } catch (error) {
    console.error('Regenerate description error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
