import React from 'react';

function LoadingSpinner({ message = 'מתחבר לשרת הנתונים...' }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-4">
      {/* האנימציה של הספינר */}
      <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
      
      {/* טקסט מתחלף */}
      <div className="text-slate-600 font-medium animate-pulse">
        {message}
      </div>
    </div>
  );
}

export default LoadingSpinner;