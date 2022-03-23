import {strictObject, z} from "@mrawesome/zod";
import {anyString, realRecord, token} from "./zodUtils";

// TODO: can you globally check for the existence of dialects etc?

export const rawDialectSchema = strictObject({
    displayName: anyString(),
    // TODO: superRefine that these dialects are real etc
    otherDisplayNames: realRecord(token("DIALECT_ID"), anyString()).optional(),
    disabled: z.boolean().optional(),
    // TODO: check for validity
    fallbacks: z.array(token("DIALECT_ID")).optional(),
});
export type RawDialect = z.infer<typeof rawDialectSchema>;
export const rawLangConfigSchema = strictObject({
    // NOTE: This is the canonical definition of what is a dialect
    dialects: realRecord(token("DIALECT_ID"), rawDialectSchema),
});
// TODO: check that dialect keys match token
export type RawLangConfig = z.infer<typeof rawLangConfigSchema>;
