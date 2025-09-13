import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy, Star, Medal, Award, Lock, CheckCircle, Target, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import type { Achievement } from '../lib/api';

interface UserAchievement extends Achievement {
  earned_at?: string;
  progress: number;
  is_earned: boolean;
}

interface LeaderboardEntry {
  user_id: string;
  username: string;
  total_achievements: number;
  total_points: number;
  rank: number;
}

const Achievements: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [achievements, setAchievements] = useState<UserAchievement[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [userStats, setUserStats] = useState({
    totalEarned: 0,
    totalPoints: 0,
    rank: 0,
    recentAchievements: [] as UserAchievement[]
  });

  const categories = [
    { id: 'all', name: 'All Achievements', icon: Trophy },
    { id: 'reading', name: 'Reading', icon: Star },
    { id: 'vocabulary', name: 'Vocabulary', icon: Medal },
    { id: 'speaking', name: 'Speaking', icon: Award },
    { id: 'progress', name: 'Progress', icon: TrendingUp }
  ];

  useEffect(() => {
    fetchAchievements();
    fetchLeaderboard();
  }, []);

  const fetchAchievements = async () => {
    try {
      const response = await api.getUserAchievements();
      const userAchievements = response.achievements || [];
      
      // Calculate user stats
      const earned = userAchievements.filter((a: UserAchievement) => a.is_earned);
      const totalPoints = earned.reduce((sum: number, a: UserAchievement) => sum + (a.points || 0), 0);
      const recent = earned
        .sort((a: UserAchievement, b: UserAchievement) => 
          new Date(b.earned_at || '').getTime() - new Date(a.earned_at || '').getTime()
        )
        .slice(0, 3);
      
      setAchievements(userAchievements);
      setUserStats({
        totalEarned: earned.length,
        totalPoints,
        rank: 0, // Will be updated from leaderboard
        recentAchievements: recent
      });
    } catch (error) {
      console.error('Error fetching achievements:', error);
      toast.error('Failed to load achievements');
    } finally {
      setLoading(false);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const response = await api.getAchievementLeaderboard();
      const leaderboardData = response.leaderboard || [];
      setLeaderboard(leaderboardData);
      
      // Find user's rank
      const userEntry = leaderboardData.find((entry: LeaderboardEntry) => entry.user_id === user?.id);
      if (userEntry) {
        setUserStats(prev => ({ ...prev, rank: userEntry.rank }));
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  };

  const filteredAchievements = achievements.filter(achievement => 
    selectedCategory === 'all' || achievement.category === selectedCategory
  );

  const getAchievementIcon = (category: string, isEarned: boolean) => {
    const iconClass = `h-8 w-8 ${isEarned ? 'text-yellow-500' : 'text-gray-400'}`;
    
    switch (category) {
      case 'reading':
        return <Star className={iconClass} />;
      case 'vocabulary':
        return <Medal className={iconClass} />;
      case 'speaking':
        return <Award className={iconClass} />;
      case 'progress':
        return <TrendingUp className={iconClass} />;
      default:
        return <Trophy className={iconClass} />;
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return 'bg-green-500';
    if (progress >= 75) return 'bg-yellow-500';
    if (progress >= 50) return 'bg-blue-500';
    return 'bg-gray-300';
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading achievements...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-50">
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
              <h1 className="text-2xl font-bold text-gray-800">Achievements</h1>
            </div>
            <button
              onClick={() => setShowLeaderboard(!showLeaderboard)}
              className="flex items-center space-x-2 bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-600 transition-colors"
            >
              <Trophy className="h-4 w-4" />
              <span>{showLeaderboard ? 'Hide' : 'Show'} Leaderboard</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="space-y-6">
            {/* User Stats */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Your Progress</h2>
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-600 mb-1">{userStats.totalEarned}</div>
                  <div className="text-sm text-gray-600">Achievements Earned</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-1">{userStats.totalPoints}</div>
                  <div className="text-sm text-gray-600">Total Points</div>
                </div>
                {userStats.rank > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600 mb-1">{getRankIcon(userStats.rank)}</div>
                    <div className="text-sm text-gray-600">Global Rank</div>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Achievements */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Achievements</h2>
              <div className="space-y-3">
                {userStats.recentAchievements.length === 0 ? (
                  <p className="text-gray-500 text-sm">No achievements yet. Keep learning!</p>
                ) : (
                  userStats.recentAchievements.map((achievement) => (
                    <div key={achievement.id} className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        {getAchievementIcon(achievement.category, true)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{achievement.title}</p>
                        <p className="text-xs text-gray-500">
                          {achievement.earned_at && new Date(achievement.earned_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-xs text-yellow-600 font-medium">+{achievement.points}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Categories */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Categories</h2>
              <div className="space-y-2">
                {categories.map((category) => {
                  const Icon = category.icon;
                  const count = achievements.filter(a => 
                    (category.id === 'all' || a.category === category.id) && a.is_earned
                  ).length;
                  
                  return (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                        selectedCategory === category.id
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Icon className="h-5 w-5" />
                        <span className="font-medium">{category.name}</span>
                      </div>
                      <span className="text-sm font-medium">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {showLeaderboard ? (
              /* Leaderboard */
              <div className="bg-white rounded-xl shadow-lg">
                <div className="p-6 border-b">
                  <h2 className="text-xl font-semibold text-gray-800">Achievement Leaderboard</h2>
                </div>
                <div className="divide-y">
                  {leaderboard.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <Trophy className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>No leaderboard data available.</p>
                    </div>
                  ) : (
                    leaderboard.map((entry, index) => (
                      <div 
                        key={entry.user_id} 
                        className={`p-4 flex items-center justify-between ${
                          entry.user_id === user?.id ? 'bg-yellow-50' : 'hover:bg-gray-50'
                        } transition-colors`}
                      >
                        <div className="flex items-center space-x-4">
                          <div className="text-2xl font-bold text-gray-600 w-12 text-center">
                            {getRankIcon(entry.rank)}
                          </div>
                          <div>
                            <div className="font-medium text-gray-800">
                              {entry.username}
                              {entry.user_id === user?.id && (
                                <span className="ml-2 text-sm text-yellow-600">(You)</span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500">
                              {entry.total_achievements} achievements
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-yellow-600">{entry.total_points}</div>
                          <div className="text-sm text-gray-500">points</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* Achievements Grid */
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-800">
                    {categories.find(c => c.id === selectedCategory)?.name || 'All Achievements'}
                  </h2>
                  <div className="text-sm text-gray-600">
                    {filteredAchievements.filter(a => a.is_earned).length} of {filteredAchievements.length} earned
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredAchievements.map((achievement) => (
                    <div 
                      key={achievement.id} 
                      className={`bg-white rounded-xl shadow-lg p-6 transition-all duration-300 ${
                        achievement.is_earned 
                          ? 'ring-2 ring-yellow-200 shadow-yellow-100' 
                          : 'opacity-75 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0">
                          {achievement.is_earned ? (
                            <div className="relative">
                              {getAchievementIcon(achievement.category, true)}
                              <CheckCircle className="absolute -top-1 -right-1 h-4 w-4 text-green-500 bg-white rounded-full" />
                            </div>
                          ) : (
                            <div className="relative">
                              {getAchievementIcon(achievement.category, false)}
                              <Lock className="absolute -top-1 -right-1 h-4 w-4 text-gray-400 bg-white rounded-full" />
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className={`font-semibold ${
                              achievement.is_earned ? 'text-gray-800' : 'text-gray-500'
                            }`}>
                              {achievement.title}
                            </h3>
                            <span className={`text-sm font-medium ${
                              achievement.is_earned ? 'text-yellow-600' : 'text-gray-400'
                            }`}>
                              {achievement.points} pts
                            </span>
                          </div>
                          
                          <p className={`text-sm mb-3 ${
                            achievement.is_earned ? 'text-gray-600' : 'text-gray-400'
                          }`}>
                            {achievement.description}
                          </p>
                          
                          {!achievement.is_earned && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>Progress</span>
                                <span>{achievement.progress}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(achievement.progress)}`}
                                  style={{ width: `${achievement.progress}%` }}
                                ></div>
                              </div>
                            </div>
                          )}
                          
                          {achievement.is_earned && achievement.earned_at && (
                            <div className="flex items-center space-x-2 text-xs text-green-600">
                              <CheckCircle className="h-3 w-3" />
                              <span>Earned on {new Date(achievement.earned_at).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {filteredAchievements.length === 0 && (
                  <div className="text-center py-12">
                    <Trophy className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium text-gray-600 mb-2">No achievements in this category</h3>
                    <p className="text-gray-500">Keep learning to unlock new achievements!</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Achievements;