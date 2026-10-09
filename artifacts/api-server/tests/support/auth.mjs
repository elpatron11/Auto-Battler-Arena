// Same synthetic Clerk identity used by the existing route harnesses.
// Never imported by the application or exposed through a running API.
export const testAuth = { getAuth: req => ({ userId: req.userId ?? null }) };
