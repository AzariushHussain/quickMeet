import React, { useState } from 'react';

const ProfileImage = ({ 
  src, 
  alt, 
  name, 
  size = 32, 
  className = "", 
  fallbackBgColor = "6366f1",
  fallbackTextColor = "ffffff",
  showInitials = false
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Generate fallback URL
  const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name || alt || 'User')}&size=${size}&background=${fallbackBgColor}&color=${fallbackTextColor}`;

  const handleError = (e) => {
    console.log(`Profile image failed to load for ${name || alt}, using fallback. Original URL:`, src);
    setHasError(true);
    setIsLoading(false);
    if (e.target.src !== fallbackUrl) {
      e.target.src = fallbackUrl;
    }
  };

  const handleLoad = () => {
    console.log(`Profile image loaded successfully for ${name || alt}:`, src);
    setIsLoading(false);
  };

  // If we want to show initials instead of loading an image
  if (showInitials || (!src && !fallbackUrl)) {
    const initials = (name || alt || 'U').charAt(0).toUpperCase();
    return (
      <div 
        className={`flex items-center justify-center rounded-full bg-gray-500 text-white font-bold ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(12, size / 3) }}
      >
        {initials}
      </div>
    );
  }

  return (
    <div className="relative">
      <img
        src={hasError ? fallbackUrl : (src || fallbackUrl)}
        alt={alt}
        className={`rounded-full ${className}`}
        style={{ width: size, height: size }}
        onError={handleError}
        onLoad={handleLoad}
        loading="lazy"
      />
      {isLoading && (
        <div 
          className="absolute inset-0 bg-gray-300 animate-pulse rounded-full"
          style={{ width: size, height: size }}
        />
      )}
    </div>
  );
};

export default ProfileImage;
