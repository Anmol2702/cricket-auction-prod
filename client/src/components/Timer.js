// client/src/components/Timer.js

import React from 'react';

function Timer({ timeLeft }) {
  // Don't render anything if the timer isn't active (timeLeft is 0 or null)
  if (!timeLeft) {
    return null;
  }

  // Add a warning class if time is running out
  const timerClass = timeLeft <= 5 ? 'timer warning' : 'timer';

  return (
    <div className={timerClass}>
      Time Left: {timeLeft}s
    </div>
  );
}

export default Timer;