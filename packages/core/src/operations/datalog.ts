import { z } from "zod";
import type { CallToolResult, RoamActionClient } from "../types.js";
import { textResult } from "../types.js";

export const DatalogQuerySchema = z.object({
  query: z
    .string()
    .describe("Datalog query string (e.g., '[:find ?title :where [?e :node/title ?title]]')"),
  inputs: z
    .array(z.unknown())
    .optional()
    .describe("Input parameters for the query, corresponding to :in clause bindings after $"),
});

export type DatalogQueryParams = z.infer<typeof DatalogQuerySchema>;

export async function datalogQuery(
  client: RoamActionClient,
  params: DatalogQueryParams,
): Promise<CallToolResult> {
  const args = params.inputs ? [params.query, ...params.inputs] : [params.query];
  const response = await client.call<unknown>("q", args);
  // Content-only read (no outputSchema): the raw scalar/tuple/collection/relation
  // goes on the text channel as-is.
  return textResult(response.result ?? []);
}
