// VPS text-module port: mirrors the workerd `Text` module rule
// (`import text from './x.txt'` yields the file string as default export).
// Trusted application HTML/CSS shells use the same explicit text port.
// Register from a test entry before importing server modules:
//   import { register } from 'node:module';
//   register('./vps/text-loader.mjs', import.meta.url);
import { readFileSync } from 'node:fs';

export async function resolve(specifier, context, next) {
  if (typeof specifier === 'string' && /\.(txt|html|css)$/.test(specifier)) {
    return { url: new URL(specifier, context.parentURL).href, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (typeof url === 'string' && /^file:/.test(url) && /\.(txt|html|css)$/.test(url)) {
    let source;
    try {
      source = readFileSync(new URL(url), 'utf8');
    } catch (error) {
      throw new Error(`vps text module missing: ${url}`, { cause: error });
    }
    return { format: 'module', source: `export default ${JSON.stringify(source)};`, shortCircuit: true };
  }
  return next(url, context);
}
