/*
MIT License

Copyright (c) 2026 PurpleSchool

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Derived from PurpleFlow app/src/renderer/src/screens/NewTask.tsx:267-295,
6476bf53c987b426418acad148b449ffbf4d4072.
React element creation becomes the existing Orca DOM factory; mode data and Auto
remain the confirmed 3c01792 policy. No PurpleFlow bridge/model calls are used.
*/

export function purpleflowModeButtons(element,container,MODES,setMode) {
  container.dataset.purpleflow='NewTaskModes';
  return MODES.map(m => {
    const button=element('button',{type:'button',class:'oc-mode mode',onClick:()=>setMode(m.id),title:m.hint||m.title},m.title);
    button.dataset.mode=m.id;container.append(button);return button;
  });
}
