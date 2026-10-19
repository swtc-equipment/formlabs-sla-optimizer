import React, { useMemo } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

interface DateDropdownPickerProps {
  value: string; // 'YYYY-MM-DD'
  onChange: (newValue: string) => void;
  minYear?: number;
  maxYear?: number;
  label?: string;
  subLabel?: string;
}

export const DateDropdownPicker: React.FC<DateDropdownPickerProps> = ({
  value,
  onChange,
  minYear = 2025,
  maxYear = 2040,
  label = '選擇帳號最終使用日期 (到期日) *',
  subLabel = '當日 23:59:59 到期'
}) => {
  // Parse YYYY-MM-DD
  const { currentYear, currentMonth, currentDay } = useMemo(() => {
    const today = new Date();
    if (!value || !value.includes('-')) {
      return {
        currentYear: today.getFullYear(),
        currentMonth: today.getMonth() + 1,
        currentDay: today.getDate()
      };
    }
    const parts = value.split('-').map(Number);
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    return {
      currentYear: isNaN(y) ? today.getFullYear() : y,
      currentMonth: isNaN(m) || m < 1 || m > 12 ? today.getMonth() + 1 : m,
      currentDay: isNaN(d) || d < 1 ? today.getDate() : d
    };
  }, [value]);

  // Calculate days in current selected year & month
  const daysInMonth = useMemo(() => {
    return new Date(currentYear, currentMonth, 0).getDate();
  }, [currentYear, currentMonth]);

  // Adjust currentDay if it exceeds daysInMonth
  const safeDay = Math.min(currentDay, daysInMonth);

  // Years array (ensure currentYear is always included)
  const years = useMemo(() => {
    const startY = Math.min(minYear, currentYear);
    const endY = Math.max(maxYear, currentYear + 5);
    const list: number[] = [];
    for (let y = startY; y <= endY; y++) {
      list.push(y);
    }
    return list;
  }, [minYear, maxYear, currentYear]);

  // Months array: 1 to 12
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  // Days array: 1 to daysInMonth
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  const updateDate = (newY: number, newM: number, newD: number) => {
    const maxD = new Date(newY, newM, 0).getDate();
    const finalD = Math.min(newD, maxD);
    const formatted = `${newY}-${String(newM).padStart(2, '0')}-${String(finalD).padStart(2, '0')}`;
    onChange(formatted);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateDate(Number(e.target.value), currentMonth, safeDay);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateDate(currentYear, Number(e.target.value), safeDay);
  };

  const handleDayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateDate(currentYear, currentMonth, Number(e.target.value));
  };

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-gray-300 font-semibold flex items-center gap-1.5 text-xs">
            <Calendar size={13} className="text-blue-400" />
            <span>{label}</span>
          </label>
          {subLabel && <span className="text-[10px] text-gray-400">{subLabel}</span>}
        </div>
      )}

      {/* 3 Dropdown selects for Year, Month, Day */}
      <div className="grid grid-cols-3 gap-2">
        {/* Year Dropdown */}
        <div className="relative">
          <label className="block text-[10px] text-gray-400 mb-1 font-medium">年 (Year)</label>
          <div className="relative">
            <select
              value={currentYear}
              onChange={handleYearChange}
              className="w-full appearance-none bg-gray-800 hover:bg-gray-750 border border-gray-700 text-white rounded-xl pl-3 pr-7 py-2 text-xs font-mono focus:outline-none focus:border-blue-500 cursor-pointer shadow-sm transition-colors"
            >
              {years.map((y) => (
                <option key={y} value={y} className="bg-gray-900 text-white font-mono py-1">
                  {y} 年
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Month Dropdown */}
        <div className="relative">
          <label className="block text-[10px] text-gray-400 mb-1 font-medium">月 (Month)</label>
          <div className="relative">
            <select
              value={currentMonth}
              onChange={handleMonthChange}
              className="w-full appearance-none bg-gray-800 hover:bg-gray-750 border border-gray-700 text-white rounded-xl pl-3 pr-7 py-2 text-xs font-mono focus:outline-none focus:border-blue-500 cursor-pointer shadow-sm transition-colors"
            >
              {months.map((m) => (
                <option key={m} value={m} className="bg-gray-900 text-white font-mono py-1">
                  {String(m).padStart(2, '0')} 月
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Day Dropdown */}
        <div className="relative">
          <label className="block text-[10px] text-gray-400 mb-1 font-medium">日 (Day)</label>
          <div className="relative">
            <select
              value={safeDay}
              onChange={handleDayChange}
              className="w-full appearance-none bg-gray-800 hover:bg-gray-750 border border-gray-700 text-white rounded-xl pl-3 pr-7 py-2 text-xs font-mono focus:outline-none focus:border-blue-500 cursor-pointer shadow-sm transition-colors"
            >
              {days.map((d) => (
                <option key={d} value={d} className="bg-gray-900 text-white font-mono py-1">
                  {String(d).padStart(2, '0')} 日
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
};
