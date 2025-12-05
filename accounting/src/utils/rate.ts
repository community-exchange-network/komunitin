import { Rate } from "./types";

export const rate = (n: number, d: number): Rate => {
  const gcd = (a: number, b: number): number => {
    return b === 0 ? a : gcd(b, a % b);
  }
  const divisor = gcd(n, d);
  return {
    n: n / divisor,
    d: d / divisor
  }
}