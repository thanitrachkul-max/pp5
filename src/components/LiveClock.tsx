import React, { useEffect, useState } from 'react';

export function useLiveTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function LiveClock({ timeClassName, inlineDate = false }: { timeClassName: string; inlineDate?: boolean }) {
  const now = useLiveTime();
  const dateText = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeText = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return <>{inlineDate ? <>{dateText}{' '}</> : <span>{dateText}</span>}<span className={timeClassName}>{timeText}</span></>;
}
