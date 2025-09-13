/**
 * Library page component - Browse and select books
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Book, Search, Filter, BookOpen, Star, Clock, Users, ChevronDown } from 'lucide-react';

interface BookData {
  id: string;
  title: string;
  author: string;
  description: string;
  difficulty_level: string;
  age_range: string;
  category: string;
  page_count: number;
  created_at: string;
}

interface FilterOptions {
  category: string;
  difficulty: string;
  ageRange: string;
  sortBy: string;
}

export default function Library() {
  const [books, setBooks] = useState<BookData[]>([]);
  const [filteredBooks, setFilteredBooks] = useState<BookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    category: '',
    difficulty: '',
    ageRange: '',
    sortBy: 'newest'
  });

  const categories = [
    'Adventure', 'Fantasy', 'Science', 'Animals', 'Friendship', 
    'Family', 'Mystery', 'Comedy', 'Educational', 'Classic'
  ];

  const difficultyLevels = [
    'Beginner', 'Elementary', 'Intermediate', 'Advanced'
  ];

  const ageRanges = [
    '3-5 years', '6-8 years', '9-11 years', '12-14 years', '15+ years'
  ];

  const sortOptions = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'title', label: 'Title A-Z' },
    { value: 'difficulty', label: 'Difficulty' },
    { value: 'popular', label: 'Most Popular' }
  ];

  useEffect(() => {
    loadBooks();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [books, searchQuery, filters]);

  const loadBooks = async () => {
    try {
      setLoading(true);
      const response = await api.getBooks({ limit: 50 });
      setBooks(response.books || []);
    } catch (error) {
      console.error('Failed to load books:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...books];

    // Apply search query
    if (searchQuery) {
      filtered = filtered.filter(book => 
        book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply category filter
    if (filters.category) {
      filtered = filtered.filter(book => book.category === filters.category);
    }

    // Apply difficulty filter
    if (filters.difficulty) {
      filtered = filtered.filter(book => book.difficulty_level === filters.difficulty);
    }

    // Apply age range filter
    if (filters.ageRange) {
      filtered = filtered.filter(book => book.age_range === filters.ageRange);
    }

    // Apply sorting
    switch (filters.sortBy) {
      case 'newest':
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'oldest':
        filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'title':
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'difficulty':
        const difficultyOrder = ['Beginner', 'Elementary', 'Intermediate', 'Advanced'];
        filtered.sort((a, b) => 
          difficultyOrder.indexOf(a.difficulty_level) - difficultyOrder.indexOf(b.difficulty_level)
        );
        break;
      default:
        break;
    }

    setFilteredBooks(filtered);
  };

  const handleFilterChange = (key: keyof FilterOptions, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      category: '',
      difficulty: '',
      ageRange: '',
      sortBy: 'newest'
    });
    setSearchQuery('');
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Beginner': return 'bg-green-100 text-green-800';
      case 'Elementary': return 'bg-blue-100 text-blue-800';
      case 'Intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'Advanced': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const BookCard = ({ book }: { book: BookData }) => (
    <Link
      to={`/book/${book.id}`}
      className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-200 group"
    >
      {/* Book Cover */}
      <div className="aspect-[3/4] bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 rounded-lg mb-4 flex items-center justify-center group-hover:scale-105 transition-transform">
        <BookOpen className="w-12 h-12 text-blue-500" />
      </div>

      {/* Book Info */}
      <div className="space-y-2">
        <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
          {book.title}
        </h3>
        <p className="text-sm text-gray-600">by {book.author}</p>
        
        {/* Difficulty Badge */}
        <div className="flex items-center justify-between">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(book.difficulty_level)}`}>
            {book.difficulty_level}
          </span>
          <div className="flex items-center text-xs text-gray-500">
            <Clock className="w-3 h-3 mr-1" />
            {book.page_count} pages
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-600 line-clamp-2">
          {book.description}
        </p>

        {/* Category */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-gray-500">{book.category}</span>
          <span className="text-xs text-gray-500">{book.age_range}</span>
        </div>
      </div>
    </Link>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            📚 Book Library
          </h1>
          <p className="text-gray-600">
            Discover amazing stories and start your reading adventure!
          </p>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-8">
          {/* Search Bar */}
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search books, authors, or topics..."
              className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Filter Toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Filter className="w-5 h-5" />
              <span>Filters</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {filteredBooks.length} book{filteredBooks.length !== 1 ? 's' : ''} found
              </span>
              {(filters.category || filters.difficulty || filters.ageRange || searchQuery) && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Filter Options */}
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={filters.category}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Categories</option>
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              {/* Difficulty Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Difficulty</label>
                <select
                  value={filters.difficulty}
                  onChange={(e) => handleFilterChange('difficulty', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Levels</option>
                  {difficultyLevels.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>

              {/* Age Range Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Age Range</label>
                <select
                  value={filters.ageRange}
                  onChange={(e) => handleFilterChange('ageRange', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Ages</option>
                  {ageRanges.map(range => (
                    <option key={range} value={range}>{range}</option>
                  ))}
                </select>
              </div>

              {/* Sort Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
                <select
                  value={filters.sortBy}
                  onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {sortOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Books Grid */}
        {filteredBooks.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No books found</h3>
            <p className="text-gray-600 mb-4">
              {searchQuery || filters.category || filters.difficulty || filters.ageRange
                ? 'Try adjusting your search or filters'
                : 'No books available at the moment'}
            </p>
            {(searchQuery || filters.category || filters.difficulty || filters.ageRange) && (
              <button
                onClick={clearFilters}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        )}

        {/* Load More Button (if needed) */}
        {filteredBooks.length > 0 && filteredBooks.length % 20 === 0 && (
          <div className="text-center mt-8">
            <button className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors">
              Load More Books
            </button>
          </div>
        )}
      </div>
    </div>
  );
}