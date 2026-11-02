// Copies a folder (used to ship locale JSON next to built JS).
import { cpSync } from 'node:fs';
cpSync(process.argv[2], process.argv[3], { recursive: true });
