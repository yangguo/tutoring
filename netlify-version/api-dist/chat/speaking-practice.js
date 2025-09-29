"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.speakingPracticeChat = void 0;
const jwt_js_1 = require("../utils/jwt.js");
// AI response function for speaking practice context
const generateSpeakingPracticeResponse = async (message, history, context) => {
    // Check if OpenAI configuration is available
    if (!process.env.OPENAI_BASE_URL ||
        !process.env.OPENAI_API_KEY ||
        process.env.OPENAI_API_KEY === 'your-openai-api-key-here' ||
        process.env.OPENAI_API_KEY.length < 10) {
        throw new Error('OpenAI API configuration is missing or invalid. Please check OPENAI_BASE_URL and OPENAI_API_KEY environment variables.');
    }
    try {
        // Create system prompt for speaking practice
        const pageContentInfo = context.currentPage.text_content || context.currentPage.image_description || 'No content available';
        const systemPrompt = `You are an AI English tutor helping a student with speaking practice.

CONTEXT:
- Book: "${context.book.title}" by ${context.book.author}
- Current Page: ${context.currentPage.number}
- Student Level: ${context.book.difficulty_level}
- Target Age: ${context.book.age_range} years
- Page Content: ${pageContentInfo}

Your role:
1. Have natural conversations about the book content on this specific page
2. Ask engaging questions about what they see or read on this page
3. Provide vocabulary help when needed
4. Give positive, encouraging feedback
5. Keep responses concise and conversational
6. Focus on building speaking confidence

IMPORTANT: Keep responses short (2-3 sentences max). Reference the specific page content when asking questions. Encourage the student to describe what they see, read, or think about this page.`;
        // Prepare messages for OpenAI
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-10), // Keep last 10 messages for context
            { role: 'user', content: message }
        ];
        const response = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
                messages,
                max_tokens: 500,
                temperature: 0.7
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenAI API error:', response.status, response.statusText, errorText);
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        const content = data.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No content received from OpenAI API');
        }
        return content;
    }
    catch (error) {
        console.error('Error calling OpenAI API:', error);
        throw error;
    }
};
const speakingPracticeChat = async (req, res) => {
    try {
        const { message, history = [], context } = req.body;
        // Validate required fields
        if (!message || !context || !context.book || !context.currentPage) {
            return res.status(400).json({
                error: 'Missing required fields: message, context.book, and context.currentPage are required'
            });
        }
        // Generate AI response
        const aiResponse = await generateSpeakingPracticeResponse(message, history, context);
        res.json({
            success: true,
            response: aiResponse,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Error in speaking practice chat:', error);
        res.status(500).json({
            error: 'Failed to process chat message',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
exports.speakingPracticeChat = speakingPracticeChat;
exports.default = [jwt_js_1.authenticateToken, exports.speakingPracticeChat];
//# sourceMappingURL=speaking-practice.js.map