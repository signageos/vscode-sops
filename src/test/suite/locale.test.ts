import * as assert from 'assert';

import { localeEnvFallback } from '../../extension';

suite('localeEnvFallback', () => {
	test('defaults LANG to a UTF-8 locale when none is set', () => {
		assert.deepStrictEqual(localeEnvFallback({}), { LANG: 'en_US.UTF-8' });
	});

	test('treats an empty LANG as unset', () => {
		assert.deepStrictEqual(localeEnvFallback({ LANG: '' }), { LANG: 'en_US.UTF-8' });
	});

	test('respects an explicit LANG', () => {
		assert.deepStrictEqual(localeEnvFallback({ LANG: 'de_DE.UTF-8' }), {});
	});

	test('respects an explicit LC_ALL', () => {
		assert.deepStrictEqual(localeEnvFallback({ LC_ALL: 'C.UTF-8' }), {});
	});

	test('respects an explicit LC_CTYPE', () => {
		assert.deepStrictEqual(localeEnvFallback({ LC_CTYPE: 'en_US.UTF-8' }), {});
	});
});
