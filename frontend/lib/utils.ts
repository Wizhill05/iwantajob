import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines Tailwind class names cleanly using clsx and twMerge.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats annual INR compensation into clean Lakhs per annum (LPA).
 * e.g. 1500000 -> "₹15L/yr", (1500000, 2500000) -> "₹15L – ₹25L/yr"
 */
export function formatSalaryLPA(
  minInr?: number | null,
  maxInr?: number | null
): string {
  if ((minInr == null && maxInr == null) || (!minInr && !maxInr)) {
    return 'Not disclosed';
  }

  const toLPA = (val: number): string => {
    const lpa = val / 100000;
    // Format to max 1 decimal place if not a whole number
    return Number.isInteger(lpa) ? `${lpa}` : `${lpa.toFixed(1)}`;
  };

  if (minInr && maxInr) {
    if (minInr === maxInr) {
      return `₹${toLPA(minInr)}L/yr`;
    }
    return `₹${toLPA(minInr)}L – ₹${toLPA(maxInr)}L/yr`;
  }

  if (minInr) {
    return `₹${toLPA(minInr)}L+/yr`;
  }

  if (maxInr) {
    return `Up to ₹${toLPA(maxInr)}L/yr`;
  }

  return 'Not disclosed';
}

/**
 * Formats ISO or parseable timestamp into clean relative human-readable time.
 * e.g. "2h ago", "3d ago", "Just now"
 */
export function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) {
    return 'Recent';
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return 'Recent';
  }

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 0) {
    return 'Just now';
  }

  if (diffInSeconds < 60) {
    return 'Just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays}d ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths}mo ago`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears}y ago`;
}

/**
 * Cleanly truncates strings without cutting words abruptly if possible.
 */
export function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen).trim()}...`;
}
