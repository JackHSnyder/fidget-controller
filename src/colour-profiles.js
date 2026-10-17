// Appearance measured from the supplied continuous recording. Physical colour
// names do not change when camera white balance shifts their measured hues.
export const RECORDING_PROFILE = {
  pink: { h: 335.3, s: .56, v: .67 },
  orange: { h: 11.6, s: .51, v: .77 },
  purple: { h: 231.1, s: .53, v: .72 },
  green: { h: 157.5, s: .41, v: .76 },
  'light-blue': { h: 206, s: .94, v: .89 },
  'dark-blue': { h: 211.1, s: .84, v: .55 },
};
export const COLOUR_PROFILES = [
  { id: 'daylight', name: 'Daylight', calibration: {} },
  { id: 'recording', name: 'Recording lighting', calibration: RECORDING_PROFILE },
];
