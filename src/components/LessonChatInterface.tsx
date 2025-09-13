import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageCircle, Loader2, BookOpen, Target } from 'lucide-react';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  cover_image_url?: string;
  target_age_min: number;
  target_age_max: number;
  difficulty_level: string;
  page_count: number;
}

interface LessonContext {
  id: string;
  title: string;
  description: string;
  objectives: string[];
  activities: any[];
  targetLevel: string;
  duration: number;
}

interface LessonChatInterfaceProps {
  book: Book;
  lessonContext: LessonContext;
  className?: string;
}

const LessonChatInterface: React.FC<LessonChatInterfaceProps> = ({
  book,
  lessonContext,
  className = ''
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Add welcome message when component mounts
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage: Message = {
        id: 'welcome',
        content: `Hi! I'm your AI tutor for the lesson "${lessonContext.title}". We'll be working with the book "${book.title}" by ${book.author}. I'm here to help you achieve the lesson objectives and guide you through the activities. What would you like to start with?`,
        isUser: false,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, [book, lessonContext, messages.length]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage.trim(),
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    setIsTyping(true);

    try {
      // Prepare the context for the AI
      const systemContext = {
        book: {
          title: book.title,
          author: book.author,
          description: book.description,
          difficulty_level: book.difficulty_level,
          target_age: `${book.target_age_min}-${book.target_age_max}`,
          page_count: book.page_count
        },
        lesson: {
          title: lessonContext.title,
          description: lessonContext.description,
          objectives: lessonContext.objectives,
          activities: lessonContext.activities,
          target_level: lessonContext.targetLevel,
          duration: lessonContext.duration
        }
      };

      // Convert messages to conversation history
      const conversationHistory = messages.map(msg => ({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.content
      }));

      // Call the AI API with lesson context
      const response = await fetch('/api/chat/lesson', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          message: userMessage.content,
          history: conversationHistory,
          context: systemContext
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();
      
      // Simulate typing delay
      setTimeout(() => {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: data.response,
          isUser: false,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMessage]);
        setIsTyping(false);
      }, 1000);
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I'm sorry, I'm having trouble responding right now. Please try again!",
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsTyping(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getSuggestedQuestions = () => {
    const baseQuestions = [
      "Can you explain the lesson objectives?",
      "What should I focus on in this book?",
      "Help me understand the main characters",
      "What's the main theme of this story?",
      "Can you guide me through the activities?"
    ];

    const objectiveQuestions = lessonContext.objectives.slice(0, 2).map(obj => 
      `Help me with: ${obj}`
    );

    return [...baseQuestions, ...objectiveQuestions];
  };

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <MessageCircle className="w-5 h-5 text-purple-600" />
            <BookOpen className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">AI Lesson Tutor</h3>
            <p className="text-sm text-gray-600">
              {lessonContext.title} • {book.title}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 text-xs text-gray-500">
          <Target className="w-4 h-4" />
          <span>{lessonContext.objectives.length} objectives</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-3 ${message.isUser
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-800'
                }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              <p className={`text-xs mt-1 ${message.isUser ? 'text-purple-100' : 'text-gray-500'
                }`}>
                {formatTime(message.timestamp)}
              </p>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-3 max-w-[80%]">
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-xs text-gray-500">AI tutor is thinking...</span>
              </div>
            </div>
          </div>
        )}

        {/* Suggested questions */}
        {messages.length <= 1 && !isTyping && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 font-medium flex items-center">
              <Target className="w-4 h-4 mr-1" />
              Suggested questions to get started:
            </p>
            <div className="grid grid-cols-1 gap-2">
              {getSuggestedQuestions().slice(0, 4).map((question, index) => (
                <button
                  key={index}
                  onClick={() => setInputMessage(question)}
                  className="block w-full text-left text-sm text-purple-600 hover:text-purple-800 hover:bg-purple-50 p-3 rounded-lg border border-purple-200 transition-colors"
                >
                  {question}
                </button>
              ))}
            </div>
            
            {/* Show lesson objectives */}
            {lessonContext.objectives.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-800 mb-2">Lesson Objectives:</p>
                <ul className="text-sm text-blue-700 space-y-1">
                  {lessonContext.objectives.map((objective, index) => (
                    <li key={index} className="flex items-start">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                      {objective}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Quick actions during conversation */}
        {messages.length > 1 && !isTyping && (
          <div className="border-t pt-3 mt-4">
            <p className="text-xs text-gray-500 mb-2">Quick actions:</p>
            <div className="flex flex-wrap gap-2">
              {[
                "Explain this concept",
                "Give me an example",
                "Check my understanding",
                "What's next?",
                "Summarize our progress"
              ].map((action, index) => (
                <button
                  key={index}
                  onClick={() => setInputMessage(action)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded-full transition-colors"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4 bg-gray-50">
        <div className="flex space-x-3">
          <input
            ref={inputRef}
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me about the lesson or book..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LessonChatInterface;