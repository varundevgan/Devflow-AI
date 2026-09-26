// Request/response shapes shared between apps/web and apps/api.
//
// Each contract is defined once as a Zod schema; the TypeScript type is derived
// with z.infer. The API validates inbound payloads against the schema and the web
// app builds forms from the same schema, so the two cannot drift apart.
//
// Database row types are not re-exported here — those come from @devflow/db.
// This package describes the wire format, which is deliberately narrower.

export {};
