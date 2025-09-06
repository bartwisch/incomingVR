module.exports = {
	root: true,
	env: { browser: true, node: true, es2021: true },
	parserOptions: { ecmaVersion: 2021, sourceType: 'module' },
	rules: {
		'sort-imports': [
			'error',
			{
				ignoreCase: false,
				ignoreDeclarationSort: false,
				ignoreMemberSort: false,
				memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
				allowSeparatedGroups: false,
			},
		],
		'no-unused-vars': ['warn', { vars: 'all', args: 'all', argsIgnorePattern: '^_' }],
		'lines-between-class-members': ['warn', 'always'],
	},
};

