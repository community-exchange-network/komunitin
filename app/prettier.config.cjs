/** @type {import('prettier').Config} */
module.exports = {
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'es5',
  printWidth: 120,
  endOfLine: 'lf',
  // Vue/HTML
  htmlWhitespaceSensitivity: 'css',
  // Put each attribute on its own line in Vue/HTML tags.
  singleAttributePerLine: true,
  // Keep the closing `>` on its own line when attributes are multiline.
  bracketSameLine: false,
  vueIndentScriptAndStyle: true,
};
