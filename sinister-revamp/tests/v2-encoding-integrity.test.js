const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceRoots = ['css', 'js', 'partials', 'templates'];
const mojibake = [
	'\u00e2\u20ac\u201d', // UTF-8 em dash decoded as Windows-1252
	'\u00e2\u20ac\u201c', // UTF-8 en dash decoded as Windows-1252
	'\u00e2\u20ac\u0153', // UTF-8 left quote decoded as Windows-1252
	'\u00e2\u20ac\u009d'  // UTF-8 right quote decoded as Windows-1252
];

function walk(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const absolute = path.join(directory, entry.name);
		return entry.isDirectory() ? walk(absolute) : [absolute];
	});
}

const failures = sourceRoots.flatMap((directory) => walk(path.join(root, directory)))
	.filter((file) => /\.(?:css|js|json|mvt)$/.test(file))
	.flatMap((file) => {
		const content = fs.readFileSync(file, 'utf8');
		return mojibake.filter((sequence) => content.includes(sequence))
			.map((sequence) => `${path.relative(root, file)} contains ${JSON.stringify(sequence)}`);
	});

assert.deepEqual(failures, [], failures.join('\n'));

const components = fs.readFileSync(path.join(root, 'js', 'sd2-v2-components.js'), 'utf8');
assert.match(
	components,
	/querySelectorAll\('\.sd2-proofbar \.rating'\)[\s\S]*?setAttribute\('aria-label', '4\.8 out of 5 stars'\)[\s\S]*?textContent = ''/,
	'the shared proof bar should replace its malformed source rating with a stable accessible label'
);
console.log('v2 source encoding integrity verified');
