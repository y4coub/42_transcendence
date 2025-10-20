module.exports = {
	root: true,
	env: {
		es2022: true,
		node: true
	},
	parser: '@typescript-eslint/parser',
	parserOptions: {
		project: './tsconfig.json',
		tsconfigRootDir: __dirname
	},
	plugins: ['@typescript-eslint', 'import'],
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:@typescript-eslint/recommended-requiring-type-checking',
		'plugin:import/recommended',
		'plugin:import/typescript',
		'prettier'
	],
	ignorePatterns: ['dist', 'node_modules'],
	rules: {
		'@typescript-eslint/explicit-member-accessibility': [
			'error',
			{ accessibility: 'no-public' }
		],
		'@typescript-eslint/no-floating-promises': 'error',
		'@typescript-eslint/no-misused-promises': [
			'error',
			{ checksVoidReturn: false }
		],
		'import/order': [
			'warn',
			{
				alphabetize: { order: 'asc', caseInsensitive: true },
				groups: [['builtin', 'external'], ['internal'], ['parent', 'sibling', 'index']],
				'newlines-between': 'always'
			}
		],
		'import/no-unresolved': 'error'
	}
};
