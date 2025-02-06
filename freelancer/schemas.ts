import { z } from "zod";

/**
 * Input schema for Pyth fetch price feed ID action.
 */
export const FreelancerQuerySchema = z
  .object({
    query: z.string().describe("The query term to fetch projects for").min(1),
  })
  .strict();

