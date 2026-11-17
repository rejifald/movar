import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Throwaway certificate authority + per-host leaf certificates, minted with the
 * `openssl` CLI (present on macOS and Linux). Leaf certs follow what iOS
 * enforces on TLS server certs: a SAN, the serverAuth EKU, and a validity well
 * under 825 days.
 */
const LEAF_DAYS = 365;
const CA_DAYS = 365;

export interface LeafCert {
  key: string;
  cert: string;
}

export interface CertAuthority {
  dir: string;
  caCertPath: string;
  /** Leaf cert for `host`, minted on first use and cached. */
  leafFor(host: string): LeafCert;
}

function openssl(args: readonly string[]): void {
  // The CLI is resolved from PATH on purpose: macOS and Linux both ship one.
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- openssl is looked up on PATH deliberately
  execFileSync('openssl', [...args], { stdio: ['ignore', 'ignore', 'pipe'] });
}

function createCa(dir: string): string {
  const keyPath = path.join(dir, 'ca.key');
  const certPath = path.join(dir, 'ca.pem');
  const conf = path.join(dir, 'ca.cnf');
  writeFileSync(
    conf,
    [
      '[req]',
      'distinguished_name=dn',
      'x509_extensions=v3_ca',
      'prompt=no',
      '[dn]',
      'CN=Movar Store Listing Mock CA',
      '[v3_ca]',
      'basicConstraints=critical,CA:TRUE,pathlen:0',
      'keyUsage=critical,keyCertSign,cRLSign',
      'subjectKeyIdentifier=hash',
    ].join('\n'),
  );
  openssl([
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    String(CA_DAYS),
    '-sha256',
    '-config',
    conf,
  ]);
  return certPath;
}

function mintLeaf(dir: string, host: string): LeafCert {
  const safe = host.replaceAll(/[^a-z0-9.-]/gi, '_');
  const keyPath = path.join(dir, `${safe}.key`);
  const csrPath = path.join(dir, `${safe}.csr`);
  const certPath = path.join(dir, `${safe}.pem`);
  const conf = path.join(dir, `${safe}.cnf`);
  writeFileSync(
    conf,
    [
      '[req]',
      'distinguished_name=dn',
      'prompt=no',
      '[dn]',
      `CN=${host}`,
      '[v3_leaf]',
      'basicConstraints=critical,CA:FALSE',
      'keyUsage=critical,digitalSignature,keyEncipherment',
      'extendedKeyUsage=serverAuth',
      'subjectKeyIdentifier=hash',
      'authorityKeyIdentifier=keyid',
      `subjectAltName=DNS:${host}`,
    ].join('\n'),
  );
  openssl([
    'req',
    '-new',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    csrPath,
    '-config',
    conf,
  ]);
  openssl([
    'x509',
    '-req',
    '-in',
    csrPath,
    '-CA',
    path.join(dir, 'ca.pem'),
    '-CAkey',
    path.join(dir, 'ca.key'),
    '-CAcreateserial',
    '-out',
    certPath,
    '-days',
    String(LEAF_DAYS),
    '-sha256',
    '-extfile',
    conf,
    '-extensions',
    'v3_leaf',
  ]);
  return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') };
}

/** Create (or, when `dir` already holds one, reuse) the CA. */
export function createCertAuthority(dir?: string): CertAuthority & { ephemeral: boolean } {
  const ephemeral = dir === undefined;
  const root = dir ?? mkdtempSync(path.join(tmpdir(), 'movar-mock-ca-'));
  mkdirSync(root, { recursive: true });
  const caCertPath = path.join(root, 'ca.pem');
  if (!existsSync(caCertPath) || !existsSync(path.join(root, 'ca.key'))) createCa(root);
  const cache = new Map<string, LeafCert>();
  return {
    dir: root,
    caCertPath,
    ephemeral,
    leafFor(host: string): LeafCert {
      let leaf = cache.get(host);
      if (leaf === undefined) {
        leaf = mintLeaf(root, host);
        cache.set(host, leaf);
      }
      return leaf;
    },
  };
}
