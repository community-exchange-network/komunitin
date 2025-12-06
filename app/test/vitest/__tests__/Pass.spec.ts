import { describe, expect, it } from 'vitest';

describe("Pass", () => {
  it("Passes", async () => {
    // Just to check that the test system works with typescript.
    function getTrue(): boolean {
      return true;
    }
    expect(getTrue()).toBe(true);
  })
  
})