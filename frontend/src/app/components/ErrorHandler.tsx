"use client";

import { useEffect } from "react";

/**
 * Client-side error handler untuk menangani Supabase refresh token errors
 * yang tidak kritis dan tidak mempengaruhi aplikasi
 */
export default function ErrorHandler() {
  useEffect(() => {
    // Handle unhandled promise rejections untuk Supabase refresh token errors
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      const errorMessage = error?.message || String(error);
      const errorStack = error?.stack || '';
      
      // Check if this is a Supabase refresh token error
      const isSupabaseRefreshError = 
        errorMessage === 'Failed to fetch' &&
        (errorStack.includes('_refreshAccessToken') || 
         errorStack.includes('_callRefreshToken') ||
         errorStack.includes('SupabaseAuthClient') ||
         errorStack.includes('_recoverAndRefresh'));
      
      if (isSupabaseRefreshError) {
        // Prevent the error from showing in console
        event.preventDefault();
        
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
          console.debug('ℹ️ Supabase token refresh failed (non-critical):', errorMessage);
        }
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}




