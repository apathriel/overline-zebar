import { useWidgetSetting } from '@overline-zebar/config';
import { chipStyles } from '@overline-zebar/ui';
import { DateOutput } from 'zebar';
import { cn } from '../utils/cn';

interface TimeDisplayProps {
  dateOutput: DateOutput | null;
}

export function TimeDisplay({ dateOutput }: TimeDisplayProps) {
  const [timeFormat] = useWidgetSetting('main', 'timeFormat');
  const [timeLocale] = useWidgetSetting('main', 'timeLocale');

  const safeTimeFormat = timeFormat || 'EEE d MMM t';
  const safeTimeLocale = timeLocale || 'en-GB';

  const isCustomConfigured =
    safeTimeFormat !== 'EEE d MMM t' || safeTimeLocale !== 'en-GB';

  let content: string;

  if (isCustomConfigured) {
    let formatOptions: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: 'numeric',
    };
    if (safeTimeFormat.includes('E')) formatOptions.weekday = 'short';
    if (safeTimeFormat.includes('d')) formatOptions.day = 'numeric';
    if (safeTimeFormat.includes('M')) formatOptions.month = 'short';
    if (safeTimeFormat.includes('y')) formatOptions.year = 'numeric';
    if (safeTimeFormat.includes('s')) formatOptions.second = 'numeric';
    if (safeTimeFormat.includes('h') || safeTimeFormat.includes('a')) {
      formatOptions.hour12 = true;
    }
    try {
      content = new Intl.DateTimeFormat(safeTimeLocale, formatOptions)
        .format(new Date())
        .replace(/,/g, '');
    } catch {
      try {
        content = new Date().toLocaleTimeString(safeTimeLocale);
      } catch {
        content = new Date().toLocaleTimeString();
      }
    }
  } else {
    content =
      dateOutput?.formatted ??
      new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: 'numeric',
      })
        .format(new Date())
        .replace(/,/g, '');
  }

  return (
    <div className={cn(chipStyles, 'justify-center tabular-nums')}>
      {content}
    </div>
  );
}
