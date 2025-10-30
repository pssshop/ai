import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const docsDir = path.join(__dirname, '../docs');
const keepFiles = ['.nojekyll'];

if (!fs.existsSync(docsDir)) {
    process.exit(0);
}

for (const file of fs.readdirSync(docsDir)) {
    if (!keepFiles.includes(file)) {
        const filePath = path.join(docsDir, file);
        const stat = fs.lstatSync(filePath);
        if (stat.isDirectory()) {
            // Node 14+ supports rmSync
            fs.rmSync(filePath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(filePath);
        }
    }
}
