/** Random ids for trips, versions, pools and budget changes. */
export function newId(): string {
  return crypto.randomUUID();
}

/** Every id the app accepts. Also safe to use in a file name. */
export const ID_RE = /^[a-z0-9-]{1,64}$/;
