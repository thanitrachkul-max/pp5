import React, { useEffect, useId, useState } from 'react';
import { ModalPortal } from './ModalPortal';
import { parseAssessmentScore } from '../lib/assessmentLimits';

interface Props {
  value: number | string | null | undefined;
  onChange: (value: number | '') => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/** Assessment ratings are whole numbers from 0 to 3. */
export const AssessmentScoreCell: React.FC<Props> = ({ value, onChange, disabled = false, className = '', ariaLabel }) => {
  const [warning, setWarning] = useState<{ top: number; left: number } | null>(null);
  const warningId = useId();

  useEffect(() => {
    if (!warning) return;
    const dismiss = () => setWarning(null);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [warning]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const text = event.currentTarget.value;
    const score = parseAssessmentScore(text);
    if (score === '') {
      setWarning(null);
      onChange('');
      return;
    }
    if (score === null) {
      const rect = event.currentTarget.getBoundingClientRect();
      setWarning({
        top: Math.max(8, rect.bottom + 36 < window.innerHeight ? rect.bottom + 6 : rect.top - 38),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 160)),
      });
      return;
    }
    setWarning(null);
    onChange(score);
  };

  return <>
    <td className={`${className} ${warning ? 'score-entry-cell-invalid' : ''}`}>
      <input
        type="number"
        min={0}
        max={3}
        step={1}
        className="excel-input text-center"
        value={value ?? ''}
        onChange={handleChange}
        onBlur={() => setWarning(null)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={Boolean(warning)}
        aria-describedby={warning ? warningId : undefined}
      />
    </td>
    {warning && <ModalPortal>
      <div id={warningId} role="alert" className="pointer-events-none fixed z-[150] whitespace-nowrap rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 shadow-md" style={{ top: warning.top, left: warning.left }}>
        กรอกได้ 0–3 เท่านั้น
      </div>
    </ModalPortal>}
  </>;
};
