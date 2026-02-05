/**
 * Stub types for Intl.DurationFormat, while they are not yet in
 * 
 */

declare namespace Intl {
  type DurationFormatUnit = 'long' | 'short' | 'narrow' | 'always' | 'auto';
  type DurationFormatDisplay = 'always' | 'auto';

  interface DurationFormatOptionsBase {
    style: 'long' | 'short' | 'narrow' | 'digital';
    years: DurationFormatUnit;
    yearsDisplay: DurationFormatDisplay;
    months: DurationFormatUnit;
    monthsDisplay: DurationFormatDisplay;
    weeks: DurationFormatUnit;
    weeksDisplay: DurationFormatDisplay;
    days: DurationFormatUnit;
    daysDisplay: DurationFormatDisplay;
    hours: DurationFormatUnit;
    hoursDisplay: DurationFormatDisplay;
    minutes: DurationFormatUnit;
    minutesDisplay: DurationFormatDisplay;
    seconds: DurationFormatUnit;
    secondsDisplay: DurationFormatDisplay;
    milliseconds: DurationFormatUnit;
    millisecondsDisplay: DurationFormatDisplay;
    microseconds: DurationFormatUnit;
    microsecondsDisplay: DurationFormatDisplay;
    nanoseconds: DurationFormatUnit;
    nanosecondsDisplay: DurationFormatDisplay;
    fractionalDigits?: number;
  }

  interface DurationFormatOptions extends Partial<DurationFormatOptionsBase> {
    fractionalDigits?: number;
    localeMatcher?: 'lookup' | 'best fit';
  }

  interface ResolvedDurationFormatOptions extends DurationFormatOptionsBase {
    locale: string;
    numberingSystem: string;
  }

  interface Duration {
    years?: number;
    months?: number;
    weeks?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
    milliseconds?: number;
    nanoseconds?: number;
  }

  interface DurationFormat {
    format(duration: Duration): string;
    formatToParts(duration: Duration): Intl.DateTimeFormatPart[];
    resolvedOptions(): ResolvedDurationFormatOptions;
  }

  const DurationFormat: {
    prototype: DurationFormat;
    new(locales?: string | string[], options?: DurationFormatOptions): DurationFormat;
    (locales?: string | string[], options?: DurationFormatOptions): DurationFormat;
  };
}
