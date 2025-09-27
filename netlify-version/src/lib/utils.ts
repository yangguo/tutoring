import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Cleans text for TTS (Text-to-Speech) by removing non-word characters and formatting
 * that don't contribute to natural speech
 */
export function cleanTextForTTS(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    // Remove markdown formatting
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
    .replace(/\*(.*?)\*/g, '$1') // Remove italic
    .replace(/`(.*?)`/g, '$1') // Remove code
    .replace(/#{1,6}\s/g, '') // Remove headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
    // Remove special characters and symbols that don't contribute to speech
    .replace(/[#@$%^&*()_+=\[\]{}|\\:";'<>?,./~`]/g, ' ') // Remove special characters
    .replace(/[-]{2,}/g, ' ') // Replace multiple dashes with space
    .replace(/[^\w\s.,!?-]/g, ' ') // Keep only word characters, spaces, and basic punctuation
    // Clean up spacing and formatting
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/\n+/g, '. ') // Replace newlines with periods for natural pauses
    .replace(/\.\s*\./g, '.') // Remove duplicate periods
    .replace(/\s+([.,!?])/g, '$1') // Remove spaces before punctuation
    .trim();
}
