import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  BookOpen,
  Star,
  Eye,
  EyeOff,
  Sparkles,
  Volume1,
  Contrast,
  MessageCircle,
  RefreshCw
} from 'lucide-react';
import { api, Book, BookPage, VocabularyWord, DiscussionMessage } from '../lib/api';
import ChatInterface from '../components/ChatInterface';
import { convertPdfFileToImages } from '../lib/pdf';



interface ReadingSessionData {
  book_id: string;
  pages_read: number[];
  time_spent: number;
  comprehension_score?: number;
}

const ReadingSession: React.FC = () => {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<BookPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [highlightedText, setHighlightedText] = useState<string>('');
  
  // Current page based on index
  const currentPage = pages[currentPageIndex];
  const [sessionStartTime] = useState(Date.now());
  const [readPages, setReadPages] = useState<Set<number>>(new Set());
  const [showVocabulary, setShowVocabulary] = useState(false);
  const [vocabularyWords, setVocabularyWords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImageDescription, setShowImageDescription] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [imageDescriptions, setImageDescriptions] = useState<Record<string, string>>({});
  const [highContrastMode, setHighContrastMode] = useState(false);
  const [autoReadDescriptions, setAutoReadDescriptions] = useState(false);
  const [showDiscussion, setShowDiscussion] = useState(false);
  const [discussionMessages, setDiscussionMessages] = useState<DiscussionMessage[]>([]);
  const [loadingDiscussion, setLoadingDiscussion] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [convertingPdf, setConvertingPdf] = useState(false);
  const [conversionMessage, setConversionMessage] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string | undefined>();

  useEffect(() => {
    if (bookId) {
      fetchBookData();
      fetchVocabulary();
    }
  }, [bookId]);

  useEffect(() => {
    const handleVoicesChanged = () => {
      setVoices(speechSynthesis.getVoices());
    };
    speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
    handleVoicesChanged(); // Initial load
    return () => speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
  }, []);

  // Load discussion history when component mounts
  useEffect(() => {
    if (book?.id) {
      loadDiscussionHistory();
    }
  }, [book?.id]);

  const loadDiscussionHistory = async () => {
    if (!book?.id) return;
    
    try {
      const response = await api.getBookDiscussions(book.id);
      const messages: DiscussionMessage[] = [];
      
      response.discussions.forEach(discussion => {
        messages.push({
          id: `${discussion.id}-user`,
          type: 'user',
          content: discussion.user_message,
          timestamp: discussion.created_at,
          page_number: discussion.page_number
        });
        messages.push({
          id: `${discussion.id}-ai`,
          type: 'ai',
          content: discussion.ai_response,
          timestamp: discussion.created_at,
          page_number: discussion.page_number
        });
      });
      
      setDiscussionMessages(messages);
    } catch (error) {
      console.error('Failed to load discussion history:', error);
    }
  };

  const handleSendMessage = async (message: string, history: any[]): Promise<string> => {
    if (!book?.id || !message.trim()) return "I'm sorry, I couldn't process your message.";
    
    setLoadingDiscussion(true);
    
    try {
      const response = await api.discussBook(
        book.id, 
        message, 
        currentPage?.page_number
      );
      
      return response.response;
    } catch (error) {
      console.error('Failed to send message:', error);
      throw new Error('Failed to send message. Please try again.');
    } finally {
      setLoadingDiscussion(false);
    }
  };

  // Keyboard navigation for accessibility
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return; // Don't interfere with form inputs
      }
      
      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          goToPreviousPage();
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          goToNextPage();
          break;
        case ' ': // Spacebar
          event.preventDefault();
          if (currentPage?.audio_url) {
            toggleAudio();
          }
          break;
        case 'Enter':
          if (event.ctrlKey && currentPage?.image_url) {
            event.preventDefault();
            analyzeCurrentImage();
          }
          break;
        case 'd':
        case 'D':
          if (event.ctrlKey) {
            event.preventDefault();
            setShowImageDescription(!showImageDescription);
          }
          break;
        case 'h':
        case 'H':
          if (event.ctrlKey) {
            event.preventDefault();
            setHighContrastMode(!highContrastMode);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPageIndex, isPlaying, showImageDescription, highContrastMode, currentPage]);

  useEffect(() => {
    // Mark current page as read
    if (pages.length > 0) {
      setReadPages(prev => new Set([...prev, pages[currentPageIndex]?.page_number]));
    }
  }, [currentPageIndex, pages]);

  const fetchBookData = async () => {
    try {
      const response = await api.getBook(bookId!);
      setBook(response.book);
      setPages(response.book.pages || []);
    } catch (error) {
      console.error('Error fetching book:', error);
      toast.error('Failed to load book');
    } finally {
      setLoading(false);
    }
  };

  const fetchVocabulary = async () => {
    try {
      const response = await api.getVocabulary();
      setVocabularyWords(response.words || []);
    } catch (error) {
      console.error('Error fetching vocabulary:', error);
    }
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const goToPreviousPage = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
      setIsPlaying(false);
    }
  };

  const goToNextPage = () => {
    if (currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
      setIsPlaying(false);
    }
  };

  const toggleAudio = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTextClick = (word: string) => {
    setHighlightedText(word);
    // Find vocabulary word definition
    const vocabWord = vocabularyWords.find(v => 
      v.word.toLowerCase() === word.toLowerCase()
    );
    if (vocabWord) {
      toast.info(`${vocabWord.word}: ${vocabWord.definition}`);
    }
  };

  const handleFinishSession = async () => {
    try {
      const timeSpent = Math.floor((Date.now() - sessionStartTime) / 1000);
      await api.createReadingSession(
        bookId!,
        Array.from(readPages).length,
        timeSpent,
        Array.from(readPages).length === pages.length
      );
      toast.success('Reading session completed!');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error saving session:', error);
      toast.error('Failed to save reading session');
    }
  };

  const addToVocabulary = async (wordId: string) => {
    try {
      await api.learnVocabularyWord(wordId);
      toast.success('Word added to your vocabulary!');
    } catch (error) {
      console.error('Error adding word:', error);
      toast.error('Failed to add word to vocabulary');
    }
  };

  const analyzeCurrentImage = async () => {
    if (!currentPage?.image_url || analyzingImage) return;
    
    setAnalyzingImage(true);
    try {
      const response = await fetch('/api/books/analyze-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ image_url: currentPage.image_url })
      });
      
      const data = await response.json();
      if (data.description) {
        setImageDescriptions(prev => ({
          ...prev,
          [currentPage.id]: data.description
        }));
        
        // Extract vocabulary from the description if available
        if (data.description && data.description.length > 50) {
          try {
            const vocabularyResult = await api.extractVocabulary(
              data.description,
              book?.difficulty_level || 'beginner',
              3
            );
            
            if (vocabularyResult.vocabulary.length > 0) {
              toast.success(`Found ${vocabularyResult.vocabulary.length} new vocabulary words!`);
              // Refresh vocabulary list to show new words
               fetchVocabulary();
            }
          } catch (vocabError) {
            console.error('Vocabulary extraction failed:', vocabError);
            // Don't show error for vocabulary extraction as it's secondary
          }
        }
        
        toast.success('Image analyzed successfully!');
      }
    } catch (error) {
      console.error('Error analyzing image:', error);
      toast.error('Failed to analyze image');
    } finally {
      setAnalyzingImage(false);
    }
  };

  const regenerateDescription = async () => {
    if (!bookId || !currentPage?.id || regenerating) return;

    setRegenerating(true);
    try {
      const response = await fetch(`/api/books/${bookId}/pages/${currentPage.id}/regenerate-description`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      const data = await response.json();
      if (response.ok) {
        // Update the imageDescriptions state
        setImageDescriptions(prev => ({
          ...prev,
          [currentPage.id]: data.description
        }));

        // Update the pages state
        setPages(prevPages => {
          const newPages = [...prevPages];
          const pageIndex = newPages.findIndex(p => p.id === currentPage.id);
          if (pageIndex !== -1) {
            newPages[pageIndex] = {
              ...newPages[pageIndex],
              image_description: data.description
            };
          }
          return newPages;
        });

        toast.success('Description regenerated successfully!');
      } else {
        throw new Error(data.error || 'Failed to regenerate description');
      }
    } catch (error) {
      console.error('Error regenerating description:', error);
      toast.error(error.message);
    } finally {
      setRegenerating(false);
    }
  };

  const speakDescription = (description: string) => {
    if ('speechSynthesis' in window) {
      // Stop any current speech
      speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(description);
      if (selectedVoice) {
        const voice = voices.find(v => v.voiceURI === selectedVoice);
        if (voice) {
          utterance.voice = voice;
        }
      }
      utterance.rate = 0.8;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      // Add ARIA live region announcement
      const announcement = document.createElement('div');
      announcement.setAttribute('aria-live', 'polite');
      announcement.setAttribute('aria-atomic', 'true');
      announcement.className = 'sr-only';
      announcement.textContent = `Reading image description: ${description}`;
      document.body.appendChild(announcement);
      
      // Remove announcement after speech
      utterance.onend = () => {
        document.body.removeChild(announcement);
      };
      
      speechSynthesis.speak(utterance);
    }
  };

  const speakImageDescription = () => {
    const description = currentPage?.image_description || imageDescriptions[currentPage?.id || ''];
    if (description && 'speechSynthesis' in window) {
      speakDescription(description);
    } else {
      toast.error('Text-to-speech not available');
    }
  };

  // Auto-read descriptions when they become available
  useEffect(() => {
    if (autoReadDescriptions && currentPage && imageDescriptions[currentPage.id]) {
      const description = imageDescriptions[currentPage.id];
      if (description) {
        speakDescription(description);
      }
    }
  }, [imageDescriptions, currentPage?.id, autoReadDescriptions]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading book...</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Book not found</h2>
          <p className="text-gray-500 mb-4">The book you're looking for doesn't exist.</p>
          <button
            onClick={() => navigate('/library')}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  // If there are no page images but we have a PDF, show embedded PDF viewer
  const inlinePdfUrl = (book as any)?.pdf_file_url as string | undefined;
  const handleConvertExistingPdf = async () => {
    if (!inlinePdfUrl || !book?.id || convertingPdf) return;
    try {
      setConvertingPdf(true);
      setConversionMessage('Downloading PDF...');
      const resp = await fetch(inlinePdfUrl, { credentials: 'omit' });
      if (!resp.ok) throw new Error('Failed to download PDF');
      const pdfBlob = await resp.blob();
      const pdfFile = new File([pdfBlob], `${book.title || 'book'}.pdf`, { type: 'application/pdf' });

      setConversionMessage('Converting PDF to images...');
      const images = await convertPdfFileToImages(pdfFile);
      setConversionMessage(`Uploading ${images.length} page images...`);

      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Authentication required');

      const pagesForm = new FormData();
      images.forEach(({ blob, pageNumber }) => {
        const name = `page-${pageNumber}.png`;
        pagesForm.append('pages', new File([blob], name, { type: 'image/png' }), name);
      });

      const uploadResp = await fetch(`/api/upload/book/${book.id}/pages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: pagesForm,
      });
      const uploadResult = await uploadResp.json().catch(() => ({}));
      if (!uploadResp.ok) {
        throw new Error(uploadResult.error || 'Failed to upload page images');
      }

      setConversionMessage(null);
      toast.success(`Converted and uploaded ${images.length} pages.`);
      // Reload book data to pick up new pages
      setLoading(true);
      await fetchBookData();
    } catch (err) {
      console.error('PDF conversion failed:', err);
      setConversionMessage(null);
      toast.error(err instanceof Error ? err.message : 'PDF conversion failed');
    } finally {
      setConvertingPdf(false);
      setLoading(false);
    }
  };

  if (pages.length === 0 && inlinePdfUrl) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Back</span>
            </button>
            <h1 className="text-lg font-semibold text-gray-800 truncate">{book.title}</h1>
            <div className="w-10" />
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl shadow-lg overflow-hidden border">
            <div className="h-[80vh]">
              <iframe title="PDF" src={inlinePdfUrl} className="w-full h-full" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Tip: If the PDF doesn’t render, open it in a new tab from the Library.
            </p>
            <div className="flex items-center gap-3">
              {conversionMessage && (
                <span className="text-sm text-gray-700">{conversionMessage}</span>
              )}
              <button
                onClick={handleConvertExistingPdf}
                disabled={convertingPdf}
                className={`px-4 py-2 rounded-lg text-white ${
                  convertingPdf ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
                }`}
                title="Convert PDF to page images for better reading experience"
              >
                {convertingPdf ? 'Converting…' : 'Convert PDF to Images'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      highContrastMode 
        ? 'bg-black text-white' 
        : 'bg-gradient-to-br from-blue-50 to-indigo-100'
    }`}
    role="main"
    aria-label="Reading session for book"
    >
      {/* Header */}
        <div className={`shadow-sm border-b transition-colors duration-300 ${
          highContrastMode 
            ? 'bg-gray-900 border-gray-700 text-white' 
            : 'bg-white'
        }`}>
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/library')}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Library</span>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-800">{book.title}</h1>
                <p className="text-sm text-gray-600">by {book.author}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Page {currentPageIndex + 1} of {pages.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowImageDescription(!showImageDescription)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    showImageDescription
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  aria-label={showImageDescription ? 'Hide image descriptions' : 'Show image descriptions'}
                >
                  <Eye className="h-4 w-4 inline mr-2" />
                  Descriptions
                </button>
                
                <button
                   onClick={() => setHighContrastMode(!highContrastMode)}
                   className={`px-4 py-2 rounded-lg transition-colors ${
                     highContrastMode
                       ? 'bg-gray-800 text-white'
                       : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                   }`}
                   aria-label={highContrastMode ? 'Disable high contrast mode' : 'Enable high contrast mode'}
                   title="Ctrl+H"
                 >
                   <Contrast className="h-4 w-4 inline mr-2" />
                   {highContrastMode ? 'Normal' : 'High Contrast'}
                 </button>
                
                <button
                  onClick={() => setAutoReadDescriptions(!autoReadDescriptions)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    autoReadDescriptions
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  aria-label={autoReadDescriptions ? 'Disable auto-read descriptions' : 'Enable auto-read descriptions'}
                >
                  <Volume2 className="h-4 w-4 inline mr-2" />
                  Auto-Read
                </button>

                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="bg-gray-200 text-gray-700 rounded-lg px-4 py-2"
                >
                  {voices.map(voice => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
                
                <button
                  onClick={() => setShowDiscussion(!showDiscussion)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    showDiscussion
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  aria-label={showDiscussion ? 'Hide discussion panel' : 'Show discussion panel'}
                >
                  <MessageCircle className="h-4 w-4 inline mr-2" />
                  Discuss
                </button>
              </div>
               
               {/* Keyboard Navigation Help */}
               <div className="text-sm text-gray-600 hidden md:block" aria-label="Keyboard shortcuts">
                 <span className="mr-4">⬅️➡️ Navigate</span>
                 <span className="mr-4">Space: Play/Pause</span>
                 <span className="mr-4">Ctrl+Enter: Analyze</span>
                 <span className="mr-4">Ctrl+D: Descriptions</span>
                 <span>Ctrl+H: High Contrast</span>
               </div>
               
               <button
                 onClick={() => setShowVocabulary(!showVocabulary)}
                className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors"
              >
                Vocabulary
              </button>
              <button
                onClick={handleFinishSession}
                className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors"
              >
                Finish Session
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className={`grid gap-8 ${
          showDiscussion 
            ? 'grid-cols-1 xl:grid-cols-4' 
            : 'grid-cols-1 lg:grid-cols-3'
        }`}>
          
          {/* Screen Reader Instructions */}
          <div className="sr-only" aria-live="polite">
            Reading session for {book?.title}. Page {currentPageIndex + 1} of {pages.length}.
            {currentPage?.image_description && showImageDescription && 
              `Image description available: ${currentPage.image_description}`
            }
          </div>
          {/* Main Reading Area */}
          <div className={showDiscussion ? 'xl:col-span-2' : 'lg:col-span-2'}>
            <div className={`rounded-xl shadow-lg p-8 transition-colors duration-300 ${
              highContrastMode 
                ? 'bg-gray-800 border-2 border-white text-white' 
                : 'bg-white'
            }`}
            role="img"
            aria-label={`Book page ${currentPageIndex + 1} content`}
            >
              {/* Page Image */}
              {currentPage?.image_url && (
                <div className="mb-6">
                  <div className="relative">
                    <img
                      src={currentPage.image_url}
                      alt={`Page ${currentPage.page_number}`}
                      className="w-full h-64 object-contain rounded-lg border"
                    />
                    
                    {/* Image Controls Overlay */}
                    <div className="absolute top-2 right-2 flex space-x-2">
                      <button
                        onClick={() => setShowImageDescription(!showImageDescription)}
                        className={`p-2 rounded-full shadow-lg transition-colors ${
                          showImageDescription 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                        title="Toggle image description"
                      >
                        {showImageDescription ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      
                      <button
                        onClick={analyzeCurrentImage}
                        disabled={analyzingImage}
                        className="p-2 rounded-full bg-purple-500 text-white shadow-lg hover:bg-purple-600 transition-colors disabled:opacity-50"
                        title="Analyze image with AI"
                      >
                        {analyzingImage ? (
                          <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                      </button>
                      
                      {(currentPage?.image_description || imageDescriptions[currentPage?.id]) && (
                        <button
                          onClick={speakImageDescription}
                          className="p-2 rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 transition-colors"
                          title="Listen to image description"
                        >
                          <Volume1 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Image Description */}
                  {showImageDescription && (currentPage?.image_description || imageDescriptions[currentPage?.id]) && (
                    <div className={`mt-4 p-4 rounded-lg border transition-colors duration-300 ${
                      highContrastMode 
                        ? 'bg-gray-700 border-gray-500 text-white' 
                        : 'bg-blue-50 border-blue-200'
                    }`}
                    role="region"
                    aria-label="Image description section"
                    >
                      <div className="flex items-start space-x-2">
                        <Sparkles className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                          highContrastMode ? 'text-blue-300' : 'text-blue-500'
                        }`} />
                        <div>
                          <div className="flex items-center justify-between">
                            <h4 className={`font-medium mb-2 ${
                              highContrastMode ? 'text-white' : 'text-blue-800'
                            }`}>AI Image Description</h4>
                            <button
                              onClick={regenerateDescription}
                              disabled={regenerating}
                              className="p-1 rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                              title="Regenerate description"
                            >
                              {regenerating ? (
                                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          <p className={`text-sm leading-relaxed ${
                            highContrastMode ? 'text-gray-100' : 'text-blue-700'
                          }`}
                          aria-live="polite"
                          >
                            {currentPage?.image_description || imageDescriptions[currentPage?.id]}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Page Text */}
              <div className="mb-6">
                <div 
                  className="text-lg leading-relaxed text-gray-800 cursor-pointer select-none"
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.textContent) {
                      const word = target.textContent.trim().replace(/[.,!?;]/g, '');
                      handleTextClick(word);
                    }
                  }}
                >
                  {currentPage?.text_content?.split(' ').map((word, index) => (
                    <span
                      key={index}
                      className={`hover:bg-yellow-200 transition-colors rounded px-1 ${
                        highlightedText === word.replace(/[.,!?;]/g, '') ? 'bg-yellow-300' : ''
                      }`}
                    >
                      {word}{' '}
                    </span>
                  ))}
                </div>
              </div>

              {/* Audio Controls */}
              {currentPage?.audio_url && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <audio
                    ref={audioRef}
                    src={currentPage.audio_url}
                    onEnded={() => setIsPlaying(false)}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  />
                  <div className="flex items-center justify-center space-x-4">
                    <button
                      onClick={goToPreviousPage}
                      disabled={currentPageIndex === 0}
                      className="p-2 rounded-full bg-blue-500 text-white disabled:bg-gray-300 hover:bg-blue-600 transition-colors"
                    >
                      <SkipBack className="h-5 w-5" />
                    </button>
                    <button
                      onClick={handlePlayPause}
                      className="p-3 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors"
                    >
                      {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                    </button>
                    <button
                      onClick={goToNextPage}
                      disabled={currentPageIndex === pages.length - 1}
                      className="p-2 rounded-full bg-blue-500 text-white disabled:bg-gray-300 hover:bg-blue-600 transition-colors"
                    >
                      <SkipForward className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-center mt-2">
                    <Volume2 className="h-4 w-4 text-gray-500 mr-2" />
                    <span className="text-sm text-gray-600">Click play to hear the story</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className={`space-y-6 ${
            showDiscussion ? 'xl:col-span-1' : ''
          }`}>
            {/* Progress */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Reading Progress</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pages Read</span>
                  <span className="font-medium">{readPages.size} / {pages.length}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(readPages.size / pages.length) * 100}%` }}
                  ></div>
                </div>
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(readPages.size, 5) }, (_, i) => (
                    <Star key={i} className="h-4 w-4 text-yellow-400 fill-current" />
                  ))}
                </div>
              </div>
            </div>

            {/* Vocabulary Panel */}
            {showVocabulary && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Vocabulary Words</h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {vocabularyWords.slice(0, 5).map((word) => (
                    <div key={word.id} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-gray-800">{word.word}</h4>
                        <button
                          onClick={() => addToVocabulary(word.id)}
                          className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 transition-colors"
                        >
                          Learn
                        </button>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">{word.definition}</p>
                      {word.example_sentence && (
                        <p className="text-xs text-gray-500 italic">"{word.example_sentence}"</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Page Navigation */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Pages</h3>
              <div className="grid grid-cols-4 gap-2">
                {pages.map((page, index) => (
                  <button
                    key={page.id}
                    onClick={() => setCurrentPageIndex(index)}
                    className={`aspect-square rounded-lg border-2 text-sm font-medium transition-colors ${
                      index === currentPageIndex
                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                        : readPages.has(page.page_number)
                        ? 'border-green-500 bg-green-50 text-green-600'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {page.page_number}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Discussion Panel */}
          {showDiscussion && (
            <div className="xl:col-span-1">
              <div className={`rounded-xl shadow-lg h-[600px] transition-colors duration-300 ${
                highContrastMode 
                  ? 'bg-gray-800 border-2 border-white text-white' 
                  : 'bg-white'
              }`}>
                <div className="p-4 border-b">
                  <h3 className="text-lg font-semibold flex items-center">
                    <MessageCircle className="h-5 w-5 mr-2" />
                    Book Discussion
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Ask questions about the story, characters, or vocabulary!
                  </p>
                </div>
                
                <ChatInterface
                  isOpen={showDiscussion}
                  onClose={() => setShowDiscussion(false)}
                  onSendMessage={handleSendMessage}
                  bookTitle={book?.title || 'Unknown Book'}
                  pageNumber={currentPage?.page_number}
                  className="h-full"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReadingSession;
