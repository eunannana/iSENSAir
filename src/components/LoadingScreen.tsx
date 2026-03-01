import { useState, useEffect } from "react";

export interface LoadingScreenProps {
  isVisible: boolean;
  message?: string;
  stage?: "connecting" | "booting" | "loading";
}

export default function LoadingScreen({
  isVisible,
  message = "Loading river monitoring data...",
  stage = "loading",
}: LoadingScreenProps) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length < 3 ? prev + "." : ""));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  if (!isVisible) return null;

  const stageMessages = {
    connecting: "Connecting to API",
    booting: "API is starting up",
    loading: "Loading river monitoring data",
  };

  const displayMessage = message || stageMessages[stage];

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-white to-gray-50 flex flex-col items-center justify-center z-50 transition-opacity duration-500">
      <div className="flex flex-col items-center gap-6 max-w-md">
        {/* Main Spinner with gradient */}
        <div className="relative w-20 h-20 flex items-center justify-center">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-4 border-blue-200 animate-pulse"></div>

          {/* Spinning ring */}
          <div className="w-20 h-20 border-4 border-blue-600 border-t-blue-300 border-r-blue-300 rounded-full animate-spin"></div>

          {/* Center circle */}
          <div className="absolute w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
            <div className="w-4 h-4 bg-white rounded-full"></div>
          </div>
        </div>

        {/* Stage indicator - small badges showing progress */}
        <div className="flex gap-2 justify-center">
          {["connecting", "booting", "loading"].map((s) => (
            <div
              key={s}
              className={`h-2 w-2 rounded-full transition-all duration-500 ${
                stage === s || ["connecting", "booting", "loading"].indexOf(s) < ["connecting", "booting", "loading"].indexOf(stage)
                  ? "bg-blue-600 w-8"
                  : "bg-gray-300"
              }`}
            ></div>
          ))}
        </div>

        {/* Main message */}
        <div className="text-center">
          <p className="text-gray-700 text-base tracking-wide font-medium">
            {displayMessage}
            <span className="inline-block w-4 text-left">{dots}</span>
          </p>

          {/* Sub-message */}
          {stage === "booting" && (
            <p className="text-gray-500 text-sm mt-2">
              This may take a moment on first access
            </p>
          )}

          {stage === "connecting" && (
            <p className="text-gray-500 text-sm mt-2">
              Initializing connection
            </p>
          )}
        </div>

        {/* Progress bar simulation */}
        <div className="w-full max-w-xs bg-gray-200 rounded-full h-1 overflow-hidden">
          <div
            className="bg-gradient-to-r from-blue-600 to-blue-400 h-full rounded-full animate-pulse"
            style={{
              animation: "progress 2s ease-in-out infinite",
            }}
          ></div>
        </div>

        {/* Helpful tip */}
        <p className="text-xs text-gray-400 text-center mt-2 max-w-xs">
          {stage === "booting"
            ? "The server is waking up from sleep mode. Please be patient..."
            : "Fetching data from server..."}
        </p>
      </div>

      <style jsx>{`
        @keyframes progress {
          0% {
            width: 10%;
            left: 0%;
          }
          50% {
            width: 70%;
            left: 20%;
          }
          100% {
            width: 10%;
            left: 90%;
          }
        }
      `}</style>
    </div>
  );
}
