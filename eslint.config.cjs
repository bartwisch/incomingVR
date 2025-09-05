module.exports = [
	{
		files: ['**/*.js', '**/*.cjs'],
		languageOptions: {
			ecmaVersion: 2021,
			sourceType: 'module',
		},
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
			'no-unused-vars': [
				'warn',
				{ vars: 'all', args: 'all', argsIgnorePattern: '^_' },
			],
			'lines-between-class-members': ['warn', 'always'],
		},
	},
];
