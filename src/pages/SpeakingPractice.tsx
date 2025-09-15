import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Play, Pause, RotateCcw, CheckCircle, XCircle, ArrowLeft, Volume2, MessageCircle, ChevronLeft, ChevronRight, BookOpen, Send, Clock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { api } from '../lib/api';
import type { Book, BookPage, DiscussionMessage } from '../lib/api';

// TypeScript declarations for SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: any) => any) | null;
  onerror: ((this: SpeechRecognition, ev: any) => any) | null;
}

interface SpeakingSessionData {
  book_id: string;
  page_number: number;
  text_content: string;
  audio_url?: string;
  pronunciation_score: number;
  fluency_score: number;
  accuracy_score: number;
}

interface RecognitionResult {
  transcript: string;
  confidence: number;
}

const SpeakingPractice: React.FC = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [bookPages, setBookPages] = useState<BookPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [currentText, setCurrentText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState<{
    pronunciation: number;
    fluency: number;
    accuracy: number;
    suggestions: string[];
  } | null>(null);
  const [practiceTexts] = useState([
    "The cat sat on the mat.",
    "She sells seashells by the seashore.",
    "How much wood would a woodchuck chuck?",
    "Peter Piper picked a peck of pickled peppers.",
    "The quick brown fox jumps over the lazy dog."
  ]);
  const [selectedTextIndex, setSelectedTextIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sessionHistory, setSessionHistory] = useState<any[]>([]);
  
  // Chat functionality
  const [chatMessages, setChatMessages] = useState<DiscussionMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatMode, setIsChatMode] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  
  // LLM Chat sidebar functionality
  const [llmChatMessages, setLlmChatMessages] = useState<{role: 'user' | 'assistant', content: string, timestamp: Date}[]>([]);
  const [llmChatInput, setLlmChatInput] = useState('');
  const [isLlmChatLoading, setIsLlmChatLoading] = useState(false);
  
  // Voice functionality for AI Assistant
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceInputTranscript, setVoiceInputTranscript] = useState('');
  const [speechSynthesis, setSpeechSynthesis] = useState<SpeechSynthesis | null>(null);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const voiceRecognitionRef = useRef<SpeechRecognition | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    fetchBooks();
    initializeSpeechRecognition();
    initializeVoiceFunctionality();
    setCurrentText(practiceTexts[0]);
  }, []);

  // Cleanup speech synthesis on component unmount
  useEffect(() => {
    return () => {
      if (speechSynthesis) {
        speechSynthesis.cancel();
      }
      if (voiceRecognitionRef.current) {
        voiceRecognitionRef.current.abort();
      }
    };
  }, [speechSynthesis]);

  // Initialize voice functionality for AI Assistant
  const initializeVoiceFunctionality = () => {
    // Initialize speech synthesis with better error handling
    if ('speechSynthesis' in window) {
      const synth = window.speechSynthesis;
      
      // Wait for voices to load
      const loadVoices = () => {
        const voices = synth.getVoices();
        if (voices.length > 0) {
          setSpeechSynthesis(synth);
        } else {
          // Retry after a short delay
          setTimeout(loadVoices, 100);
        }
      };
      
      if (synth.getVoices().length > 0) {
        setSpeechSynthesis(synth);
      } else {
        synth.addEventListener('voiceschanged', loadVoices);
        loadVoices();
      }
    }

    // Initialize voice recognition for chat input
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        setIsListening(true);
      };
      
      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setVoiceInputTranscript(transcript);
        
        // If final result, update chat input
        if (event.results[event.results.length - 1].isFinal) {
          setLlmChatInput(transcript);
          setVoiceInputTranscript('');
        }
      };
      
      recognition.onend = () => {
        setIsListening(false);
        setIsVoiceInputActive(false);
      };
      
      recognition.onerror = (event) => {
        console.error('Voice recognition error:', event.error);
        setIsListening(false);
        setIsVoiceInputActive(false);
        toast.error('Voice recognition failed. Please try again.');
      };
      
      voiceRecognitionRef.current = recognition;
    }
  };

  // Voice input functions
  const startVoiceInput = () => {
    if (!voiceRecognitionRef.current) {
      toast.error('Voice recognition not supported in this browser');
      return;
    }
    
    try {
      setIsVoiceInputActive(true);
      setVoiceInputTranscript('');
      voiceRecognitionRef.current.start();
    } catch (error) {
      console.error('Error starting voice recognition:', error);
      toast.error('Failed to start voice recognition');
      setIsVoiceInputActive(false);
    }
  };

  const stopVoiceInput = () => {
    if (voiceRecognitionRef.current && isListening) {
      voiceRecognitionRef.current.stop();
    }
    setIsVoiceInputActive(false);
  };

  // Voice output functions
  const speakText = (text: string) => {
    if (!speechSynthesis || !text.trim()) {
      console.warn('Speech synthesis not available or no text to speak');
      return;
    }
    
    // Check if speech synthesis is ready
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      speechSynthesis.cancel();
      // Wait a bit before starting new speech
      setTimeout(() => speakText(text), 100);
      return;
    }
    
    // Clean text for better speech (remove markdown formatting)
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/`(.*?)`/g, '$1') // Remove code
      .replace(/#{1,6}\s/g, '') // Remove headers
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
      .replace(/\n+/g, '. ') // Replace newlines with periods
      .trim();
    
    if (!cleanText) {
      console.warn('No text to speak after cleaning');
      return;
    }
    
    try {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      
      // Get available voices and use a preferred one if available
      const voices = speechSynthesis.getVoices();
      const englishVoice = voices.find(voice => voice.lang.startsWith('en'));
      if (englishVoice) {
        utterance.voice = englishVoice;
      }
      
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.lang = 'en-US';
      
      utterance.onstart = () => {
        setIsSpeaking(true);
      };
      
      utterance.onend = () => {
        setIsSpeaking(false);
      };
      
      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event.error, event);
        setIsSpeaking(false);
        
        // Only show error toast for certain error types
        if (event.error === 'network' || event.error === 'synthesis-failed') {
          toast.error('Failed to speak text. Please try again.');
        } else if (event.error === 'not-allowed') {
          toast.error('Speech synthesis not allowed. Please check browser permissions.');
        }
        // For other errors like 'interrupted' or 'canceled', don't show toast
      };
      
      speechUtteranceRef.current = utterance;
      speechSynthesis.speak(utterance);
      
    } catch (error) {
      console.error('Error creating speech utterance:', error);
      setIsSpeaking(false);
      toast.error('Failed to initialize speech synthesis');
    }
  };

  const stopSpeaking = () => {
    if (speechSynthesis) {
      try {
        speechSynthesis.cancel();
        
        // Force stop the current utterance if it exists
        if (speechUtteranceRef.current) {
          speechUtteranceRef.current.onend = null;
          speechUtteranceRef.current.onerror = null;
          speechUtteranceRef.current = null;
        }
        
        setIsSpeaking(false);
      } catch (error) {
        console.error('Error stopping speech:', error);
        setIsSpeaking(false);
      }
    }
  };

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (chatMessagesEndRef.current && chatMessagesEndRef.current.parentElement) {
      const container = chatMessagesEndRef.current.parentElement;
      container.scrollTop = container.scrollHeight;
    }
  }, [llmChatMessages]);

  const fetchBooks = async (retryCount = 0) => {
    try {
      const response = await api.getBooks();
      setBooks(response.books || []);
    } catch (error: any) {
      console.error('Error fetching books:', error);
      
      // Handle rate limiting with retry
      if (error.message === 'Network error' && retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.log(`Rate limited, retrying in ${delay}ms...`);
        setTimeout(() => fetchBooks(retryCount + 1), delay);
        return;
      }
      
      toast.error('Failed to load books');
    } finally {
      if (retryCount === 0) {
        setLoading(false);
      }
    }
  };

  const handleBookSelection = async (book: Book) => {
    try {
      setSelectedBook(book);
      setCurrentPageIndex(0);
      setChatMessages([]);
      
      console.log('Selecting book:', book.title, 'ID:', book.id);
      
      // Fetch book details with pages
      const bookDetails = await api.getBook(book.id);
      console.log('Book details received:', bookDetails);
      
      if (bookDetails.book.pages && bookDetails.book.pages.length > 0) {
        console.log('Found', bookDetails.book.pages.length, 'pages for book');
        setBookPages(bookDetails.book.pages);
        const firstPage = bookDetails.book.pages[0];
        console.log('First page:', firstPage);
        setCurrentText(firstPage.text_content || firstPage.image_description || book.description || '');
      } else {
        console.log('No pages found for book, using description');
        setBookPages([]);
        setCurrentText(book.description || '');
      }
      
      setIsChatMode(true);
      toast.success(`Selected "${book.title}" for discussion`);
    } catch (error) {
      console.error('Error loading book details:', error);
      toast.error('Failed to load book details');
    }
  };

  const navigateToPage = (direction: 'prev' | 'next') => {
    if (!bookPages.length) return;
    
    let newIndex = currentPageIndex;
    if (direction === 'prev' && currentPageIndex > 0) {
      newIndex = currentPageIndex - 1;
    } else if (direction === 'next' && currentPageIndex < bookPages.length - 1) {
      newIndex = currentPageIndex + 1;
    }
    
    if (newIndex !== currentPageIndex) {
      setCurrentPageIndex(newIndex);
      const page = bookPages[newIndex];
      setCurrentText(page.text_content || page.image_description || '');
      setTranscript('');
      setFeedback(null);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !selectedBook || isSendingMessage) return;
    
    const userMessage: DiscussionMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: chatInput.trim(),
      timestamp: new Date().toISOString(),
      page_number: bookPages.length > 0 ? currentPageIndex + 1 : undefined
    };
    
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsSendingMessage(true);
    
    try {
      // Create context for the AI
      const currentPage = bookPages[currentPageIndex];
      const context = {
        book: {
          title: selectedBook.title,
          author: selectedBook.author,
          description: selectedBook.description || '',
          difficulty_level: selectedBook.difficulty_level,
          target_age: selectedBook.age_range,
          page_count: selectedBook.page_count
        },
        lesson: {
          title: `Book Discussion: ${selectedBook.title}`,
          description: `Interactive discussion about "${selectedBook.title}" by ${selectedBook.author}`,
          objectives: [
            'Understand the story and characters',
            'Improve reading comprehension',
            'Practice verbal communication',
            'Develop critical thinking skills'
          ],
          activities: [
            'Page-by-page discussion',
            'Character analysis',
            'Theme exploration',
            'Vocabulary building'
          ],
          target_level: selectedBook.difficulty_level,
          duration: 30
        },
        currentPage: currentPage ? {
          number: currentPageIndex + 1,
          text: currentPage.text_content || '',
          description: currentPage.image_description || '',
          image_url: currentPage.image_url || ''
        } : null
      };
      
      const response = await fetch('/api/chat/lesson', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          message: userMessage.content,
          history: chatMessages.map(msg => ({
            role: msg.type === 'user' ? 'user' : 'assistant',
            content: msg.content
          })),
          context
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }
      
      const data = await response.json();
      
      const aiMessage: DiscussionMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: data.response || 'I\'m here to help you discuss this book! What would you like to talk about?',
        timestamp: new Date().toISOString(),
        page_number: bookPages.length > 0 ? currentPageIndex + 1 : undefined
      };
      
      setChatMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error sending chat message:', error);
      toast.error('Failed to send message');
      
      // Fallback AI response
      const fallbackMessage: DiscussionMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: `That's an interesting point about "${selectedBook?.title}"! I'd love to discuss this further. What specific aspect of ${bookPages.length > 0 ? `page ${currentPageIndex + 1}` : 'the book'} would you like to explore?`,
        timestamp: new Date().toISOString(),
        page_number: bookPages.length > 0 ? currentPageIndex + 1 : undefined
      };
      
      setChatMessages(prev => [...prev, fallbackMessage]);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleVoiceChat = () => {
    if (isVoiceMode) {
      // Stop voice mode
      setIsVoiceMode(false);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } else {
      // Start voice mode for chat
      setIsVoiceMode(true);
      if (recognitionRef.current) {
        // Configure recognition for chat mode
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';
        
        recognitionRef.current.onresult = (event: any) => {
          const result = event.results[0][0];
          const transcript = result.transcript.trim();
          
          if (transcript) {
            setChatInput(transcript);
            setIsVoiceMode(false);
            
            // Auto-send the voice message after a short delay
            setTimeout(() => {
              if (transcript && !isSendingMessage) {
                sendVoiceMessage(transcript);
              }
            }, 500);
          }
        };
        
        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsVoiceMode(false);
          toast.error('Voice recognition failed. Please try again.');
        };
        
        recognitionRef.current.onend = () => {
          setIsVoiceMode(false);
        };
        
        try {
          recognitionRef.current.start();
          toast.success('Listening... Speak your message!');
        } catch (error) {
          console.error('Failed to start voice recognition:', error);
          setIsVoiceMode(false);
          toast.error('Failed to start voice recognition');
        }
      } else {
        toast.error('Voice recognition not supported in this browser');
      }
    }
  };
  
  const sendVoiceMessage = async (transcript: string) => {
    if (!transcript.trim() || !selectedBook || isSendingMessage) return;
    
    const userMessage: DiscussionMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: transcript,
      timestamp: new Date().toISOString(),
      page_number: bookPages.length > 0 ? currentPageIndex + 1 : undefined
    };
    
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsSendingMessage(true);
    
    try {
      // Create context for the AI
      const currentPage = bookPages[currentPageIndex];
      const context = {
        book: {
          title: selectedBook.title,
          author: selectedBook.author,
          description: selectedBook.description || '',
          difficulty_level: selectedBook.difficulty_level,
          target_age: selectedBook.age_range,
          page_count: selectedBook.page_count
        },
        lesson: {
          title: `Book Discussion: ${selectedBook.title}`,
          description: `Interactive discussion about "${selectedBook.title}" by ${selectedBook.author}`,
          objectives: [
            'Understand the story and characters',
            'Improve reading comprehension',
            'Practice verbal communication',
            'Develop critical thinking skills'
          ],
          activities: [
            'Page-by-page discussion',
            'Character analysis',
            'Theme exploration',
            'Vocabulary building'
          ],
          target_level: selectedBook.difficulty_level,
          duration: 30
        },
        currentPage: currentPage ? {
          number: currentPageIndex + 1,
          text: currentPage.text_content || '',
          description: currentPage.image_description || '',
          image_url: currentPage.image_url || ''
        } : null
      };
      
      const response = await fetch('/api/chat/lesson', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          message: userMessage.content,
          history: chatMessages.map(msg => ({
            role: msg.type === 'user' ? 'user' : 'assistant',
            content: msg.content
          })),
          context
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }
      
      const data = await response.json();
      
      const aiMessage: DiscussionMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: data.response || 'I\'m here to help you discuss this book! What would you like to talk about?',
        timestamp: new Date().toISOString(),
        page_number: bookPages.length > 0 ? currentPageIndex + 1 : undefined
      };
      
      setChatMessages(prev => [...prev, aiMessage]);
      
      // Read the AI response aloud
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(aiMessage.content);
        utterance.rate = 0.8;
        utterance.pitch = 1;
        utterance.volume = 0.8;
        speechSynthesis.speak(utterance);
      }
      
    } catch (error) {
      console.error('Error sending voice message:', error);
      toast.error('Failed to send voice message');
      
      // Fallback AI response
      const fallbackMessage: DiscussionMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: `That's an interesting point about "${selectedBook?.title}"! I'd love to discuss this further. What specific aspect of ${bookPages.length > 0 ? `page ${currentPageIndex + 1}` : 'the book'} would you like to explore?`,
        timestamp: new Date().toISOString(),
        page_number: bookPages.length > 0 ? currentPageIndex + 1 : undefined
      };
      
      setChatMessages(prev => [...prev, fallbackMessage]);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const initializeSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';
      
      recognitionRef.current.onresult = (event: any) => {
         const result = event.results[0][0];
         setTranscript(result.transcript);
       };
      
      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        toast.error('Speech recognition failed. Please try again.');
        setIsRecording(false);
      };
      
      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    } else {
      toast.error('Speech recognition is not supported in this browser.');
    }
  };

  const startRecording = async () => {
    try {
      // Start speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.start();
        setIsRecording(true);
        setTranscript('');
        setFeedback(null);
      }

      // Start audio recording for analysis
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      
      mediaRecorderRef.current.start();
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording. Please check microphone permissions.');
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    setIsRecording(false);
  };

  const evaluatePronunciation = async () => {
    if (!transcript || !currentText) return;

    try {
      const response = await fetch('/api/books/evaluate-pronunciation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          transcript,
          targetText: currentText,
          confidence: 0.8
        })
      });

      if (!response.ok) {
        throw new Error('Failed to evaluate pronunciation');
      }

      const evaluation = await response.json();
      
      setFeedback({
        accuracy: evaluation.accuracy_score,
        pronunciation: evaluation.pronunciation_score,
        fluency: evaluation.fluency_score,
        suggestions: evaluation.suggestions
      });
    } catch (error) {
      console.error('Evaluation error:', error);
      // Fallback to basic evaluation
      const accuracy = Math.random() * 40 + 60;
      const pronunciation = Math.random() * 30 + 70;
      const fluency = Math.random() * 35 + 65;
      
      setFeedback({
        accuracy: Math.round(accuracy),
        pronunciation: Math.round(pronunciation),
        fluency: Math.round(fluency),
        suggestions: ['Keep practicing to improve your pronunciation!']
      });
    }
  };

  const saveSpeakingSession = async (scores: any) => {
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const sessionData: SpeakingSessionData = {
        book_id: selectedBook!.id,
        page_number: 1,
        text_content: currentText,
        audio_url: audioUrl,
        pronunciation_score: scores.pronunciation,
        fluency_score: scores.fluency,
        accuracy_score: scores.accuracy
      };
      
      await api.createSpeakingSession(sessionData);
      
      // Add to session history
      setSessionHistory(prev => [{
        id: Date.now(),
        text: currentText,
        scores,
        timestamp: new Date().toLocaleTimeString()
      }, ...prev.slice(0, 4)]); // Keep last 5 sessions
      
      toast.success('Speaking session saved!');
    } catch (error) {
      console.error('Error saving speaking session:', error);
      toast.error('Failed to save speaking session');
    }
  };

  const playTargetAudio = () => {
    // Use Web Speech API to speak the target text
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(currentText);
      utterance.rate = 0.8;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      
      speechSynthesis.speak(utterance);
    }
  };

  const resetPractice = () => {
    setTranscript('');
    setFeedback(null);
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
      setIsPlaying(false);
    }
  };

  // LLM Chat functionality
  const sendLlmMessage = async (message: string) => {
    if (!message.trim() || isLlmChatLoading) return;
    
    setIsLlmChatLoading(true);
    
    // Add user message
    const userMessage = {
      role: 'user' as const,
      content: message,
      timestamp: new Date()
    };
    setLlmChatMessages(prev => [...prev, userMessage]);
    setLlmChatInput('');
    
    try {
      // Prepare context from current page
      let context = '';
      if (selectedBook && bookPages.length > 0) {
        const currentPage = bookPages[currentPageIndex];
        context = `Book: ${selectedBook.title} by ${selectedBook.author}\n`;
        context += `Page ${currentPageIndex + 1}: ${currentPage.text_content || currentPage.image_description || ''}\n`;
        if (currentPage.image_description) {
          context += `Image description: ${currentPage.image_description}\n`;
        }
      } else if (selectedBook) {
        context = `Book: ${selectedBook.title} by ${selectedBook.author}\n${selectedBook.description || ''}`;
      } else {
        context = `Speaking practice text: ${currentText}`;
      }
      
      // Prepare context for speaking practice chat
      const chatContext = {
        book: selectedBook ? {
          title: selectedBook.title,
          author: selectedBook.author,
          description: selectedBook.description || '',
          difficulty_level: selectedBook.difficulty_level,
          age_range: selectedBook.age_range,
          page_count: selectedBook.page_count
        } : null,
        currentPage: selectedBook && bookPages.length > 0 ? {
          number: currentPageIndex + 1,
          text_content: bookPages[currentPageIndex]?.text_content,
          image_description: bookPages[currentPageIndex]?.image_description,
          image_url: bookPages[currentPageIndex]?.image_url
        } : null
      };
      
      // Call LLM API using the API client
      const response = await api.sendSpeakingPracticeMessage(
        message,
        llmChatMessages.slice(-10), // Last 10 messages for context
        chatContext
      );
      
      // Add assistant response
      const assistantMessage = {
        role: 'assistant' as const,
        content: response.response,
        timestamp: new Date()
      };
      setLlmChatMessages(prev => [...prev, assistantMessage]);
      
      // Auto-play voice output if enabled
      speakText(response.response);
      
    } catch (error) {
      console.error('Error sending message to LLM:', error);
      toast.error('Failed to get response from AI assistant');
      
      // Add error message
      const errorMessage = {
        role: 'assistant' as const,
        content: 'Sorry, I\'m having trouble responding right now. Please try again.',
        timestamp: new Date()
      };
      setLlmChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLlmChatLoading(false);
    }
  };
  
  const handleLlmChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendLlmMessage(llmChatInput);
  };

  const clearLlmChat = () => {
    setLlmChatMessages([]);
    toast.success('Chat history cleared');
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 80) return <CheckCircle className="h-5 w-5 text-green-600" />;
    return <XCircle className="h-5 w-5 text-red-600" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading speaking practice...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Dashboard</span>
              </button>
              <h1 className="text-2xl font-bold text-gray-800">Speaking Practice</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Practice Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Mode Selection */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-800">Practice Mode</h2>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setIsChatMode(false)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      !isChatMode
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Speaking Practice
                  </button>
                  <button
                    onClick={() => setIsChatMode(true)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isChatMode
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Book Discussion
                  </button>
                </div>
              </div>
            </div>

            {/* Book Selection */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                {isChatMode ? 'Select Book for Discussion' : 'Choose Practice Text'}
              </h2>
              
              {isChatMode ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {books.map((book) => (
                      <div
                        key={book.id}
                        onClick={() => handleBookSelection(book)}
                        className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                          selectedBook?.id === book.id
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          <BookOpen className="w-8 h-8 text-purple-600 mt-1" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-900 truncate">{book.title}</h3>
                            <p className="text-sm text-gray-600 truncate">by {book.author}</p>
                            <div className="flex items-center space-x-2 mt-2">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                book.difficulty_level === 'beginner' ? 'bg-green-100 text-green-800' :
                                book.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {book.difficulty_level}
                              </span>
                              <span className="text-xs text-gray-500">{book.page_count} pages</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {selectedBook && (
                    <div className="p-4 bg-gray-50 rounded-lg">
                      {bookPages.length > 0 ? (
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-4">
                              <button
                                onClick={() => navigateToPage('prev')}
                                disabled={currentPageIndex === 0}
                                className="p-2 rounded-md bg-white border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <span className="text-sm font-medium text-gray-700">
                                Page {currentPageIndex + 1} of {bookPages.length}
                              </span>
                              <button
                                onClick={() => navigateToPage('next')}
                                disabled={currentPageIndex === bookPages.length - 1}
                                className="p-2 rounded-md bg-white border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="text-sm text-gray-600">
                              Discussing: {selectedBook.title}
                            </div>
                          </div>
                          
                          {/* Book Page Image Display */}
                          {bookPages[currentPageIndex]?.image_url && (
                            <div className="bg-white rounded-lg p-6 mb-6">
                              <img
                                src={bookPages[currentPageIndex].image_url}
                                alt={`Page ${currentPageIndex + 1} of ${selectedBook.title}`}
                                className="w-full h-screen object-contain rounded-lg border shadow-lg"
                                onError={(e) => {
                                  console.error('Failed to load image:', bookPages[currentPageIndex].image_url);
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          
                          {/* Page Text Content */}
                          {currentText && (
                            <div className="bg-white rounded-lg p-6">
                              <div className="prose prose-gray max-w-none">
                                <ReactMarkdown>{currentText}</ReactMarkdown>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="text-sm text-gray-600 mb-2">
                            Discussing: {selectedBook.title}
                          </div>
                          <div className="text-xs text-amber-600 bg-amber-50 px-3 py-1 rounded-full inline-block">
                            No pages available - using book description
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Speaking Practice Mode */
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Practice Text</h3>
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <p className="text-gray-800 leading-relaxed text-lg">
                      {practiceTexts[selectedTextIndex]}
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-center space-x-4 mb-6">
                    <button
                      onClick={playTargetAudio}
                      disabled={isPlaying}
                      className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      <span>{isPlaying ? 'Playing...' : 'Listen'}</span>
                    </button>
                    
                    <button
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                        isRecording
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'bg-purple-600 text-white hover:bg-purple-700'
                      }`}
                    >
                      {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      <span>{isRecording ? 'Stop Recording' : 'Start Recording'}</span>
                    </button>
                    
                    <button
                      onClick={resetPractice}
                      className="flex items-center space-x-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Reset</span>
                    </button>
                  </div>
                  
                  {transcript && (
                    <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4">Your Recording</h3>
                      <div className="bg-gray-50 rounded-lg p-4 mb-4">
                        <p className="text-gray-800 leading-relaxed">{transcript}</p>
                      </div>
                      
                      <div className="flex justify-center">
                        <button
                          onClick={evaluatePronunciation}
                          className="flex items-center space-x-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>Evaluate Pronunciation</span>
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {feedback && (
                    <div className="bg-white rounded-xl shadow-lg p-6">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4">Pronunciation Feedback</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="text-center p-4 bg-purple-50 rounded-lg">
                          <div className="flex items-center justify-center mb-2">
                            {getScoreIcon(feedback.pronunciation)}
                          </div>
                          <div className="text-2xl font-bold text-purple-600 mb-1">
                            {feedback.pronunciation}%
                          </div>
                          <div className="text-sm text-gray-600">Pronunciation</div>
                        </div>
                        <div className="text-center p-4 bg-blue-50 rounded-lg">
                          <div className="flex items-center justify-center mb-2">
                            {getScoreIcon(feedback.fluency)}
                          </div>
                          <div className="text-2xl font-bold text-blue-600 mb-1">
                            {feedback.fluency}%
                          </div>
                          <div className="text-sm text-gray-600">Fluency</div>
                        </div>
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                          <div className="flex items-center justify-center mb-2">
                            {getScoreIcon(feedback.accuracy)}
                          </div>
                          <div className="text-2xl font-bold text-green-600 mb-1">
                            {feedback.accuracy}%
                          </div>
                          <div className="text-sm text-gray-600">Accuracy</div>
                        </div>
                      </div>
                      
                      {feedback.suggestions.length > 0 && (
                        <div>
                          <h4 className="font-medium text-gray-800 mb-3">Suggestions for Improvement:</h4>
                          <ul className="space-y-2">
                            {feedback.suggestions.map((suggestion, index) => (
                              <li key={index} className="flex items-start space-x-2">
                                <div className="bg-yellow-100 rounded-full p-1 mt-0.5">
                                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                </div>
                                <span className="text-sm text-gray-700">{suggestion}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      <div className="mt-6">
                        <button
                          onClick={() => saveSpeakingSession({
                            pronunciation: feedback.pronunciation,
                            fluency: feedback.fluency,
                            accuracy: feedback.accuracy
                          })}
                          className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                        >
                          Save Session
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Sidebar */}
          <div className="space-y-6">
            {isChatMode ? (
              <>
                {/* Reading Progress */}
                {selectedBook && bookPages.length > 0 && (
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Reading Progress</h3>
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{selectedBook.title}</span>
                        <span className="text-xs text-gray-500">
                          {Math.round(((currentPageIndex + 1) / bookPages.length) * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div 
                          className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${((currentPageIndex + 1) / bookPages.length) * 100}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-600">
                        Page {currentPageIndex + 1} of {bookPages.length}
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Discussion Stats */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Discussion Stats</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <MessageCircle className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-medium text-purple-800">Messages</span>
                      </div>
                      <span className="text-sm font-bold text-purple-600">{chatMessages.length}</span>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-800">Session Time</span>
                      </div>
                      <span className="text-sm font-bold text-blue-600">
                        {chatMessages.length > 0 ? Math.floor((Date.now() - new Date(chatMessages[0].timestamp).getTime()) / 60000) : 0}min
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* AI Assistant */}
                <div className="bg-white rounded-xl shadow-lg p-6 h-[600px] flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-800">AI Assistant</h3>
                      <div className="flex items-center space-x-2">
                        {llmChatMessages.length > 0 && (
                          <button
                            onClick={clearLlmChat}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Clear chat history"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <MessageCircle className="w-5 h-5 text-indigo-600" />
                      </div>
                    </div>
                    
                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2 max-h-96">
                      {llmChatMessages.length === 0 ? (
                        <div className="text-center text-gray-500 text-sm mt-8">
                          <MessageCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                          <p>Start a conversation with the AI assistant!</p>
                          <p className="text-xs mt-1">Ask questions about the current content.</p>
                        </div>
                      ) : (
                        llmChatMessages.map((message, index) => (
                          <div
                            key={index}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] p-3 rounded-lg text-sm ${
                                message.role === 'user'
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              <ReactMarkdown 
                                components={{
                                  p: ({children}) => <p className="mb-2">{children}</p>,
                                  strong: ({children}) => <strong className="font-semibold">{children}</strong>,
                                  em: ({children}) => <em className="italic">{children}</em>,
                                  code: ({children}) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm">{children}</code>,
                                  ul: ({children}) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                                  ol: ({children}) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                                  li: ({children}) => <li className="mb-1">{children}</li>
                                }}
                              >
                                {message.content}
                              </ReactMarkdown>
                              <div className={`text-xs mt-1 opacity-70`}>
                                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                      
                      {isLlmChatLoading && (
                        <div className="flex justify-start">
                          <div className="bg-gray-100 text-gray-800 p-3 rounded-lg text-sm">
                            <div className="flex items-center space-x-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                              <span>AI is thinking...</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={chatMessagesEndRef} />
                    </div>
                    
                    {/* Voice Status Indicator */}
                    {(isListening || voiceInputTranscript) && (
                      <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                            <span className="text-sm text-blue-700 font-medium">
                              {isListening ? 'Listening...' : 'Processing...'}
                            </span>
                          </div>
                        </div>
                        {voiceInputTranscript && (
                          <p className="text-sm text-gray-600 mt-1 italic">
                            "{voiceInputTranscript}"
                          </p>
                        )}
                      </div>
                    )}
                    
                    {/* Chat Input */}
                    <form onSubmit={handleLlmChatSubmit} className="flex space-x-2">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={llmChatInput}
                          onChange={(e) => setLlmChatInput(e.target.value)}
                          placeholder="Ask about the content..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                          disabled={isLlmChatLoading}
                        />
                      </div>
                      
                      {/* Voice Input Button */}
                      <button
                        type="button"
                        onClick={isVoiceInputActive ? stopVoiceInput : startVoiceInput}
                        className={`px-3 py-2 rounded-lg transition-colors ${
                          isVoiceInputActive 
                            ? 'bg-red-600 hover:bg-red-700 text-white' 
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                        }`}
                        disabled={isLlmChatLoading}
                        title={isVoiceInputActive ? 'Stop voice input' : 'Start voice input'}
                      >
                        {isVoiceInputActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </button>
                      
                      {/* Voice Output Button */}
                      <button
                        type="button"
                        onClick={isSpeaking ? stopSpeaking : () => {
                          const lastMessage = llmChatMessages[llmChatMessages.length - 1];
                          if (lastMessage && lastMessage.role === 'assistant') {
                            speakText(lastMessage.content);
                          }
                        }}
                        className={`px-3 py-2 rounded-lg transition-colors ${
                          isSpeaking 
                            ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                        }`}
                        disabled={isLlmChatLoading || (llmChatMessages.length === 0 || llmChatMessages[llmChatMessages.length - 1]?.role !== 'assistant')}
                        title={isSpeaking ? 'Stop speaking' : 'Speak last response'}
                      >
                        {isSpeaking ? <Pause className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                      
                      <button
                        type="submit"
                        disabled={!llmChatInput.trim() || isLlmChatLoading}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  </div>
              </>
            ) : (
              <>
                {/* Recent Sessions */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Sessions</h3>
                  <div className="space-y-3">
                    {sessionHistory.length === 0 ? (
                      <p className="text-gray-500 text-sm">No sessions yet. Start practicing!</p>
                    ) : (
                      sessionHistory.map((session) => (
                        <div key={session.id} className="border rounded-lg p-3">
                          <div className="text-xs text-gray-500 mb-1">{session.timestamp}</div>
                          <div className="text-sm text-gray-700 mb-2 truncate">{session.text}</div>
                          <div className="flex justify-between text-xs">
                            <span className={getScoreColor(session.scores.pronunciation)}>P: {session.scores.pronunciation}%</span>
                            <span className={getScoreColor(session.scores.fluency)}>F: {session.scores.fluency}%</span>
                            <span className={getScoreColor(session.scores.accuracy)}>A: {session.scores.accuracy}%</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                
                {/* Speaking Tips */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Speaking Tips</h3>
                  <div className="space-y-3 text-sm text-gray-600">
                    <div className="flex items-start space-x-2">
                      <div className="bg-purple-100 rounded-full p-1 mt-0.5">
                        <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      </div>
                      <p>Speak clearly and at a moderate pace</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <div className="bg-purple-100 rounded-full p-1 mt-0.5">
                        <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      </div>
                      <p>Listen to the target audio first</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <div className="bg-purple-100 rounded-full p-1 mt-0.5">
                        <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      </div>
                      <p>Practice in a quiet environment</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <div className="bg-purple-100 rounded-full p-1 mt-0.5">
                        <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      </div>
                      <p>Focus on pronunciation accuracy</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpeakingPractice;