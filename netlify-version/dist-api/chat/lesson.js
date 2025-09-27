import { authenticateToken } from '../utils/jwt.js';
// Mock AI response function - replace with actual AI service integration
const generateAIResponse = async (message, _history, context) => {
    // Create a comprehensive system prompt with lesson and book context
    /* const systemPrompt = `You are an AI tutor helping a student with a specific lesson. Here's the context:
  
  LESSON INFORMATION:
  - Title: ${context.lesson.title}
  - Description: ${context.lesson.description}
  - Target Level: ${context.lesson.target_level}
  - Duration: ${context.lesson.duration} minutes
  - Learning Objectives:
  ${context.lesson.objectives.map(obj => `  • ${obj}`).join('\n')}
  - Activities:
  ${context.lesson.activities.map(activity => `  • ${typeof activity === 'string' ? activity : activity.description || activity.type || 'Activity'}`).join('\n')}
  
  BOOK INFORMATION (use as context, don't repeat descriptions):
  - Title: "${context.book.title}" by ${context.book.author}
  - Description: ${context.book.description}
  - Difficulty Level: ${context.book.difficulty_level}
  - Target Age: ${context.book.target_age} years
  - Page Count: ${context.book.page_count} pages
  
  Your role is to:
  1. Help the student achieve the lesson objectives
  2. Guide them through the lesson activities
  3. Use the book content to support learning (but don't repeat full descriptions)
  4. Provide age-appropriate explanations
  5. Encourage critical thinking and engagement
  6. Ask questions to check understanding
  7. Relate book content to lesson goals
  
  IMPORTANT: Use the book description as context to understand the story, but don't output the full description to students. Instead, ask engaging questions and guide discussion based on your understanding of the content.
  
  Be encouraging, patient, and educational. Tailor your responses to the student's level and the lesson objectives.`; */
    // Simple mock responses based on common patterns
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('objective') || lowerMessage.includes('goal')) {
        return `Great question! Let's focus on our lesson objectives for "${context.lesson.title}". We have ${context.lesson.objectives.length} main goals:\n\n${context.lesson.objectives.map((obj, i) => `${i + 1}. ${obj}`).join('\n')}\n\nWhich of these would you like to explore first using our book "${context.book.title}"?`;
    }
    if (lowerMessage.includes('activity') || lowerMessage.includes('activities')) {
        return `Perfect! Let's look at the activities planned for this lesson. We have several engaging activities that will help us work with "${context.book.title}":\n\n${context.lesson.activities.map((activity, i) => `${i + 1}. ${typeof activity === 'string' ? activity : activity.description || activity.type || 'Activity'}`).join('\n')}\n\nWhich activity sounds most interesting to you?`;
    }
    if (lowerMessage.includes('book') || lowerMessage.includes('story') || lowerMessage.includes(context.book.title.toLowerCase())) {
        return `Excellent! "${context.book.title}" by ${context.book.author} is a wonderful ${context.book.difficulty_level}-level book that's perfect for our lesson "${context.lesson.title}". This book will help us achieve our learning objectives. What aspect of the story would you like to explore first?`;
    }
    // Include current page context in responses
    const pageContext = context.currentPage ? `\n\nOn page ${context.currentPage.number}, we're reading: "${context.currentPage.text || context.currentPage.description}"` : '';
    if (lowerMessage.includes('character') || lowerMessage.includes('who')) {
        return `Great question about the characters! Understanding characters is key to our lesson objectives. In "${context.book.title}", let's think about:${pageContext}\n\n• Who are the main characters?\n• What are their motivations?\n• How do they change throughout the story?\n• How do they relate to our lesson goals?\n\nLooking at ${context.currentPage ? `page ${context.currentPage.number}` : 'what we\'ve read'}, what do you think about the main character so far?`;
    }
    if (lowerMessage.includes('theme') || lowerMessage.includes('lesson') || lowerMessage.includes('meaning')) {
        return `Excellent thinking! Identifying themes connects perfectly with our lesson "${context.lesson.title}". In "${context.book.title}", we can explore several important themes that align with our objectives:${pageContext}\n\n${context.lesson.objectives.slice(0, 2).map(obj => `• ${obj}`).join('\n')}\n\nWhat themes do you notice in ${context.currentPage ? `this page` : 'the story'}? How do they connect to what we're learning?`;
    }
    if (lowerMessage.includes('page') || lowerMessage.includes('image') || lowerMessage.includes('picture')) {
        if (context.currentPage) {
            return `Great question about page ${context.currentPage.number}! ${pageContext}\n\n${context.currentPage.image_url ? 'The illustration on this page helps us understand the story better. ' : ''}Let's discuss what's happening here. \n\nWhat do you notice about this part of the story? How does it connect to what we've read before?`;
        }
    }
    if (lowerMessage.includes('help') || lowerMessage.includes('explain') || lowerMessage.includes('understand')) {
        return `I'm here to help! Let's break this down step by step. Based on our lesson "${context.lesson.title}" and the book "${context.book.title}", I can help you with:\n\n• Understanding the story and characters\n• Connecting the book to our lesson objectives\n• Working through our planned activities\n• Explaining difficult concepts\n• Checking your understanding\n\nWhat specific part would you like me to explain?`;
    }
    if (lowerMessage.includes('next') || lowerMessage.includes('what now')) {
        return `Great progress! Let's continue with our lesson. Based on where we are, here are some good next steps:\n\n• Dive deeper into one of our lesson objectives\n• Try one of our planned activities\n• Explore a specific part of "${context.book.title}"\n• Discuss what you've learned so far\n\nWhat feels like the right next step for you?`;
    }
    if (lowerMessage.includes('summary') || lowerMessage.includes('progress')) {
        return `Let's review our progress on the lesson "${context.lesson.title}"! \n\nWe're working with "${context.book.title}" to achieve our learning objectives. So far, we've been exploring the story and connecting it to our goals. \n\nOur main objectives are:\n${context.lesson.objectives.map((obj, i) => `${i + 1}. ${obj}`).join('\n')}\n\nWhat part of the lesson has been most interesting to you so far?`;
    }
    // Default response
    return `That's a thoughtful question! In our lesson "${context.lesson.title}", we're exploring "${context.book.title}" to achieve our learning objectives. ${pageContext}\n\nLet me help you think about this in relation to our goals. Can you tell me more about what you're thinking, or would you like me to guide you through one of our lesson activities?`;
};
export const lessonChat = async (req, res) => {
    try {
        const { message, history, context } = req.body;
        if (!message || !context || !context.book || !context.lesson) {
            return res.status(400).json({
                error: 'Missing required fields: message, context with book and lesson information'
            });
        }
        // Validate context structure
        if (!context.book.title || !context.lesson.title) {
            return res.status(400).json({
                error: 'Invalid context: book and lesson must have titles'
            });
        }
        // Generate AI response with lesson context
        const aiResponse = await generateAIResponse(message, history || [], context);
        res.json({
            response: aiResponse,
            context: {
                lesson_title: context.lesson.title,
                book_title: context.book.title
            }
        });
    }
    catch (error) {
        console.error('Error in lesson chat:', error);
        res.status(500).json({
            error: 'Failed to generate response',
            message: 'An error occurred while processing your message. Please try again.'
        });
    }
};
// Apply authentication middleware
export default [authenticateToken, lessonChat];
