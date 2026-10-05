#!/bin/sh
# Headless test run using macOS JavaScriptCore (no Node needed).
# Usage: sh test/run.sh
cd "$(dirname "$0")/.." || exit 1
osascript -l JavaScript <<'EOF'
ObjC.import('Foundation');
const read = (p) => $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null).js;
const cwd = $.NSFileManager.defaultManager.currentDirectoryPath.js;
eval(read(cwd + '/theory.js'));
eval(read(cwd + '/midi.js'));
eval(read(cwd + '/test/theory.test.js'));
const r = globalThis.__testResults;
const failed = r.filter((t) => !t.ok);
r.map((t) => (t.ok ? 'pass  ' : 'FAIL  ') + t.name + (t.ok ? '' : '\n      ' + t.err)).join('\n') +
  '\n\n' + (r.length - failed.length) + '/' + r.length + ' passed';
EOF
