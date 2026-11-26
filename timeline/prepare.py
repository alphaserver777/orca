#!/usr/bin/env python3
"""Build an overlay in a NEW directory; never writes to the source runtime."""
import argparse
import hashlib
import json
from pathlib import Path

TASK = 'assets/App-CTRL5owY.js'
PREVIOUS_OVERLAYS = {
    'a62dd0b30a566d967adc9b221f805d1cf0dc138e2b4bb42ca3be1db23cdc716d',  # Exact combined e5ee5fc release; archive-built upgrade/rollback regression
    '0d4bb14bd54d22728580c94e69078339da44ddf9af746a3bc8945bdb95bbbf5b',  # Full chart / conditional drawer, verified standalone upgrade input
    '39d4eb600e4677c424a858fa601218bb13e22120c5af325a2845bbf03b434a86',  # Standalone workspace overview before composer installation
    '3dab5a7abd0bab44ecd4023bd1a7640f4d932a823ce3f93e084a19beb77a90b2',  # Verified combined native sidebar, base 0c76193
    'c28209ae3c766b87e2ac5da389b959b578df3125ddb0a7ec0edc560e7bb90fc7',  # Final native sidebar, bounded native drag and Escape focus
    '3c2d77395fe1c72585d8ffddb6912c640a8dc07c9582135ec82e178bb7f5b3b5',  # Current combined-component standalone timeline
    '3cb8eb66bb81fcac69933a52628430afdf62b602aa7b4e50e649006b16cfac34',  # Pinned PurpleFlow timeline without composer; verified upgrade input
    '2fefb0799872ada37ddf99ba42f7d2af98a8d7f73880af120eb5059a6b363c86',  # Card button
    'a2f9465f579767253deacf3f351eae6963d78360bde801b27fec76b483a3af2e',  # Panel text button
    'f543d3c80f29a07b305d91f70b087e608a6bc5751eeaf5b8039397ef1323a6f2',  # Native toolbar icon; composer upgrade base
}
FINGERPRINTS = {
    'assets/client-CT6WTNXA.js': '33aed2d294c1d6c3289b196a15a4692b74653abcc8c271f48db3fb14e2c3df66',
    '.orca-web-client-files.json': '29f8cdeb221d736ae34e394800f46f39dfd733e59d9014cfcd1543a474ecc847',
    'assets/TaskPage-3pHscwlt.js': '7d164dc78284adf8d38c35a98d69b27b9a814b53d9c7819481880dc32c2b13c6',
    'assets/web-CBiXLmJa.js': 'd5a552fd50fbe19bde76825cfeb9231af081bbb12554a88587ee9f8309774b46',
    'assets/App-CTRL5owY.js': '63973ebef7ec07cf5bb8b3a764e1b2519abea86c153887fdc121f57cb8baba29',
    'web-index.html': '839907fc9a0e872c60f372699c18a7bf74ac3e54cd070ade0c9cb24b70365fad',
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check(runtime, allow_previous_overlay=False):
    if runtime.joinpath('VERSION').read_text().splitlines()[0] != 'orca 1.4.274':
        raise ValueError('Expected Orca 1.4.274')
    renderer = runtime / 'orcad/out/renderer'
    if (runtime / 'out/renderer').resolve() != renderer.resolve():
        raise ValueError('WEB entrypoint resolves to another renderer root')
    app_digest = sha(renderer / TASK)
    upgrading = allow_previous_overlay and app_digest in PREVIOUS_OVERLAYS
    for name, expected in FINGERPRINTS.items():
        actual = sha(renderer / name)
        if name == TASK and upgrading:
            continue
        if name == 'web-index.html' and actual != expected:
            # An earlier rollback retains only a deterministic cache map for original App.
            current = (renderer / name).read_text()
            text = strip_cache_map(current)
            if current != cache_index(text,app_digest):
                raise ValueError('Unexpected WEB cache map')
            actual = hashlib.sha256(text.encode()).hexdigest()
        if actual != expected:
            raise ValueError(f'Unexpected WEB bundle: {name}')
    # Prove the patch point belongs to the WEB lazy import graph, not desktop only.
    assert 'web-CBiXLmJa.js' in (renderer / 'web-index.html').read_text()
    assert './App-CTRL5owY.js' in (renderer / 'assets/web-CBiXLmJa.js').read_text()
    assert './TaskPage-3pHscwlt.js' in (renderer / 'assets/App-CTRL5owY.js').read_text()
    allowed = json.loads((renderer / '.orca-web-client-files.json').read_text())
    assert {TASK, 'assets/react-DvvP-0SR.js', 'assets/react-dom-D9Z4mmdI.js'} <= set(allowed)
    return renderer


def strip_cache_map(text):
    import re
    return re.sub(r'\n<script type="importmap" data-orca-timeline-cache>.*?</script>', '', text, count=1)


def cache_index(text, digest):
    text = strip_cache_map(text)
    imports = {f'./{TASK}': f'./{TASK}?timeline={digest}'}
    mapping = '<script type="importmap" data-orca-timeline-cache>' + json.dumps({'imports': imports}, separators=(',', ':')) + '</script>'
    return text.replace('<head>', '<head>\n' + mapping, 1)


def prepare(runtime, output):
    renderer = check(runtime)
    if output.exists():
        raise ValueError('Output must not exist')
    output.mkdir(parents=True)
    (output / 'assets').mkdir()
    src = Path(__file__).parent
    # The shipped server snapshots .orca-web-client-files.json at startup.
    # Inline into an ALREADY allowed chunk: adding files would require restarting it.
    modules = ['/*\n'+(src/'purpleflow-LICENSE.txt').read_text()+'*/', (src.parent / 'integration/purpleflow.bundle.js').read_text(), 'const OrcaPurpleflowStyles=' + json.dumps((src.parent / 'integration/purpleflow/upstream.css').read_text()+(src.parent / 'integration/purpleflow/panel.css').read_text())+';']
    for module in ('model', 'bindings', 'overview', 'overview-client', 'selection', 'decisions', 'decision-view', 'attempts', 'attempt-view', 'view', 'launch'):
        lines = (src / f'{module}.mjs').read_text().splitlines()
        modules.append('\n'.join(line for line in lines if not line.startswith('import '))
                       .replace('export function ', 'function ')
                       .replace('export async function ', 'async function ')
                       .replace('export const ', 'const ')
                       .replace('requireReact()', 'OrcaTimelineReact()')
                       .replace('requireReactDOM()', 'OrcaTimelineReactDOM()'))
    prefix = 'import {t as OrcaTimelineReact} from "./react-DvvP-0SR.js";\n'
    prefix += 'import {t as OrcaTimelineReactDOM} from "./react-dom-D9Z4mmdI.js";\n'
    prefix += 'import {t as OrcaTimelineClient} from "./client-CT6WTNXA.js";\n'
    prefix += 'const OrcaTimelineLaunch = (() => {\n' + '\n'.join(modules) + '\nreturn TimelineLaunch;\n})();\n// ORCA_TIMELINE_END\n'
    code = (renderer / TASK).read_text()
    def replace_once(anchor, replacement):
        nonlocal code
        start=code.index('function pgt()');end=code.index('function mgt(',start)
        section=code[start:end]
        if section.count(anchor)!=1:raise ValueError('Native sidebar anchor changed: '+anchor[:80])
        code=code[:start]+section.replace(anchor,replacement,1)+code[end:]
    replace_once('let{effectiveTab:N,selectActivityTab:P}=igt(M),',
        'let{effectiveTab:OrcaNativeTab,selectActivityTab:OrcaNativeSelect}=igt(M),{effectiveTab:N,selectActivityTab:P}=OrcaTimelineSidebar(OrcaNativeTab,OrcaNativeSelect),')
    replace_once('let V=B,H;', 'let V=OrcaTimelineItems(B),H;')
    replace_once('let le=ce,ue;', 'let le=N===`timeline`?Math.min(ce,Math.max(280,innerWidth-640)):ce,ue;')
    replace_once('let de=ue,fe;', 'let de=N===`timeline`?Math.min(ue,Math.max(280,innerWidth-640)):ue,fe;')
    replace_once('children:(0,$.jsx)(Rht,{effectiveTab:N,rightSidebarOpen:o,focusVaultSearch:f,onVaultSearchFocusHandled:()=>p(!1)})',
        'children:N===`timeline`?(0,$.jsx)(OrcaTimelineLaunch,{onClose:()=>P(`explorer`)}):(0,$.jsx)(Rht,{effectiveTab:N,rightSidebarOpen:o,focusVaultSearch:f,onVaultSearchFocusHandled:()=>p(!1)})')
    selector = 'function OrcaTimelineWorkspaceSelector(s){return s.activeView===`terminal`&&s.activeWorktreeId ? Y9(s,s.activeWorktreeId,s.activeWorkspaceExecutionHostId) : null;}\n'
    # Subscribe inside the patch component, before its launch content renders.
    prefix = selector + prefix.replace('return TimelineLaunch;', 'return Object.assign(props => TimelineLaunch({...props,workspace:X(OrcaTimelineWorkspaceSelector)}),{Icon:props=>TimelineIcon({...props,workspace:X(OrcaTimelineWorkspaceSelector)})});')
    prefix+='''
let OrcaTimelineTarget=null;
function OrcaTimelineOpenSidebar(){
  const state=X.getState();state.setRightSidebarOpen(true);
  if(innerWidth>=1280&&state.rightSidebarWidth<600)state.setRightSidebarWidth(Math.min(760,innerWidth-640));
}
function OrcaTimelineItems(items){
  const base=items.filter(item=>item.id!==`timeline`),at=base.findIndex(item=>item.id===`checks`);
  if(innerWidth<=720||!OrcaTimelineWorkspaceSelector(X.getState()))return base;
  base.splice(at<0?base.length:at+1,0,{id:`timeline`,title:`Таймлайн`,shortcut:``,icon:OrcaTimelineLaunch.Icon});return base;
}
function OrcaTimelineSidebar(nativeTab,nativeSelect){
  const React=OrcaTimelineReact(),workspace=X(OrcaTimelineWorkspaceSelector),route=X(s=>s.rightSidebarRouteRequestId);
  const key=workspace?JSON.stringify([workspace.id,workspace.instanceId,workspace.runtimeOwnerEnvironmentId]):null;
  const [selected,setSelected]=React.useState(null);
  const shown=key!==null&&selected?.key===key&&selected.route===route;
  React.useEffect(()=>{
    const requested=event=>{
      const target=event.detail;OrcaTimelineTarget=target;
      if(target.id!==workspace?.id||target.instanceId!==workspace?.instanceId||target.environmentId!==workspace?.runtimeOwnerEnvironmentId)return;
      OrcaTimelineOpenSidebar();setSelected({key,route:X.getState().rightSidebarRouteRequestId});OrcaTimelineTarget=null;
    };
    if(OrcaTimelineTarget)requested({detail:OrcaTimelineTarget});
    window.addEventListener('orca-composer-open-timeline',requested);
    return ()=>window.removeEventListener('orca-composer-open-timeline',requested);
  },[key]);
  return {effectiveTab:shown&&innerWidth>720?`timeline`:nativeTab,selectActivityTab:(tab,focus)=>{
    if(tab===`timeline`){OrcaTimelineOpenSidebar();setSelected({key,route:X.getState().rightSidebarRouteRequestId});}
    else{setSelected(null);nativeSelect(tab,focus);}
  }};
}
'''
    code = prefix + code
    (output / TASK).write_text(code)
    index = cache_index((renderer / 'web-index.html').read_text(), sha(output / TASK))
    (output / 'web-index.html').write_text(index)
    changed = [TASK, 'web-index.html']
    manifest = {'version': '1.4.274', 'base': FINGERPRINTS,
                'files': {name: sha(output / name) for name in changed}}
    (output / 'overlay.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.runtime.resolve(), args.output.resolve())
    print('WEB overlay prepared; live runtime unchanged')
