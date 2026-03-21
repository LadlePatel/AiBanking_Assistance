import React, { useEffect, useState } from "react";
import { DarkModeSwitch } from "react-toggle-dark-mode";

const Darkmode = () => {
  const [isDarkMode, setDarkMode] = useState(() => {
    // SSR-safe checks
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      return false; // Default to light mode for SSR
    }

    // Check if user has a saved preference with error handling
    try {
      const savedMode = localStorage.getItem("darkMode");
      if (savedMode !== null) {
        return JSON.parse(savedMode);
      }
    } catch (error) {
      console.warn("Failed to parse darkMode from localStorage:", error);
      // Fall through to system preference
    }

    // Otherwise, check system preference
    if (window.matchMedia && typeof window.matchMedia === "function") {
      try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      } catch (error) {
        console.warn("Failed to detect system color scheme:", error);
      }
    }

    return false; // Default fallback
  });

  const toggleDarkMode = (checked) => {
    setDarkMode(checked);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem("darkMode", JSON.stringify(checked));
      } catch (error) {
        console.warn("Failed to save darkMode to localStorage:", error);
      }
    }
  };

  useEffect(() => {
    // Apply dark mode class
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  useEffect(() => {
    // Listen for system theme changes
    const mediaQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    if (!mediaQuery) return; // Exit if matchMedia not available

    const handleChange = (e) => {
      // Only auto-switch if user hasn't set a preference
      if (typeof localStorage !== "undefined") {
        try {
          const savedMode = localStorage.getItem("darkMode");
          if (savedMode === null) {
            setDarkMode(e.matches);
          }
        } catch (error) {
          console.warn("Failed to check localStorage for darkMode:", error);
        }
      }
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else if (mediaQuery.addListener) {
      // Legacy browsers
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  return (
    <DarkModeSwitch checked={isDarkMode} onChange={toggleDarkMode} size={30} />
  );
};

export default Darkmode;
