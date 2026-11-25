/**
 * DEV ONLY — signs a PDF with a self-signed test certificate (not a real QES):
 *   pnpm sign-test-pdf <in.pdf> <out.pdf> "<Ime Priimek>"
 * Run it again on the output with another name to add a counter-signature.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createTestCertificate, signPdf } from '../test-signing';

const [input, output, name] = process.argv.slice(2);
if (!input || !output || !name) {
  console.error('usage: pnpm sign-test-pdf <in.pdf> <out.pdf> "<signer name>"');
  process.exit(2);
}
// pnpm --filter runs in the package directory; resolve paths against where the user ran it.
const cwd = process.env.INIT_CWD ?? process.cwd();
const signed = await signPdf(await readFile(resolve(cwd, input)), createTestCertificate(name));
await writeFile(resolve(cwd, output), signed);
console.log(`signed by "${name}" (TEST certificate) -> ${resolve(cwd, output)}`);
