type Patterns = string[] | { exact: string[]; partial: string[] }
type ManualNG = {
  videoIds: string[]
  authorIds: string[]
  videoTitles: Patterns
  authorNames: Patterns
}

export function validateNGLists(
  manual: any,
  derived: unknown,
): asserts manual is ManualNG {
  const strings = (value: unknown) =>
    Array.isArray(value) && value.every((id) => typeof id === 'string')
  const patterns = (value: any) =>
    strings(value) || (value && strings(value.exact) && strings(value.partial))
  if (
    !manual ||
    !strings(manual.videoIds) ||
    !strings(manual.authorIds) ||
    !patterns(manual.videoTitles) ||
    !patterns(manual.authorNames) ||
    !strings(derived)
  ) {
    throw new Error('Invalid NG data; refusing unfiltered publication')
  }
}
