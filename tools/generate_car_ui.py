#!/usr/bin/env python3
"""Generate a native iDrive 7 list page and its source-only Store package."""
import json
import pathlib
import shutil
import uuid
from xml.sax.saxutils import escape
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
CAR = ROOT / 'car'
APP = 'maxmods_hud_mirror'
VERSION = '0.1.1'
TREE = CAR / (APP + '@' + VERSION)
NS = uuid.UUID('61e3f454-5dc3-4c41-8f08-e5d94750f4cd')

def write(p, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, indent=2) + '\n')

def uid(name):
    return str(uuid.uuid5(NS, name))

rows = [
    (10, 'title', 'mirrorTitle', 'Max Mods HUD Mirror'),
    (20, 'label', 'mirrorStatus', 'Stopped'),
    (21, 'label', 'mirrorPark', 'Waiting for vehicle signals'),
    (22, 'label', 'mirrorPhone', 'Start sharing on your phone, then select Pair phone'),
    (30, 'button', 'mirrorTest', 'Test HUD (8 seconds)'),
    (31, 'button', 'mirrorPair', 'Pair phone'),
    (32, 'button', 'mirrorStart', 'Start mirror'),
    (33, 'button', 'mirrorStop', 'Stop mirror'),
]
components = {}
xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<application>', '  <container id="1" type="state" widget="LT_State_Wide">', '    <layoutGroup id="100" name="Titlebar">', '      <component id="10" type="title"><property id="2" value="1"/></component>', '    </layoutGroup>', '    <layoutGroup id="200" name="List">', '      <property id="3" value="1"/>']
for ident, kind, name, label in rows:
    focus = 3 if kind == 'button' else 0
    cell = {'value': 'SID_HUD_TITLE', 'type': 'StringId'} if kind == 'title' else {'value': label, 'type': 'Text'}
    components[str(ident)] = {'type': kind, 'name': name, 'properties': {'Visible': {'value': 1, 'type': 'UInt'}, 'Focusable': {'value': focus, 'type': 'UInt'}}, 'rows': [{'Text': cell}]}
    if kind != 'title':
        widget = 'LT_Button_1Row' if kind == 'button' else 'LT_Label_1Row'
        xml.append(f'      <component id="{ident}" type="{kind}" widget="{widget}"><property id="2" value="1"/><property id="3" value="{focus}"/></component>')
xml += ['    </layoutGroup>', '  </container>', '</application>']
ui = TREE / 'rhmiData' / 'uiDescriptions' / 'ID7'
ui.mkdir(parents=True, exist_ok=True)
(ui / 'application.xml').write_text('\n'.join(xml) + '\n')
write(ui / 'uiDescription.json', {'schemaVersion': '1.3.0', 'containers': {'1': {'type': 'state', 'name': 'ST_MaxModsHudMirror', 'components': components}}})
write(TREE / 'rhmiData' / 'application.json', {'schemaVersion': '1.3.0', 'application': {
    'uuid': uid('application'), 'type': 'OnlineApp', 'name': APP, 'vendor': 'Max Mods', 'version': VERSION,
    'defaultLanguage': 'en_GB', 'stringBundleUuid': uid('strings'), 'resourceBundleUuid': uid('resources'),
    'uiDescriptions': [{'applicationFilePath': './uiDescriptions/ID7/application.xml', 'uiDescriptionFilePath': './uiDescriptions/ID7/uiDescription.json', 'hmi': ['ID7']}],
    'variantGroups': [{'stringsPath': './variantGroups/Common/texts', 'resourcesPath': './variantGroups/Common/images', 'hmi': ['ID7'], 'brands': ['BMW']}],
    'entryPoints': [{'name': APP, 'uuid': uid('entry'), 'textId': 'SID_HUD_TITLE', 'icon': 'hud_mirror.png',
                     'insertionStateId': 20974, 'insertionFocusId': 2, 'insertionMode': 'INSERT_BELOW', 'insertionOrder': 0,
                     'insertionPriority': 0, 'previewType': 'NONE', 'bookmarkable': True, 'private': False,
                     'appearance': 'DEFAULT', 'isGroupHeader': False, 'insertionGroup': 0}]
}})
languages = ['ar_AE','cs_CZ','da_DK','de_DE','el_GR','en_GB','en_US','es_ES','fi_FI','fr_FR','he_IL','hr_HR','hu_HU','id_ID','it_IT','ja_JP','ko_KR','nb_NO','nl_NL','no_NO','pl_PL','pt_BR','pt_PT','ro_RO','ru_RU','sk_SK','sl_SI','sv_SE','th_TH','tr_TR','uk_UA','vi_VN','zh_CN','zh_TW']
for lang in languages:
    write(TREE / 'rhmiData' / 'variantGroups' / 'Common' / 'texts' / (lang + '.json'), {'SID_HUD_TITLE': 'Max Mods HUD Mirror'})
write(TREE / 'package.json', {'name': APP, 'version': VERSION, 'description': 'Experimental Android screen mirroring to the iDrive 7 windscreen HUD while stationary in Park',
    'main': 'javascript/runner.js', 'author': 'Max Mods', 'license': 'GPL-3.0-or-later', 'mguLocalOnly': True,
    'mguHmi': ['ID7'], 'mguInternet': True,
    'engines': {'node': '>=8.7.0'}, 'dependencies': {'oap-sdk': '24.10.2'},
    'oapAppSettings': {'maxDiskUsage': 10485760, 'cpuLimit': 30, 'memoryThresholdKB': 102400, 'priority': 'PRIO_MEDIUM',
        'visibility': 'FOREGROUND', 'latencyClass': 'FOREGROUND', 'loggingId': 'MMHM', 'userLoginRequired': False,
        'backgroundPriority': 150, 'someipManifest': 'manifest.json'},
    'files': ['config','rhmiData','package.json','npm-shrinkwrap.json','permissions.json','javascript','manifest.json','LICENSE','THIRD_PARTY_NOTICES.md']})
write(TREE / 'npm-shrinkwrap.json', {'name': APP, 'version': VERSION, 'lockfileVersion': 1, 'requires': True, 'dependencies': {}})
write(TREE / 'config' / 'base.json', {'rhmiLoadingEnabled': True, 'entryPointLoadingEnabled': True})

proxies = {x: '*' for x in [
    'de.bmw.infotainment.telematic.oapcontroller.OAPController',
    'de.bmw.infotainment.hmi.remote.RemoteHmi', 'de.bmw.infotainment.hmi.remote.RemoteHmiApplication',
    'de.bmw.infotainment.hmi.entrypoint.EntryPoint','de.bmw.infotainment.hmi.entrypoint.EntryPointManager',
    'de.bmw.infotainment.hmi.resourcemanagement.ResourceManager','de.bmw.infotainment.hmi.resourcemanagement.ResourceBundle',
    'de.bmw.infotainment.hmi.resourcemanagement.StringBundle',
    'de.bmw.infotainment.hmi.usecasemanagement.UseCaseInstance', 'de.bmw.infotainment.hmi.usecasemanagement.UseCaseProvider']}
proxies.update({
    'de.bmw.infotainment.hmi.usecasemanagement.UseCaseRegistry': {'attributes': {'useCaseIds': 'r'}, 'broadcasts': ['registryUpdate'], 'instances': '*', 'methods': ['getProvider']},
    'de.bmw.infotainment.telematic.oap.PrivateEntryPoint': {'instances': ['${userId}'], 'methods': ['registerEntryPoint','unregisterEntryPoint','setSelected','setAvailability']},
    'de.bmw.infotainment.telematic.oap.AppBookmarks': {'instances': ['${userId}'], 'methods': ['registerBookmark']},
    'de.bmw.infotainment.telematic.oap.WakeUpOnDemand': {'instances': ['${userId}'], 'methods': ['registerParticipant','unregisterParticipant']},
    'de.bmw.infotainment.telematic.oap.WodControl': {'instances': '${userId}', 'methods': ['offerService','stopOfferingService']},
    'de.bmw.infotainment.telematic.provisioning.Provisioning': {'instances': '1','broadcasts': ['provisioningDataJSON'],'methods': ['getValueJSON','setFilterForProvisioningData']},
    'de.bmw.infotainment.vehicle.Vehicle': '*', 'de.bmw.infrastructure.EnvironmentalInformation': '*',
    'de.bmw.infotainment.certification.Certification': '*',
    'de.bmw.infotainment.vehicle.Vehicle2': {'instances': '1', 'attributes': {'statusCarSpeed2': 'rs'}},
    # Gear fields have notifications, but no getter in BMW's catalog.
    'de.bmw.infrastructure.VehicleInformation': {'instances': '1', 'attributes': {'statusGearboxDrive': 's','DataPowerTrain2': 's'}}
})
write(TREE / 'manifest.json', {'proxies': proxies, 'services': {'de.bmw.infotainment.telematic.oap.AppStatus': {'instances': ['${userId}']}}})
# The Store completes framework ACLs from manifest.json at install time.
write(TREE / 'permissions.json', {x: [] for x in ['masterAccessTable','mediatorAccessTable','ownerAccessTable','masterRegistrationTable','mediatorRegistrationTable','ownerRegistrationTable','domainRoleTable']})
modules = ['app.js','speller.js','park_guard.js','vehicle_signals.js','phone_client.js','mirror_controller.js','cluster_render_client.js']
write(CAR / 'mgu-app.json', {'schema': 1, 'id': APP, 'version': VERSION, 'tree': TREE.name, 'internet': True,
    'modules': ['src/' + x for x in modules], 'sdk': ['oap-sdk/src/core/OnlineApp.js','oap-sdk/src/logging/logging','oap-sdk/src/someip/someipBuilders']})
write(ROOT / 'mgu-repo.json', {'schema': 1, 'components': [{'id': APP,'kind': 'app','path': 'car','build': 'unit', 'title': 'Max Mods HUD Mirror',
    'description': 'Android phone screen on the windscreen HUD. Parked test prototype.', 'version': VERSION, 'mguHmi': ['ID7'],
    'requires': {'cluster-render': '0.3.7','mgu-deploy': '0.7.11'}}]})
image = Image.new('RGBA', (140, 140), (0,0,0,0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((10,12,130,128), radius=24, fill=(15,27,33,255), outline=(102,220,167,255), width=4)
draw.rounded_rectangle((28,34,112,88), radius=7, outline=(255,255,255,255), width=4)
draw.line((49,107,91,107), fill=(102,220,167,255), width=4)
draw.line((70,91,70,107), fill=(102,220,167,255), width=4)
draw.line((50,61,64,75,91,46), fill=(102,220,167,255), width=5)
icon = TREE / 'rhmiData' / 'variantGroups' / 'Common' / 'images' / 'hud_mirror.png'
icon.parent.mkdir(parents=True, exist_ok=True); image.save(icon)
shutil.copy(ROOT / 'LICENSE', TREE / 'LICENSE')
if (ROOT / 'THIRD_PARTY_NOTICES.md').exists(): shutil.copy(ROOT / 'THIRD_PARTY_NOTICES.md', TREE / 'THIRD_PARTY_NOTICES.md')
print('Generated', TREE)
