import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Calendar, Users, BookOpen, TrendingUp, Award, Clock, Target, Plus, Edit, Trash2, Eye, Check } from 'lucide-react';
import { useAuthStore } from "../stores/authStore";
import { api, type Book } from '../lib/api';

interface Student {
  id: string;
  name: string;
  email: string;
  age: number;
  level: string;
  totalReadingTime: number;
  booksCompleted: number;
  vocabularyLearned: number;
  lastActive: string;
  averageScore: number;
}

interface LessonPlan {
  id: string;
  title: string;
  description: string;
  targetLevel: string;
  duration: number;
  objectives: string[];
  activities: string[];
  createdAt: string;
  assignedStudents: string[];
  bookIds?: string[];
}

interface ProgressData {
  date: string;
  readingTime: number;
  vocabularyLearned: number;
  speakingScore: number;
}

const Dashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [students, setStudents] = useState<Student[]>([]);
  const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>([]);
  const [progressData, setProgressData] = useState<ProgressData[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'lessons' | 'analytics'>('overview');
  const [showLessonForm, setShowLessonForm] = useState(false);
  const [editingLesson, setEditingLesson] = useState<LessonPlan | null>(null);
  const [loading, setLoading] = useState(true);

  // Get user role for conditional rendering
  const userRole = user?.role || 'child';

  // Helper function to ensure chart data is valid
  const getValidChartData = (data: any) => {
    if (!data || !Array.isArray(data)) {
      console.warn('Chart data is not an array:', data);
      return [];
    }
    return data;
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      // Fetch students data
      const studentsResponse = await fetch('/api/dashboard/students', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      
      if (studentsResponse.ok) {
        const studentsData = await studentsResponse.json();
        setStudents(studentsData);
      } else {
        // Mock data for demonstration
        setStudents([
          {
            id: '1',
            name: 'Emma Johnson',
            email: 'emma@example.com',
            age: 8,
            level: 'Beginner',
            totalReadingTime: 120,
            booksCompleted: 5,
            vocabularyLearned: 45,
            lastActive: '2024-01-15',
            averageScore: 85
          },
          {
            id: '2',
            name: 'Liam Smith',
            email: 'liam@example.com',
            age: 10,
            level: 'Intermediate',
            totalReadingTime: 200,
            booksCompleted: 8,
            vocabularyLearned: 78,
            lastActive: '2024-01-14',
            averageScore: 92
          }
        ]);
      }

      // Fetch lesson plans - use different endpoint for students vs parents/admins
      const userRole = user?.user_metadata?.role || 'child';
      const lessonsEndpoint = userRole === 'child' ? '/api/dashboard/my-lessons' : '/api/dashboard/lessons';
      const lessonsResponse = await fetch(lessonsEndpoint, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      
      if (lessonsResponse.ok) {
        const lessonsData = await lessonsResponse.json();
        setLessonPlans(lessonsData);
      } else {
        // Mock data
        setLessonPlans([
          {
            id: '1',
            title: 'Basic Phonics',
            description: 'Introduction to letter sounds and basic reading',
            targetLevel: 'beginner',
            duration: 30,
            objectives: ['Learn letter sounds', 'Practice blending', 'Read simple words'],
            activities: ['Letter sound games', 'Blending exercises', 'Word recognition'],
            createdAt: '2024-01-10',
            assignedStudents: ['1']
          }
        ]);
      }

      // Fetch progress data
      const progressResponse = await fetch('/api/dashboard/progress', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      
      if (progressResponse.ok) {
        const progressData = await progressResponse.json();
        setProgressData(progressData);
      } else {
        // Mock data
        setProgressData([
          { date: '2024-01-10', readingTime: 25, vocabularyLearned: 5, speakingScore: 80 },
          { date: '2024-01-11', readingTime: 30, vocabularyLearned: 7, speakingScore: 85 },
          { date: '2024-01-12', readingTime: 20, vocabularyLearned: 3, speakingScore: 78 },
          { date: '2024-01-13', readingTime: 35, vocabularyLearned: 8, speakingScore: 90 },
          { date: '2024-01-14', readingTime: 40, vocabularyLearned: 6, speakingScore: 88 }
        ]);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const createLessonPlan = async (lessonData: Omit<LessonPlan, 'id' | 'createdAt'>) => {
    try {
      const response = await fetch('/api/dashboard/lessons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify(lessonData)
      });

      if (response.ok) {
        const newLesson = await response.json();
        setLessonPlans([...lessonPlans, newLesson]);
      } else {
        // Mock creation
        const newLesson: LessonPlan = {
          ...lessonData,
          id: Date.now().toString(),
          createdAt: new Date().toISOString().split('T')[0]
        };
        setLessonPlans([...lessonPlans, newLesson]);
      }
      setShowLessonForm(false);
    } catch (error) {
      console.error('Error creating lesson plan:', error);
    }
  };

  const updateLessonPlan = async (lessonId: string, lessonData: Partial<LessonPlan>) => {
    try {
      const response = await fetch(`/api/dashboard/lessons/${lessonId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify(lessonData)
      });

      if (response.ok) {
        const updatedLesson = await response.json();
        setLessonPlans(lessonPlans.map(lesson => 
          lesson.id === lessonId ? updatedLesson : lesson
        ));
      } else {
        // Mock update
        setLessonPlans(lessonPlans.map(lesson => 
          lesson.id === lessonId ? { ...lesson, ...lessonData } : lesson
        ));
      }
      setEditingLesson(null);
    } catch (error) {
      console.error('Error updating lesson plan:', error);
    }
  };

  const deleteLessonPlan = async (lessonId: string) => {
    try {
      const response = await fetch(`/api/dashboard/lessons/${lessonId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      if (response.ok || response.status === 404) {
        setLessonPlans(lessonPlans.filter(lesson => lesson.id !== lessonId));
      }
    } catch (error) {
      console.error('Error deleting lesson plan:', error);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'beginner': return 'bg-blue-100 text-blue-800';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'advanced': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatLevelDisplay = (level: string) => {
    return level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            {userRole === 'child' && 'My Learning Dashboard'}
            {userRole === 'parent' && 'Parent Dashboard'}
            {userRole === 'admin' && 'Admin Dashboard'}
          </h1>
          <p className="text-gray-600">
            {userRole === 'child' && 'Track your reading progress and achievements'}
            {userRole === 'parent' && 'Monitor your children\'s learning progress and manage lessons'}
            {userRole === 'admin' && 'Manage the entire learning platform'}
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {(() => {
                let tabs = [];
                if (userRole === 'child') {
                  tabs = [
                    { id: 'overview', label: 'My Progress', icon: TrendingUp },
                    { id: 'books', label: 'My Books', icon: BookOpen },
                    { id: 'my-lessons', label: 'My Lessons', icon: BookOpen },
                    { id: 'achievements', label: 'Achievements', icon: Award }
                  ];
                } else if (userRole === 'parent') {
                  tabs = [
                    { id: 'overview', label: 'Overview', icon: TrendingUp },
                    { id: 'students', label: 'Students', icon: Users },
                    { id: 'lessons', label: 'Lesson Plans', icon: BookOpen },
                    { id: 'analytics', label: 'Analytics', icon: BarChart }
                  ];
                } else if (userRole === 'admin') {
                  tabs = [
                    { id: 'overview', label: 'System Overview', icon: TrendingUp },
                    { id: 'users', label: 'User Management', icon: Users },
                    { id: 'content', label: 'Content Management', icon: BookOpen },
                    { id: 'analytics', label: 'System Analytics', icon: BarChart }
                  ];
                }
                return tabs;
              })().map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id as any)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeTab === id
                      ? 'border-purple-500 text-purple-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Parent Overview Tab */}
        {activeTab === 'overview' && userRole === 'parent' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Students</p>
                    <p className="text-2xl font-bold text-gray-900">{students ? students.length : 0}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <BookOpen className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Books Completed</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {students ? students.reduce((sum, student) => sum + student.booksCompleted, 0) : 0}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Clock className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Reading Time</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {students ? students.reduce((sum, student) => sum + student.totalReadingTime, 0) : 0} min
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Award className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Avg Score</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {students && students.length > 0 ? Math.round(students.reduce((sum, student) => sum + student.averageScore, 0) / students.length) : 0}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Student Activity</h3>
              <div className="space-y-4">
                {students && students.slice(0, 5).map((student) => (
                  <div key={student.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-semibold">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{student.name}</p>
                        <p className="text-sm text-gray-600">Last active: {student.lastActive}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${getScoreColor(student.averageScore)}`}>
                        {student.averageScore}% avg
                      </p>
                      <p className="text-sm text-gray-600">{student.booksCompleted} books</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Child Overview Tab */}
        {activeTab === 'overview' && userRole === 'child' && (
          <div className="space-y-6">
            {/* Child Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <BookOpen className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Books Read</p>
                    <p className="text-2xl font-bold text-gray-900">12</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Clock className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Reading Time</p>
                    <p className="text-2xl font-bold text-gray-900">45 min</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Award className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Achievements</p>
                    <p className="text-2xl font-bold text-gray-900">8</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Reading Progress */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">My Reading Progress</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">Daily Reading Goal</span>
                  <span className="text-sm text-gray-900">30 min</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-600 h-2 rounded-full" style={{width: '75%'}}></div>
                </div>
                <p className="text-sm text-gray-600">22.5 minutes completed today</p>
              </div>
            </div>

            {/* Recent Books */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Recently Read Books</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { title: 'The Magic Tree', level: 'Beginner', progress: 100 },
                  { title: 'Adventure Island', level: 'Intermediate', progress: 65 }
                ].map((book, index) => (
                  <div key={index} className="p-4 border border-gray-200 rounded-lg">
                    <h4 className="font-medium text-gray-900">{book.title}</h4>
                    <p className="text-sm text-gray-600 mb-2">{book.level}</p>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-purple-600 h-2 rounded-full" style={{width: `${book.progress}%`}}></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{book.progress}% complete</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Student My Lessons Tab */}
        {activeTab === 'my-lessons' && userRole === 'child' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">My Assigned Lessons</h3>
              {lessonPlans.length === 0 ? (
                <div className="text-center py-8">
                  <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No lessons assigned yet</p>
                  <p className="text-sm text-gray-400">Your teacher will assign lessons for you to complete</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {lessonPlans.map((lesson) => (
                    <div key={lesson.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 mb-2">{lesson.title}</h4>
                          <p className="text-sm text-gray-600 mb-3">{lesson.description}</p>
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            <span className="flex items-center space-x-1">
                              <Clock className="h-4 w-4" />
                              <span>{lesson.duration} min</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <Award className="h-4 w-4" />
                              <span>{formatLevelDisplay(lesson.targetLevel)}</span>
                            </span>
                          </div>
                          {lesson.objectives && lesson.objectives.length > 0 && (
                            <div className="mt-3">
                              <p className="text-sm font-medium text-gray-700 mb-1">Learning Goals:</p>
                              <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                                {lesson.objectives.map((objective, index) => (
                                  <li key={index}>{objective}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {lesson.activities && lesson.activities.length > 0 && (
                            <div className="mt-3">
                              <p className="text-sm font-medium text-gray-700 mb-1">Activities:</p>
                              <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                                {lesson.activities.map((activity, index) => (
                                  <li key={index}>
                                    {typeof activity === 'string' ? activity : activity.description || activity.type || 'Activity'}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                        <div className="ml-4 flex-shrink-0 space-y-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Assigned
                          </span>
                          <button
                            onClick={() => window.location.href = `/lesson-session/${lesson.id}`}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                          >
                            <BookOpen className="h-4 w-4" />
                            <span>Start Lesson</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Parent Overview Tab */}
        {activeTab === 'overview' && userRole === 'parent' && (
          <div className="space-y-6">
            {/* Parent Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">My Children</p>
                    <p className="text-2xl font-bold text-gray-900">2</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <BookOpen className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Books Read</p>
                    <p className="text-2xl font-bold text-gray-900">25</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Clock className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Reading Time</p>
                    <p className="text-2xl font-bold text-gray-900">180 min</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Award className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Achievements</p>
                    <p className="text-2xl font-bold text-gray-900">15</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Children Progress */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Children\'s Progress</h3>
              <div className="space-y-4">
                {[
                  { name: 'Emma', age: 8, booksRead: 12, readingTime: 90, level: 'Beginner' },
                  { name: 'Liam', age: 10, booksRead: 13, readingTime: 90, level: 'Intermediate' }
                ].map((child, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-semibold">
                        {child.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{child.name} ({child.age} years)</p>
                        <p className="text-sm text-gray-600">Level: {child.level}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{child.booksRead} books</p>
                      <p className="text-sm text-gray-600">{child.readingTime} min this week</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Parent Students Tab */}
        {activeTab === 'students' && userRole === 'parent' && (
          <div className="bg-white rounded-lg shadow-md">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">Student Management</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Level</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Active</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {students && students.map((student) => (
                    <tr key={student.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-semibold">
                            {student.name.charAt(0)}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{student.name}</div>
                            <div className="text-sm text-gray-500">{student.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getLevelColor(student.level)}`}>
                          {student.level}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span>Books: {student.booksCompleted}</span>
                            <span>Vocab: {student.vocabularyLearned}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-purple-600 h-2 rounded-full" 
                              style={{ width: `${Math.min(100, (student.booksCompleted / 10) * 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {student.lastActive}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button 
                          onClick={() => setSelectedStudent(student.id)}
                          className="text-purple-600 hover:text-purple-900 mr-3"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Lesson Plans Tab */}
        {activeTab === 'lessons' && (userRole === 'parent' || userRole === 'admin') && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">Lesson Plans</h3>
              <button
                onClick={() => setShowLessonForm(true)}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Create Lesson</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {lessonPlans && lessonPlans.map((lesson) => (
                <div key={lesson.id} className="bg-white rounded-lg shadow-md p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="text-lg font-semibold text-gray-800">{lesson.title}</h4>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setEditingLesson(lesson)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteLessonPlan(lesson.id)}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-600 text-sm mb-4">{lesson.description}</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Level:</span>
                      <span className={`px-2 py-1 rounded-full text-xs ${getLevelColor(lesson.targetLevel)}`}>
                        {formatLevelDisplay(lesson.targetLevel)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Duration:</span>
                      <span className="text-gray-700">{lesson.duration} min</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Students:</span>
                      <span className="text-gray-700">{lesson.assignedStudents ? lesson.assignedStudents.length : 0}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (userRole === 'parent' || userRole === 'admin') && (
          <div className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                <span className="ml-2 text-gray-600">Loading analytics...</span>
              </div>
            ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Reading Progress Chart */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Reading Progress</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={getValidChartData(progressData)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="readingTime" stroke="#8884d8" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Vocabulary Learning Chart */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Vocabulary Learning</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={getValidChartData(progressData)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="vocabularyLearned" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Speaking Scores Chart */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Speaking Performance</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={getValidChartData(progressData)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="speakingScore" stroke="#ff7300" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
                </div>
            </div>
            )}
          </div>
        )}

        {/* Lesson Plan Form Modal */}
        {(showLessonForm || editingLesson) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                {editingLesson ? 'Edit Lesson Plan' : 'Create New Lesson Plan'}
              </h3>
              <LessonPlanForm
                lesson={editingLesson}
                onSave={(lessonData) => {
                  if (editingLesson) {
                    updateLessonPlan(editingLesson.id, lessonData);
                  } else {
                    createLessonPlan(lessonData);
                  }
                }}
                onCancel={() => {
                  setShowLessonForm(false);
                  setEditingLesson(null);
                }}
                students={students || []}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Lesson Plan Form Component
interface LessonPlanFormProps {
  lesson?: LessonPlan | null;
  onSave: (lessonData: Omit<LessonPlan, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
  students: Student[];
}

const LessonPlanForm: React.FC<LessonPlanFormProps> = ({ lesson, onSave, onCancel, students }) => {
  const [formData, setFormData] = useState({
    title: lesson?.title || '',
    description: lesson?.description || '',
    targetLevel: lesson?.targetLevel || 'beginner',
    duration: lesson?.duration || 30,
    objectives: lesson?.objectives || [''],
    activities: lesson?.activities || [''],
    assignedStudents: lesson?.assignedStudents || [],
    bookIds: lesson?.bookIds || []
  });
  
  const [books, setBooks] = useState<Book[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  
  useEffect(() => {
    fetchBooks();
  }, []);
  
  const fetchBooks = async () => {
    try {
      setLoadingBooks(true);
      const response = await api.getBooks({ limit: 50 });
      setBooks(response.books || []);
    } catch (error) {
      console.error('Error fetching books:', error);
    } finally {
      setLoadingBooks(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const addObjective = () => {
    setFormData({ ...formData, objectives: [...formData.objectives, ''] });
  };

  const removeObjective = (index: number) => {
    setFormData({ 
      ...formData, 
      objectives: formData.objectives.filter((_, i) => i !== index) 
    });
  };

  const updateObjective = (index: number, value: string) => {
    const newObjectives = [...formData.objectives];
    newObjectives[index] = value;
    setFormData({ ...formData, objectives: newObjectives });
  };

  const addActivity = () => {
    setFormData({ ...formData, activities: [...formData.activities, ''] });
  };

  const removeActivity = (index: number) => {
    setFormData({ 
      ...formData, 
      activities: formData.activities.filter((_, i) => i !== index) 
    });
  };

  const updateActivity = (index: number, value: string) => {
    const newActivities = [...formData.activities];
    newActivities[index] = value;
    setFormData({ ...formData, activities: newActivities });
  };
  
  const toggleStudentSelection = (studentId: string) => {
    const isSelected = formData.assignedStudents.includes(studentId);
    if (isSelected) {
      setFormData({
        ...formData,
        assignedStudents: formData.assignedStudents.filter(id => id !== studentId)
      });
    } else {
      setFormData({
        ...formData,
        assignedStudents: [...formData.assignedStudents, studentId]
      });
    }
  };
  
  const toggleBookSelection = (bookId: string) => {
    const isSelected = formData.bookIds.includes(bookId);
    if (isSelected) {
      setFormData({
        ...formData,
        bookIds: formData.bookIds.filter(id => id !== bookId)
      });
    } else {
      setFormData({
        ...formData,
        bookIds: [...formData.bookIds, bookId]
      });
    }
  };
  
  const getSelectedStudentNames = () => {
    return students
      .filter(student => formData.assignedStudents.includes(student.id))
      .map(student => student.name)
      .join(', ') || 'None selected';
  };
  
  const getSelectedBookTitles = () => {
    return books
      .filter(book => formData.bookIds.includes(book.id))
      .map(book => book.title)
      .join(', ') || 'None selected';
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
          rows={3}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Target Level</label>
          <select
            value={formData.targetLevel}
            onChange={(e) => setFormData({ ...formData, targetLevel: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Duration (minutes)</label>
          <input
            type="number"
            value={formData.duration}
            onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            min="1"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Learning Objectives</label>
        {formData.objectives.map((objective, index) => (
          <div key={index} className="flex items-center space-x-2 mb-2">
            <input
              type="text"
              value={objective}
              onChange={(e) => updateObjective(index, e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Enter learning objective"
              required
            />
            {formData.objectives.length > 1 && (
              <button
                type="button"
                onClick={() => removeObjective(index)}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addObjective}
          className="text-purple-600 hover:text-purple-800 text-sm flex items-center space-x-1"
        >
          <Plus className="h-4 w-4" />
          <span>Add Objective</span>
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Activities</label>
        {formData.activities.map((activity, index) => (
          <div key={index} className="flex items-center space-x-2 mb-2">
            <input
              type="text"
              value={activity}
              onChange={(e) => updateActivity(index, e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Enter activity"
              required
            />
            {formData.activities.length > 1 && (
              <button
                type="button"
                onClick={() => removeActivity(index)}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addActivity}
          className="text-purple-600 hover:text-purple-800 text-sm flex items-center space-x-1"
        >
          <Plus className="h-4 w-4" />
          <span>Add Activity</span>
        </button>
      </div>

      {/* Book Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Books</label>
        {loadingBooks ? (
          <div className="text-gray-500">Loading books...</div>
        ) : (
          <>
            <div className="mb-2 p-2 bg-gray-50 rounded-md text-sm text-gray-600">
              Selected: {getSelectedBookTitles()}
            </div>
            <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-md p-2">
              {books.length === 0 ? (
                <div className="text-gray-500 text-sm">No books available</div>
              ) : (
                books.map((book) => (
                  <div key={book.id} className="flex items-center space-x-2 py-1">
                    <input
                      type="checkbox"
                      id={`book-${book.id}`}
                      checked={formData.bookIds.includes(book.id)}
                      onChange={() => toggleBookSelection(book.id)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <label htmlFor={`book-${book.id}`} className="text-sm text-gray-700 cursor-pointer flex-1">
                      {book.title}
                    </label>
                    {formData.bookIds.includes(book.id) && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Student Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Assign Students</label>
        <div className="mb-2 p-2 bg-gray-50 rounded-md text-sm text-gray-600">
          Selected: {getSelectedStudentNames()}
        </div>
        <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-md p-2">
          {students.length === 0 ? (
            <div className="text-gray-500 text-sm">No students available</div>
          ) : (
            students.map((student) => (
              <div key={student.id} className="flex items-center space-x-2 py-1">
                <input
                  type="checkbox"
                  id={`student-${student.id}`}
                  checked={formData.assignedStudents.includes(student.id)}
                  onChange={() => toggleStudentSelection(student.id)}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <label htmlFor={`student-${student.id}`} className="text-sm text-gray-700 cursor-pointer flex-1">
                  {student.name}
                </label>
                {formData.assignedStudents.includes(student.id) && (
                  <Check className="h-4 w-4 text-green-500" />
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
        >
          {lesson ? 'Update' : 'Create'} Lesson
        </button>
      </div>
    </form>
  );
};

export default Dashboard;