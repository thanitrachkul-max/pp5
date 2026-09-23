import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Attributes5_8Form } from '../src/components/Attributes5_8Form';
import type { AppData } from '../src/types';

for (const semester of ['1', '2']) {
  test(`attributes 5-8 summary heading follows semester ${semester} in editor and print views`, () => {
    for (const printMode of [false, true]) {
      const html = renderToStaticMarkup(React.createElement(Attributes5_8Form, {
        students: [],
        data: {},
        generalInfo: {
          gradeLevel: 'ม.6/5',
          semester,
          academicYear: '2569',
        } as AppData['generalInfo'],
        printMode,
        onChange: () => undefined,
      }));

      assert.match(html, new RegExp(`รวมทุกคุณลักษณะภาคเรียนที่ ${semester}<\\/th>`));
      assert.ok(!html.includes(`รวมทุกคุณลักษณะภาคเรียนที่ ${semester === '1' ? '2' : '1'}`));
    }
  });
}
