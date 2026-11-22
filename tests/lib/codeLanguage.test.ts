import { describe, it, expect } from 'vitest'
import { common, createLowlight } from 'lowlight'
import {
  detectCodeLanguage,
  isPlainTextLanguage,
  withLanguageDetection,
} from '../../src/lib/codeLanguage'

describe('detectCodeLanguage — code', () => {
  const cases: [string, string][] = [
    ['javascript', 'const x = await fetch(url)\nif (x.ok) { console.log(x) }'],
    ['javascript', "import React from 'react'\nexport default function App() { return null }"],
    ['typescript', 'interface Foo { a: string }\nexport function f(x: Foo): number { return 1 }'],
    ['typescript', 'const n: number = 3\nconst s = n as unknown'],
    ['python', 'def foo(x):\n    return [i for i in range(x)]\n\nprint(foo(3))'],
    ['python', 'from os import path\n\nclass A:\n    def run(self):\n        self.x = None'],
    ['json', '{"a": 1, "b": [true, null]}'],
    ['json', '[1, 2, 3]'],
    ['bash', 'npm install\ncd src && ls -la | grep foo'],
    ['bash', '#!/bin/bash\necho hi'],
    ['bash', 'git commit -m "fix"'],
    ['bash', 'git commit -m "fix the bug"'],
    ['bash', 'npm install'],
    ['bash', 'cd src'],
    ['bash', 'export PATH=$HOME/bin:$PATH'],
    ['bash', 'rm -rf dist'],
    ['bash', 'echo "hello"'],
    ['go', 'name := "x"\nfmt.Println(name)'],
    ['sql', 'SELECT id, name FROM users WHERE age > 30 ORDER BY name;'],
    ['sql', 'CREATE TABLE notes (id INTEGER PRIMARY KEY);'],
    ['css', '.foo { color: red; margin: 0 auto; }'],
    ['xml', '<div class="a"><p>Hello</p></div>'],
    ['yaml', 'name: test\nversion: 1\nitems:\n  - a\n  - b'],
    ['rust', 'fn main() {\n    let mut v = Vec::new();\n    println!("{}", v.len());\n}'],
    ['go', 'package main\nimport "fmt"\nfunc main() { fmt.Println("hi") }'],
    ['java', 'public class A {\n  public static void main(String[] args) {\n    System.out.println("hi");\n  }\n}'],
    ['csharp', 'using System;\nclass A { static void Main() { Console.WriteLine("hi"); } }'],
    ['cpp', '#include <iostream>\nint main() { std::cout << "hi"; }'],
    ['c', '#include <stdio.h>\nint main() { printf("hi"); }'],
    ['php', '<?php echo $name; ?>'],
    ['diff', 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b'],
  ]
  for (const [lang, code] of cases) {
    it(`${lang}: ${code.split('\n')[0].slice(0, 40)}`, () => {
      expect(detectCodeLanguage(code)).toBe(lang)
    })
  }
})

describe('detectCodeLanguage — plain text stays plain', () => {
  const cases = [
    '',
    'hi',
    'hello',
    'Hello, this is just some plain text that I wrote in a code block.',
    'Esto es solo un texto normal, sin nada de código. Lista de la compra: pan, leche.',
    '- comprar pan\n- llamar a Juan\n- revisar correo',
    'https://example.com/foo?bar=1',
    'C:\\Users\\foo\\Documents',
    '# Title\nSome text with **bold**',
    '123 456 789',
    '2024-01-01 12:00:00 ERROR Something failed at line 3',
    'Nota: llamar mañana',
    'If you select one from the list, then it is done.',
    'TODO:\nbuy milk\ncall mom',
    '{ not json',
    // Command names that are also words
    'export the report to PDF before Friday',
    'touch base with the team tomorrow',
    'echo chamber effect',
    'git is great',
    'docker is great',
    // A lone `:=` and Python-looking prose
    'name := value',
    'for the meeting:\nTrue story',
  ]
  for (const text of cases) {
    it(JSON.stringify(text.slice(0, 40)), () => {
      expect(detectCodeLanguage(text)).toBeNull()
    })
  }
})

describe('isPlainTextLanguage', () => {
  it('recognises plaintext ids and aliases', () => {
    expect(isPlainTextLanguage('plaintext')).toBe(true)
    expect(isPlainTextLanguage('TXT')).toBe(true)
    expect(isPlainTextLanguage('text')).toBe(true)
    expect(isPlainTextLanguage('js')).toBe(false)
    expect(isPlainTextLanguage(null)).toBe(false)
  })
})

describe('withLanguageDetection', () => {
  const lowlight = withLanguageDetection(createLowlight(common))
  it('highlights detected code with the detected language', () => {
    const tree = lowlight.highlightAuto('def foo(x):\n    return x') as { data?: { language?: string } }
    expect(tree.data?.language).toBe('python')
  })
  it('leaves undetected text unhighlighted', () => {
    const tree = lowlight.highlightAuto('Just a sentence.') as { children: { type: string }[] }
    expect(tree.children.every((c) => c.type === 'text')).toBe(true)
  })
  it('keeps the rest of the lowlight API', () => {
    expect(lowlight.listLanguages()).toContain('javascript')
    expect(lowlight.registered('ts')).toBe(true)
  })
})
