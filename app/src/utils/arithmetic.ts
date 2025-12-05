export const gcd = (a: number, b: number): number => {
  if (!b) {
    return a
  }
  return gcd(b, a % b)
}