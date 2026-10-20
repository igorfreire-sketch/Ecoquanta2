import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vite's dependency optimizer needs cwd and the project files on the same path.
// On Windows this repository may be opened through a junction on another drive.
process.chdir(realpathSync(dirname(dirname(fileURLToPath(import.meta.url)))));

await import('../node_modules/vite/bin/vite.js');
