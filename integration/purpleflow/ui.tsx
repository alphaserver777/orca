import React from 'react';
// PurpleFlow ui.tsx Button and TextArea, MIT (see LICENSE); native theme in panel.css.
import {forwardRef} from 'react';
export function Button({tone='ghost',icon,children,busy,className='',...rest}:any) {
  return <button {...rest} className={`btn btn-${tone} ${busy?'is-busy':''} ${className}`} disabled={rest.disabled||busy}>
    {busy?<span className="spinner" aria-hidden/>:icon}{children&&<span>{children}</span>}
  </button>;
}
export const TextArea=forwardRef(function TextArea({className='',...rest}:any,ref:any) {
  return <textarea ref={ref} {...rest} aria-label="Комментарий к редакции" maxLength={8000} className={`input textarea ${className}`}/>;
});
