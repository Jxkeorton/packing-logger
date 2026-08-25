// Maps a pack-job / tandem-jump category to its Tailwind text-color
// utility class.
//
// Deliberately a literal lookup rather than building the class name with
// a template string (`text-${category}`): Tailwind's build-time scanner
// only picks up complete class-name strings it can actually see in the
// source text, not ones assembled at runtime — a template literal is
// invisible to it, so the utility would silently never be generated and
// the column would render uncolored. Every value here appears in full,
// so the scanner finds it.
export const CATEGORY_TEXT_CLASS: Record<string, string> = {
  tandem: 'text-tandem',
  instructor: 'text-instructor',
  student: 'text-student',
  sport: 'text-sport',
  videographer: 'text-videographer',
};
