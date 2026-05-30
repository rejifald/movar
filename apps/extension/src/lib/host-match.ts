/** Normalize a hostname or stored domain so the comparison is dot-anchored.
 *  Browsers normally hand us a lowercase `hostname`, but the FQDN form
 *  (`example.com.`, trailing dot) is valid and preserved by some browsers
 *  on user-typed URLs; without the strip we'd miss the allowlist entry the
 *  user added as the bare `example.com`. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/\.$/, '');
}

/** True when `host` matches `domain` exactly or as a proper subdomain. The
 *  `.` prefix on the suffix check is the dot-anchor that prevents
 *  `evilexample.com` from matching `example.com`. */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = normalize(host);
  const d = normalize(domain);
  return h === d || h.endsWith(`.${d}`);
}

/** True when `host` matches any entry in the allowlist (exact or subdomain). */
export function hostMatchesAllowlist(host: string, allowlist: readonly string[]): boolean {
  return allowlist.some((d) => hostMatchesDomain(host, d));
}
