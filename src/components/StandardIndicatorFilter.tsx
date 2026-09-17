import React, { useState, useEffect } from 'react';
import { fetchCurriculumStandards, parseClassLevelCode, type Standard } from '../lib/curriculum';
import { Plus, Trash2 } from 'lucide-react';

interface Props {
  subjectName: string;
  subjectCode?: string;
  learningArea?: string;
  gradeLevel: string;
  initialStandard?: string;
  initialIndicators?: string[];
  expectedLearningOutcomes?: string;
  onExpectedLearningOutcomesChange?: (value: string) => void;
  onSelectIndicators: (standardCode: string, indicators: string[]) => void;
}

export const StandardIndicatorFilter: React.FC<Props> = ({
  subjectName,
  subjectCode,
  learningArea,
  gradeLevel,
  initialStandard = '',
  initialIndicators = [],
  onSelectIndicators,
  expectedLearningOutcomes = "",
  onExpectedLearningOutcomesChange,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(initialIndicators);
  const [isManualMode, setIsManualMode] = useState<boolean>(false);
  const [manualStandard, setManualStandard] = useState<string>(initialStandard);
  const [manualIndicators, setManualIndicators] = useState<string[]>(
    initialIndicators.length > 0 ? initialIndicators : [''],
  );
  const [standards, setStandards] = useState<Standard[]>([]);
  const [loadingStandards, setLoadingStandards] = useState(false);

  const classLevel = parseClassLevelCode(gradeLevel);

  useEffect(() => {
    setSelectedSubject(subjectName || learningArea || '');
    setSelectedIndicators(initialIndicators);
    setManualStandard(initialStandard);
    setManualIndicators(initialIndicators.length > 0 ? initialIndicators : ['']);
    setIsManualMode(false);
  }, [subjectName, learningArea, gradeLevel, classLevel]);

  useEffect(() => {
    const area = learningArea || subjectName;
    if (!area || !classLevel) return;
    let cancelled = false;
    setLoadingStandards(true);
    void fetchCurriculumStandards(area, classLevel, subjectName, { subjectCode }).then((data) => {
      if (!cancelled) {
        setStandards(data);
        setLoadingStandards(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setStandards([]);
        setLoadingStandards(false);
      }
    });
    return () => { cancelled = true; };
  }, [learningArea, subjectName, subjectCode, classLevel]);

  const handleIndicatorToggle = (indCode: string) => {
    setSelectedIndicators(prev =>
      prev.includes(indCode) ? prev.filter(code => code !== indCode) : [...prev, indCode],
    );
  };

  const handleSelectAll = (standard: Standard) => {
    const allCodes = standard.indicators.map(ind => ind.code);
    setSelectedIndicators(prev => Array.from(new Set([...prev, ...allCodes])));
  };

  const handleDeselectStandard = (standard: Standard) => {
    const codes = new Set(standard.indicators.map(ind => ind.code));
    setSelectedIndicators(prev => prev.filter(code => !codes.has(code)));
  };

  const handleDeselectAll = () => {
    setSelectedIndicators([]);
  };

  const handleAddManualIndicator = () => {
    setManualIndicators(prev => [...prev, '']);
  };

  const handleRemoveManualIndicator = (index: number) => {
    setManualIndicators(prev => prev.filter((_, i) => i !== index));
  };

  const handleManualIndicatorChange = (index: number, value: string) => {
    setManualIndicators(prev => {
      const newInds = [...prev];
      newInds[index] = value;
      return newInds;
    });
  };

  useEffect(() => {
    if (isManualMode) {
      const validIndicators = manualIndicators.filter(i => i.trim() !== '');
      onSelectIndicators(manualStandard.trim(), validIndicators);
      return;
    }

    const selectedStandardCodes = standards
      .filter(standard => standard.indicators.some(ind => selectedIndicators.includes(ind.code)))
      .map(standard => standard.code);
    onSelectIndicators(selectedStandardCodes.join(', '), selectedIndicators);
  }, [selectedIndicators, isManualMode, manualStandard, manualIndicators, standards, onSelectIndicators]);

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-5">
      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
        <h3 className="font-bold text-slate-800">มาตรฐานการเรียนรู้และตัวชี้วัด</h3>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-slate-500">โหมดการกรอก:</span>
          <button
            type="button"
            onClick={() => setIsManualMode(false)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${!isManualMode ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            เลือกจากฐานข้อมูล
          </button>
          <button
            type="button"
            onClick={() => setIsManualMode(true)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${isManualMode ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            กรอกเอง
          </button>
        </div>
      </div>

      {!isManualMode ? (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">ระดับชั้น</label>
              <input
                type="text"
                value={classLevel}
                readOnly
                className="w-full border border-slate-300 rounded-md p-2 text-sm bg-slate-100 text-slate-600 cursor-not-allowed"
              />
            </div>
          </div>

          {loadingStandards ? (
            <p className="text-sm text-slate-500 py-4 text-center">กำลังโหลดหลักสูตร...</p>
          ) : standards.length > 0 ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-slate-700">ตัวชี้วัดที่ต้องการประเมิน</label>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  ยกเลิกทั้งหมด
                </button>
              </div>

              <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                {standards.map(std => {
                  const standardCodes = std.indicators.map(ind => ind.code);
                  const selectedInStandard = standardCodes.filter(code => selectedIndicators.includes(code));
                  const allSelected =
                    standardCodes.length > 0 && selectedInStandard.length === standardCodes.length;

                  return (
                    <section key={std.code} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => allSelected ? handleDeselectStandard(std) : handleSelectAll(std)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          aria-label={`เลือกตัวชี้วัดทั้งหมดของ ${std.code}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-blue-900">{std.code}</span>
                            {selectedInStandard.length > 0 && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                                เลือกแล้ว {selectedInStandard.length}/{standardCodes.length}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">{std.description}</p>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {std.indicators.map(ind => (
                          <label key={ind.code} className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent p-2 transition-colors hover:border-blue-100 hover:bg-blue-50/50">
                            <input
                              type="checkbox"
                              checked={selectedIndicators.includes(ind.code)}
                              onChange={() => handleIndicatorToggle(ind.code)}
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm leading-relaxed text-slate-700">
                              <span className="font-bold text-blue-900">{ind.code}</span> {selectedSubject !== 'พื้นฐานอาชีพ' && ind.description}
                            </span>
                          </label>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm text-center">
              ไม่พบข้อมูลมาตรฐานการเรียนรู้สำหรับวิชาและระดับชั้นที่เลือก
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">รหัสมาตรฐานการเรียนรู้</label>
            <input
              type="text"
              value={manualStandard}
              onChange={(e) => setManualStandard(e.target.value)}
              placeholder="เช่น ค 1.1"
              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

      {onExpectedLearningOutcomesChange && (
        <label className="block text-sm font-medium text-slate-700">
          ผลการเรียนรู้ที่คาดหวัง (รายวิชาเพิ่มเติม)
          <textarea aria-label="ผลการเรียนรู้ที่คาดหวัง" value={expectedLearningOutcomes}
            onChange={e => onExpectedLearningOutcomesChange(e.target.value)} rows={3}
            placeholder="กรอกผลการเรียนรู้ที่คาดหวัง"
            className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-normal" />
        </label>
      )}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-slate-700">รหัสตัวชี้วัด</label>
              <button
                type="button"
                onClick={handleAddManualIndicator}
                className="text-xs flex items-center text-blue-600 hover:text-blue-800 font-medium"
              >
                <Plus size={14} className="mr-1" /> เพิ่มตัวชี้วัด
              </button>
            </div>
            <div className="space-y-2">
              {manualIndicators.map((ind, idx) => (
                <div key={idx} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={ind}
                    onChange={(e) => handleManualIndicatorChange(idx, e.target.value)}
                    placeholder={`ตัวชี้วัดที่ ${idx + 1} เช่น ค 1.1 ป.1/1`}
                    className="flex-1 border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {manualIndicators.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveManualIndicator(idx)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
