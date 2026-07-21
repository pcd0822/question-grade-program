// ESLint (flat config). `npm run lint` 로 실행.
// 프론트(src, TS+React)와 백엔드(netlify, 순수 JS)는 환경이 달라 블록을 나눈다.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.netlify', 'supabase'] },

  // ── 프론트엔드 ──
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // 이 앱은 "마운트 시 서버에서 불러와 state 에 넣는" 패턴을 전면적으로 쓴다.
      // (라우터가 없어 탭 전환 = 마운트) 의도된 구조이므로 이 규칙만 끈다.
      'react-hooks/set-state-in-effect': 'off',
      // 의도적으로 무시하는 값은 _ 접두사로 표시
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // 빈 인터페이스(타입 별칭 용도)를 쓰는 곳이 있어 완화
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },

  // ── Netlify Functions (Node, ESM) ──
  {
    files: ['netlify/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, crypto: 'readonly' },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
)
