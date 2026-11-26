"""One pinned package: composer + timeline + native plan decisions. No runtime writes."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'timeline'))
from prepare import sha
from prepare_server import prepare_server, SERVER_SHA

def prepare_combined(runtime,output):
    spec=importlib.util.spec_from_file_location('integration_composer',ROOT/'composer/prepare.py')
    composer=importlib.util.module_from_spec(spec);spec.loader.exec_module(composer)
    if sha(runtime/'orcad/orcad-server.js')!=SERVER_SHA:raise ValueError('Server is not stock 1.4.274')
    renderer=composer.prepare_composer(runtime,output)
    prepare_server(runtime/'orcad/orcad-server.js',output/'server.js')
    code=(output/'assets/App-CTRL5owY.js').read_text()
    # Fail closed if either overlay was erased, duplicated or replaced by a sibling patch.
    for marker in ['function OrcaComposerRoot','function TimelineLaunch','function planTransport','function openPlan','var OrcaPurpleflow =']:
        if code.count(marker)!=1:raise ValueError('Missing or duplicate integration '+marker)
    provenance=json.loads((ROOT/'integration/adapter-source.json').read_text())
    manifest={'version':'1.4.274','composerBase':'3c01792c384a43f148c9178290f04b43e30f22cc',
        'renderer':renderer['files'],'serverBase':SERVER_SHA,'server':sha(output/'server.js'),
        'adapterSource':provenance,'purpleflow':json.loads((ROOT/'integration/purpleflow/upstream.json').read_text()),
        'bundleSha256':sha(ROOT/'integration/purpleflow.bundle.js')}
    (output/'combined.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return manifest

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--runtime',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();prepare_combined(a.runtime.resolve(),a.output.resolve());print('One combined package prepared; runtime unchanged')
