import React, { useState } from 'react';
import { Upload as UploadIcon, BookOpen, AlertCircle, CheckCircle } from 'lucide-react';
import { convertPdfFileToImages } from '../lib/pdf';
import { API_BASE_URL } from '../lib/api';

interface UploadFormData {
  title: string;
  description: string;
  target_age_min: number;
  target_age_max: number;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  category: string;
  language: string;
  is_public: boolean;
  file: File | null;
}

const Upload: React.FC = () => {
  const [formData, setFormData] = useState<UploadFormData>({
    title: '',
    description: '',
    target_age_min: 3,
    target_age_max: 8,
    difficulty_level: 'beginner',
    category: '',
    language: 'en',
    is_public: false,
    file: null
  });

  const [isUploading, setIsUploading] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.category.trim()) {
      newErrors.category = 'Category is required';
    }

    if (!formData.file) {
      newErrors.file = 'Please select a file to upload';
    } else {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(formData.file.type)) {
        newErrors.file = 'Only PDF, JPG, and PNG files are allowed';
      }
      if (formData.file.size > 50 * 1024 * 1024) {
        newErrors.file = 'File size must be less than 50MB';
      }
    }

    if (formData.target_age_min < 3 || formData.target_age_min > 18) {
      newErrors.target_age_min = 'Minimum age must be between 3 and 18';
    }

    if (formData.target_age_max < 3 || formData.target_age_max > 18) {
      newErrors.target_age_max = 'Maximum age must be between 3 and 18';
    }

    if (formData.target_age_min > formData.target_age_max) {
      newErrors.target_age_max = 'Maximum age must be greater than or equal to minimum age';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (type === 'number') {
      setFormData(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFormData(prev => ({ ...prev, file }));
    
    if (errors.file) {
      setErrors(prev => ({ ...prev, file: '' }));
    }
  };

  const buildApiUrl = (path: string) => `${API_BASE_URL.replace(/\/$/, '')}${path}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsUploading(true);
    setConversionProgress(null);
    setUploadStatus({ type: null, message: '' });

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const formDataToSend = new FormData();
      formDataToSend.append('title', formData.title);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('target_age_min', formData.target_age_min.toString());
      formDataToSend.append('target_age_max', formData.target_age_max.toString());
      formDataToSend.append('difficulty_level', formData.difficulty_level);
      formDataToSend.append('category', formData.category);
      formDataToSend.append('language', formData.language);
      formDataToSend.append('is_public', formData.is_public.toString());
      if (formData.file) {
        formDataToSend.append('file', formData.file);
      }

      const response = await fetch(buildApiUrl('/api/upload/book'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formDataToSend
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      // If a PDF was uploaded, convert to images and upload pages
      if (formData.file && formData.file.type === 'application/pdf' && result?.book?.id) {
        try {
          setConversionProgress('Converting PDF to images...');
          const images = await convertPdfFileToImages(formData.file);
          setConversionProgress(`Uploading ${images.length} page images...`);

          // Build FormData for pages
          const pagesForm = new FormData();
          images.forEach(({ blob, pageNumber }, _idx) => {
            const fileName = `page-${pageNumber}.png`;
            const file = new File([blob], fileName, { type: 'image/png' });
            pagesForm.append('pages', file, fileName);
          });

          const pagesResp = await fetch(buildApiUrl(`/api/upload/book/${result.book.id}/pages`), {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: pagesForm,
          });
          const pagesResult = await pagesResp.json().catch(() => ({}));
          if (!pagesResp.ok) {
            throw new Error(pagesResult.error || 'Failed to upload page images');
          }

          setConversionProgress(null);
          setUploadStatus({
            type: 'success',
            message: `Book uploaded and ${images.length} pages processed.`
          });
        } catch (convErr) {
          setConversionProgress(null);
          setUploadStatus({
            type: 'error',
            message: convErr instanceof Error ? convErr.message : 'PDF conversion failed'
          });
        }
      } else {
        setUploadStatus({
          type: 'success',
          message: 'Book uploaded successfully!'
        });
      }

      // Reset form
      setFormData({
        title: '',
        description: '',
        target_age_min: 3,
        target_age_max: 8,
        difficulty_level: 'beginner',
        category: '',
        language: 'en',
        is_public: false,
        file: null
      });

      // Reset file input
      const fileInput = document.getElementById('file') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }

    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Upload failed'
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="flex items-center mb-6">
          <BookOpen className="h-8 w-8 text-blue-600 mr-3" />
          <h1 className="text-3xl font-bold text-gray-900">Upload Book</h1>
        </div>

        {(uploadStatus.type || conversionProgress) && (
          <div className={`mb-6 p-4 rounded-md flex items-center ${
            uploadStatus.type === 'success' 
              ? 'bg-green-50 text-green-800 border border-green-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {uploadStatus.type === 'success' ? (
              <CheckCircle className="h-5 w-5 mr-2" />
            ) : (
              <AlertCircle className="h-5 w-5 mr-2" />
            )}
            {conversionProgress ? conversionProgress : uploadStatus.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Title *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.title ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Enter book title"
            />
            {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter book description"
            />
          </div>

          {/* Age Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="target_age_min" className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Age *
              </label>
              <input
                type="number"
                id="target_age_min"
                name="target_age_min"
                value={formData.target_age_min}
                onChange={handleInputChange}
                min="3"
                max="18"
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.target_age_min ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.target_age_min && <p className="mt-1 text-sm text-red-600">{errors.target_age_min}</p>}
            </div>
            <div>
              <label htmlFor="target_age_max" className="block text-sm font-medium text-gray-700 mb-2">
                Maximum Age *
              </label>
              <input
                type="number"
                id="target_age_max"
                name="target_age_max"
                value={formData.target_age_max}
                onChange={handleInputChange}
                min="3"
                max="18"
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.target_age_max ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.target_age_max && <p className="mt-1 text-sm text-red-600">{errors.target_age_max}</p>}
            </div>
          </div>

          {/* Difficulty Level */}
          <div>
            <label htmlFor="difficulty_level" className="block text-sm font-medium text-gray-700 mb-2">
              Difficulty Level *
            </label>
            <select
              id="difficulty_level"
              name="difficulty_level"
              value={formData.difficulty_level}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
              Category *
            </label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.category ? 'border-red-300' : 'border-gray-300'
              }`}
            >
              <option value="">Select a category</option>
              <option value="fiction">Fiction</option>
              <option value="non-fiction">Non-Fiction</option>
              <option value="educational">Educational</option>
              <option value="children">Children</option>
              <option value="science">Science</option>
              <option value="history">History</option>
              <option value="biography">Biography</option>
              <option value="fantasy">Fantasy</option>
              <option value="mystery">Mystery</option>
              <option value="romance">Romance</option>
              <option value="general">General</option>
            </select>
            {errors.category && <p className="mt-1 text-sm text-red-600">{errors.category}</p>}
          </div>

          {/* Language */}
          <div>
            <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-2">
              Language
            </label>
            <select
              id="language"
              name="language"
              value={formData.language}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="zh">Chinese</option>
            </select>
          </div>

          {/* Public Access */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_public"
              name="is_public"
              checked={formData.is_public}
              onChange={handleInputChange}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="is_public" className="ml-2 block text-sm text-gray-700">
              Make this book publicly available
            </label>
          </div>

          {/* File Upload */}
          <div>
            <label htmlFor="file" className="block text-sm font-medium text-gray-700 mb-2">
              Book File *
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                <UploadIcon className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600">
                  <label
                    htmlFor="file"
                    className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                  >
                    <span>Upload a file</span>
                    <input
                      id="file"
                      name="file"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">
                  PDF, JPG, PNG up to 50MB
                </p>
                {formData.file && (
                  <p className="text-sm text-green-600 mt-2">
                    Selected: {formData.file.name}
                  </p>
                )}
              </div>
            </div>
            {errors.file && <p className="mt-1 text-sm text-red-600">{errors.file}</p>}
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={isUploading}
              className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                isUploading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
              }`}
            >
              {isUploading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Uploading...
                </>
              ) : (
                'Upload Book'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Upload;
