import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen, ArrowLeft, Target, Clock, Award } from 'lucide-react';
import LessonChatInterface from '../components/LessonChatInterface';
import { toast } from 'sonner';

interface LessonPlan {
  id: string;
  title: string;
  description: string;
  targetLevel: string;
  duration: number;
  objectives: string[];
  activities: any[];
  bookIds: string[];
  assignedStudents: string[];
  createdAt: string;
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

const LessonSession: React.FC = () => {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState<LessonPlan | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLessonData();
  }, [lessonId]);

  const fetchLessonData = async () => {
    try {
      setLoading(true);
      
      // Fetch lesson details
      const lessonResponse = await fetch(`/api/dashboard/my-lessons`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      
      if (!lessonResponse.ok) {
        throw new Error('Failed to fetch lesson data');
      }
      
      const lessonsData = await lessonResponse.json();
      const currentLesson = lessonsData.find((l: LessonPlan) => l.id === lessonId);
      
      if (!currentLesson) {
        throw new Error('Lesson not found');
      }
      
      setLesson(currentLesson);
      
      // Fetch books associated with the lesson
      if (currentLesson.bookIds && currentLesson.bookIds.length > 0) {
        const booksResponse = await fetch('/api/books', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        });
        
        if (booksResponse.ok) {
          const allBooks = await booksResponse.json();
          const lessonBooks = allBooks.filter((book: Book) => 
            currentLesson.bookIds.includes(book.id)
          );
          setBooks(lessonBooks);
          
          // Auto-select the first book if available
          if (lessonBooks.length > 0) {
            setSelectedBook(lessonBooks[0]);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching lesson data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load lesson');
      toast.error('Failed to load lesson data');
    } finally {
      setLoading(false);
    }
  };

  const formatLevelDisplay = (level: string) => {
    return level.charAt(0).toUpperCase() + level.slice(1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading lesson...</p>
        </div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Lesson Not Found</h2>
          <p className="text-gray-600 mb-4">{error || 'The requested lesson could not be found.'}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Dashboard</span>
              </button>
              <div className="h-6 w-px bg-gray-300"></div>
              <h1 className="text-xl font-semibold text-gray-900">{lesson.title}</h1>
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <div className="flex items-center space-x-1">
                <Clock className="h-4 w-4" />
                <span>{lesson.duration} min</span>
              </div>
              <div className="flex items-center space-x-1">
                <Award className="h-4 w-4" />
                <span>{formatLevelDisplay(lesson.targetLevel)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lesson Info Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Lesson Overview */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Lesson Overview</h3>
              <p className="text-gray-600 mb-4">{lesson.description}</p>
              
              {lesson.objectives && lesson.objectives.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <Target className="h-4 w-4 mr-1" />
                    Learning Goals
                  </h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {lesson.objectives.map((objective, index) => (
                      <li key={index} className="flex items-start">
                        <span className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                        {objective}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {lesson.activities && lesson.activities.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Activities</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {lesson.activities.map((activity, index) => (
                      <li key={index} className="flex items-start">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                        {typeof activity === 'string' ? activity : activity.description || activity.type || 'Activity'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Book Selection */}
            {books.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Lesson Books</h3>
                <div className="space-y-3">
                  {books.map((book) => (
                    <div
                      key={book.id}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                        selectedBook?.id === book.id
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedBook(book)}
                    >
                      <div className="flex items-start space-x-3">
                        {book.cover_image_url && (
                          <img
                            src={book.cover_image_url}
                            alt={book.title}
                            className="w-12 h-16 object-cover rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-900 truncate">{book.title}</h4>
                          <p className="text-xs text-gray-600">{book.author}</p>
                          <p className="text-xs text-gray-500 mt-1">{formatLevelDisplay(book.difficulty_level)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chat Interface */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md h-[600px]">
              {selectedBook ? (
                <LessonChatInterface
                  book={selectedBook}
                  lessonContext={{
                    id: lesson.id,
                    title: lesson.title,
                    description: lesson.description,
                    objectives: lesson.objectives,
                    activities: lesson.activities,
                    targetLevel: lesson.targetLevel,
                    duration: lesson.duration
                  }}
                />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Book</h3>
                    <p className="text-gray-600">Choose a book from the lesson to start your AI tutoring session.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LessonSession;