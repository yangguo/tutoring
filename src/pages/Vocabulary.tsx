import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Plus, BookOpen, Volume2, Star, Trash2, Edit3, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import type { VocabularyWord } from '../lib/api';

interface WordWithProgress extends VocabularyWord {
  mastery_level: number;
  last_practiced?: string;
}

const Vocabulary: React.FC = () => {
  const navigate = useNavigate();
  const [words, setWords] = useState<WordWithProgress[]>([]);
  const [filteredWords, setFilteredWords] = useState<WordWithProgress[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedMastery, setSelectedMastery] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingWord, setEditingWord] = useState<WordWithProgress | null>(null);
  const [practiceMode, setPracticeMode] = useState(false);
  const [currentPracticeIndex, setCurrentPracticeIndex] = useState(0);
  const [practiceWords, setPracticeWords] = useState<WordWithProgress[]>([]);
  const [showDefinition, setShowDefinition] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [practiceStats, setPracticeStats] = useState({ correct: 0, total: 0 });

  // Form state
  const [formData, setFormData] = useState({
    word: '',
    definition: '',
    pronunciation: '',
    example_sentence: '',
    difficulty_level: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    category: ''
  });

  useEffect(() => {
    fetchVocabulary();
  }, []);

  useEffect(() => {
    filterWords();
  }, [words, searchTerm, selectedDifficulty, selectedMastery]);

  const fetchVocabulary = async () => {
    try {
      const response = await api.getLearnedVocabulary();
      const wordsWithProgress = response.words?.map((word: any) => ({
        ...word,
        mastery_level: word.mastery_level || 0,
        last_practiced: word.last_practiced
      })) || [];
      setWords(wordsWithProgress);
    } catch (error) {
      console.error('Error fetching vocabulary:', error);
      toast.error('Failed to load vocabulary');
    } finally {
      setLoading(false);
    }
  };

  const filterWords = () => {
    let filtered = words;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(word => 
        word.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
        word.definition.toLowerCase().includes(searchTerm.toLowerCase()) ||
        word.category?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Difficulty filter
    if (selectedDifficulty !== 'all') {
      filtered = filtered.filter(word => word.difficulty_level === selectedDifficulty);
    }

    // Mastery filter
    if (selectedMastery !== 'all') {
      if (selectedMastery === 'low') {
        filtered = filtered.filter(word => word.mastery_level < 30);
      } else if (selectedMastery === 'medium') {
        filtered = filtered.filter(word => word.mastery_level >= 30 && word.mastery_level < 70);
      } else if (selectedMastery === 'high') {
        filtered = filtered.filter(word => word.mastery_level >= 70);
      }
    }

    setFilteredWords(filtered);
  };

  const handleAddWord = async () => {
    try {
      const newWordData = {
        book_id: 'manual', // For manually added words
        word_id: Date.now().toString(),
        word: formData.word,
        definition: formData.definition,
        pronunciation: formData.pronunciation,
        example_sentence: formData.example_sentence,
        difficulty_level: formData.difficulty_level,
        category: formData.category
      };
      
      await api.learnVocabulary(newWordData);
      
      const newWord = {
        id: newWordData.word_id,
        word: newWordData.word,
        definition: newWordData.definition,
        pronunciation: newWordData.pronunciation,
        example_sentence: newWordData.example_sentence,
        difficulty_level: newWordData.difficulty_level,
        category: newWordData.category,
        mastery_level: 0,
        last_practiced: new Date().toISOString()
      };
      
      setWords(prev => [...prev, newWord]);
      setShowAddForm(false);
      resetForm();
      toast.success('Word added successfully!');
    } catch (error) {
      console.error('Error adding word:', error);
      toast.error('Failed to add word');
    }
  };

  const handleEditWord = async () => {
    if (!editingWord) return;
    
    try {
      // Update word logic would go here
      const updatedWords = words.map(word => 
        word.id === editingWord.id ? { ...editingWord, ...formData } : word
      );
      setWords(updatedWords);
      setEditingWord(null);
      resetForm();
      toast.success('Word updated successfully!');
    } catch (error) {
      console.error('Error updating word:', error);
      toast.error('Failed to update word');
    }
  };

  const handleDeleteWord = async (wordId: string) => {
    try {
      // Delete word logic would go here
      setWords(prev => prev.filter(word => word.id !== wordId));
      toast.success('Word deleted successfully!');
    } catch (error) {
      console.error('Error deleting word:', error);
      toast.error('Failed to delete word');
    }
  };

  const resetForm = () => {
    setFormData({
      word: '',
      definition: '',
      pronunciation: '',
      example_sentence: '',
      difficulty_level: 'beginner',
      category: ''
    });
  };

  const startPractice = () => {
    const wordsToReview = filteredWords.filter(word => word.mastery_level < 80);
    if (wordsToReview.length === 0) {
      toast.info('No words need practice right now!');
      return;
    }
    
    setPracticeWords(wordsToReview.sort(() => Math.random() - 0.5).slice(0, 10));
    setCurrentPracticeIndex(0);
    setPracticeMode(true);
    setShowDefinition(false);
    setUserAnswer('');
    setPracticeStats({ correct: 0, total: 0 });
  };

  const handlePracticeAnswer = (isCorrect: boolean) => {
    setPracticeStats(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1
    }));

    // Update mastery level
    const currentWord = practiceWords[currentPracticeIndex];
    const masteryChange = isCorrect ? 10 : -5;
    const newMasteryLevel = Math.max(0, Math.min(100, currentWord.mastery_level + masteryChange));
    
    setWords(prev => prev.map(word => 
      word.id === currentWord.id 
        ? { ...word, mastery_level: newMasteryLevel, last_practiced: new Date().toISOString() }
        : word
    ));

    // Move to next word or finish
    setTimeout(() => {
      if (currentPracticeIndex < practiceWords.length - 1) {
        setCurrentPracticeIndex(prev => prev + 1);
        setShowDefinition(false);
        setUserAnswer('');
      } else {
        // Practice session complete
        setPracticeMode(false);
        toast.success(`Practice complete! Score: ${practiceStats.correct + (isCorrect ? 1 : 0)}/${practiceStats.total + 1}`);
      }
    }, 1500);
  };

  const speakWord = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.8;
      utterance.pitch = 1;
      speechSynthesis.speak(utterance);
    }
  };

  const getMasteryColor = (level: number) => {
    if (level >= 70) return 'bg-green-500';
    if (level >= 30) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getMasteryLabel = (level: number) => {
    if (level >= 70) return 'Mastered';
    if (level >= 30) return 'Learning';
    return 'New';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading vocabulary...</p>
        </div>
      </div>
    );
  }

  if (practiceMode) {
    const currentWord = practiceWords[currentPracticeIndex];
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="max-w-2xl mx-auto p-8">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="mb-6">
              <div className="text-sm text-gray-500 mb-2">
                Question {currentPracticeIndex + 1} of {practiceWords.length}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((currentPracticeIndex + 1) / practiceWords.length) * 100}%` }}
                ></div>
              </div>
            </div>
            
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-gray-800 mb-4">{currentWord.word}</h2>
              <button
                onClick={() => speakWord(currentWord.word)}
                className="flex items-center space-x-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors mx-auto"
              >
                <Volume2 className="h-4 w-4" />
                <span>Pronounce</span>
              </button>
            </div>
            
            {!showDefinition ? (
              <div className="space-y-4">
                <p className="text-gray-600 mb-6">What does this word mean?</p>
                <input
                  type="text"
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  placeholder="Type your answer..."
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && setShowDefinition(true)}
                />
                <button
                  onClick={() => setShowDefinition(true)}
                  className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Show Answer
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-lg text-gray-800 mb-2">{currentWord.definition}</p>
                  {currentWord.example_sentence && (
                    <p className="text-sm text-gray-600 italic">Example: {currentWord.example_sentence}</p>
                  )}
                </div>
                
                <div className="flex space-x-4 justify-center">
                  <button
                    onClick={() => handlePracticeAnswer(true)}
                    className="flex items-center space-x-2 bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 transition-colors"
                  >
                    <Check className="h-5 w-5" />
                    <span>I knew it!</span>
                  </button>
                  <button
                    onClick={() => handlePracticeAnswer(false)}
                    className="flex items-center space-x-2 bg-red-500 text-white px-6 py-3 rounded-lg hover:bg-red-600 transition-colors"
                  >
                    <X className="h-5 w-5" />
                    <span>I didn't know</span>
                  </button>
                </div>
              </div>
            )}
            
            <div className="mt-8 text-sm text-gray-500">
              Score: {practiceStats.correct}/{practiceStats.total}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
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
              <h1 className="text-2xl font-bold text-gray-800">My Vocabulary</h1>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={startPractice}
                className="flex items-center space-x-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
              >
                <BookOpen className="h-4 w-4" />
                <span>Practice</span>
              </button>
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center space-x-2 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Add Word</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search words..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Difficulties</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
            
            <select
              value={selectedMastery}
              onChange={(e) => setSelectedMastery(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Mastery Levels</option>
              <option value="low">Need Practice (&lt;30%)</option>
              <option value="medium">Learning (30-70%)</option>
              <option value="high">Mastered (&gt;70%)</option>
            </select>
            
            <div className="text-sm text-gray-600 flex items-center">
              <span>{filteredWords.length} words</span>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6 text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">{words.length}</div>
            <div className="text-gray-600">Total Words</div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6 text-center">
            <div className="text-3xl font-bold text-green-600 mb-2">
              {words.filter(w => w.mastery_level >= 70).length}
            </div>
            <div className="text-gray-600">Mastered</div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6 text-center">
            <div className="text-3xl font-bold text-yellow-600 mb-2">
              {words.filter(w => w.mastery_level >= 30 && w.mastery_level < 70).length}
            </div>
            <div className="text-gray-600">Learning</div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6 text-center">
            <div className="text-3xl font-bold text-red-600 mb-2">
              {words.filter(w => w.mastery_level < 30).length}
            </div>
            <div className="text-gray-600">Need Practice</div>
          </div>
        </div>

        {/* Word List */}
        <div className="bg-white rounded-xl shadow-lg">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-800">Vocabulary Words</h2>
          </div>
          <div className="divide-y">
            {filteredWords.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <BookOpen className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No vocabulary words found.</p>
                <p className="text-sm">Start reading books to build your vocabulary!</p>
              </div>
            ) : (
              filteredWords.map((word) => (
                <div key={word.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-800">{word.word}</h3>
                        <button
                          onClick={() => speakWord(word.word)}
                          className="text-blue-500 hover:text-blue-600 transition-colors"
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                        <span className={`px-2 py-1 rounded-full text-xs text-white ${getMasteryColor(word.mastery_level)}`}>
                          {getMasteryLabel(word.mastery_level)}
                        </span>
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                          {word.difficulty_level}
                        </span>
                        {word.category && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded-full text-xs">
                            {word.category}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 mb-2">{word.definition}</p>
                      {word.example_sentence && (
                        <p className="text-sm text-gray-500 italic">Example: {word.example_sentence}</p>
                      )}
                      <div className="mt-2">
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all duration-300 ${getMasteryColor(word.mastery_level)}`}
                              style={{ width: `${word.mastery_level}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-500">{word.mastery_level}%</span>
                        </div>
                      </div>
                      {word.last_practiced && (
                        <p className="text-xs text-gray-400 mt-1">
                          Last practiced: {new Date(word.last_practiced).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          setEditingWord(word);
                          setFormData({
                            word: word.word,
                            definition: word.definition,
                            pronunciation: word.pronunciation || '',
                            example_sentence: word.example_sentence || '',
                            difficulty_level: word.difficulty_level,
                            category: word.category || ''
                          });
                          setShowAddForm(true);
                        }}
                        className="text-blue-500 hover:text-blue-600 transition-colors"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteWord(word.id)}
                        className="text-red-500 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Word Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              {editingWord ? 'Edit Word' : 'Add New Word'}
            </h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Word"
                value={formData.word}
                onChange={(e) => setFormData(prev => ({ ...prev, word: e.target.value }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <textarea
                placeholder="Definition"
                value={formData.definition}
                onChange={(e) => setFormData(prev => ({ ...prev, definition: e.target.value }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
              <input
                type="text"
                placeholder="Pronunciation (optional)"
                value={formData.pronunciation}
                onChange={(e) => setFormData(prev => ({ ...prev, pronunciation: e.target.value }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <textarea
                placeholder="Example sentence (optional)"
                value={formData.example_sentence}
                onChange={(e) => setFormData(prev => ({ ...prev, example_sentence: e.target.value }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={2}
              />
              <select
                value={formData.difficulty_level}
                onChange={(e) => setFormData(prev => ({ ...prev, difficulty_level: e.target.value as any }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
              <input
                type="text"
                placeholder="Category (optional)"
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setEditingWord(null);
                  resetForm();
                }}
                className="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editingWord ? handleEditWord : handleAddWord}
                className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition-colors"
              >
                {editingWord ? 'Update' : 'Add'} Word
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Vocabulary;