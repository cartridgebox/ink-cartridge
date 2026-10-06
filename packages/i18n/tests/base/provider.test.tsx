import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LanguageProvider, useI18n } from '../../src/index.js';

let tmpDir: string;

function makeTmpDir(): string {
  const dir = join(tmpdir(), `ink-lang-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeLocales(files: Record<string, Record<string, unknown>>): string {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = makeTmpDir();
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(tmpDir, name), JSON.stringify(content));
  }
  return tmpDir;
}

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

function stripAnsi(str: string | undefined): string {
  return (str ?? '').replace(/\x1b\[[0-9;]*m/g, '');
}

function T({ k, p }: { k: string; p?: Record<string, string | number> }) {
  const { t } = useI18n();
  return <Text>{t(k, p ? { params: p } : undefined)}</Text>;
}

function CurrentLang() {
  const { currentLanguage } = useI18n();
  return <Text>{currentLanguage}</Text>;
}

function TContext({ k, c }: { k: string; c?: string }) {
  const { t } = useI18n();
  return <Text>{t(k, { context: c })}</Text>;
}

function TContextParams({
  k, c, p,
}: {
  k: string; c?: string; p?: Record<string, string | number>;
}) {
  const { t } = useI18n();
  return <Text>{t(k, { context: c, params: p })}</Text>;
}

class ErrorCatcher extends React.Component<
  { children: React.ReactNode },
  { err: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { err: error.message };
  }
  render() {
    if (this.state.err) return <Text>{this.state.err}</Text>;
    return <>{this.props.children}</>;
  }
}

function Bad() {
  useI18n();
  return <Text>ok</Text>;
}

describe('resources mode — basic translation', () => {
  it('simple key translation', () => {
    const { lastFrame } = render(
      <LanguageProvider resources={{ 'en-US': { hello: 'Hello' } }} defaultLanguage="en-US">
        <T k="hello" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Hello');
  });

  it('parameter interpolation', () => {
    const { lastFrame } = render(
      <LanguageProvider resources={{ 'en-US': { level: 'Level {n}' } }} defaultLanguage="en-US">
        <T k="level" p={{ n: 5 }} />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Level 5');
  });

  it('multiple parameter interpolation', () => {
    const { lastFrame } = render(
      <LanguageProvider resources={{ 'en-US': { info: '{name} aged {age}' } }} defaultLanguage="en-US">
        <T k="info" p={{ name: 'Alice', age: '30' }} />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Alice aged 30');
  });

  it('missing parameter keeps placeholder', () => {
    const { lastFrame } = render(
      <LanguageProvider resources={{ 'en-US': { greet: 'Hi {name}' } }} defaultLanguage="en-US">
        <T k="greet" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Hi {name}');
  });

  it('missing key returns key itself', () => {
    const { lastFrame } = render(
      <LanguageProvider resources={{ 'en-US': { a: 'A' } }} defaultLanguage="en-US">
        <T k="nonexistent" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('nonexistent');
  });
});

describe('nested keys and fallback', () => {
  it('nested JSON accessed via dot notation', () => {
    const { lastFrame } = render(
      <LanguageProvider
        resources={{ 'en-US': { menu: { title: 'Main', sub: 'Sub' } } } as any}
        defaultLanguage="en-US"
      >
        <T k="menu.title" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Main');
  });

  it('fallbackLanguage used when key missing in current language', () => {
    const { lastFrame } = render(
      <LanguageProvider
        resources={{
          'en-US': { hello: 'Hello' },
          'zh-CN': { bye: '再见' },
        }}
        defaultLanguage="zh-CN"
        fallbackLanguage="en-US"
      >
        <T k="hello" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Hello');
  });

  it('returns key itself when fallback also misses', () => {
    const { lastFrame } = render(
      <LanguageProvider
        resources={{ 'en-US': { a: 'A' }, 'zh-CN': { a: '啊' } }}
        defaultLanguage="zh-CN"
        fallbackLanguage="en-US"
      >
        <T k="missing" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('missing');
  });
});

describe('language switching', () => {
  it('setLanguage updates t() output in real time', async () => {
    function Switch() {
      const { t, setLanguage } = useI18n();
      useEffect(() => { setLanguage('zh-CN'); }, []);
      return <Text>{t('hello')}</Text>;
    }
    const { lastFrame } = render(
      <LanguageProvider
        resources={{ 'en-US': { hello: 'Hello' }, 'zh-CN': { hello: '你好' } }}
        defaultLanguage="en-US"
      >
        <Switch />
      </LanguageProvider>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(stripAnsi(lastFrame())).toContain('你好');
  });

  it('setLanguage to non-existent language throws', async () => {
    function Switch() {
      const { setLanguage } = useI18n();
      const [err, setErr] = useState<string | null>(null);
      useEffect(() => {
        try { setLanguage('fr-FR'); } catch (e: any) { setErr(e.message); }
      }, []);
      if (err) return <Text>{err}</Text>;
      return <Text>ok</Text>;
    }
    const { lastFrame } = render(
      <LanguageProvider resources={{ 'en-US': { hello: 'Hello' } }} defaultLanguage="en-US">
        <Switch />
      </LanguageProvider>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(stripAnsi(lastFrame())).toContain('[ink-cartridge]');
    expect(stripAnsi(lastFrame())).toContain('en-US');
  });
});

describe('getLanguages and currentLanguage', () => {
  it('getLanguages returns all available languages', () => {
    function List() {
      const { getLanguages } = useI18n();
      return <Text>{getLanguages().join(',')}</Text>;
    }
    const { lastFrame } = render(
      <LanguageProvider
        resources={{ 'en-US': { a: 'A' }, 'zh-CN': { a: '啊' }, 'ja-JP': { a: 'あ' } }}
        defaultLanguage="en-US"
      >
        <List />
      </LanguageProvider>,
    );
    const out = stripAnsi(lastFrame());
    expect(out).toContain('en-US');
    expect(out).toContain('zh-CN');
    expect(out).toContain('ja-JP');
  });

  it('currentLanguage returns current language', () => {
    const { lastFrame } = render(
      <LanguageProvider resources={{ 'en-US': { a: 'A' } }} defaultLanguage="en-US">
        <CurrentLang />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('en-US');
  });
});

describe('path mode', () => {
  it('loads JSON translation files from a directory', () => {
    const dir = writeLocales({
      'en-US.json': { hello: 'Hello from file' },
      'zh-CN.json': { hello: '来自文件' },
    });

    const { lastFrame } = render(
      <LanguageProvider path={dir} defaultLanguage="zh-CN">
        <T k="hello" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('来自文件');
  });

  it('throws when directory does not exist', () => {
    const { lastFrame } = render(
      <ErrorCatcher>
        <LanguageProvider path="/nonexistent/path/12345">
          <T k="x" />
        </LanguageProvider>
      </ErrorCatcher>,
    );
    expect(stripAnsi(lastFrame())).toContain('[ink-cartridge]');
  });
});

describe('JSON value type handling', () => {
  it('number converted to string', () => {
    const dir = writeLocales({ 'en-US.json': { count: 42 } });
    const { lastFrame } = render(
      <LanguageProvider path={dir} defaultLanguage="en-US">
        <T k="count" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('42');
  });

  it('boolean converted to string', () => {
    const dir = writeLocales({ 'en-US.json': { active: true, inactive: false } });
    const { lastFrame } = render(
      <LanguageProvider path={dir} defaultLanguage="en-US">
        <T k="active" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('true');
  });

  it('array converted to comma-separated string', () => {
    const dir = writeLocales({ 'en-US.json': { items: ['a', 'b', 'c'] } });
    const { lastFrame } = render(
      <LanguageProvider path={dir} defaultLanguage="en-US">
        <T k="items" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('a, b, c');
  });
});

describe('context translation', () => {
  it('context=female resolves greeting.female', () => {
    const { lastFrame } = render(
      <LanguageProvider
        resources={{
          'en-US': {
            greeting: 'Hello',
            'greeting.female': 'Hello, madam',
            'greeting.male': 'Hello, sir',
          },
        }}
        defaultLanguage="en-US"
      >
        <TContext k="greeting" c="female" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Hello, madam');
  });

  it('context=male resolves greeting.male', () => {
    const { lastFrame } = render(
      <LanguageProvider
        resources={{
          'en-US': {
            greeting: 'Hello',
            'greeting.female': 'Hello, madam',
            'greeting.male': 'Hello, sir',
          },
        }}
        defaultLanguage="en-US"
      >
        <TContext k="greeting" c="male" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Hello, sir');
  });

  it('falls back to base key when context key does not exist', () => {
    const { lastFrame } = render(
      <LanguageProvider
        resources={{
          'en-US': {
            greeting: 'Hello',
            'greeting.female': 'Hello, madam',
          },
        }}
        defaultLanguage="en-US"
      >
        <TContext k="greeting" c="unknown" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Hello');
  });

  it('context + parameter interpolation work together', () => {
    const { lastFrame } = render(
      <LanguageProvider
        resources={{
          'en-US': {
            'welcome.female': 'Welcome, Ms. {name}',
            'welcome.male': 'Welcome, Mr. {name}',
          },
        }}
        defaultLanguage="en-US"
      >
        <TContextParams k="welcome" c="female" p={{ name: 'Alice' }} />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Welcome, Ms. Alice');
  });

  it('returns key itself when neither base nor context key exist', () => {
    const { lastFrame } = render(
      <LanguageProvider resources={{ 'en-US': {} }} defaultLanguage="en-US">
        <TContext k="missing" c="male" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('missing');
  });

  it('extra keys in options are safely ignored', () => {
    function Extra() {
      const { t } = useI18n();
      const result = t('greeting', { context: 'female', extra: 'ignored' } as any);
      return <Text>{result}</Text>;
    }
    const { lastFrame } = render(
      <LanguageProvider
        resources={{
          'en-US': {
            greeting: 'Hello',
            'greeting.female': 'Hello, madam',
          },
        }}
        defaultLanguage="en-US"
      >
        <Extra />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Hello, madam');
  });

  it('context undefined behaves same as no options', () => {
    const { lastFrame } = render(
      <LanguageProvider
        resources={{
          'en-US': {
            greeting: 'Hello',
            'greeting.female': 'Hello, madam',
          },
        }}
        defaultLanguage="en-US"
      >
        <TContext k="greeting" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Hello');
  });
});

describe('no resources fallback', () => {
  it('t() returns key itself when no resources', () => {
    const { lastFrame } = render(
      <LanguageProvider>
        <T k="hello" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('hello');
  });

  it('getLanguages returns empty array when no resources', () => {
    function Empty() {
      const { getLanguages } = useI18n();
      return <Text>{String(getLanguages().length)}</Text>;
    }
    const { lastFrame } = render(
      <LanguageProvider>
        <Empty />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('0');
  });
});

describe('useI18n outside Provider', () => {
  it('throws error with framework prefix', () => {
    const { lastFrame } = render(
      <ErrorCatcher>
        <Bad />
      </ErrorCatcher>,
    );
    expect(stripAnsi(lastFrame())).toContain('[ink-cartridge]');
  });
});

describe('mergeLanguage', () => {
  it('new key overrides old after merge', async () => {
    const dir = writeLocales({ 'en-US.json': { hello: 'Hello from mod' } });

    function MergeTest() {
      const { t, mergeLanguage } = useI18n();
      useEffect(() => { mergeLanguage([dir]); }, []);
      return <Text>{t('hello')}</Text>;
    }

    const { lastFrame } = render(
      <LanguageProvider resources={{ 'en-US': { hello: 'Base' } }} defaultLanguage="en-US">
        <MergeTest />
      </LanguageProvider>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(stripAnsi(lastFrame())).toContain('Hello from mod');
  });

  it('merge can introduce new languages', async () => {
    const dir = writeLocales({ 'zh-CN.json': { hello: '模组你好' } });

    function MergeTest() {
      const { mergeLanguage, getLanguages } = useI18n();
      useEffect(() => { mergeLanguage([dir]); }, []);
      return <Text>{getLanguages().join(',')}</Text>;
    }

    const { lastFrame } = render(
      <LanguageProvider resources={{ 'en-US': { hello: 'Hello' } }} defaultLanguage="en-US">
        <MergeTest />
      </LanguageProvider>,
    );
    await new Promise((r) => setTimeout(r, 10));
    const out = stripAnsi(lastFrame());
    expect(out).toContain('zh-CN');
    expect(out).toContain('en-US');
  });

  it('merged language can be listed and used for translation', async () => {
    const dir = writeLocales({ 'zh-CN.json': { hello: '模组的你好' } });

    function MergeTest() {
      const { mergeLanguage, getLanguages } = useI18n();
      useEffect(() => { mergeLanguage([dir]); }, []);
      return <Text>{getLanguages().join(',')}</Text>;
    }

    const { lastFrame } = render(
      <LanguageProvider resources={{ 'en-US': { hello: 'Hello' } }} defaultLanguage="en-US">
        <MergeTest />
      </LanguageProvider>,
    );
    await new Promise((r) => setTimeout(r, 10));
    const out = stripAnsi(lastFrame());
    expect(out).toContain('zh-CN');
    expect(out).toContain('en-US');
  });

  it('multiple paths: later overrides earlier', async () => {
    const base = makeTmpDir();
    const modA = join(base, 'a');
    const modB = join(base, 'b');
    mkdirSync(modA, { recursive: true });
    mkdirSync(modB, { recursive: true });
    writeFileSync(join(modA, 'en-US.json'), JSON.stringify({ hello: 'From A' }));
    writeFileSync(join(modB, 'en-US.json'), JSON.stringify({ hello: 'From B' }));

    function MergeTest() {
      const { t, mergeLanguage } = useI18n();
      useEffect(() => { mergeLanguage([modA, modB]); }, []);
      return <Text>{t('hello')}</Text>;
    }

    const { lastFrame } = render(
      <LanguageProvider resources={{ 'en-US': { hello: 'Base' } }} defaultLanguage="en-US">
        <MergeTest />
      </LanguageProvider>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(stripAnsi(lastFrame())).toContain('From B');
    expect(stripAnsi(lastFrame())).not.toContain('From A');
  });
});

describe('defaultContext prop', () => {
  it('defaultContext="male" resolves greeting.male', () => {
    const { lastFrame } = render(
      <LanguageProvider
        resources={{
          'en-US': {
            greeting: 'Hello',
            'greeting.male': 'Hello, sir',
            'greeting.female': 'Hello, madam',
          },
        }}
        defaultLanguage="en-US"
        defaultContext="male"
      >
        <T k="greeting" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Hello, sir');
  });

  it('falls back to base key when defaultContext key missing', () => {
    const { lastFrame } = render(
      <LanguageProvider
        resources={{
          'en-US': {
            greeting: 'Hello',
            'greeting.female': 'Hello, madam',
          },
        }}
        defaultLanguage="en-US"
        defaultContext="male"
      >
        <T k="greeting" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Hello');
  });

  it('explicit context overrides defaultContext', () => {
    const { lastFrame } = render(
      <LanguageProvider
        resources={{
          'en-US': {
            greeting: 'Hello',
            'greeting.male': 'Hello, sir',
            'greeting.female': 'Hello, madam',
          },
        }}
        defaultLanguage="en-US"
        defaultContext="male"
      >
        <TContext k="greeting" c="female" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Hello, madam');
  });

  it('setDefaultContext updates t() output dynamically', async () => {
    function Switcher() {
      const { t, setDefaultContext } = useI18n();
      useEffect(() => { setDefaultContext('female'); }, []);
      return <Text>{t('greeting')}</Text>;
    }
    const { lastFrame } = render(
      <LanguageProvider
        resources={{
          'en-US': {
            greeting: 'Hello',
            'greeting.male': 'Hello, sir',
            'greeting.female': 'Hello, madam',
          },
        }}
        defaultLanguage="en-US"
        defaultContext="male"
      >
        <Switcher />
      </LanguageProvider>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(stripAnsi(lastFrame())).toContain('Hello, madam');
  });

  it('setDefaultContext(undefined) clears and reverts to base key lookup', async () => {
    function Clearer() {
      const { t, setDefaultContext } = useI18n();
      useEffect(() => { setDefaultContext(undefined); }, []);
      return <Text>{t('greeting')}</Text>;
    }
    const { lastFrame } = render(
      <LanguageProvider
        resources={{
          'en-US': {
            greeting: 'Hello',
            'greeting.male': 'Hello, sir',
          },
        }}
        defaultLanguage="en-US"
        defaultContext="male"
      >
        <Clearer />
      </LanguageProvider>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(stripAnsi(lastFrame())).not.toContain('Hello, sir');
    expect(stripAnsi(lastFrame())).toContain('Hello');
  });

  it('missing key with defaultContext returns key itself', () => {
    const { lastFrame } = render(
      <LanguageProvider
        resources={{ 'en-US': {} }}
        defaultLanguage="en-US"
        defaultContext="male"
      >
        <T k="nonexistent" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('nonexistent');
  });

  it('behaviour unchanged when defaultContext is not set', () => {
    const { lastFrame } = render(
      <LanguageProvider
        resources={{
          'en-US': {
            greeting: 'Hello',
            'greeting.male': 'Hello, sir',
          },
        }}
        defaultLanguage="en-US"
      >
        <T k="greeting" />
      </LanguageProvider>,
    );
    expect(stripAnsi(lastFrame())).toContain('Hello');
    expect(stripAnsi(lastFrame())).not.toContain('sir');
  });
});
