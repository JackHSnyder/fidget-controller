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
// Dim indoor camera appearance. Values are relative to the surrounding white
// frame, so this profile also follows brighter exposure on the same camera.
export const INDOOR_PROFILE = {
  pink: { h: 354, s: .58, v: .40, whiteValue: .40 },
  orange: { h: 12, s: .62, v: .49, whiteValue: .40 },
  purple: { h: 256, s: .37, v: .20, whiteValue: .40 },
  green: { h: 116, s: .47, v: .31, whiteValue: .40 },
  'light-blue': { h: 198, s: .91, v: .34, whiteValue: .40 },
  'dark-blue': { h: 201, s: .75, v: .15, whiteValue: .40 },
};
export const COLOUR_PROFILES = [
  { id: 'indoor', name: 'Indoor / dim camera', calibration: INDOOR_PROFILE },
  { id: 'daylight', name: 'Daylight', calibration: {} },
  { id: 'recording', name: 'Recording lighting', calibration: RECORDING_PROFILE },
];
