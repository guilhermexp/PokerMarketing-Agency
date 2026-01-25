import React from "react";

export const GeneratingLoader: React.FC = () => {
  return (
    <div className="generating-loader-wrapper">
      <div className="generating-loader-text">
        <span className="generating-loader-letter">G</span>
        <span className="generating-loader-letter">e</span>
        <span className="generating-loader-letter">r</span>
        <span className="generating-loader-letter">a</span>
        <span className="generating-loader-letter">n</span>
        <span className="generating-loader-letter">d</span>
        <span className="generating-loader-letter">o</span>
      </div>
      <div className="generating-loader-bar"></div>
    </div>
  );
};
