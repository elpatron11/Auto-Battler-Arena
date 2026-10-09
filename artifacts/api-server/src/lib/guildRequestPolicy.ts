import type { Request } from "express";

// Browser-authenticated mutations must come from this app. Non-browser callers
// still require Clerk authentication, rather than accepting a supplied identity.
export function guildMutationOriginAllowed(req:Request){
  if(req.method==="GET"||!req.headers.origin)return true;
  try{return new URL(req.headers.origin).host===req.headers.host;}
  catch{return false;}
}
