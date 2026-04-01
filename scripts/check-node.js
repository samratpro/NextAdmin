const major = Number(process.versions.node.split('.')[0]);
const supportedMajor = 20;

if (major !== supportedMajor) {
    console.error(
        [
            '',
            'Unsupported Node.js version for this repo.',
            `Detected: ${process.versions.node}`,
            `Required: Node.js ${supportedMajor}.x LTS`,
            '',
            'Why this is enforced:',
            '- The API depends on native modules such as better-sqlite3.',
            '- Newer Node versions can trigger Windows native rebuild failures.',
            '',
            'Fix:',
            '- Switch to Node 20 and run npm install again.',
            '- If you use nvm: nvm use 20',
            ''
        ].join('\n')
    );
    process.exit(1);
}
