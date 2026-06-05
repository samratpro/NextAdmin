const major = Number(process.versions.node.split('.')[0]);
const supportedMajors = [20, 22, 24];

if (!supportedMajors.includes(major)) {
    console.error(
        [
            '',
            'Unsupported Node.js version for this repo.',
            `Detected: ${process.versions.node}`,
            `Required: Node.js ${supportedMajors.join('.x LTS, ')}.x LTS`,
            '',
            'Why this is enforced:',
            '- The API depends on native modules such as better-sqlite3.',
            '- Unsupported Node versions can trigger Windows native rebuild failures.',
            '',
            'Fix:',
            '- Switch to Node 20, 22, or 24 and run npm install again.',
            '- If you use nvm: nvm use 22',
            ''
        ].join('\n')
    );
    process.exit(1);
}
